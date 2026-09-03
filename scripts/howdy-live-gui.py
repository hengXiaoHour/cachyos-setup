#!/usr/bin/env python3
"""Howdy live GUI tuner, two windows.
Window 1 PREVIEW: IR feed, circle around each face (green + name = match,
  yellow = seen but no match), darkness / timing stats at the bottom.
Window 2 TUNING: sliders dark, cert x10, height, up. Panel shows values,
  save status, and keys.

Run: /usr/bin/python3 howdy-live-gui.py            (must be system python, not 3.11)
     /usr/bin/python3 howdy-live-gui.py --selftest (no camera needed)
Keys (focus either window): s = save to real config, r = revert, q/ESC = quit."""
import sys, os, json, time, subprocess, io, configparser

SYS_PYTHON = "/usr/bin/python3"
try:
    import cv2
except ImportError:
    if os.environ.get("HOWDY_GUI_REEXEC") or sys.executable.startswith(SYS_PYTHON):
        raise  # right interpreter already, real problem, show it
    os.environ["HOWDY_GUI_REEXEC"] = "1"
    os.execv(SYS_PYTHON, [SYS_PYTHON] + sys.argv)

sys.path.insert(0, "/usr/lib/howdy")
import numpy as np

CONFIG = "/etc/howdy/config.ini"
COMPARE = "/usr/lib/howdy/compare.py"
BACKUP_SUFFIX = ".livetune-bak"
DEVICE = "/dev/v4l/by-path/pci-0000:00:14.0-usb-0:7:1.2-video-index0"
MODEL = "/etc/howdy/models/chenla.dat"
PREVIEW = "1 preview - IR feed (s=save r=revert q=quit)"
TUNING = "2 tuning - sliders"

def load_config():
    c = configparser.ConfigParser()
    c.optionxform = lambda optionstr: optionstr
    c.read(CONFIG)
    return c

def save_all(dark, cert, max_h, ups):
    c = load_config()
    c["video"]["dark_threshold"] = str(dark)
    c["video"]["certainty"] = str(round(cert, 1))
    c["video"]["max_height"] = str(max_h)
    buf = io.StringIO()
    c.write(buf)
    err = None
    if os.geteuid() == 0:
        with open(CONFIG, "w") as f:
            f.write(buf.getvalue())
    else:
        r = subprocess.run(["sudo", "tee", CONFIG], input=buf.getvalue().encode(),
                           capture_output=True)
        if r.returncode != 0:
            err = "config save FAILED (sudo?)"
    with open(COMPARE) as f:
        txt = f.read()
    txt = txt.replace("face_detector(gsframe, 1)", "face_detector(gsframe, 0)") \
        if ups == 0 else txt.replace("face_detector(gsframe, 0)", "face_detector(gsframe, 1)")
    if os.geteuid() == 0:
        with open(COMPARE, "w") as f:
            f.write(txt)
    else:
        r = subprocess.run(["sudo", "tee", COMPARE], input=txt.encode(),
                           capture_output=True)
        if r.returncode != 0:
            err = (err + " " if err else "") + "upsample save FAILED (sudo?)"
    subprocess.run("sudo find /usr/lib/howdy -name __pycache__ -type d "
                   "-exec rm -rf {} + 2>/dev/null", shell=True)
    return err or f"saved dark={dark} cert={cert:.1f} height={max_h} up={ups}"

def revert_all():
    msgs = []
    for p in (CONFIG, COMPARE):
        b = p + BACKUP_SUFFIX
        exists = subprocess.run(f"test -e '{b}'", shell=True).returncode == 0
        if not exists:
            msgs.append(f"no backup for {p}")
            continue
        cmd = f"cp '{b}' '{p}'" if os.geteuid() == 0 else f"sudo cp '{b}' '{p}'"
        msgs.append(("reverted " if subprocess.run(cmd, shell=True).returncode == 0
                     else "revert FAILED ") + p)
    return " | ".join(msgs)

def load_models():
    with open(MODEL) as f:
        models = json.load(f)
    encodings, labels = [], []
    for m in models:
        for e in m["data"]:
            encodings.append(np.array(e))
            labels.append(m.get("label", "?"))
    return encodings, labels

def init_dlib():
    import dlib
    import paths_factory
    return (dlib.get_frontal_face_detector(),
            dlib.shape_predictor(paths_factory.shape_predictor_5_face_landmarks_path()),
            dlib.face_recognition_model_v1(paths_factory.dlib_face_recognition_resnet_model_v1_path()))

def darkness_of(gsframe):
    hist = cv2.calcHist([gsframe], [0], None, [8], [0, 256])
    total = float(np.sum(hist))
    if total == 0:
        return 100.0
    return float(hist[0] / total * 100)

def selftest():
    print("models...", end=" ", flush=True)
    enc, lab = load_models()
    print(f"OK ({len(enc)} encodings)")
    print("dlib...", end=" ", flush=True)
    t0 = time.time()
    det, _, _ = init_dlib()
    print(f"OK ({time.time()-t0:.1f}s)")
    fake = np.random.randint(0, 255, (240, 320), dtype=np.uint8)
    t0 = time.time()
    faces = det(fake, 0)
    print(f"detector OK ({(time.time()-t0)*1000:.0f}ms, faces: {len(faces)})")
    panel = np.zeros((300, 420, 3), dtype=np.uint8)
    cv2.circle(panel, (210, 150), 60, (0, 255, 0), 2)
    print("circle-draw OK")
    print("SELFTEST PASS")

