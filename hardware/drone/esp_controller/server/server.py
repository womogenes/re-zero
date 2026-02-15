import asyncio
import json
import time
from collections import deque
from pathlib import Path
from typing import Optional

import aiohttp
from aiohttp import web

from aiortc import RTCPeerConnection, RTCSessionDescription
from aiortc.contrib.media import MediaBlackhole
from aiortc.mediastreams import VideoStreamTrack

import av
import cv2
import numpy as np


ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"

TCP_PORT = 6767
UDP_PORT = 6767


class JpegReassembler:
    """
    Assemble full JPEG frames from a stream of UDP datagrams by scanning for SOI/EOI.
    Assumes the sender forwards raw video UDP payload bytes unmodified.
    """

    def __init__(self) -> None:
        self._buf = bytearray()
        self._q: asyncio.Queue[bytes] = asyncio.Queue(maxsize=2)
        self.frames = 0
        self.dgrams = 0

    def push(self, data: bytes) -> None:
        self.dgrams += 1
        self._buf.extend(data)
        if len(self._buf) > 1_500_000:
            del self._buf[:-300_000]
        buf = self._buf
        while True:
            soi = buf.find(b"\xff\xd8")
            if soi < 0:
                if len(buf) > 4:
                    del buf[:-4]
                return
            if soi > 0:
                del buf[:soi]
            eoi = buf.find(b"\xff\xd9", 2)
            if eoi < 0:
                return
            jpg = bytes(buf[: eoi + 2])
            del buf[: eoi + 2]
            self.frames += 1
            if self._q.full():
                try:
                    self._q.get_nowait()
                except asyncio.QueueEmpty:
                    pass
            try:
                self._q.put_nowait(jpg)
            except asyncio.QueueFull:
                pass

    async def get(self, timeout: float = 1.0) -> Optional[bytes]:
        try:
            return await asyncio.wait_for(self._q.get(), timeout=timeout)
        except asyncio.TimeoutError:
            return None


class DroneVideoTrack(VideoStreamTrack):
    def __init__(self, ras: JpegReassembler) -> None:
        super().__init__()
        self._ras = ras
        self._last = None
        self._t0 = time.time()

    async def recv(self) -> av.VideoFrame:
        jpg = await self._ras.get(timeout=1.0)
        if jpg is None:
            # Reuse last frame if available.
            if self._last is None:
                img = np.zeros((240, 320, 3), dtype=np.uint8)
            else:
                img = self._last
        else:
            arr = np.frombuffer(jpg, dtype=np.uint8)
            img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
            if img is None:
                img = self._last if self._last is not None else np.zeros((240, 320, 3), dtype=np.uint8)
            else:
                self._last = img

        frame = av.VideoFrame.from_ndarray(img, format="bgr24")
        frame.pts, frame.time_base = await self.next_timestamp()
        return frame


class UplinkState:
    def __init__(self) -> None:
        self.addr: Optional[tuple[str, int]] = None
        self.last_seen = 0.0


class UdpProto(asyncio.DatagramProtocol):
    def __init__(self, st: UplinkState, ras: JpegReassembler) -> None:
        self.st = st
        self.ras = ras
        self.transport: Optional[asyncio.DatagramTransport] = None

    def connection_made(self, transport) -> None:
        self.transport = transport

    def datagram_received(self, data: bytes, addr) -> None:
        self.st.addr = (addr[0], addr[1])
        self.st.last_seen = time.time()
        # Uplink connectivity probe (lets you verify L2/L3 reachability on guest networks).
        if data == b"uplink_hello" and self.transport is not None:
            self.transport.sendto(b"uplink_ack", addr)
            return

        # Otherwise treat as raw forwarded video bytes.
        self.ras.push(data)


def build_cc_control(x: int = 0x80, y: int = 0x80, z: int = 0x80, w: int = 0x80, flags: int = 0x00) -> bytes:
    x &= 0xFF
    y &= 0xFF
    z &= 0xFF
    w &= 0xFF
    flags &= 0xFF
    p = bytearray(15)
    p[0:2] = b"cc"
    p[2:4] = (0x000A).to_bytes(2, "little")
    p[4] = 0x00
    p[5:7] = (0x0008).to_bytes(2, "little")
    p[7] = 0x66
    p[8] = x
    p[9] = y
    p[10] = z
    p[11] = w
    p[12] = flags
    p[13] = p[8] ^ p[9] ^ p[10] ^ p[11] ^ p[12]
    p[14] = 0x99
    return bytes(p)


async def index(_: web.Request) -> web.Response:
    return web.FileResponse(STATIC / "index.html")


async def static_handler(request: web.Request) -> web.Response:
    p = (STATIC / request.match_info["name"]).resolve()
    if not str(p).startswith(str(STATIC)):
        raise web.HTTPNotFound()
    return web.FileResponse(p)


