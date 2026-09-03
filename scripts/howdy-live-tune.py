#!/usr/bin/env python3
"""howdy live tuner - change one knob, test, keep or revert. Run: sudo python3 howdy-live-tune.py"""
import configparser, shutil, subprocess, sys, os

CONFIG = "/etc/howdy/config.ini"
COMPARE = "/usr/lib/howdy/compare.py"
BACKUP_SUFFIX = ".livetune-bak"

def backup(path):
    b = path + BACKUP_SUFFIX
    if not os.path.exists(b):
        shutil.copy2(path, b)
        print(f"backup: {b}")

def load():
    c = configparser.ConfigParser()
    c.optionxform = lambda optionstr: optionstr
    c.read(CONFIG)
    return c

def show(c):
    print("\ncurrent:")
    for sec, key in [("video","max_height"),("video","certainty"),("video","dark_threshold"),("video","timeout"),("video","rotate"),("core","use_cnn"),("debug","end_report")]:
        try: print(f"  [{sec}] {key} = {c.get(sec,key)}")
        except Exception: print(f"  [{sec}] {key} = (unset)")
    print(f"  compare.py upsample = {get_upsample()}")

def get_upsample():
    with open(COMPARE) as f: txt = f.read()
    if "face_detector(gsframe, 0)" in txt: return "0 (fast)"
    if "face_detector(gsframe, 1)" in txt: return "1 (accurate)"
    return "unknown"

def set_ini(c, sec, key, val):
    if sec not in c: c[sec] = {}
    c[sec][key] = str(val)
    with open(CONFIG, "w") as f: c.write(f)
    print(f"set [{sec}] {key} = {val}")

def set_upsample(n):
    with open(COMPARE) as f: txt = f.read()
    if n == "0":
        txt = txt.replace("face_detector(gsframe, 1)", "face_detector(gsframe, 0)")
    else:
        txt = txt.replace("face_detector(gsframe, 0)", "face_detector(gsframe, 1)")
    with open(COMPARE, "w") as f: f.write(txt)
    # drop stale bytecode so PAM picks it up next sudo
    subprocess.run(["find","/usr/lib/howdy","-name","__pycache__","-type","d","-exec","rm","-rf","{}","+"],
                   stderr=subprocess.DEVNULL)
    print(f"set upsample = {n}")

def test():
    print("\nlook at the camera, testing...")
    subprocess.run(["sudo","-k"])
    r = subprocess.run(["bash","-c","time sudo -i -c 'echo OK-face-unlock'"], capture_output=False)
    print("exit:", r.returncode, "(0 with your name = face worked)")

def revert():
    for p in (CONFIG, COMPARE):
        b = p + BACKUP_SUFFIX
        if os.path.exists(b):
            shutil.copy2(b, p)
            print(f"reverted {p}")

MENU = """
1 max_height  [160 fast | 240 | 320 accurate]
2 certainty   [3.5 strict | 4.0 | 4.5 loose, max 5]
3 dark_thresh [85 current, 80-92 safe]
4 timeout     [6, failure wait only]
5 upsample    [0 fast | 1 accurate]  (code edit)
6 end_report  [true = show timings]
t test now (sudo -k + time sudo -i)
s show current
r revert all to pre-tuner backup
q quit
"""

if len(sys.argv) > 1 and sys.argv[1] in ("--show", "-s"):
    c = load()
    show(c)
    sys.exit(0)

if len(sys.argv) > 1 and sys.argv[1] in ("--help", "-h"):
    print("usage: python3 howdy-live-tune.py [--show]   (no sudo needed for --show)")
    print("       sudo python3 howdy-live-tune.py       (needed to change values)")
    sys.exit(0)

if os.geteuid() != 0:
    print("viewing is fine without sudo: python3 howdy-live-tune.py --show")
    print("to CHANGE values, run with sudo: sudo python3 howdy-live-tune.py")
    sys.exit(1)

backup(CONFIG); backup(COMPARE)
c = load()
print("howdy live tuner. one change, then press t to test.")
while True:
    show(load())
    print(MENU)
    ch = input("choice> ").strip().lower()
    c = load()
    if ch == "1": set_ini(c,"video","max_height",input("max_height [160/240/320]> ").strip() or "160")
    elif ch == "2": set_ini(c,"video","certainty",input("certainty [3.5/4.0/4.5]> ").strip() or "4.0")
    elif ch == "3": set_ini(c,"video","dark_threshold",input("dark_threshold [80-92]> ").strip() or "85")
    elif ch == "4": set_ini(c,"video","timeout",input("timeout secs> ").strip() or "6")
    elif ch == "5": set_upsample(input("upsample [0/1]> ").strip() or "0")
    elif ch == "6": set_ini(c,"debug","end_report",input("end_report [true/false]> ").strip() or "true")
    elif ch == "t": test()
    elif ch == "s": continue
    elif ch == "r": revert()
    elif ch == "q": print("bye. backups at *"+BACKUP_SUFFIX); break
    else: print("unknown choice")
