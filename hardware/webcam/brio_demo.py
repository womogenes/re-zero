#!/usr/bin/env python3
"""
Brio Demo - MX Brio SDK showcase.

Live video with effects, type a message to flash as Morse code on the LED.

Keys:
  [ / ] or , / . : Prev / next effect
  z / x          : Zoom in / out
  r              : Reset zoom
  h              : Flash "HELLO" in Morse
  n              : Flash "SOS" in Morse
  m              : Enter text → Morse on LED (type in the window)
  p              : Party mode (cycles patterns)
  l              : LED toggle
  s              : Save snapshot
  v              : Start/stop video recording
  SPACE          : Stop LED / Morse
  q / ESC        : Quit
"""

import os
import sys
import time
import numpy as np
import cv2

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from brio_sdk import Brio, EFFECTS
from mx_brio_morse import text_to_morse

# ── State ─────────────────────────────────────────────────────

effect_names = list(EFFECTS.keys())
effect_idx = 0
party_patterns = ["strobe", "pulse", "heartbeat", "disco", "countdown"]
party_idx = 0
led_on_manual = False

# Text input mode
typing_mode = False
typed_text = ""

# Status
status_msg = ""
status_time = 0

# Recording
recording = False
rec_start_time = 0


def set_status(msg, duration=3.0):
    global status_msg, status_time
    status_msg = msg
    status_time = time.time() + duration


# ── HUD ──────────────────────────────────────────────────────

def draw_hud(frame, cam):
    h, w = frame.shape[:2]
    overlay = frame.copy()

    # Semi-transparent bar at bottom
    bar_h = 110 if typing_mode else 90
    cv2.rectangle(overlay, (0, h - bar_h), (w, h), (0, 0, 0), -1)
    cv2.addWeighted(overlay, 0.6, frame, 0.4, 0, frame)

    y = h - bar_h + 18
    font = cv2.FONT_HERSHEY_SIMPLEX
    sm = 0.45
    col = (0, 255, 0)
    dim = (120, 120, 120)

    # Line 1: Device + effect + zoom
    line1 = f"MX Brio 4K | Effect: {cam._effect} [{effect_idx+1}/{len(effect_names)}] | Zoom: {cam._zoom:.1f}x"
    if cam._morse_active:
        line1 += " | MORSE ACTIVE"
    if recording:
        elapsed = time.time() - rec_start_time
        line1 += f" | REC {elapsed:.0f}s"
        # Blinking red dot
        if int(elapsed * 2) % 2:
            cv2.circle(frame, (w - 25, y - 5), 8, (0, 0, 255), -1)
    cv2.putText(frame, line1, (10, y), font, sm, col, 1)

    # Line 2: Controls
    y += 20
    cv2.putText(frame, ",/. effects | z/x zoom | h hello | n sos | m type | p party | v record | s snap | q quit",
                (10, y), font, 0.33, dim, 1)

    # Line 3: Status / typing
    y += 20
    if typing_mode:
        cursor = "_" if int(time.time() * 2) % 2 else " "
        cv2.putText(frame, f"Type message: {typed_text}{cursor}  (ENTER to send, ESC to cancel)",
                    (10, y), font, sm, (0, 255, 255), 1)
        # Show morse preview
        if typed_text:
            y += 20
            morse_preview = text_to_morse(typed_text)
            cv2.putText(frame, f"Morse: {morse_preview}", (10, y), font, 0.4, (0, 200, 200), 1)
    elif status_msg and time.time() < status_time:
        cv2.putText(frame, status_msg, (10, y), font, sm, (0, 200, 255), 1)

    # Zoom crosshair
    if cam._zoom > 1.01:
        cx, cy = w // 2, (h - bar_h) // 2
        cv2.line(frame, (cx - 20, cy), (cx + 20, cy), (0, 255, 0), 1)
        cv2.line(frame, (cx, cy - 20), (cx, cy + 20), (0, 255, 0), 1)
        cv2.putText(frame, f"{cam._zoom:.1f}x", (cx + 25, cy + 5), font, 0.5, (0, 255, 0), 1)

    # Title
    cv2.rectangle(frame, (0, 0), (w, 28), (0, 0, 0), -1)
    cv2.putText(frame, "MX BRIO SDK DEMO", (10, 19), font, 0.5, (0, 255, 0), 1)
    eidx_str = f"[{effect_idx+1}/{len(effect_names)}] {effect_names[effect_idx]}"
    cv2.putText(frame, eidx_str, (w - 200, 19), font, 0.45, col, 1)

    return frame


