#!/usr/bin/env python3
"""
MX Brio Morse Code LED SDK.

Encodes text to Morse code and flashes the webcam LED.
Uses HID Report 0x08 for LED control.

Usage:
    # As script:
    python3 mx_brio_morse.py "HELLO"
    python3 mx_brio_morse.py "SOS" --wpm 25
    python3 mx_brio_morse.py "HELLO WORLD" --loop 3

    # As library:
    from mx_brio_morse import MorseLED
    led = MorseLED()
    led.send("HELLO")
    led.close()
"""

import sys
import time
import threading

try:
    import hid
except ImportError:
    print("ERROR: pip install hidapi", file=sys.stderr)
    sys.exit(1)

VID, PID = 0x046D, 0x0944

# ── Morse code table ────────────────────────────────────────────

MORSE = {
    'A': '.-',    'B': '-...',  'C': '-.-.',  'D': '-..',
    'E': '.',     'F': '..-.',  'G': '--.',   'H': '....',
    'I': '..',    'J': '.---',  'K': '-.-',   'L': '.-..',
    'M': '--',    'N': '-.',    'O': '---',   'P': '.--.',
    'Q': '--.-',  'R': '.-.',   'S': '...',   'T': '-',
    'U': '..-',   'V': '...-',  'W': '.--',   'X': '-..-',
    'Y': '-.--',  'Z': '--..',
    '0': '-----', '1': '.----', '2': '..---', '3': '...--',
    '4': '....-', '5': '.....', '6': '-....', '7': '--...',
    '8': '---..', '9': '----.',
    '.': '.-.-.-', ',': '--..--', '?': '..--..', '!': '-.-.--',
    '/': '-..-.', '(': '-.--.', ')': '-.--.-', '&': '.-...',
    ':': '---...', ';': '-.-.-.', '=': '-...-', '+': '.-.-.',
    '-': '-....-', '_': '..--.-', '"': '.-..-.', '$': '...-..-',
    '@': '.--.-.', "'": '.----.',
}

# ── Morse timing (ITU standard) ─────────────────────────────────
# 1 unit = dot duration
# dash = 3 units
# intra-character gap = 1 unit
# inter-character gap = 3 units
# word gap = 7 units

def wpm_to_unit(wpm):
    """Convert words-per-minute to dot duration in seconds. PARIS standard."""
    return 1.2 / wpm


def text_to_morse(text):
    """Convert text to Morse string with / for letter gaps and // for word gaps."""
    words = text.upper().split()
    coded_words = []
    for word in words:
        letters = []
        for ch in word:
            if ch in MORSE:
                letters.append(MORSE[ch])
        coded_words.append('/'.join(letters))
    return '//'.join(coded_words)


def morse_to_timeline(morse_str, unit_s, dash_weight=3):
    """Convert Morse string to list of (on: bool, duration_s) tuples.
    dash_weight: dash = dash_weight * unit_s (ITU standard = 3, use 5+ for demos).
    """
    timeline = []
    i = 0
    while i < len(morse_str):
        ch = morse_str[i]
        if ch == '.':
            timeline.append((True, unit_s))          # dot ON
            # intra-char gap (if next is dot or dash)
            if i + 1 < len(morse_str) and morse_str[i + 1] in '.-':
                timeline.append((False, unit_s))
        elif ch == '-':
            timeline.append((True, dash_weight * unit_s))  # dash ON
            if i + 1 < len(morse_str) and morse_str[i + 1] in '.-':
                timeline.append((False, unit_s))
        elif ch == '/':
            if i + 1 < len(morse_str) and morse_str[i + 1] == '/':
                timeline.append((False, 7 * unit_s))  # word gap
                i += 1  # skip second /
            else:
                timeline.append((False, 3 * unit_s))  # letter gap
        i += 1
    return timeline


# ── MorseLED class ───────────────────────────────────────────────

