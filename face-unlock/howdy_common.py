#!/usr/bin/env python3
"""Shared core for the Howdy GUI tools. Imported by howdy-live-gui.py
(tuning) and howdy-capture-gui.py (enrollment). Not run directly."""
import sys, os, json, time, subprocess, io, configparser

SYS_PYTHON = "/usr/bin/python3"
try:
    import cv2
except ImportError:
    if os.environ.get("HOWDY_GUI_REEXEC") or sys.executable.startswith(SYS_PYTHON):
        raise
    os.environ["HOWDY_GUI_REEXEC"] = "1"
    os.execv(SYS_PYTHON, [SYS_PYTHON] + sys.argv)

import numpy as np

CONFIG = "/etc/howdy/config.ini"
COMPARE = "/usr/lib/howdy/compare.py"
BACKUP_SUFFIX = ".livetune-bak"
DEVICE = "/dev/v4l/by-path/pci-0000:00:14.0-usb-0:7:1.2-video-index0"
MODEL = "/etc/howdy/models/chenla.dat"
USER = "chenla"


def load_config():
    c = configparser.ConfigParser()
    c.optionxform = lambda optionstr: optionstr
    c.read(CONFIG)
    return c


def write_root(path, text):
    if os.geteuid() == 0:
        with open(path, "w") as f:
            f.write(text)
        return True
    r = subprocess.run(["sudo", "tee", path], input=text.encode(),
                       capture_output=True)
    if r.returncode != 0:
        print(f"write FAILED for {path} (sudo password?)")
        return False
    return True


def sudo_cmd(cmd):
    full = cmd if os.geteuid() == 0 else "sudo " + cmd
    return subprocess.run(full, shell=True).returncode == 0


def ensure_sudo():
    """Cache sudo credentials BEFORE any GUI window opens.

    Returns True if sudo is now cached. Prompts for the password
    in the terminal, so call this as the first thing in main().
    Without this, sudo calls made after cv2 windows open fail with
    'unable to read password: Input/output error' because there is
    no terminal to prompt on."""
    if os.geteuid() == 0:
        return True
    r = subprocess.run(["sudo", "-v"])
    if r.returncode != 0:
        print("sudo authentication failed, cannot continue.")
        return False
    return True


def load_models():
    """Returns (encodings, labels) from the same file real login uses."""
    with open(MODEL) as f:
        models = json.load(f)
    encodings, labels = [], []
    for m in models:
        for e in m["data"]:
            encodings.append(np.array(e))
            labels.append(m.get("label", "?"))
    return encodings, labels, models


def model_labels(models):
    return [f"#{m['id']} {m.get('label', '?')}" for m in models]


def init_dlib():
    import dlib
    sys.path.insert(0, "/usr/lib/howdy")
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


def open_camera():
    # Try the raw node on V4L2 first: the /dev/v4l/by-path symlink
    # makes OpenCV pick GStreamer, which fails with
    # 'Could not read from resource'. V4L2 opens the IR node directly.
    for target in (2, "/dev/video2", DEVICE):
        try:
            if isinstance(target, int):
                cam = cv2.VideoCapture(target, cv2.CAP_V4L2)
            elif target == DEVICE:
                cam = cv2.VideoCapture(target)
            else:
                cam = cv2.VideoCapture(target, cv2.CAP_V4L2)
        except Exception:
            continue
        if cam.isOpened():
            return cam
        try:
            cam.release()
        except Exception:
            pass
    print(f"cannot open {DEVICE} (/dev/video2). Close any app using the camera and retry.")
    sys.exit(1)


def detect_and_match(frame, gray, small, scale, detector, predictor, encoder,
                     encodings, labels, ups, cert_thr):
    """Returns (circles, status, best, ms). circles: (cx,cy,rad,match,name,dist)."""
    inv = 1 / scale if scale != 1 else 1.0
    circles, best = [], None
    t0 = time.time()
    faces = detector(small, ups)
    for fl in faces:
        r = fl.rect if hasattr(fl, "rect") else fl
        x1, y1 = int(r.left() * inv), int(r.top() * inv)
        x2, y2 = int(r.right() * inv), int(r.bottom() * inv)
        cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
        rad = max(x2 - x1, y2 - y1) // 2
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
        circles.append((cx, cy, rad, dist is not None and 0 < dist < cert_thr, name, dist))
    ms = (time.time() - t0) * 1000
    if best and 0 < best[0] < cert_thr:
        status = f"MATCH {best[1]} ({best[0]*10:.1f})"
    elif faces:
        status = f"no match best={best[0]*10:.1f}" if best else "face, encode fail"
    else:
        status = "no face"
    return circles, status, best, ms


def draw_circles(color, circles):
    for (cx, cy, rad, match, name, dist) in circles:
        col = (0, 255, 0) if match else (0, 200, 255)
        cv2.circle(color, (cx, cy), max(rad, 4), col, 2)
        tag = f"{name} {dist*10:.1f}" if dist is not None else "face"
        cv2.putText(color, tag, (max(cx - rad, 4), max(cy - rad - 8, 16)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, col, 2)


def capture_model(cam, clahe, detector, predictor, encoder, dark_thr, label=None):
    """Capture ~5 good frames, average, append model. Same format as sudo howdy add."""
    try:
        with open(MODEL) as f:
            stored = json.load(f)
    except FileNotFoundError:
        stored = []
    next_id = stored[-1]["id"] + 1 if stored else 0
    label = label or f"Model #{next_id}"
    vecs, frames, dark_skip = [], 0, 0
    t_end = time.time() + 12
    while len(vecs) < 5 and time.time() < t_end and frames < 120:
        ok, frame = cam.read()
        frames += 1
        if not ok:
            continue
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY) if len(frame.shape) == 3 else frame
        gray = clahe.apply(gray)
        if darkness_of(gray) > dark_thr:
            dark_skip += 1
            continue
        faces = detector(gray, 1)
        if len(faces) != 1:
            continue
        try:
            land = predictor(frame, faces[0])
            vecs.append(np.array(encoder.compute_face_descriptor(frame, land, 1)))
        except Exception:
            continue
    if not vecs:
        return f"capture FAILED: no usable frame ({frames} tried, {dark_skip} dark)"
    avg = np.mean(vecs, axis=0)
    stored.append({"time": int(time.time()), "label": label, "id": next_id,
                   "data": [avg.tolist()]})
    if not write_root(MODEL, json.dumps(stored)):
        return "capture FAILED to save (sudo?)"
    return f"captured {label} from {len(vecs)} frames - used from next login"


def selftest():
    print("models...", end=" ", flush=True)
    enc, lab, _ = load_models()
    print(f"OK ({len(enc)} encodings)")
    print("dlib...", end=" ", flush=True)
    t0 = time.time()
    det, _, _ = init_dlib()
    print(f"OK ({time.time()-t0:.1f}s)")
    fake = np.random.randint(0, 255, (240, 320), dtype=np.uint8)
    t0 = time.time()
    faces = det(fake, 0)
    print(f"detector OK ({(time.time()-t0)*1000:.0f}ms, faces: {len(faces)})")
    panel = np.zeros((100, 100, 3), dtype=np.uint8)
    cv2.circle(panel, (50, 50), 20, (0, 255, 0), 2)
    print("circle-draw OK")
    print("SELFTEST PASS")
