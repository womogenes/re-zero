#!/usr/bin/env python3
"""
MX Brio Live Camera Demo - OpenCV + Morse + Zoom.
Captures frames via cv2.VideoCapture, applies real-time effects,
Morse code LED, hardware/digital zoom. Keyboard controls.
"""

import sys
import os
import time
import threading
import numpy as np
import cv2

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

sys.stdout = os.fdopen(sys.stdout.fileno(), 'w', buffering=1)

def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)

log("Starting MX Brio Live Demo (OpenCV)...")

from mx_brio_morse import MORSE, text_to_morse, morse_to_timeline, wpm_to_unit

try:
    import hid
    HAS_HID = True
except ImportError:
    HAS_HID = False

VID, PID = 0x046D, 0x0944

# ── Globals ──────────────────────────────────────────────────────

current_effect = "Normal"
intensity = 1.0
led_dev = None
led_blinking = False
zoom_level = 1.0        # 1.0 = no zoom, 4.0 = max
hw_zoom = 100            # hardware zoom (100-400)
hw_zoom_works = False     # whether CAP_PROP_ZOOM actually works
morse_active = False
morse_text = ""           # current Morse message
morse_char = ""           # current character being sent
morse_symbol = ""         # current dot/dash
morse_led_on = False      # LED state for HUD indicator

# ── Effect functions ─────────────────────────────────────────────

def fx_normal(frame, _):
    return frame

def fx_grayscale(frame, _):
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    return cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)

def fx_sepia(frame, intensity):
    kernel = np.array([
        [0.272, 0.534, 0.131],
        [0.349, 0.686, 0.168],
        [0.393, 0.769, 0.189],
    ])
    sepia = cv2.transform(frame, kernel)
    sepia = np.clip(sepia, 0, 255).astype(np.uint8)
    alpha = min(intensity, 1.0)
    return cv2.addWeighted(sepia, alpha, frame, 1.0 - alpha, 0)

def fx_invert(frame, _):
    return cv2.bitwise_not(frame)

def fx_contrast(frame, intensity):
    alpha = 1.0 + intensity
    return np.clip(alpha * frame.astype(np.float32) - 128 * (alpha - 1), 0, 255).astype(np.uint8)

def fx_dark(frame, intensity):
    beta = -50 * intensity
    return np.clip(frame.astype(np.float32) + beta, 0, 255).astype(np.uint8)

def fx_bright(frame, intensity):
    beta = 50 * intensity
    return np.clip(frame.astype(np.float32) + beta, 0, 255).astype(np.uint8)

def fx_saturate(frame, intensity):
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV).astype(np.float32)
    hsv[:, :, 1] = np.clip(hsv[:, :, 1] * (1.0 + intensity), 0, 255)
    return cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)

def fx_desaturate(frame, _):
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    hsv[:, :, 1] = 0
    return cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)

def fx_hue(frame, intensity):
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV).astype(np.float32)
    hsv[:, :, 0] = (hsv[:, :, 0] + 90 * intensity) % 180
    return cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)

