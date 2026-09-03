#!/usr/bin/env python3
"""howdy live tuner - no sudo needed to launch. Password is asked only when saving.
Run: python3 howdy-live-tune.py"""
import configparser, subprocess, sys, os, io

CONFIG = "/etc/howdy/config.ini"
COMPARE = "/usr/lib/howdy/compare.py"
BACKUP_SUFFIX = ".livetune-bak"
ROOT = os.geteuid() == 0

def sudo(cmd):
    """Run a shell command with sudo only if not root."""
    if ROOT:
        r = subprocess.run(cmd, shell=True)
    else:
        r = subprocess.run("sudo " + cmd, shell=True)
    return r.returncode == 0

def backup(path):
    b = path + BACKUP_SUFFIX
    if subprocess.run(f"test -e '{b}'", shell=True).returncode == 0:
        return
    if sudo(f"cp '{path}' '{b}'"):
        print(f"backup: {b}")
    else:
        print(f"backup FAILED for {path}");

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

def write_root(path, text):
    """Write text to a root-owned file. Uses sudo tee when not root."""
    if ROOT:
        with open(path, "w") as f: f.write(text)
        return True
    r = subprocess.run(["sudo", "tee", path], input=text.encode(),
                       capture_output=True)
    if r.returncode != 0:
        print(f"write FAILED for {path} (wrong sudo password?)")
        return False
    return True

def set_ini(c, sec, key, val):
    if sec not in c: c[sec] = {}
    c[sec][key] = str(val)
    buf = io.StringIO()
    c.write(buf)
    if write_root(CONFIG, buf.getvalue()):
        print(f"set [{sec}] {key} = {val}  (saved, password was accepted)")

def set_upsample(n):
    with open(COMPARE) as f: txt = f.read()
    if n == "0":
        txt = txt.replace("face_detector(gsframe, 1)", "face_detector(gsframe, 0)")
    else:
        txt = txt.replace("face_detector(gsframe, 0)", "face_detector(gsframe, 1)")
    if write_root(COMPARE, txt):
        sudo("find /usr/lib/howdy -name __pycache__ -type d -exec rm -rf {} + 2>/dev/null")
        print(f"set upsample = {n}  (saved)")

def test():
    print("\nlook at the camera, testing...")
    subprocess.run(["sudo", "-k"])
    r = subprocess.run(["bash", "-c", "time sudo -i -c 'echo OK-face-unlock'"])
    print("exit:", r.returncode, "(0 with your name = face worked)")

def revert():
    for p in (CONFIG, COMPARE):
        b = p + BACKUP_SUFFIX
        if subprocess.run(f"test -e '{b}'", shell=True).returncode == 0:
            if sudo(f"cp '{b}' '{p}'"):
                print(f"reverted {p}")
        else:
            print(f"no backup for {p}")

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
    show(load())
    sys.exit(0)

if len(sys.argv) > 1 and sys.argv[1] in ("--help", "-h"):
    print("usage: python3 howdy-live-tune.py [--show]")
    print("No sudo needed to launch. Password is asked only when saving.")
    sys.exit(0)

def ask(prompt, default, lo, hi):
    """Prompt for a number, clamp to [lo, hi]. Pasted commands are rejected."""
    raw = input(f"{prompt} [{default}]> ").strip() or default
    try:
        val = float(raw)
    except ValueError:
        print(f"rejected {raw!r}: not a number, keeping current value")
        return None
    if not (lo <= val <= hi):
        print(f"rejected {val}: must be between {lo} and {hi}")
        return None
    return val

backup(CONFIG); backup(COMPARE)
print("howdy live tuner. one change, then press t to test.")
print("(password is asked only when saving, not at startup)")
while True:
    show(load())
    print(MENU)
    try:
        ch = input("choice> ").strip().lower()
    except EOFError:
        print("\nbye.")
        break
    c = load()
    if ch == "1":
        v = ask("max_height", "160", 80, 480)
        if v is not None: set_ini(c, "video", "max_height", int(v))
    elif ch == "2":
        v = ask("certainty", "4.0", 1.0, 5.0)
        if v is not None: set_ini(c, "video", "certainty", v)
    elif ch == "3":
        v = ask("dark_threshold", "85", 10, 100)
        if v is not None: set_ini(c, "video", "dark_threshold", v)
    elif ch == "4":
        v = ask("timeout secs", "6", 2, 30)
        if v is not None: set_ini(c, "video", "timeout", int(v))
    elif ch == "5":
        v = ask("upsample", "0", 0, 1)
        if v is not None: set_upsample(int(v))
    elif ch == "6": set_ini(c, "debug", "end_report", input("end_report [true/false]> ").strip() or "true")
    elif ch == "t": test()
    elif ch == "s": continue
    elif ch == "r": revert()
    elif ch == "q": print("bye. backups at *" + BACKUP_SUFFIX); break
    else: print("unknown choice")
