import socket
import threading
import time
import queue
from dataclasses import dataclass


DRONE_IP_DEFAULT = "192.168.0.1"
DRONE_UDP_PORT = 40000

# These match what we observed in the phone->drone traffic:
# - heartbeat stream from UDP src port 6000
# - control stream from UDP src port 5010
HB_SRC_PORT = 6000
CTRL_SRC_PORT = 5010

HB_PAYLOAD = bytes.fromhex("63630100000000")  # cc opcode 0x0001

FLAG_TAKEOFF = 0x01
FLAG_LAND = 0x02
FLAG_ESTOP = 0x04
FLAG_GYRO_CALIB = 0x10
FLAG_HEADLESS = 0x80

VIDEO_SRC_PORT = 7070
_JPEG_SOI = b"\xff\xd8"
_JPEG_EOI = b"\xff\xd9"


def build_cc_control(x: int = 0x80, y: int = 0x80, z: int = 0x80, w: int = 0x80, flags: int = 0x00) -> bytes:
    """
    cc opcode 0x000a (15 bytes):
      63 63 0a 00 00 08 00 66  x y z w  flags  xor  99
    """
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


def _mk_udp_socket(bind_ip: str, bind_port: int, connect_dst: tuple[str, int] | None) -> socket.socket:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    except Exception:
        pass
    s.bind((bind_ip, bind_port))
    # Optional UDP connect:
    # - helps pick a concrete source IP (getsockname())
    # - but can also filter incoming packets by (ip,port) on many OSes
    if connect_dst is not None:
        s.connect(connect_dst)
    s.setblocking(False)
    return s


def _infer_local_ip(dst: tuple[str, int], bind_ip: str = "0.0.0.0") -> tuple[str, int] | None:
    """
    Returns the (local_ip, local_port) the kernel would choose to reach dst.
    Uses a temporary UDP connect so it doesn't filter incoming packets on our
    real receive socket.
    """
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.bind((bind_ip, 0))
        s.connect(dst)
        return s.getsockname()
    except Exception:
        return None
    finally:
        try:
            s.close()
        except Exception:
            pass


@dataclass
class Axes:
    x: int = 0x80
    y: int = 0x80
    z: int = 0x80
    w: int = 0x80
    flags: int = 0x00


