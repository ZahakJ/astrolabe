#!/usr/bin/env bash
# Boot the packed AppImage under a virtual display and make sure the main
# process comes up and stays up. Releases 3.1.0–3.3.4 shipped a main process
# that died on its first line ("Identifier 'existsSync' has already been
# declared"); a green build and a green typecheck said nothing about that.
#   scripts/check-desktop-boot.sh desktop/release/Astrolabe-<v>.AppImage
set -u
app="${1:?AppImage path}"
log="$(mktemp)"
export ASTROLABE_VAULT="$(mktemp -d)"
export ASTROLABE_DATA="$ASTROLABE_VAULT/.data"
timeout 25 xvfb-run -a "$app" --no-sandbox > "$log" 2>&1
code=$?
if grep -qiE "A JavaScript error occurred|Uncaught Exception|SyntaxError|Cannot find module" "$log"; then
  echo "DESKTOP BOOT FAILED:"; grep -iE "error|exception" "$log" | head -5; exit 1
fi
# 124 is timeout's own code: the app was still running when the clock ran out — which is the good outcome.
if [ "$code" != "124" ] && [ "$code" != "0" ]; then echo "DESKTOP BOOT FAILED: exit $code"; tail -5 "$log"; exit 1; fi
echo "DESKTOP BOOT OK (exit $code, $(grep -c . "$log") log lines)"
