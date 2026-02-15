import asyncio
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, JSONResponse


ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"
INDEX_HTML = (STATIC / "index.html").read_text(encoding="utf-8")

UDP_PORT = 6767


class JpegReassembler:
    # Assemble full JPEGs from a stream of chunks by scanning SOI/EOI.
    def __init__(self) -> None:
        self._buf = bytearray()

    def push(self, data: bytes) -> Optional[bytes]:
        self._buf.extend(data)
        if len(self._buf) > 1_500_000:
            del self._buf[:-300_000]

        buf = self._buf
        while True:
            soi = buf.find(b"\xff\xd8")
            if soi < 0:
                if len(buf) > 4:
                    del buf[:-4]
                return None
            if soi > 0:
                del buf[:soi]
            eoi = buf.find(b"\xff\xd9", 2)
            if eoi < 0:
                return None
            jpg = bytes(buf[: eoi + 2])
            del buf[: eoi + 2]
            return jpg


@dataclass
class DeviceState:
    jpeg: bytes = b""
    jpeg_ts: float = 0.0
    jpeg_n: int = 0

    ras: JpegReassembler = field(default_factory=JpegReassembler)
    cmd_q: asyncio.Queue[bytes] = field(default_factory=lambda: asyncio.Queue(maxsize=64))
    jpeg_cv: asyncio.Condition = field(default_factory=asyncio.Condition)

    chunk_n: int = 0
    chunk_bytes: int = 0


STATE: Dict[str, DeviceState] = {}


def st_for(device: str) -> DeviceState:
    st = STATE.get(device)
    if st is None:
        st = DeviceState()
        STATE[device] = st
    return st


# Binary protocol
# - Device -> server:
#   - 0x02 + raw video chunk bytes
# - Server -> device:
#   - raw command bytes: 0x10..., 0x11..., 0x12
# - UI -> server:
#   - raw command bytes: 0x10..., 0x11..., 0x12
# - Server -> UI:
#   - 0x01 + full JPEG bytes
MSG_UI_JPEG = 0x01
MSG_DEV_VCHUNK = 0x02


app = FastAPI()
app.state.udp_transport = None
app.state.uplink_addr = None  # (ip, port) of the last uplink UDP sender


@app.get("/")
async def index() -> HTMLResponse:
    return HTMLResponse(INDEX_HTML)


@app.get("/health")
async def health() -> JSONResponse:
    now = time.time()
    out = {}
    for dev, st in STATE.items():
        out[dev] = {
            "jpeg_age_s": (now - st.jpeg_ts) if st.jpeg_ts else None,
            "jpeg_n": st.jpeg_n,
            "cmd_q": st.cmd_q.qsize(),
            "chunk_n": st.chunk_n,
            "chunk_bytes": st.chunk_bytes,
        }
    return JSONResponse(out)

def udp_send_to_uplink(payload: bytes) -> bool:
    t = app.state.udp_transport
    addr = app.state.uplink_addr
    if t is None or addr is None:
        return False
    t.sendto(payload, addr)
    return True


class UdpProto(asyncio.DatagramProtocol):
    def __init__(self) -> None:
        super().__init__()

    def connection_made(self, transport) -> None:
        app.state.udp_transport = transport

    def datagram_received(self, data: bytes, addr) -> None:
        # Any UDP packet from the uplink refreshes its return address for command egress.
        app.state.uplink_addr = (addr[0], addr[1])

        if not data:
            return
        # Expected: 0x02 + video chunk bytes. Accept raw bytes too.
        if data[0] == MSG_DEV_VCHUNK:
            payload = data[1:]
        else:
            payload = data

        st = st_for("uplink")
        st.chunk_n += 1
        st.chunk_bytes += len(payload)
        jpg = st.ras.push(payload)
        if jpg:
            st.jpeg = jpg
            st.jpeg_ts = time.time()
            st.jpeg_n += 1
            async def _notify():
                async with st.jpeg_cv:
                    st.jpeg_cv.notify_all()
            # fire-and-forget, safe from non-async callback
            asyncio.get_running_loop().create_task(_notify())


@app.on_event("startup")
async def _startup_udp() -> None:
    loop = asyncio.get_running_loop()
    await loop.create_datagram_endpoint(lambda: UdpProto(), local_addr=("0.0.0.0", UDP_PORT))


@app.websocket("/ws/device/{device}")
async def ws_device(ws: WebSocket, device: str):
    await ws.accept()
    st = st_for(device)

    async def sender():
        while True:
            cmd = await st.cmd_q.get()
            await ws.send_bytes(cmd)

    send_task = asyncio.create_task(sender())
    try:
        while True:
            msg = await ws.receive()
            data = msg.get("bytes")
            if not data:
                continue
            if data[0] != MSG_DEV_VCHUNK:
                continue
            st.chunk_n += 1
            st.chunk_bytes += len(data) - 1
            jpg = st.ras.push(data[1:])
            if jpg:
                st.jpeg = jpg
                st.jpeg_ts = time.time()
                st.jpeg_n += 1
                async with st.jpeg_cv:
                    st.jpeg_cv.notify_all()
    except WebSocketDisconnect:
        pass
    finally:
        send_task.cancel()


@app.websocket("/ws/ui/{device}")
async def ws_ui(ws: WebSocket, device: str):
    await ws.accept()
    st = st_for(device)

    async def video_pusher():
        last_n = -1
        while True:
            async with st.jpeg_cv:
                if st.jpeg and st.jpeg_n != last_n:
                    last_n = st.jpeg_n
                    jpg = st.jpeg
                else:
                    await st.jpeg_cv.wait_for(lambda: st.jpeg_n != last_n)
                    last_n = st.jpeg_n
                    jpg = st.jpeg
            if jpg:
                await ws.send_bytes(bytes([MSG_UI_JPEG]) + jpg)

    push_task = asyncio.create_task(video_pusher())
    try:
        while True:
            msg = await ws.receive()
            data = msg.get("bytes")
            if not data:
                continue
            if data[0] not in (0x10, 0x11, 0x12):
                continue
            # Prefer sending directly to uplink via UDP (VPS mode).
            if not udp_send_to_uplink(data):
                # Fallback: queue for ws_device clients.
                try:
                    st.cmd_q.put_nowait(data)
                except asyncio.QueueFull:
                    try:
                        _ = st.cmd_q.get_nowait()
                    except asyncio.QueueEmpty:
                        pass
                    try:
                        st.cmd_q.put_nowait(data)
                    except asyncio.QueueFull:
                        pass
    except WebSocketDisconnect:
        pass
    finally:
        push_task.cancel()
