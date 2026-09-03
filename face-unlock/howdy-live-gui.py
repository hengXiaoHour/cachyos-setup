#!/usr/bin/env python3
"""Howdy TUNING gui: live IR preview with clickable preset buttons.
Buttons across the top: 1-5 presets, SAVE writes to the real login
config, UNDO reverts. Keys work too: 1-5, s, r, q/ESC.
For new face models use howdy-capture-gui.py instead.

Run: /usr/bin/python3 howdy-live-gui.py"""
import os, subprocess, io, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import howdy_common as H

PREVIEW = "tuner - click a preset, SAVE to keep"

# Presets: (dark_threshold, certainty, max_height, upsample).
# 1 = stock Howdy defaults, 5 = strictest. 2-4 trade strictness for speed.
PRESETS = {
    1: (60, 3.5, 320, 1, "stock defaults"),
    2: (85, 4.0, 240, 1, "balanced"),
    3: (90, 4.5, 160, 0, "fast"),
    4: (95, 5.0, 120, 0, "fastest low-light"),
    5: (70, 3.0, 320, 1, "strict"),
}


CLICKS = []  # pending mouse-button actions, drained by the main loop

# Buttons drawn across the top of the preview: 5 presets + save + undo.
BUTTONS = [
    ("1", 1), ("2", 2), ("3", 3), ("4", 4), ("5", 5),
    ("SAVE", "s"), ("UNDO", "r"),
]
BW, BH = 88, 30


def preset_text(n):
    dark, cert, max_h, ups, name = PRESETS[n]
    return f"preset {n} ({name}): dark={dark} cert={cert} height={max_h} up={ups}"


def draw_buttons(img):
    for i, (label, _action) in enumerate(BUTTONS):
        x0 = 4 + i * (BW + 4)
        H.cv2.rectangle(img, (x0, 4), (x0 + BW, 4 + BH), (60, 60, 60), -1)
        H.cv2.rectangle(img, (x0, 4), (x0 + BW, 4 + BH), (0, 255, 0), 1)
        H.cv2.putText(img, label, (x0 + 8, 26),
                      H.cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 1)


def button_at(x, y):
    if y < 4 or y > 4 + BH:
        return None
    i = (x - 4) // (BW + 4)
    if 0 <= i < len(BUTTONS):
        x0 = 4 + i * (BW + 4)
        if x0 <= x <= x0 + BW:
            return BUTTONS[i][1]
    return None


def on_mouse(event, x, y, flags, param):
    if event == H.cv2.EVENT_LBUTTONDOWN:
        action = button_at(x, y)
        if action is not None:
            CLICKS.append(action)


def save_all(dark, cert, max_h, ups):
    c = H.load_config()
    c["video"]["dark_threshold"] = str(dark)
    c["video"]["certainty"] = str(round(cert, 1))
    c["video"]["max_height"] = str(max_h)
    buf = io.StringIO()
    c.write(buf)
    err = None
    if not H.write_root(H.CONFIG, buf.getvalue()):
        err = "config save FAILED (sudo?)"
    with open(H.COMPARE) as f:
        txt = f.read()
    txt = txt.replace("face_detector(gsframe, 1)", "face_detector(gsframe, 0)") \
        if ups == 0 else txt.replace("face_detector(gsframe, 0)", "face_detector(gsframe, 1)")
    if not H.write_root(H.COMPARE, txt):
        err = (err + " " if err else "") + "upsample save FAILED (sudo?)"
    H.sudo_cmd("find /usr/lib/howdy -name __pycache__ -type d "
               "-exec rm -rf {} + 2>/dev/null")
    return err or f"saved dark={dark} cert={cert:.1f} height={max_h} up={ups}"


def revert_all():
    msgs = []
    for p in (H.CONFIG, H.COMPARE):
        b = p + H.BACKUP_SUFFIX
        if subprocess.run(f"test -e '{b}'", shell=True).returncode != 0:
            msgs.append(f"no backup for {p}")
            continue
        ok = H.sudo_cmd(f"cp '{b}' '{p}'")
        msgs.append(("reverted " if ok else "revert FAILED ") + p)
    return " | ".join(msgs)


