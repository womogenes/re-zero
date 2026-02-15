import asyncio
import json
import time
from pathlib import Path

from aiohttp import web

from drone import DroneLink, DRONE_IP_DEFAULT, FLAG_ESTOP, FLAG_LAND, FLAG_TAKEOFF


HERE = Path(__file__).resolve().parent
STATIC_DIR = HERE / "web_static"

# Tuning knobs (edit if any axis direction feels inverted).
NEUTRAL = 0x80
STRAFE_DELTA = 0x30  # A/D
PITCH_DELTA = 0x30   # W/S
THROTTLE_DELTA = 0x30  # Up/Down
YAW_DELTA = 0x7F     # Left/Right (needs to be large on this drone)

# Directions. If a control feels backwards, flip the +/- below.
W_IS_FORWARD_NEG = False
UP_IS_THROTTLE_POS = True
RIGHT_IS_YAW_POS = True
D_IS_STRAFE_POS = True

VIDEO_MAX_FPS = 15.0


def _clamp_u8(v: int) -> int:
    if v < 0:
        return 0
    if v > 255:
        return 255
    return v


def _axes_from_keys(keys: set[str]) -> tuple[int, int, int, int]:
    dx = (1 if "d" in keys else 0) - (1 if "a" in keys else 0)
    dy = (1 if "s" in keys else 0) - (1 if "w" in keys else 0)
    dz = (1 if "ArrowUp" in keys else 0) - (1 if "ArrowDown" in keys else 0)
    dr = (1 if "ArrowRight" in keys else 0) - (1 if "ArrowLeft" in keys else 0)

    if not D_IS_STRAFE_POS:
        dx = -dx
    if not W_IS_FORWARD_NEG:
        dy = -dy
    if not UP_IS_THROTTLE_POS:
        dz = -dz
    if not RIGHT_IS_YAW_POS:
        dr = -dr

    x = _clamp_u8(NEUTRAL + dx * STRAFE_DELTA)
    y = _clamp_u8(NEUTRAL + dy * PITCH_DELTA)
    z = _clamp_u8(NEUTRAL + dz * THROTTLE_DELTA)
    r = _clamp_u8(NEUTRAL + dr * YAW_DELTA)
    return x, y, z, r


class WebController:
    def __init__(self, drone: DroneLink) -> None:
        self.drone = drone
        self.clients: set[web.WebSocketResponse] = set()
        self.keys: set[str] = set()
        self._last_video_sent = 0.0
        self._video_task: asyncio.Task | None = None

    def _apply_keys(self) -> tuple[int, int, int, int]:
        x, y, z, r = _axes_from_keys(self.keys)
        # Don't touch flags here; allow takeoff/land/estop pulses to coexist with movement updates.
        self.drone.set_axes(x=x, y=y, z=z, w=r)
        return x, y, z, r

    async def ws_handler(self, request: web.Request) -> web.StreamResponse:
        ws = web.WebSocketResponse(heartbeat=10.0, max_msg_size=2 * 1024 * 1024)
        await ws.prepare(request)
        self.clients.add(ws)

        # Start video broadcaster once.
        if self._video_task is None:
            self.drone.enable_video(max_queue=2)
            self._video_task = asyncio.create_task(self._video_broadcast_loop())

        try:
            async for msg in ws:
                if msg.type == web.WSMsgType.TEXT:
                    try:
                        obj = json.loads(msg.data)
                    except Exception:
                        continue
                    t = obj.get("t")
                    if t == "sync":
                        # Movement keys only.
                        keys = obj.get("keys") or []
                        self.keys = {str(k) for k in keys}
                        x, y, z, r = self._apply_keys()
                        try:
                            await ws.send_str(json.dumps({"t": "axes", "x": x, "y": y, "z": z, "r": r}))
                        except Exception:
                            pass
                    elif t == "reset":
                        self.keys = set()
                        self.drone.neutral()
                    elif t == "action":
                        a = obj.get("a")
                        if a == "takeoff":
                            self.drone.pulse_flags(FLAG_TAKEOFF, duration_s=0.35)
                        elif a == "land":
                            self.drone.pulse_flags(FLAG_LAND, duration_s=0.35)
                        elif a == "estop":
                            self.drone.neutral()
                            self.drone.pulse_flags(FLAG_ESTOP, duration_s=0.35)
                        elif a == "neutral":
                            self.keys = set()
                            self.drone.neutral()
                elif msg.type == web.WSMsgType.ERROR:
                    break
        finally:
            self.clients.discard(ws)
            self.keys = set()
            self.drone.neutral()
            try:
                await ws.close()
            except Exception:
                pass
        return ws

    async def _video_broadcast_loop(self) -> None:
        while True:
            # Pull frames from the drone thread in a worker thread.
            jpeg = await asyncio.to_thread(self.drone.get_jpeg, 1.0)
            if not jpeg:
                continue

            now = time.time()
            if (now - self._last_video_sent) < (1.0 / VIDEO_MAX_FPS):
                continue
            self._last_video_sent = now

            dead: list[web.WebSocketResponse] = []
            for ws in self.clients:
                if ws.closed:
                    dead.append(ws)
                    continue
                try:
                    await ws.send_bytes(jpeg)
                except Exception:
                    dead.append(ws)
            for ws in dead:
                self.clients.discard(ws)


async def index_handler(_: web.Request) -> web.Response:
    return web.FileResponse(STATIC_DIR / "index.html")


def make_app(drone: DroneLink) -> web.Application:
    app = web.Application(client_max_size=4 * 1024 * 1024)
    ctl = WebController(drone)
    app["ctl"] = ctl

    app.router.add_get("/", index_handler)
    app.router.add_get("/ws", ctl.ws_handler)
    app.router.add_static("/static", STATIC_DIR)
    return app


def main() -> int:
    drone = DroneLink(drone_ip=DRONE_IP_DEFAULT, verbose=True).start()
    try:
        app = make_app(drone)
        web.run_app(app, host="0.0.0.0", port=8000, print=None)
        return 0
    finally:
        drone.stop()


if __name__ == "__main__":
    raise SystemExit(main())
