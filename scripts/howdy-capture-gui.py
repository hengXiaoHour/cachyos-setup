#!/usr/bin/env python3
"""Howdy CAPTURE gui: enroll new face models with a window, no CLI.
Preview shows your IR feed with face circles. Press c, look straight,
stay still ~5s: it grabs 5 good frames, averages them, appends a model
(Model #2, #3, ...) in the exact format sudo howdy add writes.
Keys: c = capture new model, X twice = wipe ALL models, q/ESC = quit.
For speed sliders use howdy-live-gui.py instead.

Run: python3 howdy-capture-gui.py (auto-switches to system python if needed)"""
import os, sys, time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import howdy_common as H

PREVIEW = "capture - IR feed (c=capture X twice=wipe q=quit)"


def load_or_empty():
    try:
        return H.load_models()
    except FileNotFoundError:
        return [], [], []


def main():
    cfg = H.load_config()
    dark_thr = float(cfg.get("video", "dark_threshold", fallback=85))

    print("loading models + dlib...", flush=True)
    encodings, labels, stored = load_or_empty()
    print(f"you have {len(stored)} models: {H.model_labels(stored)}" if stored
          else "no models yet: press c to capture your first one")
    detector, predictor, encoder = H.init_dlib()
    cam = H.open_camera()

    clahe = H.cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    H.cv2.namedWindow(PREVIEW)
    print("capture window open. c=capture X twice=wipe q=quit.")

    msg, fps, fps_n, fps_t0 = "press c and look straight", 0.0, 0, time.time()
    wipe_armed = 0.0
    while True:
        ok, frame = cam.read()
        if not ok:
            print("camera read failed")
            break
        gray = H.cv2.cvtColor(frame, H.cv2.COLOR_BGR2GRAY) if len(frame.shape) == 3 else frame
        gray = clahe.apply(gray)

        dark_pct = H.darkness_of(gray)
        h, w = gray.shape[:2]
        if not encodings:
            circles, status, ms = [], "no models yet, press c", 0.0
        elif dark_pct <= dark_thr:
            circles, status, _, ms = H.detect_and_match(
                frame, gray, gray, 1, detector, predictor, encoder,
                encodings, labels, 1, 0.45)
        else:
            circles, status, ms = [], "too dark, move to light", 0.0

        fps_n += 1
        if time.time() - fps_t0 >= 1.0:
            fps = fps_n / (time.time() - fps_t0)
            fps_n, fps_t0 = 0, time.time()

        color = frame if len(frame.shape) == 3 else H.cv2.cvtColor(frame, H.cv2.COLOR_GRAY2BGR)
        H.draw_circles(color, circles)
        H.cv2.putText(color, status, (10, 28), H.cv2.FONT_HERSHEY_SIMPLEX, 0.8,
                      (0, 255, 0) if status.startswith("MATCH") else (0, 200, 255), 2)
        H.cv2.putText(color, f"models: {len(stored)}  {msg[-60:]}",
                      (10, h - 12), H.cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1)
        H.cv2.imshow(PREVIEW, color)

        key = H.cv2.waitKey(1) & 0xFF
        if key in (ord("q"), 27):
            print("quit")
            break
        elif key == ord("c"):
            msg = "capturing... look straight, stay still"
            print(msg)
            msg = H.capture_model(cam, clahe, detector, predictor, encoder, dark_thr)
            print(msg)
            encodings, labels, stored = load_or_empty()
            wipe_armed = 0.0
        elif key in (ord("X"), ord("x")):
            if time.time() - wipe_armed < 8:
                ok = H.sudo_cmd(f"rm -f '{H.MODEL}'")
                if ok:
                    encodings, labels, stored = [], [], []
                    msg = "ALL models wiped - press c for a fresh one"
                else:
                    msg = "wipe FAILED (sudo?)"
                print(msg)
                wipe_armed = 0.0
            else:
                wipe_armed = time.time()
                msg = "press X AGAIN within 8s to wipe ALL models"
                print(msg)

    cam.release()
    H.cv2.destroyAllWindows()


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--selftest":
        H.selftest()
    else:
        main()