class DroneLink:
    """
    Notebook-friendly controller:
    - call .start() once (starts heartbeat + control loops)
    - call .set_axes() / .pulse_flags() / .takeoff() / .land() from other cells
    """

    def __init__(
        self,
        drone_ip: str = DRONE_IP_DEFAULT,
        bind_ip: str = "0.0.0.0",
        hb_hz: float = 1.0,
        ctrl_hz: float = 22.3,
        verbose: bool = True,
    ) -> None:
        self.drone_ip = drone_ip
        self.bind_ip = bind_ip
        self.hb_hz = float(hb_hz)
        self.ctrl_hz = float(ctrl_hz)
        self.verbose = bool(verbose)

        self._dst = (self.drone_ip, DRONE_UDP_PORT)
        self._hb_sock: socket.socket | None = None
        self._ctrl_sock: socket.socket | None = None

        self._axes = Axes()
        self._axes_lock = threading.Lock()

        self._stop_evt = threading.Event()
        self._tel_evt = threading.Event()
        self._threads: list[threading.Thread] = []

        self._video_enabled = False
        self._video_q: "queue.Queue[bytes] | None" = None
        self._jpeg_buf = bytearray()
        self._video_dgrams = 0
        self._video_frames = 0
        self._video_last_print = 0.0
        self._video_hdr_len: int | None = None

    def enable_video(self, max_queue: int = 2) -> None:
        """
        Enable MJPEG reassembly from UDP src port 7070 (arrives on the :6000 socket).
        Call this before show_video() if you want a video window.
        """
        if max_queue < 1:
            raise ValueError("max_queue must be >= 1")
        self._video_q = queue.Queue(maxsize=int(max_queue))
        self._video_enabled = True
        self._jpeg_buf.clear()
        self._video_dgrams = 0
        self._video_frames = 0
        self._video_last_print = 0.0
        self._video_hdr_len = None
        if self.verbose:
            print("[VID] enabled", flush=True)

    def set_video_header_len(self, n: int) -> None:
        """
        Force a per-datagram header length to strip before JPEG parsing.
        If you know packets are 'HEADER + JPEG_BYTES', set n=HEADER.
        """
        n = int(n)
        if n < 0 or n > 256:
            raise ValueError("header length must be in [0, 256]")
        self._video_hdr_len = n
        if self.verbose:
            print(f"[VID] header_len forced to {n}", flush=True)

    def video_status(self) -> dict:
        return {
            "enabled": self._video_enabled,
            "dgrams": self._video_dgrams,
            "frames": self._video_frames,
            "header_len": self._video_hdr_len,
            "buf_len": len(self._jpeg_buf),
        }

    def get_jpeg(self, timeout_s: float | None = None) -> bytes | None:
        """
        Returns a full JPEG frame (bytes) or None if video isn't enabled or times out.
        """
        if not self._video_enabled or self._video_q is None:
            return None
        try:
            return self._video_q.get(timeout=timeout_s)
        except queue.Empty:
            return None

    def show_video(self, window_name: str = "drone", quit_key: str = "q") -> None:
        """
        Blocking OpenCV window loop. Run this in its own notebook cell.
        Press quit_key (default 'q') while the window is focused to exit.
        """
        if not self._video_enabled:
            self.enable_video()

        try:
            import cv2  # type: ignore
            import numpy as np  # type: ignore
        except Exception as e:
            raise RuntimeError("cv2/numpy not available; run `uv sync` in controller/") from e

        qk = (quit_key or "q")[0]
        qk_code = ord(qk)
        while not self._stop_evt.is_set():
            jpeg = self.get_jpeg(timeout_s=0.5)
            if not jpeg:
                continue
            arr = np.frombuffer(jpeg, dtype=np.uint8)
            img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
            if img is None:
                continue
            cv2.imshow(window_name, img)
            k = cv2.waitKey(1) & 0xFF
            if k == qk_code:
                break
        try:
            cv2.destroyWindow(window_name)
        except Exception:
            pass

    def show_video_inline(self, max_fps: float = 15.0) -> None:
        """
        Notebook-friendly inline display. Run this in its own cell and interrupt the cell to stop.
        Uses the JPEG bytes directly (no cv2 required).
        """
        if not self._video_enabled:
            self.enable_video()

        try:
            from IPython.display import Image, display, clear_output  # type: ignore
        except Exception as e:
            raise RuntimeError("IPython not available; use show_video() or install ipykernel") from e

        dt = 1.0 / float(max_fps) if max_fps and max_fps > 0 else 0.0
        last = 0.0
        while not self._stop_evt.is_set():
            jpeg = self.get_jpeg(timeout_s=0.5)
            if not jpeg:
                continue
            now = time.time()
            if dt and (now - last) < dt:
                continue
            last = now
            clear_output(wait=True)
            display(Image(data=jpeg))

    def show_video_widget(self, max_fps: float = 20.0) -> None:
        """
        Notebook-friendly widget display (usually faster than clear_output()).
        Run in its own cell and interrupt to stop.
        """
        if not self._video_enabled:
            self.enable_video()

        try:
            import ipywidgets as widgets  # type: ignore
            from IPython.display import display  # type: ignore
        except Exception as e:
            raise RuntimeError("ipywidgets not available; run `uv sync` in controller/") from e

        w = widgets.Image(format="jpeg")
        display(w)
        dt = 1.0 / float(max_fps) if max_fps and max_fps > 0 else 0.0
        last = 0.0
        while not self._stop_evt.is_set():
            jpeg = self.get_jpeg(timeout_s=0.5)
            if not jpeg:
                continue
            now = time.time()
            if dt and (now - last) < dt:
                continue
            last = now
            w.value = jpeg

    def start(self, wait_for_telemetry: bool = True, telemetry_timeout_s: float = 3.0) -> "DroneLink":
        if self._hb_sock is not None or self._ctrl_sock is not None:
            raise RuntimeError("already started")

        # Heartbeat socket must receive both telemetry (src=40000) and video (src=7070).
        # Do NOT UDP-connect it, otherwise many kernels will drop packets from src=7070.
        self._hb_sock = _mk_udp_socket(self.bind_ip, HB_SRC_PORT, connect_dst=None)
        # Control socket is send-only; safe to connect.
        self._ctrl_sock = _mk_udp_socket(self.bind_ip, CTRL_SRC_PORT, connect_dst=self._dst)
        # Best-effort: large receive buffer reduces video packet loss.
        try:
            self._hb_sock.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, 4 * 1024 * 1024)
        except Exception:
            pass

        if self.verbose:
            inferred = _infer_local_ip(self._dst, bind_ip=self.bind_ip)
            inferred_s = f"{inferred[0]}:{inferred[1]}" if inferred is not None else "?"
            print(
                f"[HB] local={self._hb_sock.getsockname()} inferred_src={inferred_s} -> {self.drone_ip}:{DRONE_UDP_PORT} hz={self.hb_hz}",
                flush=True,
            )
            print(f"[CTRL] local={self._ctrl_sock.getsockname()} -> {self.drone_ip}:{DRONE_UDP_PORT} hz={self.ctrl_hz}", flush=True)

        self._stop_evt.clear()
        self._tel_evt.clear()

        t_hb = threading.Thread(target=self._hb_loop, name="drone-hb", daemon=True)
        t_rx = threading.Thread(target=self._rx_loop, name="drone-rx", daemon=True)
        t_ctrl = threading.Thread(target=self._ctrl_loop, name="drone-ctrl", daemon=True)
        self._threads = [t_hb, t_rx, t_ctrl]
        for t in self._threads:
            t.start()

        if wait_for_telemetry:
            if self.verbose:
                print("[CTRL] waiting for telemetry...", flush=True)
            ok = self._tel_evt.wait(timeout=float(telemetry_timeout_s))
            if self.verbose:
                print(f"[CTRL] telemetry {'seen' if ok else 'NOT seen'}; control stream running", flush=True)
        return self

    def stop(self) -> None:
        self._stop_evt.set()
        for t in self._threads:
            t.join(timeout=0.3)
        self._threads.clear()
        if self._hb_sock is not None:
            try:
                self._hb_sock.close()
            except Exception:
                pass
            self._hb_sock = None
        if self._ctrl_sock is not None:
            try:
                self._ctrl_sock.close()
            except Exception:
                pass
            self._ctrl_sock = None

    def set_axes(self, *, x: int | None = None, y: int | None = None, z: int | None = None, w: int | None = None, flags: int | None = None) -> None:
        with self._axes_lock:
            if x is not None:
                self._axes.x = int(x) & 0xFF
            if y is not None:
                self._axes.y = int(y) & 0xFF
            if z is not None:
                self._axes.z = int(z) & 0xFF
            if w is not None:
                self._axes.w = int(w) & 0xFF
            if flags is not None:
                self._axes.flags = int(flags) & 0xFF

    def neutral(self) -> None:
        self.set_axes(x=0x80, y=0x80, z=0x80, w=0x80, flags=0x00)

    def pulse_flags(self, flags: int, duration_s: float = 0.35) -> None:
        flags &= 0xFF
        with self._axes_lock:
            old = self._axes.flags
            self._axes.flags = flags
        time.sleep(float(duration_s))
        with self._axes_lock:
            self._axes.flags = old

    def takeoff(self, duration_s: float = 0.35) -> None:
        self.pulse_flags(FLAG_TAKEOFF, duration_s=duration_s)

    def land(self, duration_s: float = 0.35) -> None:
        self.pulse_flags(FLAG_LAND, duration_s=duration_s)

    def estop(self, duration_s: float = 0.35) -> None:
        self.pulse_flags(FLAG_ESTOP, duration_s=duration_s)

    def gyro_calibrate(self, duration_s: float = 0.7) -> None:
        self.pulse_flags(FLAG_GYRO_CALIB, duration_s=duration_s)

    def _hb_loop(self) -> None:
        assert self._hb_sock is not None
        if self.hb_hz <= 0:
            return
        dt = 1.0 / self.hb_hz
        next_t = time.monotonic()
        while not self._stop_evt.is_set():
            now = time.monotonic()
            if now < next_t:
                time.sleep(next_t - now)
            else:
                next_t = now
            next_t += dt
            try:
                self._hb_sock.sendto(HB_PAYLOAD, self._dst)
            except Exception:
                time.sleep(0.05)

    def _ctrl_loop(self) -> None:
        assert self._ctrl_sock is not None
        if self.ctrl_hz <= 0:
            return
        dt = 1.0 / self.ctrl_hz
        next_t = time.monotonic()
        while not self._stop_evt.is_set():
            now = time.monotonic()
            if now < next_t:
                time.sleep(next_t - now)
            else:
                next_t = now
            next_t += dt

            with self._axes_lock:
                a = self._axes
                payload = build_cc_control(a.x, a.y, a.z, a.w, a.flags)
            try:
                self._ctrl_sock.sendto(payload, self._dst)
            except Exception:
                time.sleep(0.01)

    def _rx_loop(self) -> None:
        assert self._hb_sock is not None
        last_print = 0.0
        while not self._stop_evt.is_set():
            try:
                data, (ip, src_port) = self._hb_sock.recvfrom(65535)
            except BlockingIOError:
                time.sleep(0.01)
                continue
            except Exception:
                time.sleep(0.05)
                continue

            if ip != self.drone_ip:
                continue
            if src_port == VIDEO_SRC_PORT:
                if self._video_enabled and self._video_q is not None:
                    self._video_dgrams += 1
                    self._on_video_datagram(data)
                    if self.verbose and (time.time() - self._video_last_print) >= 1.0:
                        self._video_last_print = time.time()
                        print(f"[VID] dgrams={self._video_dgrams} frames={self._video_frames}", flush=True)
                continue
            if src_port == DRONE_UDP_PORT:
                self._tel_evt.set()

            if self.verbose and (time.time() - last_print) >= 1.0:
                last_print = time.time()
                print(f"[RX] udp src={src_port} len={len(data)} head={data[:16].hex()}", flush=True)

    def _on_video_datagram(self, data: bytes) -> None:
        """
        Video may be:
        - full JPEG per UDP packet, or
        - JPEG split across packets with a small fixed per-packet header.

        We auto-detect and strip a fixed header length (based on where SOI appears),
        then either emit a single-packet JPEG immediately, or stream-reassemble using
        SOI..EOI markers.
        """
        payload = self._strip_video_header(data)

        # Fast path: whole JPEG is in this one datagram.
        soi = payload.find(_JPEG_SOI)
        if soi >= 0:
            eoi = payload.find(_JPEG_EOI, soi + 2)
            if eoi >= 0:
                self._emit_jpeg(payload[soi : eoi + 2])
                return

        self._jpeg_buf.extend(payload)
        # Hard cap: keep last ~1MB so we can resync if we miss packets.
        if len(self._jpeg_buf) > 1_000_000:
            del self._jpeg_buf[:-200_000]

        buf = self._jpeg_buf
        while True:
            soi = buf.find(_JPEG_SOI)
            if soi < 0:
                if len(buf) > 4:
                    del buf[:-4]
                return
            if soi > 0:
                del buf[:soi]

            eoi = buf.find(_JPEG_EOI, 2)
            if eoi < 0:
                # Keep accumulating until we see the end marker.
                return
            jpeg = bytes(buf[: eoi + 2])
            del buf[: eoi + 2]
            self._emit_jpeg(jpeg)

    def _strip_video_header(self, data: bytes) -> bytes:
        """
        Strip a fixed per-datagram header if present.
        Detection: in early packets, SOI tends to appear at a consistent small offset.
        """
        if self._video_hdr_len is None:
            soi = data.find(_JPEG_SOI)
            if soi == 0:
                self._video_hdr_len = 0
            elif 0 < soi <= 64:
                self._video_hdr_len = soi
            else:
                return data
            if self.verbose:
                print(f"[VID] header_len={self._video_hdr_len}", flush=True)

        hl = self._video_hdr_len or 0
        if hl <= 0:
            return data
        if len(data) <= hl:
            return b""
        return data[hl:]

    def _emit_jpeg(self, jpeg: bytes) -> None:
        if not (jpeg.startswith(_JPEG_SOI) and jpeg.endswith(_JPEG_EOI)):
            return
        self._video_frames += 1
        q = self._video_q
        if q is None:
            return
        # Keep newest frames; drop if the consumer is slow.
        try:
            q.put_nowait(jpeg)
        except queue.Full:
            try:
                _ = q.get_nowait()
            except queue.Empty:
                pass
            try:
                q.put_nowait(jpeg)
            except queue.Full:
                pass


def start_drone(drone_ip: str = DRONE_IP_DEFAULT, *, verbose: bool = True) -> DroneLink:
    return DroneLink(drone_ip=drone_ip, verbose=verbose).start()
