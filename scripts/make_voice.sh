#!/bin/bash
# Records the narrator's lines of the VR journey with the macOS built-in voice (docs/XR.md, "Voice and sound").
# The list below is the only place the lines are written: this script writes one .m4a per line and
# xr/public/voice/lines.json, which the app reads for the caption it shows while a line plays (xr/src/voice.ts).
#
# Usage (macOS, from the repository root):  scripts/make_voice.sh
#        another voice or speed:             VOICE=Samantha RATE=170 scripts/make_voice.sh
# The ids are fixed (xr/src/voice.ts LINE_IDS); change the words freely, keep each line under 12 words.
set -euo pipefail

VOICE="${VOICE:-Daniel}"
RATE="${RATE:-175}"
OUT="$(cd "$(dirname "$0")/.." && pwd)/xr/public/voice"

# id|what the voice says (no double quotes or backslashes in the text)
LINES=(
  "moon|This is the Moon from below its south pole. Press Start."
  "pole|Six landing sites. Yellow is our pick. Choose one."
  "surface|You're on the surface. Press the green Play button."
  "play|Watch the Sun. When it hides behind the ridge, power stops."
  "walk|Point at the ground and pull the trigger to walk."
  "handle|Grab the menu's handle to move it."
)

mkdir -p "$OUT"
rm -f "$OUT"/*.m4a
json=""
for line in "${LINES[@]}"; do
  id="${line%%|*}"
  text="${line#*|}"
  say -v "$VOICE" -r "$RATE" -o "$OUT/$id.aiff" "$text"
  afconvert -f m4af -d aac -b 32000 "$OUT/$id.aiff" "$OUT/$id.m4a"
  rm "$OUT/$id.aiff"
  json="$json    { \"id\": \"$id\", \"text\": \"$text\", \"file\": \"$id.m4a\" },\n"
done
printf '{\n  "voice": "macOS speech synthesis, voice %s, %s words per minute",\n  "lines": [\n%b  ]\n}\n' \
  "$VOICE" "$RATE" "${json%,\\n}\n" > "$OUT/lines.json"
ls -l "$OUT"