def fx_pixelate(frame, intensity):
    h, w = frame.shape[:2]
    scale = max(2, int(12 * intensity))
    small = cv2.resize(frame, (w // scale, h // scale), interpolation=cv2.INTER_LINEAR)
    return cv2.resize(small, (w, h), interpolation=cv2.INTER_NEAREST)

def fx_blur(frame, intensity):
    ksize = max(1, int(20 * intensity)) | 1
    return cv2.GaussianBlur(frame, (ksize, ksize), 0)

def fx_edges(frame, intensity):
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 50 / intensity, 150 / intensity)
    return cv2.cvtColor(edges, cv2.COLOR_GRAY2BGR)

def fx_posterize(frame, intensity):
    levels = max(2, int(6 - 3 * intensity))
    div = 256 // levels
    return (frame // div * div + div // 2).astype(np.uint8)

def fx_thermal(frame, intensity):
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    return cv2.applyColorMap(gray, cv2.COLORMAP_JET)

def fx_emboss(frame, _):
    kernel = np.array([[-2, -1, 0], [-1, 1, 1], [0, 1, 2]])
    return cv2.filter2D(frame, -1, kernel) + 128

def fx_sketch(frame, _):
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    inv = cv2.bitwise_not(gray)
    blur = cv2.GaussianBlur(inv, (21, 21), 0)
    sketch = cv2.divide(gray, 255 - blur, scale=256)
    return cv2.cvtColor(sketch, cv2.COLOR_GRAY2BGR)

EFFECTS = {
    ord('1'): ("Normal",        fx_normal),
    ord('2'): ("Grayscale",     fx_grayscale),
    ord('3'): ("Sepia",         fx_sepia),
    ord('4'): ("Invert",        fx_invert),
    ord('5'): ("High Contrast", fx_contrast),
    ord('6'): ("Dark",          fx_dark),
    ord('7'): ("Bright",        fx_bright),
    ord('8'): ("Saturate",      fx_saturate),
    ord('9'): ("Hue Shift",     fx_hue),
    ord('0'): ("Pixelate",      fx_pixelate),
    ord('b'): ("Blur",          fx_blur),
    ord('e'): ("Edges",         fx_edges),
    ord('p'): ("Posterize",     fx_posterize),
    ord('d'): ("Desaturate",    fx_desaturate),
    ord('t'): ("Thermal",       fx_thermal),
    ord('m'): ("Emboss",        fx_emboss),
    ord('s'): ("Sketch",        fx_sketch),
}

# ── Morse LED (background thread) ───────────────────────────────

def morse_send(text, wpm=12):
    """Flash Morse code on LED in background. Updates HUD globals."""
    global morse_active, morse_text, morse_char, morse_symbol, morse_led_on
    if not led_dev:
        log("  Morse: no LED device")
        return
    if morse_active:
        log("  Morse: already sending")
        return

    morse_active = True
    morse_text = text.upper()

    def worker():
        global morse_active, morse_char, morse_symbol, morse_led_on
        unit = wpm_to_unit(wpm)
        log(f"  Morse: \"{morse_text}\" @ {wpm}wpm (unit={unit*1000:.0f}ms)")

        words = morse_text.split()
        for wi, word in enumerate(words):
            for ci, ch in enumerate(word):
                if not morse_active:
                    break
                code = MORSE.get(ch, '')
                if not code:
                    continue
                morse_char = ch
                morse_symbol = code
                log(f"    '{ch}' = {code}")

                for si, sym in enumerate(code):
                    if not morse_active:
                        break
                    dur = unit if sym == '.' else 3 * unit
                    try:
                        led_dev.write([0x08, 0x01])
                    except:
                        pass
                    morse_led_on = True
                    time.sleep(dur)
                    try:
                        led_dev.write([0x08, 0x00])
                    except:
                        pass
                    morse_led_on = False
                    # intra-character gap
                    if si < len(code) - 1:
                        time.sleep(unit)

                # inter-character gap
                if ci < len(word) - 1:
                    time.sleep(3 * unit)

            # word gap
            if wi < len(words) - 1:
                morse_char = " "
                morse_symbol = ""
                time.sleep(7 * unit)

        morse_active = False
        morse_char = ""
        morse_symbol = ""
        morse_led_on = False
        log(f"  Morse: done")

    threading.Thread(target=worker, daemon=True).start()

# ── Digital zoom ─────────────────────────────────────────────────

def apply_digital_zoom(frame, zoom):
    """Crop center of frame by zoom factor and resize back."""
    if zoom <= 1.01:
        return frame
    h, w = frame.shape[:2]
    zh, zw = int(h / zoom), int(w / zoom)
    y1 = (h - zh) // 2
    x1 = (w - zw) // 2
    cropped = frame[y1:y1+zh, x1:x1+zw]
    return cv2.resize(cropped, (w, h), interpolation=cv2.INTER_LINEAR)

# ── LED toggle ───────────────────────────────────────────────────

def toggle_led():
    global led_blinking
    if not led_dev:
        log("  LED: not available")
        return
    if led_blinking:
        led_blinking = False
        log("  LED: blink OFF")
    else:
        led_blinking = True
        def blink():
            while led_blinking:
                try:
                    led_dev.write([0x08, 0x01])
                    time.sleep(0.5)
                    led_dev.write([0x08, 0x00])
                    time.sleep(0.5)
                except:
                    break
        threading.Thread(target=blink, daemon=True).start()
        log("  LED: blink ON")

# ── Find camera ──────────────────────────────────────────────────

def find_and_open_brio():
    """Find the MX Brio using AVFoundation name lookup, open with OpenCV."""
    brio_idx = None
    try:
        import AVFoundation as AVF
        devices = AVF.AVCaptureDevice.devicesWithMediaType_(AVF.AVMediaTypeVideo)
        for i, d in enumerate(devices):
            name = str(d.localizedName())
            log(f"  [{i}] {name}")
            if "brio" in name.lower():
                brio_idx = i
    except ImportError:
        log("  AVFoundation not available, trying index 0")

    if brio_idx is None:
        brio_idx = 0
        log(f"  WARN: Brio not found by name, trying index {brio_idx}")
    else:
        log(f"  -> MX Brio at AVFoundation index {brio_idx}")

    for idx in [brio_idx, 1 - brio_idx]:
        log(f"  Trying OpenCV index {idx}...")
        cap = cv2.VideoCapture(idx, cv2.CAP_AVFOUNDATION)
        if not cap.isOpened():
            log(f"  [{idx}] failed to open")
            continue
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
        cap.set(cv2.CAP_PROP_FPS, 30)

        ok = False
        for attempt in range(20):
            ret, frame = cap.read()
            if ret:
                log(f"  [{idx}] first frame at attempt {attempt + 1}: {frame.shape}")
                ok = True
                break
            time.sleep(0.15)

        if ok:
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, 3840)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 2160)
            w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            is_brio = w >= 3840
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
            tag = "MX Brio (4K confirmed)" if is_brio else "MacBook camera"
            log(f"  [{idx}] identified as: {tag}")
            if is_brio:
                return cap
            cap.release()
        else:
            log(f"  [{idx}] no frames after 20 attempts")
            cap.release()

    log("  Fallback: opening first available camera")
    cap = cv2.VideoCapture(0, cv2.CAP_AVFOUNDATION)
    return cap if cap.isOpened() else None

