import asyncio
import json
import time
from pathlib import Path

from aiohttp import web

from drone import DroneLink, DRONE_IP_DEFAULT, FLAG_ESTOP, FLAG_GYRO_CALIB, FLAG_LAND, FLAG_TAKEOFF


HERE = Path(__file__).resolve().parent
STATIC_DIR = HERE / "web_static"

# Tuning knobs (edit if any axis direction feels inverted).
NEUTRAL = 0x80
STRAFE_DELTA = 0x30  # A/D
PITCH_DELTA = 0x30   # W/S
THROTTLE_DELTA = 0x30  # Up/Down
YAW_DELTA = 0x7F     # Left/Right (max); smoothed below so it doesn't feel jerky

# Directions. If a control feels backwards, flip the +/- below.
W_IS_FORWARD_NEG = False
UP_IS_THROTTLE_POS = True
RIGHT_IS_YAW_POS = True
D_IS_STRAFE_POS = True

# 0 disables server-side FPS capping (send frames as they arrive).
VIDEO_MAX_FPS = 0.0
AXES_TICK_HZ = 30.0
# Slew limiter (max change per tick). This mainly affects yaw feel.
AXES_SLEW_STEP = 0x10


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


def _slew_u8(cur: int, target: int, step: int) -> int:
    cur &= 0xFF
    target &= 0xFF
    if cur == target:
        return cur
    if step <= 0:
        return target
    if target > cur:
        return min(target, cur + step)
    return max(target, cur - step)


