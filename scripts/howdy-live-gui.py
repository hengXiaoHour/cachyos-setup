#!/usr/bin/env python3
"""Howdy live GUI tuner: popup with your IR face feed + sliders.
Run: python3 howdy-live-gui.py            (live window, no sudo to launch)
     python3 howdy-live-gui.py --selftest (no camera needed, verifies pipeline)

Sliders: dark = dark_threshold, cert = certainty x10, height = max_height,
         up = upsample 0 fast / 1 accurate.
Keys: s = save sliders to /etc/howdy/config.ini (asks sudo password),
      r = revert to pre-tuner backup, q or ESC = quit without saving."""
import sys, os, json, time, subprocess, io, configparser

sys.path.insert(0, "/usr/lib/howdy")
import cv2
import numpy as np

CONFIG = "/etc/howdy/config.ini"
COMPARE = "/usr/lib/howdy/compare.py"
BACKUP_SUFFIX = ".livetune-bak"
DEVICE = "/dev/v4l/by-path/pci-0000:00:14.0-usb-0:7:1.2-video-index0"
USER = "chenla"

def load_config():
    c = configparser.ConfigParser()
    c.optionxform = lambda optionstr: optionstr
    c.read(CONFIG)
    return c

def save_config(values):
    """values: dict of (sec,key)->str. Writes via sudo if not root."""
    c = load_config()
    for (sec, key), val in values.items():
        if sec not in c:
            c[sec] = {}
        c[sec][key] = str(val)
    buf = io.StringIO()
    c.write(buf)
    text = buf.getvalue()
    if os.geteuid() == 0:
        with open(CONFIG, "w") as f:
            f.write(text)
    else:
        r = subprocess.run(["sudo", "tee", CONFIG], input=text.encode(),
                           capture_output=True)
        if r.returncode != 0:
            print("save FAILED (sudo password wrong?)")
            return False
    # upsample lives in code, not config
    if "upsample" in values:
        set_upsample(values["upsample"])
    print("saved:", values)
    return True

def set_upsample(n):
    with open(COMPARE) as f:
        txt = f.read()
    if str(n) == "0":
        txt = txt.replace("face_detector(gsframe, 1)", "face_detector(gsframe, 0)")
    else:
        txt = txt.replace("face_detector(gsframe, 0)", "face_detector(gsframe, 1)")
    if os.geteuid() == 0:
        with open(COMPARE, "w") as f:
            f.write(txt)
    else:
        r = subprocess.run(["sudo", "tee", COMPARE], input=txt.encode(),
                           capture_output=True)
        if r.returncode != 0:
            print("upsample save FAILED")
            return
    subprocess.run("sudo find /usr/lib/howdy -name __pycache__ -type d "
                   "-exec rm -rf {} + 2>/dev/null", shell=True)
    print("upsample =", n)

def load_models():
    """Returns (encodings list, label list). Same files real login uses."""
    with open("/etc/howdy/models/chenla.dat") as f:
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
    detector = dlib.get_frontal_face_detector()
    predictor = dlib.shape_predictor(paths_factory.shape_predictor_5_face_landmarks_path())
    encoder = dlib.face_recognition_model_v1(paths_factory.dlib_face_recognition_resnet_model_v1_path())
    return detector, predictor, encoder

def darkness_of(gsframe):
    hist = cv2.calcHist([gsframe], [0], None, [8], [0, 256])
    total = float(np.sum(hist))
    if total == 0:
        return 100.0
    return float(hist[0] / total * 100)

def selftest():
    print("loading models...", end=" ", flush=True)
    encodings, labels = load_models()
    print(f"OK ({len(encodings)} encodings, labels {set(labels)})")
    print("loading dlib (takes ~10s)...", end=" ", flush=True)
    t0 = time.time()
    detector, predictor, encoder = init_dlib()
    print(f"OK ({time.time()-t0:.1f}s)")
    print("running detector on synthetic frame...", end=" ", flush=True)
    t0 = time.time()
    fake = np.random.randint(0, 255, (240, 320), dtype=np.uint8)
    faces = detector(fake, 0)
    print(f"OK ({(time.time()-t0)*1000:.0f}ms, faces found: {len(faces)})")
    print("SELFTEST PASS: pipeline works, camera + display still needed for live mode")