# ── HUD drawing ──────────────────────────────────────────────────

def draw_hud(display, w, h, frame_count):
    """Draw heads-up display overlay on frame."""
    # Top bar: effect + zoom + frame
    zoom_str = f"zoom={zoom_level:.1f}x"
    if hw_zoom_works:
        zoom_str += f" (HW:{hw_zoom})"
    label = f"{current_effect} | {zoom_str} | {w}x{h} | #{frame_count}"
    cv2.putText(display, label, (10, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 255, 0), 2)

    # Morse display (bottom)
    if morse_active:
        # LED indicator circle
        color = (0, 255, 255) if morse_led_on else (80, 80, 80)  # yellow when on
        cv2.circle(display, (30, h - 40), 15, color, -1)
        cv2.circle(display, (30, h - 40), 15, (255, 255, 255), 2)

        # Message + current char
        morse_full = text_to_morse(morse_text)
        cv2.putText(display, f"MORSE: {morse_text}", (55, h - 55),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
        cv2.putText(display, f"  [{morse_char}] {morse_symbol}", (55, h - 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)

        # Visual Morse code bar
        bar_y = h - 15
        bar_x = 55
        for ch in morse_full:
            if ch == '.':
                cv2.rectangle(display, (bar_x, bar_y - 6), (bar_x + 8, bar_y + 6),
                              (0, 255, 255), -1)
                bar_x += 12
            elif ch == '-':
                cv2.rectangle(display, (bar_x, bar_y - 6), (bar_x + 24, bar_y + 6),
                              (0, 255, 255), -1)
                bar_x += 28
            elif ch == '/':
                bar_x += 10

    # Zoom crosshair when zoomed
    if zoom_level > 1.01:
        cx, cy = w // 2, h // 2
        cv2.line(display, (cx - 20, cy), (cx + 20, cy), (0, 255, 0), 1)
        cv2.line(display, (cx, cy - 20), (cx, cy + 20), (0, 255, 0), 1)
        cv2.circle(display, (cx, cy), 30, (0, 255, 0), 1)

    return display

# ── Main ─────────────────────────────────────────────────────────

def main():
    global current_effect, intensity, led_dev, led_blinking
    global zoom_level, hw_zoom, hw_zoom_works, morse_active

    log("Finding cameras...")
    cap = find_and_open_brio()
    if cap is None or not cap.isOpened():
        log("FATAL: Cannot open camera")
        return

    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
    cap.set(cv2.CAP_PROP_FPS, 30)

    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    log(f"  Resolution: {w}x{h} @ {fps:.0f}fps")

    # Test hardware zoom
    cur_zoom = cap.get(cv2.CAP_PROP_ZOOM)
    cap.set(cv2.CAP_PROP_ZOOM, 150)
    new_zoom = cap.get(cv2.CAP_PROP_ZOOM)
    if new_zoom != cur_zoom and new_zoom > 0:
        hw_zoom_works = True
        hw_zoom = int(new_zoom)
        cap.set(cv2.CAP_PROP_ZOOM, 100)  # reset
        hw_zoom = 100
        log(f"  Hardware zoom: YES (100-400)")
    else:
        log(f"  Hardware zoom: NO (using digital)")
    cap.set(cv2.CAP_PROP_ZOOM, 100)

    for _ in range(5):
        cap.read()

    # LED
    if HAS_HID:
        try:
            devices = hid.enumerate(VID, PID)
            if devices:
                led_dev = hid.device()
                led_dev.open_path(devices[0]["path"])
                log("  LED ready")
        except Exception as e:
            log(f"  LED failed: {e}")

    # Window
    win_name = "MX Brio Live"
    cv2.namedWindow(win_name, cv2.WINDOW_NORMAL)
    cv2.resizeWindow(win_name, 1280, 720)

    current_effect = "Normal"
    current_fn = fx_normal
    frame_count = 0

    log("")
    log("=" * 60)
    log("  LIVE - Keys (click video window first):")
    log("  1-9,0 = Effects  b=Blur e=Edges p=Poster")
    log("  d=Desat t=Thermal m=Emboss s=Sketch")
    log("  +/- = Intensity")
    log("  z/x = Zoom in/out   r = Reset zoom")
    log("  h = Morse 'HELLO'   n = Morse 'SOS'")
    log("  c = Morse custom (type in terminal)")
    log("  l = LED blink toggle")
    log("  q/ESC = Quit")
    log("=" * 60)
    log("")

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                log("Frame grab failed, retrying...")
                time.sleep(0.1)
                continue

            frame_count += 1

            # Apply zoom
            if hw_zoom_works and hw_zoom > 100:
                pass  # hardware zoom applied at capture level
            else:
                frame = apply_digital_zoom(frame, zoom_level)

            # Apply effect
            try:
                display = current_fn(frame, intensity)
            except Exception as e:
                if frame_count <= 3:
                    log(f"  Effect error: {e}")
                display = frame

            # HUD
            display = draw_hud(display, w, h, frame_count)

            cv2.imshow(win_name, display)

            key = cv2.waitKey(1) & 0xFF

            if key == ord('q') or key == 27:
                log("Quit")
                break
            elif key in EFFECTS:
                current_effect, current_fn = EFFECTS[key]
                log(f"  Effect: {current_effect}")
            elif key in (ord('+'), ord('=')):
                intensity = min(intensity + 0.2, 3.0)
                log(f"  Intensity: {intensity:.1f}")
            elif key == ord('-'):
                intensity = max(intensity - 0.2, 0.2)
                log(f"  Intensity: {intensity:.1f}")

            # Zoom
            elif key == ord('z'):
                if hw_zoom_works:
                    hw_zoom = min(hw_zoom + 50, 400)
                    cap.set(cv2.CAP_PROP_ZOOM, hw_zoom)
                    log(f"  Zoom: HW {hw_zoom}")
                    zoom_level = hw_zoom / 100.0
                else:
                    zoom_level = min(zoom_level + 0.5, 4.0)
                    log(f"  Zoom: {zoom_level:.1f}x (digital)")
            elif key == ord('x'):
                if hw_zoom_works:
                    hw_zoom = max(hw_zoom - 50, 100)
                    cap.set(cv2.CAP_PROP_ZOOM, hw_zoom)
                    log(f"  Zoom: HW {hw_zoom}")
                    zoom_level = hw_zoom / 100.0
                else:
                    zoom_level = max(zoom_level - 0.5, 1.0)
                    log(f"  Zoom: {zoom_level:.1f}x (digital)")
            elif key == ord('r'):
                zoom_level = 1.0
                hw_zoom = 100
                if hw_zoom_works:
                    cap.set(cv2.CAP_PROP_ZOOM, 100)
                log("  Zoom: reset to 1.0x")

            # Morse
            elif key == ord('h'):
                morse_send("HELLO", wpm=12)
            elif key == ord('n'):
                morse_send("SOS", wpm=12)
            elif key == ord('c'):
                # Read from terminal (won't block video since we check in next iteration)
                log("  Type Morse message in terminal and press Enter:")
                morse_active = False  # stop any current
                def read_and_send():
                    try:
                        msg = input("  > ")
                        if msg.strip():
                            morse_send(msg.strip(), wpm=12)
                    except:
                        pass
                threading.Thread(target=read_and_send, daemon=True).start()

            elif key == ord('l'):
                if morse_active:
                    morse_active = False
                    try:
                        led_dev.write([0x08, 0x00])
                    except:
                        pass
                    log("  Morse: stopped")
                else:
                    toggle_led()

            elif key != 255:
                log(f"  Unknown key: {key} ('{chr(key) if 32 <= key < 127 else '?'}')")

    except KeyboardInterrupt:
        log("Interrupted")
    finally:
        log("Cleaning up...")
        morse_active = False
        cap.release()
        cv2.destroyAllWindows()
        led_blinking = False
        if led_dev:
            try:
                led_dev.write([0x08, 0x00])
                led_dev.close()
            except:
                pass
        log(f"Total frames: {frame_count}")
        log("Done.")


if __name__ == "__main__":
    main()