def draw_morse_screen(frame_shape, text):
    """Black screen shown while camera is paused for morse."""
    h, w = frame_shape[:2]
    frame = np.zeros((h, w, 3), dtype=np.uint8)
    font = cv2.FONT_HERSHEY_SIMPLEX

    morse_str = text_to_morse(text)

    cv2.putText(frame, "MORSE CODE", (w//2 - 150, h//2 - 80),
                font, 1.2, (0, 255, 255), 2)
    cv2.putText(frame, f'"{text.upper()}"', (50, h//2 - 10),
                font, 0.9, (255, 255, 255), 2)
    cv2.putText(frame, morse_str, (50, h//2 + 40),
                font, 0.55, (0, 255, 0), 1)
    cv2.putText(frame, "Watch the camera LED...", (w//2 - 180, h//2 + 100),
                font, 0.7, (0, 150, 255), 1)
    cv2.putText(frame, "SPACE to skip", (w//2 - 90, h//2 + 140),
                font, 0.5, (120, 120, 120), 1)
    return frame


# ── Main ─────────────────────────────────────────────────────

def main():
    global effect_idx, party_idx, led_on_manual
    global typing_mode, typed_text
    global recording, rec_start_time

    print("Starting MX Brio SDK Demo...")
    cam = Brio()
    info = cam.info()
    print(f"  Camera: {info['resolution']} @ {info['fps']:.0f}fps")
    print(f"  LED: {'yes' if info['led'] else 'no'}")
    print(f"  Mic: {'yes' if info['mic'] else 'no'}")
    print(f"  Effects: {len(info['effects_available'])}")
    print()

    cv2.namedWindow("Brio Demo", cv2.WINDOW_NORMAL)
    cv2.resizeWindow("Brio Demo", 1280, 720)

    snap_count = 0
    rec_count = 0
    frame_shape = (720, 1280, 3)

    while True:
        # Morse mode: camera paused, show morse screen
        if cam._morse_active and cam._cap is None:
            morse_frame = draw_morse_screen(frame_shape, status_msg)
            cv2.imshow("Brio Demo", morse_frame)
            key = cv2.waitKey(30) & 0xFF
            if key == ord('q') or key == 27:
                cam.led_stop()
                break
            elif key == ord(' '):
                cam.led_stop()
            continue

        frame = cam.capture()
        if frame is None:
            time.sleep(0.05)
            continue

        frame_shape = frame.shape

        # Record frame if active
        if recording:
            cam.record_frame(frame)

        frame = draw_hud(frame, cam)
        cv2.imshow("Brio Demo", frame)

        key = cv2.waitKey(1) & 0xFF

        # ── Typing mode ──────────────────────────────────
        if typing_mode:
            if key == 27:  # ESC - cancel
                typing_mode = False
                typed_text = ""
            elif key == 13 or key == 10:  # Enter - send
                if typed_text.strip():
                    msg = typed_text.strip()
                    morse_str = text_to_morse(msg)
                    print(f"Morse: {msg} -> {morse_str}")
                    set_status(msg, 30)
                    cam.morse(msg, pause_camera=True)
                typing_mode = False
                typed_text = ""
            elif key == 8 or key == 127:  # Backspace
                typed_text = typed_text[:-1]
            elif 32 <= key < 127:  # Printable char
                typed_text += chr(key)
            continue

        # ── Normal mode ──────────────────────────────────
        if key == ord('q') or key == 27:
            break

        # Effects: , and . (also handle < > for shifted)
        elif key == ord(',') or key == ord('<'):
            effect_idx = (effect_idx - 1) % len(effect_names)
            cam.effect(effect_names[effect_idx])
        elif key == ord('.') or key == ord('>'):
            effect_idx = (effect_idx + 1) % len(effect_names)
            cam.effect(effect_names[effect_idx])
        # Also support [ ] and { }
        elif key == ord('[') or key == ord('{'):
            effect_idx = (effect_idx - 1) % len(effect_names)
            cam.effect(effect_names[effect_idx])
        elif key == ord(']') or key == ord('}'):
            effect_idx = (effect_idx + 1) % len(effect_names)
            cam.effect(effect_names[effect_idx])

        # Zoom
        elif key == ord('z'):
            cam.zoom(cam._zoom + 0.25)
        elif key == ord('x'):
            cam.zoom(max(1.0, cam._zoom - 0.25))
        elif key == ord('r'):
            cam.zoom(1.0)

        # Morse
        elif key == ord('h'):
            set_status("HELLO", 15)
            print(f"Morse: HELLO -> {text_to_morse('HELLO')}")
            cam.morse("HELLO", pause_camera=True)

        elif key == ord('n'):
            set_status("SOS", 15)
            print(f"Morse: SOS -> {text_to_morse('SOS')}")
            cam.morse("SOS", pause_camera=True)

        elif key == ord('m'):
            typing_mode = True
            typed_text = ""

        # Party
        elif key == ord('p'):
            pattern = party_patterns[party_idx % len(party_patterns)]
            print(f"Party: {pattern}")
            set_status(f"Party: {pattern}", 10)
            cam.party_mode_live(pattern, pause_camera=True)
            party_idx += 1

        # LED toggle
        elif key == ord('l'):
            led_on_manual = not led_on_manual
            cam.led(led_on_manual)

        # Snapshot
        elif key == ord('s'):
            snap_count += 1
            path = f"/tmp/brio_snap_{snap_count}.jpg"
            cam.snapshot(path)
            print(f"Snapshot: {path}")
            set_status(f"Saved: {path}", 2)

        # Video recording
        elif key == ord('v'):
            if recording:
                path = cam.record_stop()
                recording = False
                print(f"Recording stopped: {path}")
                set_status(f"Recording saved: {path}", 3)
            else:
                rec_count += 1
                path = f"/tmp/brio_rec_{rec_count}.mp4"
                cam.record_start(path)
                recording = True
                rec_start_time = time.time()
                print(f"Recording started: {path}")
                set_status("Recording...", 2)

        # Stop LED/Morse
        elif key == ord(' '):
            cam.led_stop()
            led_on_manual = False

    if recording:
        cam.record_stop()
    cam.close()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