class MorseLED:
    """Control the MX Brio LED with Morse code."""

    def __init__(self, wpm=15, verbose=True):
        self.wpm = wpm
        self.unit = wpm_to_unit(wpm)
        self.verbose = verbose
        self.dev = None
        self._stop = False
        self._thread = None
        self._open()

    def _open(self):
        devices = hid.enumerate(VID, PID)
        if not devices:
            raise RuntimeError("MX Brio not found")
        self.dev = hid.device()
        self.dev.open_path(devices[0]["path"])
        if self.verbose:
            print(f"[morse] Connected to MX Brio (wpm={self.wpm}, unit={self.unit*1000:.0f}ms)")

    def _led(self, on):
        if self.dev:
            self.dev.write([0x08, 0x01 if on else 0x00])

    def send(self, text, callback=None):
        """Flash Morse code for text. Blocks until done.

        callback(char, morse_str) is called for each character if provided.
        """
        self._stop = False
        morse = text_to_morse(text)
        if self.verbose:
            print(f"[morse] Text:  {text}")
            print(f"[morse] Morse: {morse}")

        timeline = morse_to_timeline(morse, self.unit)

        # Show character-by-character
        upper = text.upper()
        char_idx = 0
        morse_pos = 0

        for on, dur in timeline:
            if self._stop:
                self._led(False)
                return
            self._led(on)
            if self.verbose and on:
                sym = '.' if dur <= self.unit * 1.5 else '-'
                print(f"  LED {'ON ':3s} {dur*1000:6.0f}ms  {sym}", flush=True)
            time.sleep(dur)

        self._led(False)
        if self.verbose:
            print(f"[morse] Done: {text}")

    def send_async(self, text, callback=None):
        """Flash Morse code in background thread. Returns immediately."""
        self._stop = False
        self._thread = threading.Thread(target=self.send, args=(text, callback), daemon=True)
        self._thread.start()
        return self._thread

    def stop(self):
        """Stop current transmission."""
        self._stop = True
        if self._thread:
            self._thread.join(timeout=2)
        self._led(False)

    def close(self):
        """Release HID device."""
        self.stop()
        if self.dev:
            try:
                self._led(False)
                self.dev.close()
            except:
                pass
            self.dev = None

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()

    # ── Convenience methods ──────────────────────────────────────

    def hello(self):
        """Flash HELLO."""
        self.send("HELLO")

    def sos(self):
        """Flash SOS (international distress signal)."""
        self.send("SOS")

    def beacon(self, text="OK", count=0):
        """Repeat text indefinitely (count=0) or N times."""
        i = 0
        while not self._stop:
            self.send(text)
            time.sleep(self.unit * 7)  # word gap between repeats
            i += 1
            if count and i >= count:
                break


# ── Decode (bonus: read Morse from timing data) ─────────────────

def decode_morse(morse_str):
    """Decode Morse string back to text."""
    reverse = {v: k for k, v in MORSE.items()}
    words = morse_str.split('//')
    decoded = []
    for word in words:
        letters = word.split('/')
        decoded.append(''.join(reverse.get(l, '?') for l in letters))
    return ' '.join(decoded)


# ── CLI ──────────────────────────────────────────────────────────

def main():
    import argparse
    parser = argparse.ArgumentParser(description='MX Brio Morse Code LED')
    parser.add_argument('text', nargs='?', default='HELLO',
                        help='Text to flash (default: HELLO)')
    parser.add_argument('--wpm', type=int, default=15,
                        help='Words per minute (default: 15)')
    parser.add_argument('--loop', type=int, default=1,
                        help='Number of times to repeat (0=infinite)')
    parser.add_argument('--decode', action='store_true',
                        help='Just print Morse encoding, don\'t flash')
    args = parser.parse_args()

    if args.decode:
        morse = text_to_morse(args.text)
        print(f"Text:  {args.text}")
        print(f"Morse: {morse}")
        print(f"Back:  {decode_morse(morse)}")
        return

    with MorseLED(wpm=args.wpm) as led:
        try:
            if args.loop == 0:
                led.beacon(args.text)
            else:
                for i in range(args.loop):
                    if i > 0:
                        time.sleep(led.unit * 7)
                    led.send(args.text)
        except KeyboardInterrupt:
            print("\nStopped")


if __name__ == "__main__":
    main()
