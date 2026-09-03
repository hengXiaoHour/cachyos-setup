#!/usr/bin/env python3
"""Howdy TUNING gui: two windows, sliders only, no enrollment.
Window 1 PREVIEW: IR feed with face circles (green + name = match).
Window 2 TUNING: sliders dark / cert x10 / height / up.
Keys: s = save sliders to real login config, r = revert, q/ESC = quit.
For new face models use howdy-capture-gui.py instead.

Run: python3 howdy-live-gui.py (auto-switches to system python if needed)"""
import os, subprocess, io, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import howdy_common as H

PREVIEW = "1 preview - IR feed (1-5=preset s=save r=revert q=quit)"
TUNING = "2 tuning - sliders"

# Presets: (dark_threshold, certainty, max_height, upsample).
# 1 = stock Howdy defaults, 5 = strictest. 2-4 trade strictness for speed.
PRESETS = {
    1: (60, 3.5, 320, 1, "stock defaults"),
    2: (85, 4.0, 240, 1, "balanced"),
    3: (90, 4.5, 160, 0, "fast"),
    4: (95, 5.0, 120, 0, "fastest low-light"),
    5: (70, 3.0, 320, 1, "strict"),
}


def apply_preset(n):
    dark, cert, max_h, ups, name = PRESETS[n]
    H.cv2.setTrackbarPos("dark", TUNING, dark)
    H.cv2.setTrackbarPos("cert x10", TUNING, int(cert * 10))
    H.cv2.setTrackbarPos("height", TUNING, max_h)
    H.cv2.setTrackbarPos("up", TUNING, ups)
    return f"preset {n} ({name}): dark={dark} cert={cert} height={max_h} up={ups}"


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


def draw_panel(dark, cert, max_h, ups, msg):
    panel = H.np.zeros((400, 460, 3), dtype=H.np.uint8)
    lines = [f"dark   {dark}   (skip frames darker than this %)",
             f"cert   {cert:.1f}   (match below this, max 5.0)",
             f"height {max_h}   (smaller = faster)",
             f"up     {ups}   (0 fast / 1 accurate)",
             "",
             "presets: 1 stock  2 balanced  3 fast",
             "         4 fastest  5 strict",
             "drag a slider or press 1-5, watch window 1,",
             "s = save  r = revert  q = quit", "", msg[-70:]]
    for i, ln in enumerate(lines):
        H.cv2.putText(panel, ln, (12, 30 + i * 28), H.cv2.FONT_HERSHEY_SIMPLEX,
                      0.6, (255, 255, 255), 1)
    return panel


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
    H.cv2.namedWindow(TUNING)
    H.cv2.createTrackbar("dark", TUNING, dark0, 100, lambda v: None)
    H.cv2.createTrackbar("cert x10", TUNING, cert0, 50, lambda v: None)
    H.cv2.createTrackbar("height", TUNING, h0, 360, lambda v: None)
    H.cv2.createTrackbar("up", TUNING, up0, 1, lambda v: None)
    print("tuning windows open. s=save r=revert q=quit.")

    msg, fps, fps_n, fps_t0 = "tune away", 0.0, 0, time.time()
    while True:
        ok, frame = cam.read()
        if not ok:
            print("camera read failed")
            break
        gray = H.cv2.cvtColor(frame, H.cv2.COLOR_BGR2GRAY) if len(frame.shape) == 3 else frame
        gray = clahe.apply(gray)

        dark_thr = H.cv2.getTrackbarPos("dark", TUNING)
        cert_thr = H.cv2.getTrackbarPos("cert x10", TUNING) / 10.0
        max_h = max(80, H.cv2.getTrackbarPos("height", TUNING))
        ups = H.cv2.getTrackbarPos("up", TUNING)

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
        H.cv2.putText(color, status, (10, 28), H.cv2.FONT_HERSHEY_SIMPLEX, 0.8,
                      (0, 255, 0) if status.startswith("MATCH") else (0, 200, 255), 2)
        H.cv2.putText(color, f"dark {dark_pct:.0f}%/thr {dark_thr} det {ms:.0f}ms {fps:.0f}fps",
                      (10, h - 12), H.cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1)
        H.cv2.imshow(PREVIEW, color)
        H.cv2.imshow(TUNING, draw_panel(dark_thr, cert_thr, max_h, ups, msg))

        key = H.cv2.waitKey(1) & 0xFF
        if key in (ord("q"), 27):
            print("quit without saving")
            break
        elif key == ord("s"):
            msg = save_all(dark_thr, round(cert_thr, 1), max_h, ups)
            print(msg)
        elif key == ord("r"):
            msg = revert_all()
            print(msg)
        elif key in (ord("1"), ord("2"), ord("3"), ord("4"), ord("5")):
            msg = apply_preset(int(chr(key)))
            print(msg)

    cam.release()
    H.cv2.destroyAllWindows()


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--selftest":
        H.selftest()
    else:
        main()
