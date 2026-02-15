import asyncio
import contextlib
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Optional

import modal

APP_NAME = "esp-drone-cloud"
WEB_LABEL = "drone"

ROOT = Path(__file__).resolve().parent
STATIC_DIR = ROOT / "static"

# Ship static assets inside the image (Modal v1.2.x).
image = (
    modal.Image.debian_slim()
    .pip_install("fastapi[standard]")
    .add_local_dir(STATIC_DIR, remote_path="/root/static")
)
app = modal.App(APP_NAME)

def _read_index_html() -> str:
    # In Modal containers, this path exists via image.add_local_dir.
    p = Path("/root/static/index.html")
    try:
        return p.read_text(encoding="utf-8")
    except FileNotFoundError:
        # Fallback to local dev execution.
        return (STATIC_DIR / "index.html").read_text(encoding="utf-8")


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

    # From device -> cloud (video chunks to JPEG).
    ras: JpegReassembler = field(default_factory=JpegReassembler)

    # UI -> device command queue (binary).
    cmd_q: asyncio.Queue[bytes] = field(default_factory=lambda: asyncio.Queue(maxsize=64))

    # A condition to notify all UI sockets when a new JPEG is available.
    jpeg_cv: asyncio.Condition = field(default_factory=asyncio.Condition)


STATE: Dict[str, DeviceState] = {}


def st_for(device: str) -> DeviceState:
    st = STATE.get(device)
    if st is None:
        st = DeviceState()
        STATE[device] = st
    return st


# Binary protocol
# - Device -> cloud:
#   - 0x02 + raw video chunk bytes (e.g. forwarded UDP payload)
# - Cloud -> device:
#   - raw command bytes (same as browser sends): 0x10..., 0x11..., 0x12
# - UI -> cloud:
#   - raw command bytes: 0x10..., 0x11..., 0x12
# - Cloud -> UI:
#   - 0x01 + full JPEG bytes
MSG_UI_JPEG = 0x01
MSG_DEV_VCHUNK = 0x02


@app.function(image=image)
@modal.asgi_app(label=WEB_LABEL)
def web_app():
    from fastapi import FastAPI, WebSocket, WebSocketDisconnect
    from fastapi.responses import HTMLResponse, JSONResponse

    api = FastAPI()

    @api.get("/")
    async def index() -> HTMLResponse:
        return HTMLResponse(_read_index_html())

    @api.get("/health")
    async def health() -> JSONResponse:
        now = time.time()
        out = {}
        for dev, st in STATE.items():
            out[dev] = {
                "jpeg_age_s": (now - st.jpeg_ts) if st.jpeg_ts else None,
                "jpeg_n": st.jpeg_n,
                "cmd_q": st.cmd_q.qsize(),
            }
        return JSONResponse(out)

    @api.websocket("/ws/device/{device}")
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
                if data is None:
                    continue
                if not data:
                    continue
                typ = data[0]
                if typ != MSG_DEV_VCHUNK:
                    continue
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
            with contextlib.suppress(Exception):
                await send_task

    @api.websocket("/ws/ui/{device}")
    async def ws_ui(ws: WebSocket, device: str):
        await ws.accept()
        st = st_for(device)

        async def video_pusher():
            last_n = -1
            while True:
                async with st.jpeg_cv:
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
                if data is None:
                    continue
                if not data:
                    continue
                # Browser sends raw command bytes.
                if data[0] not in (0x10, 0x11, 0x12):
                    continue
                try:
                    st.cmd_q.put_nowait(data)
                except asyncio.QueueFull:
                    # Drop oldest.
                    try:
                        _ = st.cmd_q.get_nowait()
                    except asyncio.QueueEmpty:
                        pass
                    with contextlib.suppress(asyncio.QueueFull):
                        st.cmd_q.put_nowait(data)
        except WebSocketDisconnect:
            pass
        finally:
            push_task.cancel()
            with contextlib.suppress(Exception):
                await push_task

    return api