def main():
    cfg = load_config()
    dark = int(float(cfg.get("video", "dark_threshold", fallback=85)))
    cert = int(float(cfg.get("video", "certainty", fallback=3.5)) * 10)
    height = int(float(cfg.get("video", "max_height", fallback=320)))
    with open(COMPARE) as f:
        up = 0 if "face_detector(gsframe, 0)" in f.read() else 1

    print("loading your face model...", flush=True)
    encodings, labels = load_models()
    print(f"loaded {len(encodings)} encodings. loading dlib (~10s)...", flush=True)
    detector, predictor, encoder = init_dlib()
    print("opening IR camera...", flush=True)
    cam = cv2.VideoCapture(DEVICE)
    if not cam.isOpened():
        print(f"cannot open {DEVICE}. Is another app using the camera?")
        sys.exit(1)

    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    win = "howdy live tune (s=save r=revert q=quit)"
    cv2.namedWindow(win)
    cv2.createTrackbar("dark", win, dark, 100, lambda v: None)
    cv2.createTrackbar("cert x10", win, cert, 50, lambda v: None)
    cv2.createTrackbar("height", win, height, 360, lambda v: None)
    cv2.createTrackbar("up", win, up, 1, lambda v: None)

    print("window open. Tune sliders, press s to save, q to quit.")
    fps_t0, fps_n, fps = time.time(), 0, 0.0
    while True:
        ok, frame = cam.read()
        if not ok:
            print("camera read failed, quitting")
            break
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY) if len(frame.shape) == 3 else frame
        gray = clahe.apply(gray)

        dark_thr = cv2.getTrackbarPos("dark", win)
        cert_thr = cv2.getTrackbarPos("cert x10", win) / 10.0
        max_h = max(80, cv2.getTrackbarPos("height", win))
        ups = cv2.getTrackbarPos("up", win)

        dark_pct = darkness_of(gray)
        h, w = gray.shape[:2]
        scale = (max_h / h) or 1
        small = gray if scale >= 1 else cv2.resize(gray, None, fx=scale, fy=scale,
                                                  interpolation=cv2.INTER_AREA)

        status, best, ms = "too dark, skipped", None, 0.0
        rects = []
        if dark_pct <= dark_thr:
            t0 = time.time()
            faces = detector(small, ups)
            inv = 1 / scale if scale != 1 else 1.0
            for fl in faces:
                r = fl.rect if hasattr(fl, "rect") else fl
                x1, y1 = int(r.left() * inv), int(r.top() * inv)
                x2, y2 = int(r.right() * inv), int(r.bottom() * inv)
                rects.append((x1, y1, x2, y2))
                try:
                    land = predictor(frame, fl if not hasattr(fl, "rect") else fl)
                    enc = np.array(encoder.compute_face_descriptor(frame, land, 1))
                    dists = np.linalg.norm(np.array(encodings) - enc, axis=1)
                    i = int(np.argmin(dists))
                    if best is None or dists[i] < best[0]:
                        best = (float(dists[i]), labels[i])
                except Exception:
                    pass
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
        for (x1, y1, x2, y2) in rects:
            cv2.rectangle(color, (x1, y1), (x2, y2), (0, 255, 0), 2)
        cv2.putText(color, status, (10, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.8,
                    (0, 255, 0) if status.startswith("MATCH") else (0, 200, 255), 2)
        cv2.putText(color, f"dark {dark_pct:.0f}%/thr {dark_thr} cert {cert_thr:.1f} "
                    f"det {ms:.0f}ms {fps:.0f}fps", (10, h - 12),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1)
        cv2.imshow(win, color)

        key = cv2.waitKey(1) & 0xFF
        if key in (ord("q"), 27):
            print("quit without saving")
            break
        elif key == ord("s"):
            save_config({("video", "dark_threshold"): dark_thr,
                         ("video", "certainty"): round(cert_thr, 1),
                         ("video", "max_height"): max_h,
                         "upsample": ups})
        elif key == ord("r"):
            for p in (CONFIG, COMPARE):
                b = p + BACKUP_SUFFIX
                if os.path.exists(b) or subprocess.run(
                        f"test -e '{b}'", shell=True).returncode == 0:
                    subprocess.run(f"sudo cp '{b}' '{p}'" if os.geteuid() != 0
                                   else f"cp '{b}' '{p}'", shell=True)
                    print("reverted", p)

    cam.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--selftest":
        selftest()
    elif len(sys.argv) > 1 and sys.argv[1] in ("--help", "-h"):
        print(__doc__)
    else:
        main()
