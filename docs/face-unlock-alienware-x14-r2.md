# Face unlock (Windows Hello style) on Alienware x14 R2 + CachyOS

Howdy + linux-enable-ir-emitter on GNOME/GDM. Written while installing on 2026-09-03.

## Hardware (measured on this machine)

  Camera: Realtek 0bda:555d Integrated_Webcam_FHD, usb-0000:00:14.0-7
  /dev/video0 = RGB, MJPG 1920x1080
  /dev/video1 = RGB metadata node (no formats)
  /dev/video2 = IR sensor, GREY 640x360 15fps <- Howdy device
  /dev/video3 = IR metadata node (no formats)
  Stable Howdy path: /dev/v4l/by-path/pci-0000:00:14.0-usb-0:7:1.2-video-index0
  Desktop: GNOME, login via gdm-password (covers login + lock screen)

Commands used to probe:
  v4l2-ctl --list-devices
  for d in /dev/video0 /dev/video1 /dev/video2 /dev/video3; do v4l2-ctl -d $d --list-formats-ext; done
  ls -l /dev/v4l/by-id/ /dev/v4l/by-path/
  lsusb -d 0bda:555d

## Status

  [x] Hardware probed, IR node confirmed
  [ ] paru installed
  [ ] howdy-git installed (AUR, dlib build takes a long time)
  [ ] linux-enable-ir-emitter installed
  [ ] IR emitter configured (INTERACTIVE step, see below)
  [ ] Howdy configured, face enrolled
  [ ] PAM wired for sudo + GDM
  [ ] Tested

## Step 0 - root access (DONE, 2026-09-03)

visudo path failed (no vi, lines pasted into fish by mistake). What worked:
SUDO_PASSWORD exported in the Hermes terminal session, backend injects it
for sudo. Password never written to disk, docs, or repo. unset at the end.

## Step 1 - install (in progress, unattended builds running)

Repo deps installed via pacman (2026-09-03):
  paru fmt gtk3 opencv spdlog yaml-cpp argparse qt6-base cblas lapack
  python-scikit-build, plus pre-existing giflib libjpeg-turbo libjxl libpng
  libwebp boost python-setuptools sqlite python-numpy meson ninja cmake git.
  Dropped zlib from the list: CachyOS ships zlib-ng-compat instead (conflict).

AUR, building as user with makepkg in /tmp (sequential, -j16):
  python-dlib with _build_cuda flipped 1 to 0 (no CUDA toolkit on box,
  CPU dlib is plenty for one-frame auth, avoids multi-GB CUDA downloads)
  then python-opencv, howdy-git, linux-enable-ir-emitter.
  paru -S not used: its internal sudo prompts cannot be answered here;
  manual makepkg plus direct sudo pacman -U instead.

Result: builds running in background, packages land via sudo pacman -U next.

2026-09-03 pivot: python-dlib built fine (CPU-only). AUR python-opencv
FAILED: its opencv-python 4.5.1.48 source from 2021 does not compile on
Python 3.14 / current toolchain (ninja subcommand failure in videoio/calib3d).
Not worth fixing. CachyOS ships binary python-opencv 5.0.0
(cachyos-extra-v3 + extra), installed via pacman instead. howdy-git and
linux-enable-ir-emitter still built from AUR with makepkg.

## Step 2 - build log (DONE 2026-09-03)

  Installed and verified: howdy 3.0.0 BETA (howdy-git r592.d3ab993),
  linux-enable-ir-emitter 7.0.0-beta2 (upstream release tarball in
  /usr/local/bin, AUR 6.1.2 skipped: needs opencv4, system has opencv5,
  upstream master is a Rust rewrite), python-opencv 5.0.0 binary,
  python-dlib 20.0.1 CPU-only (local makepkg), cv2+dlib+numpy import OK.
  Config: /etc/howdy/config.ini device_path set to the IR by-path node,
  snapshots already default off in 3.0.
  IR feed verified headless: 640x360 frames arriving, mean brightness 30
  (dark without emitter, as expected). howdy test GUI cannot run from a
  headless session, deferred to user terminal on DISPLAY :0.

## Step 3 - face enrolled, test-utility bug fixed (2026-09-03)

  User ran sudo howdy add in own terminal: model enrolled for chenla OK.
  sudo howdy test crashed: test.py:131 int(sum(hist)[0]) assumes calcHist
  returns (8,1), opencv 5 returns flat, IndexError. Auth path (compare.py)
  and enrollment (add.py) already use np.sum, unaffected. Fixed locally with
  the same one-liner, syntax checked. Second instance of the same bug at
  test.py:137 (value[0] loop over flat hist) fixed the same way, no more
  shape assumptions left in test/compare/add. Emitter configure still pending.

## Step 4 - configure IR emitter (PENDING, interactive, user terminal)

  linux-enable-ir-emitter configure

Follow the wizard, answer Y/N on whether the preview flashes.
Upstream warns probing can in theory corrupt camera firmware.
If auto-detect fails, retry in manual mode.

## Step 5 - configure Howdy (mostly DONE)

  sudo howdy config
  device_path = /dev/v4l/by-path/pci-0000:00:14.0-usb-0:7:1.2-video-index0
  snapshots: capture_failed = false, capture_successful = false

  sudo howdy add
  sudo howdy test

## Step 6 - PAM (PENDING, after emitter + test pass)

Top of /etc/pam.d/gdm-password and /etc/pam.d/sudo:

  auth sufficient /lib/security/pam_howdy.so
  auth sufficient pam_unix.so try_first_pass likeauth nullok

Emitter hook, directly BEFORE the howdy line (fix paths via which):

  auth optional pam_exec.so /usr/local/bin/linux-enable-ir-emitter run --config /home/USER/.config/linux-enable-ir-emitter.toml

Keep a root shell open while testing PAM. Test with sudo -i in a new terminal,
then GDM logout/login.

## Caveats

  Howdy is convenience, not security. A photo can fool it. Never sole auth.
  No Alienware x14 R2 success report found online (checked 2026-09-03);
  closest Dell cases: Latitude 7280 issue 89 (emitter search failed, 0bda:58c7),
  Inspiron 5567 issue 9 (no IR node at all). Our IR node IS exposed, which is
  a better starting point than both.
