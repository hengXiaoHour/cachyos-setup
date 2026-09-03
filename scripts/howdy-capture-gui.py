#!/usr/bin/env python3
"""Howdy CAPTURE gui: guided multi-angle enrollment, no CLI.

Flow: sudo cached first -> standby window (camera OFF) -> press c to
start guided enrollment -> tilt lid to the prompted angle, press c to
capture that angle -> repeat for 60 / 90 / 115 deg -> 3 models, all
labeled 'face1', so login matches from any of the three angles.
Keys: c = next step / capture, p = preview toggle, X twice = wipe ALL
models, q/ESC = quit. For speed sliders use howdy-live-gui.py instead.

Run: /usr/bin/python3 howdy-capture-gui.py"""
import os, sys, time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import howdy_common as H

PREVIEW = "capture - face1 enrollment (c=next X twice=wipe q=quit)"
ANGLES = (60, 90, 115)
FACE = "face1"


def load_or_empty():
    try:
        return H.load_models()
    except FileNotFoundError:
        return [], [], []


def main():
    print("step 1/3: checking sudo (password prompt below)...", flush=True)
    if not H.ensure_sudo():
        sys.exit(1)
    print("sudo OK, credentials cached for this session.", flush=True)
    cfg = H.load_config()
    dark_thr = float(cfg.get("video", "dark_threshold", fallback=85))

    print("loading models + dlib...", flush=True)
    encodings, labels, stored = load_or_empty()
    print(f"you have {len(stored)} models: {H.model_labels(stored)}" if stored
          else "no models yet: press c to capture your first one")
    detector, predictor, encoder = H.init_dlib()

    import numpy as np
    clahe = H.cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    H.cv2.namedWindow(PREVIEW)
    print("standby, camera OFF. c=next step X twice=wipe q=quit.")

    msg = "press c to start face1 enrollment"
    wipe_armed = 0.0
    step = 0  # 0 = idle, 1..3 = awaiting capture at ANGLES[step-1]
    while True:
        panel = np.zeros((360, 640, 3), dtype=np.uint8)
        H.cv2.putText(panel, "camera OFF", (230, 120),
                      H.cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 255), 2)
        if step == 0:
            help_line = "c=start  X twice=wipe  q=quit"
        else:
            help_line = (f"lid ~{ANGLES[step - 1]} deg: look straight, "
                         f"press c ({step}/3)")
        H.cv2.putText(panel, help_line, (30, 170),
                      H.cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 1)
        H.cv2.putText(panel, f"models: {len(stored)}", (30, 210),
                      H.cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
        H.cv2.putText(panel, msg[-60:], (10, 340),
                      H.cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1)
        H.cv2.imshow(PREVIEW, panel)

        key = H.cv2.waitKey(50) & 0xFF
        if key in (ord("q"), 27):
            print("quit")
            break
        elif key == ord("c"):
            try:
                if step == 0:
                    # Start guided flow. No capture yet, just prompt angle 1.
                    step = 1
                    msg = (f"tilt lid to ~{ANGLES[0]} deg, look straight, "
                           f"stay still, then press c (1/3)")
                    print(msg)
                else:
                    angle = ANGLES[step - 1]
                    msg = (f"capturing {FACE} angle {angle}... "
                           f"stay still ({step}/3)")
                    print(msg)
                    cam = H.open_camera()
                    try:
                        msg = H.capture_model(
                            cam, clahe, detector, predictor,
                            encoder, dark_thr, label=FACE)
                    finally:
                        cam.release()
                    if msg.startswith("captured"):
                        msg = f"{msg} [lid ~{angle} deg]"
                        print(msg)
                        step += 1
                        if step > len(ANGLES):
                            step = 0
                            msg += " -- face1 COMPLETE (3 angles)"
                            print(msg)
                        else:
                            msg = (f"tilt lid to ~{ANGLES[step - 1]} deg, "
                                   f"then press c ({step}/3)")
                            print(msg)
                    else:
                        print(msg)  # capture failed, stay on same step
            except Exception as e:
                msg = f"capture FAILED: {e}"
                print(msg)
            try:
                encodings, labels, stored = load_or_empty()
            except FileNotFoundError:
                encodings, labels, stored = [], [], []
            wipe_armed = 0.0
        elif key in (ord("X"), ord("x")):
            if time.time() - wipe_armed < 8:
                ok = H.sudo_cmd(f"rm -f '{H.MODEL}'")
                if ok:
                    encodings, labels, stored = [], [], []
                    step = 0
                    msg = "ALL models wiped - press c to start over"
                else:
                    msg = "wipe FAILED (sudo?)"
                print(msg)
                wipe_armed = 0.0
            else:
                wipe_armed = time.time()
                msg = "press X AGAIN within 8s to wipe ALL models"
                print(msg)

    H.cv2.destroyAllWindows()


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--selftest":
        H.selftest()
    else:
        main()