async def health(request: web.Request) -> web.Response:
    st: UplinkState = request.app["uplink_state"]
    ras: JpegReassembler = request.app["ras"]
    return web.json_response(
        {
            "udp_port": UDP_PORT,
            "uplink_addr": st.addr,
            "uplink_last_seen_s": (time.time() - st.last_seen) if st.last_seen else None,
            "video_dgrams": ras.dgrams,
            "video_frames": ras.frames,
        }
    )


async def ws_control(request: web.Request) -> web.StreamResponse:
    ws = web.WebSocketResponse(heartbeat=10.0, max_msg_size=64 * 1024)
    await ws.prepare(request)

    async for msg in ws:
        if msg.type != aiohttp.WSMsgType.TEXT:
            continue
        try:
            obj = json.loads(msg.data)
        except Exception:
            continue

        if request.app["uplink_state"].addr is None:
            await ws.send_str(json.dumps({"t": "err", "e": "uplink not seen yet (no UDP video received)"}))
            continue

        if isinstance(obj, dict):
            _handle_control_obj(request.app, obj)

    return ws


def _udp_send_to_uplink(app: web.Application, payload: bytes) -> bool:
    st: UplinkState = app["uplink_state"]
    transport: asyncio.DatagramTransport = app["udp_transport"]
    if st.addr is None:
        return False
    transport.sendto(payload, st.addr)
    return True


def _handle_control_obj(app: web.Application, obj: dict) -> None:
    """
    Accepts the same JSON schema as the old WebSocket API and forwards as binary to uplink.
    """
    t = obj.get("t")
    if t == "ctrl":
        x = int(obj.get("x", 0x80))
        y = int(obj.get("y", 0x80))
        z = int(obj.get("z", 0x80))
        r = int(obj.get("r", 0x80))
        flags = int(obj.get("flags", 0))
        pkt = build_cc_control(x, y, z, r, flags)
        _udp_send_to_uplink(app, bytes([0x10]) + pkt)
    elif t == "pulse":
        flag = int(obj.get("flag", 0)) & 0xFF
        dur_ms = int(obj.get("dur_ms", 350)) & 0xFFFF
        _udp_send_to_uplink(app, bytes([0x11, flag, dur_ms & 0xFF, (dur_ms >> 8) & 0xFF]))
    elif t == "neutral":
        _udp_send_to_uplink(app, bytes([0x12]))


async def webrtc_offer(request: web.Request) -> web.Response:
    params = await request.json()
    offer = RTCSessionDescription(sdp=params["sdp"], type=params["type"])

    ras: JpegReassembler = request.app["ras"]
    pc = RTCPeerConnection()
    request.app["pcs"].add(pc)

    @pc.on("datachannel")
    def on_datachannel(channel):
        # Browser sends raw binary control packets:
        # 0x10 + 15-byte cc payload, 0x11 flag dur_lo dur_hi, 0x12.
        @channel.on("message")
        def on_message(message):
            if isinstance(message, (bytes, bytearray, memoryview)):
                b = bytes(message)
                if b and b[0] in (0x10, 0x11, 0x12):
                    _udp_send_to_uplink(request.app, b)
                return
            if isinstance(message, str):
                # Back-compat for older clients sending JSON strings over the DataChannel.
                try:
                    obj = json.loads(message)
                except Exception:
                    return
                if isinstance(obj, dict):
                    _handle_control_obj(request.app, obj)

    @pc.on("connectionstatechange")
    async def on_state_change():
        if pc.connectionState in ("failed", "closed", "disconnected"):
            await pc.close()
            request.app["pcs"].discard(pc)

    # Send video track to browser.
    pc.addTrack(DroneVideoTrack(ras))

    await pc.setRemoteDescription(offer)
    answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    return web.json_response({"sdp": pc.localDescription.sdp, "type": pc.localDescription.type})


async def on_shutdown(app: web.Application) -> None:
    pcs = app["pcs"]
    coros = [pc.close() for pc in pcs]
    await asyncio.gather(*coros, return_exceptions=True)
    pcs.clear()


async def main_async() -> int:
    app = web.Application()
    app["ras"] = JpegReassembler()
    app["uplink_state"] = UplinkState()
    app["pcs"] = set()

    loop = asyncio.get_running_loop()
    transport, _ = await loop.create_datagram_endpoint(
        lambda: UdpProto(app["uplink_state"], app["ras"]),
        local_addr=("0.0.0.0", UDP_PORT),
    )
    app["udp_transport"] = transport

    app.router.add_get("/", index)
    app.router.add_get("/static/{name}", static_handler)
    app.router.add_get("/health", health)
    app.router.add_get("/ws", ws_control)
    app.router.add_post("/webrtc/offer", webrtc_offer)
    app.on_shutdown.append(on_shutdown)

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", TCP_PORT)
    await site.start()

    print(f"server: tcp http/ws on :{TCP_PORT}, udp video/control on :{UDP_PORT}", flush=True)
    while True:
        await asyncio.sleep(1)


def main() -> int:
    try:
        asyncio.run(main_async())
    except KeyboardInterrupt:
        return 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