def main():
    if not H.ensure_sudo():
        sys.exit(1)
    import time
    cfg = H.load_config()
    dark0 = int(float(cfg.get("video", "dark_threshold", fallback=85)))
    cert0 = int(float(cfg.get("video", "certainty", fallback=3.5)) * 10)
    h0 = int(float(cfg.get("video", "max_height", fallback=320)))
    with open(H.COMPARE) as f:
        up0 = 0 if "face_detector(gsframe, 0)" in f.read() else 1

    print("loading model + dlib...", flush=True)
    encodings, labels, _ = H.load_models()
    detector, predictor, encoder = H.init_dlib()
    cam = H.open_camera()

    clahe = H.cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    H.cv2.namedWindow(PREVIEW)
    H.cv2.setMouseCallback(PREVIEW, on_mouse)
    print("tuner open: click preset 1-5, SAVE to keep, UNDO to revert, q to quit.")
    print("presets: 1=stock 2=balanced 3=fast 4=fastest 5=strict")

    dark_thr, cert_thr = dark0, cert0 / 10.0
    max_h, ups = h0, up0
    cur = 0  # active preset, 0 = launch values
    msg, fps, fps_n, fps_t0 = "click a preset button", 0.0, 0, time.time()
    while True:
        ok, frame = cam.read()
        if not ok:
            print("camera read failed")
            break
        gray = H.cv2.cvtColor(frame, H.cv2.COLOR_BGR2GRAY) if len(frame.shape) == 3 else frame
        gray = clahe.apply(gray)

        while CLICKS:
            action = CLICKS.pop(0)
            if isinstance(action, int):
                d, c, h, u, _name = PRESETS[action]
                dark_thr, cert_thr, max_h, ups = d, c, h, u
                cur = action
                msg = preset_text(action) + " -- click SAVE to keep"
                print(msg)
            elif action == "s":
                msg = save_all(dark_thr, round(cert_thr, 1), max_h, ups)
                print(msg)
            elif action == "r":
                msg = revert_all()
                dark_thr, cert_thr, max_h, ups = dark0, cert0 / 10.0, h0, up0
                cur = 0
                print(msg)

        dark_pct = H.darkness_of(gray)
        h, w = gray.shape[:2]
        scale = (max_h / h) or 1
        small = gray if scale >= 1 else H.cv2.resize(gray, None, fx=scale, fy=scale,
                                                    interpolation=H.cv2.INTER_AREA)

        if dark_pct <= dark_thr:
            circles, status, _, ms = H.detect_and_match(
                frame, gray, small, scale, detector, predictor, encoder,
                encodings, labels, ups, cert_thr)
        else:
            circles, status, ms = [], "too dark, skipped", 0.0

        fps_n += 1
        if time.time() - fps_t0 >= 1.0:
            fps = fps_n / (time.time() - fps_t0)
            fps_n, fps_t0 = 0, time.time()

        color = frame if len(frame.shape) == 3 else H.cv2.cvtColor(frame, H.cv2.COLOR_GRAY2BGR)
        H.draw_circles(color, circles)
        draw_buttons(color)
        H.cv2.putText(color, status, (10, 60), H.cv2.FONT_HERSHEY_SIMPLEX, 0.8,
                      (0, 255, 0) if status.startswith("MATCH") else (0, 200, 255), 2)
        H.cv2.putText(color, f"preset {cur or '-'} dark {dark_thr} cert {cert_thr:.1f} h {max_h} up {ups} det {ms:.0f}ms {fps:.0f}fps",
                      (10, h - 12), H.cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1)
        H.cv2.imshow(PREVIEW, color)

        key = H.cv2.waitKey(1) & 0xFF
        if key in (ord("q"), 27):
            print("quit without saving")
            break
        elif key == ord("s"):
            msg = save_all(dark_thr, round(cert_thr, 1), max_h, ups)
            print(msg)
        elif key == ord("r"):
            msg = revert_all()
            dark_thr, cert_thr, max_h, ups = dark0, cert0 / 10.0, h0, up0
            cur = 0
            print(msg)
        elif key in (ord("1"), ord("2"), ord("3"), ord("4"), ord("5")):
            n = int(chr(key))
            d, c, mh, u, _name = PRESETS[n]
            dark_thr, cert_thr, max_h, ups = d, c, mh, u
            cur = n
            msg = preset_text(n) + " -- press s to save"
            print(msg)

    cam.release()
    H.cv2.destroyAllWindows()


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--selftest":
        H.selftest()
    else:
        main()
