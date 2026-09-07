#!/usr/bin/env bash
# The desktop RELAUNCH gate: an AppImage that restarts itself the way an
# applied update does, and comes back.
#
#   scripts/check-desktop-relaunch.sh path/to/Astrolabe-x.y.z.AppImage
#
# Boots the AppImage under Xvfb with an isolated config directory and
# ASTROLABE_SELFTEST=relaunch, which makes main.ts call the updater's own
# relaunch four seconds after boot. Passes when the first main process is gone
# AND a second one, started from the same file, is running afterwards. This
# exists because `app.relaunch()` looked like it worked and did not: Electron's
# relauncher runs from the mounted image, which is unmounted by the time it
# executes, and the owner's "restart didn't restart on its own" was the first
# anyone heard of it. Every AppImage release runs this before upload.
set -u
IMG="${1:?usage: $0 <AppImage>}"
[ -x "$IMG" ] || { echo "RELAUNCH FAIL: $IMG is not executable"; exit 1; }
IMG="$(readlink -f "$IMG")"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/xdg" "$WORK/home"
LOG="$WORK/run.log"

# The main process of an instance started from THIS file, by environment: the
# AppImage runtime exports the file's path as APPIMAGE.
mains() {
  for p in $(pgrep -f "astrolabe" 2>/dev/null); do
    cat "/proc/$p/cmdline" 2>/dev/null | tr '\0' ' ' | grep -q -- "--type=" && continue
    env="$(cat "/proc/$p/environ" 2>/dev/null | tr '\0' '\n')" || continue
    grep -qx "APPIMAGE=$IMG" <<< "$env" || continue
    grep -qx "XDG_CONFIG_HOME=$WORK/xdg" <<< "$env" || continue
    echo "$p"
  done
}

cd "$WORK/home"
mkdir -p "$WORK/vault"
XDG_CONFIG_HOME="$WORK/xdg" HOME="$WORK/home" ASTROLABE_VAULT="$WORK/vault" ASTROLABE_SELFTEST=relaunch \
  xvfb-run -a "$IMG" --no-sandbox > "$LOG" 2>&1 &
# Mounting the image and starting the main process takes a few seconds.
FIRST=""
for _ in $(seq 1 15); do
  sleep 1
  FIRST="$(mains | head -1)"
  [ -n "$FIRST" ] && break
done
[ -n "$FIRST" ] || { echo "RELAUNCH FAIL: the first instance never came up"; tail -5 "$LOG"; exit 1; }

# The self-test fires at 4 s; give the exit and the relaunch a moment each.
for _ in $(seq 1 20); do
  sleep 1
  [ -d "/proc/$FIRST" ] || break
done
[ -d "/proc/$FIRST" ] && { echo "RELAUNCH FAIL: the first instance ($FIRST) never exited"; kill "$FIRST" 2>/dev/null; exit 1; }

SECOND=""
for _ in $(seq 1 20); do
  sleep 1
  SECOND="$(mains | head -1)"
  [ -n "$SECOND" ] && break
done
for p in $(mains); do kill "$p" 2>/dev/null; done
sleep 1
if [ -z "$SECOND" ]; then
  echo "RELAUNCH FAIL: the first instance exited and nothing came back"
  grep -i "fusermount\|error" "$LOG" | head -3
  exit 1
fi
if grep -qi "Uncaught Exception\|SyntaxError" "$LOG"; then
  echo "RELAUNCH FAIL: exception in the log"; grep -i "Uncaught Exception\|SyntaxError" "$LOG" | head -3; exit 1
fi
echo "DESKTOP RELAUNCH OK (first $FIRST exited, second $SECOND came back)"