def draw_panel(dark, cert, max_h, ups, msg):
    panel = np.zeros((300, 460, 3), dtype=np.uint8)
    lines = [f"dark   {dark}   (skip frames darker than this %)",
             f"cert   {cert:.1f}   (match below this, max 5.0)",
             f"height {max_h}   (smaller = faster)",
             f"up     {ups}   (0 fast / 1 accurate)",
             "", "drag a slider, watch window 1,",
             "s = save  r = revert  q = quit", "", msg[-70:]]
    for i, ln in enumerate(lines):
        cv2.putText(panel, ln, (12, 30 + i * 28), cv2.FONT_HERSHEY_SIMPLEX,
                    0.6, (255, 255, 255), 1)
    return panel

def main():
    cfg = load_config()
    dark0 = int(float(cfg.get("video", "dark_threshold", fallback=85)))
    cert0 = int(float(cfg.get("video", "certainty", fallback=3.5)) * 10)
    h0 = int(float(cfg.get("video", "max_height", fallback=320)))
    with open(COMPARE) as f:
        up0 = 0 if "face_detector(gsframe, 0)" in f.read() else 1

    print("loading model + dlib...", flush=True)
    encodings, labels = load_models()
    detector, predictor, encoder = init_dlib()
    cam = cv2.VideoCapture(DEVICE)
    if not cam.isOpened():
        print(f"cannot open {DEVICE}. Close any app using the camera and retry.")
        sys.exit(1)

    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    cv2.namedWindow(PREVIEW)
    cv2.namedWindow(TUNING)
    cv2.createTrackbar("dark", TUNING, dark0, 100, lambda v: None)
    cv2.createTrackbar("cert x10", TUNING, cert0, 50, lambda v: None)
    cv2.createTrackbar("height", TUNING, h0, 360, lambda v: None)
    cv2.createTrackbar("up", TUNING, up0, 1, lambda v: None)
    print("two windows open. s=save r=revert q=quit.")

    msg, fps, fps_n, fps_t0 = "tune away", 0.0, 0, time.time()
    while True:
        ok, frame = cam.read()
        if not ok:
            print("camera read failed")
            break
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY) if len(frame.shape) == 3 else frame
        gray = clahe.apply(gray)

        dark_thr = cv2.getTrackbarPos("dark", TUNING)
        cert_thr = cv2.getTrackbarPos("cert x10", TUNING) / 10.0
        max_h = max(80, cv2.getTrackbarPos("height", TUNING))
        ups = cv2.getTrackbarPos("up", TUNING)

        dark_pct = darkness_of(gray)
        h, w = gray.shape[:2]
        scale = (max_h / h) or 1
        small = gray if scale >= 1 else cv2.resize(gray, None, fx=scale, fy=scale,
                                                  interpolation=cv2.INTER_AREA)
        inv = 1 / scale if scale != 1 else 1.0

        circles, status, best, ms = [], "too dark, skipped", None, 0.0
        if dark_pct <= dark_thr:
            t0 = time.time()
            faces = detector(small, ups)
            for fl in faces:
                r = fl.rect if hasattr(fl, "rect") else fl
                x1, y1 = int(r.left() * inv), int(r.top() * inv)
                x2, y2 = int(r.right() * inv), int(r.bottom() * inv)
                cx, cy, rad = (x1 + x2) // 2, (y1 + y2) // 2, max(x2 - x1, y2 - y1) // 2
                name, dist = None, None
                try:
                    ref = fl if not hasattr(fl, "rect") else fl
                    land = predictor(frame, ref)
                    vec = np.array(encoder.compute_face_descriptor(frame, land, 1))
                    d = np.linalg.norm(np.array(encodings) - vec, axis=1)
                    i = int(np.argmin(d))
                    dist, name = float(d[i]), labels[i]
                    if best is None or dist < best[0]:
                        best = (dist, name)
                except Exception:
                    pass
                match = dist is not None and 0 < dist < cert_thr
                circles.append((cx, cy, rad, match, name, dist))
            ms = (time.time() - t0) * 1000
            if best and 0 < best[0] < cert_thr:
                status = f"MATCH {best[1]} ({best[0]*10:.1f})"
            elif faces:
                status = f"no match best={best[0]*10:.1f}" if best else "face, encode fail"
            else:
                status = "no face"

        fps_n += 1
        if time.time() - fps_t0 >= 1.0:
            fps = fps_n / (time.time() - fps_t0)
            fps_n, fps_t0 = 0, time.time()

        color = frame if len(frame.shape) == 3 else cv2.cvtColor(frame, cv2.COLOR_GRAY2BGR)
        for (cx, cy, rad, match, name, dist) in circles:
            col = (0, 255, 0) if match else (0, 200, 255)
            cv2.circle(color, (cx, cy), max(rad, 4), col, 2)
            tag = f"{name} {dist*10:.1f}" if dist is not None else "face"
            cv2.putText(color, tag, (max(cx - rad, 4), max(cy - rad - 8, 16)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, col, 2)
        cv2.putText(color, status, (10, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.8,
                    (0, 255, 0) if status.startswith("MATCH") else (0, 200, 255), 2)
        cv2.putText(color, f"dark {dark_pct:.0f}%/thr {dark_thr} det {ms:.0f}ms {fps:.0f}fps",
                    (10, h - 12), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1)
        cv2.imshow(PREVIEW, color)
        cv2.imshow(TUNING, draw_panel(dark_thr, cert_thr, max_h, ups, msg))

        key = cv2.waitKey(1) & 0xFF
        if key in (ord("q"), 27):
            print("quit without saving")
            break
        elif key == ord("s"):
            msg = save_all(dark_thr, round(cert_thr, 1), max_h, ups)
            print(msg)
        elif key == ord("r"):
            msg = revert_all()
            print(msg)

    cam.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--selftest":
        selftest()
    elif len(sys.argv) > 1 and sys.argv[1] in ("--help", "-h"):
        print(__doc__)
    else:
        main()
