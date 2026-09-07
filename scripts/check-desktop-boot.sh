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
# Its own config home: never the reader's ~/.config/astrolabe, whose
# single-instance lock would make this launch hand off to a running app and
# exit 0 — which reads as "booted" and is nothing of the kind.
export XDG_CONFIG_HOME="$(mktemp -d)"
# NEVER from the repository: a checkout carries a .env, and a desktop app
# started beside one links to that deployment — it opened the owner's real
# vault on the vault's own first port candidate while their app was down, and
# their next launch moved ports and lost its tabs. An empty directory is the
# only honest place to boot a test instance from.
app="$(readlink -f "$app")"
cd "$(mktemp -d)"
timeout 25 xvfb-run -a "$app" --no-sandbox > "$log" 2>&1
code=$?
if grep -qiE "A JavaScript error occurred|Uncaught Exception|SyntaxError|Cannot find module" "$log"; then
  echo "DESKTOP BOOT FAILED:"; grep -iE "error|exception" "$log" | head -5; exit 1
fi
# 124 is timeout's own code: the app was still running when the clock ran out — which is the good outcome.
if [ "$code" != "124" ] && [ "$code" != "0" ]; then echo "DESKTOP BOOT FAILED: exit $code"; tail -5 "$log"; exit 1; fi
echo "DESKTOP BOOT OK (exit $code, $(grep -c . "$log") log lines)"