class WebController:
    def __init__(self, drone: DroneLink) -> None:
        self.drone = drone
        self.clients_ctrl: set[web.WebSocketResponse] = set()
        self.clients_video: set[web.WebSocketResponse] = set()
        self.keys: set[str] = set()
        self._axes_cur = (NEUTRAL, NEUTRAL, NEUTRAL, NEUTRAL)
        self._last_video_sent = 0.0
        self._video_task: asyncio.Task | None = None
        self._axes_task: asyncio.Task | None = None
        self._axes_last_bcast = 0.0

    def _apply_keys(self) -> tuple[int, int, int, int]:
        # Target based on keys, but slew-limit for smoother start/stop (especially yaw).
        tx, ty, tz, tr = _axes_from_keys(self.keys)
        cx, cy, cz, cr = self._axes_cur
        nx = _slew_u8(cx, tx, AXES_SLEW_STEP)
        ny = _slew_u8(cy, ty, AXES_SLEW_STEP)
        nz = _slew_u8(cz, tz, AXES_SLEW_STEP)
        nr = _slew_u8(cr, tr, AXES_SLEW_STEP)
        self._axes_cur = (nx, ny, nz, nr)
        # Don't touch flags here; allow takeoff/land/estop/calib pulses to coexist with movement updates.
        self.drone.set_axes(x=nx, y=ny, z=nz, w=nr)
        return self._axes_cur

    async def _axes_loop(self) -> None:
        dt = 1.0 / AXES_TICK_HZ
        while True:
            await asyncio.sleep(dt)
            x, y, z, r = self._apply_keys()
            # Broadcast HUD axes at low rate.
            now = time.time()
            if now - self._axes_last_bcast < 0.12:
                continue
            self._axes_last_bcast = now
            dead: list[web.WebSocketResponse] = []
            for ws in self.clients_ctrl:
                if ws.closed:
                    dead.append(ws)
                    continue
                try:
                    await ws.send_str(json.dumps({"t": "axes", "x": x, "y": y, "z": z, "r": r}))
                except Exception:
                    dead.append(ws)
            for ws in dead:
                self.clients_ctrl.discard(ws)

    async def ws_ctrl_handler(self, request: web.Request) -> web.StreamResponse:
        ws = web.WebSocketResponse(heartbeat=10.0, max_msg_size=2 * 1024 * 1024)
        await ws.prepare(request)
        self.clients_ctrl.add(ws)

        # Start video broadcaster once.
        if self._video_task is None:
            self.drone.enable_video(max_queue=2)
            self._video_task = asyncio.create_task(self._video_broadcast_loop())
        if self._axes_task is None:
            self._axes_task = asyncio.create_task(self._axes_loop())

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
                        # Axes loop will converge on this set; reply once with current value.
                        x, y, z, r = self._apply_keys()
                        await ws.send_str(json.dumps({"t": "axes", "x": x, "y": y, "z": z, "r": r}))
                    elif t == "reset":
                        self.keys = set()
                        self.drone.neutral()
                    elif t == "action":
                        a = obj.get("a")
                        if a == "takeoff":
                            await asyncio.to_thread(self.drone.pulse_flags, FLAG_TAKEOFF, 0.35)
                        elif a == "land":
                            await asyncio.to_thread(self.drone.pulse_flags, FLAG_LAND, 0.35)
                        elif a == "estop":
                            await asyncio.to_thread(self.drone.neutral)
                            await asyncio.to_thread(self.drone.pulse_flags, FLAG_ESTOP, 0.35)
                        elif a == "calib":
                            await asyncio.to_thread(self.drone.pulse_flags, FLAG_GYRO_CALIB, 0.7)
                        elif a == "neutral":
                            self.keys = set()
                            await asyncio.to_thread(self.drone.neutral)
                elif msg.type == web.WSMsgType.ERROR:
                    break
        finally:
            self.clients_ctrl.discard(ws)
            self.keys = set()
            try:
                await asyncio.to_thread(self.drone.neutral)
            except Exception:
                pass
            try:
                await ws.close()
            except Exception:
                pass
        return ws

    async def ws_video_handler(self, request: web.Request) -> web.StreamResponse:
        # Video is heavy; isolate it from control to avoid TCP backpressure impacting input.
        ws = web.WebSocketResponse(heartbeat=10.0, max_msg_size=4 * 1024 * 1024)
        await ws.prepare(request)
        self.clients_video.add(ws)

        if self._video_task is None:
            self.drone.enable_video(max_queue=2)
            self._video_task = asyncio.create_task(self._video_broadcast_loop())

        try:
            async for msg in ws:
                if msg.type == web.WSMsgType.ERROR:
                    break
                # Ignore any client messages; this socket is server->client only.
        finally:
            self.clients_video.discard(ws)
            try:
                await ws.close()
            except Exception:
                pass
        return ws

    async def shutdown(self) -> None:
        # Best-effort cleanup; don't block shutdown on any one client.
        for ws in list(self.clients_ctrl):
            try:
                await ws.close()
            except Exception:
                pass
        self.clients_ctrl.clear()
        for ws in list(self.clients_video):
            try:
                await ws.close()
            except Exception:
                pass
        self.clients_video.clear()
        if self._video_task is not None:
            self._video_task.cancel()
            self._video_task = None
        if self._axes_task is not None:
            self._axes_task.cancel()
            self._axes_task = None

    async def _video_broadcast_loop(self) -> None:
        while True:
            # Pull frames from the drone thread in a worker thread.
            jpeg = await asyncio.to_thread(self.drone.get_jpeg, 1.0)
            if not jpeg:
                continue

            if VIDEO_MAX_FPS and VIDEO_MAX_FPS > 0:
                now = time.time()
                if (now - self._last_video_sent) < (1.0 / VIDEO_MAX_FPS):
                    continue
                self._last_video_sent = now

            dead: list[web.WebSocketResponse] = []
            for ws in self.clients_video:
                if ws.closed:
                    dead.append(ws)
                    continue
                try:
                    await ws.send_bytes(jpeg)
                except Exception:
                    dead.append(ws)
            for ws in dead:
                self.clients_video.discard(ws)


async def health_handler(request: web.Request) -> web.Response:
    ctl: WebController = request.app["ctl"]
    return web.json_response(
        {
            "clients_ctrl": len(ctl.clients_ctrl),
            "clients_video": len(ctl.clients_video),
            "keys": sorted(ctl.keys),
            "video": ctl.drone.video_status(),
        }
    )


async def index_handler(_: web.Request) -> web.Response:
    return web.FileResponse(STATIC_DIR / "index.html")


def make_app(drone: DroneLink) -> web.Application:
    app = web.Application(client_max_size=4 * 1024 * 1024)
    ctl = WebController(drone)
    app["ctl"] = ctl

    app.router.add_get("/", index_handler)
    app.router.add_get("/ws_ctrl", ctl.ws_ctrl_handler)
    app.router.add_get("/ws_video", ctl.ws_video_handler)
    app.router.add_get("/health", health_handler)
    app.router.add_static("/static", STATIC_DIR)

    async def _on_shutdown(app: web.Application) -> None:
        try:
            await app["ctl"].shutdown()
        except Exception:
            pass
        try:
            await asyncio.to_thread(drone.neutral)
        except Exception:
            pass

    app.on_shutdown.append(_on_shutdown)
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
