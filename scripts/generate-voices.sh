#!/usr/bin/env bash
# Generates The God of Rage voice pack with the macOS speech
# synthesiser and a God-of-War-scale processing chain.
#
#   ./scripts/generate-voices.sh
#
# Output: public/voices/*.mp3 (44.1 kHz, mono, 192 kbps).
# Requires: macOS `say`, `ffmpeg` with libmp3lame.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/public/voices"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$OUT"

THUNDER="highpass=f=55,equalizer=f=140:t=q:w=1.1:g=5,equalizer=f=3100:t=q:w=1.3:g=-2.5,asetrate=42336,aresample=48000,atempo=1.1339,acompressor=threshold=-20dB:ratio=3.5:attack=8:release=220:makeup=3,aecho=0.85:0.9:120|260:0.28|0.14,loudnorm=I=-15:TP=-1.5:LRA=10"
NARRATOR="highpass=f=70,equalizer=f=180:t=q:w=1:g=4,equalizer=f=3000:t=q:w=1.4:g=-2,asetrate=43200,aresample=48000,atempo=1.1111,acompressor=threshold=-20dB:ratio=3:attack=10:release=260:makeup=3,aecho=0.82:0.9:150|320|520:0.3|0.16|0.08,loudnorm=I=-16:TP=-1.5:LRA=10"
AGGRO="highpass=f=50,equalizer=f=120:t=q:w=1:g=6,equalizer=f=2400:t=q:w=1.2:g=-3,asetrate=40800,aresample=48000,atempo=1.1765,acompressor=threshold=-18dB:ratio=5:attack=3:release=150:makeup=4,aecho=0.8:0.9:90|200|340:0.32|0.18|0.1,loudnorm=I=-14:TP=-1.2:LRA=9"
HERALD="highpass=f=120,equalizer=f=2600:t=q:w=1:g=1.5,asetrate=46080,aresample=48000,atempo=1.0417,acompressor=threshold=-20dB:ratio=3:attack=6:release=180:makeup=2,aecho=0.9:0.35:70:0.14,loudnorm=I=-16:TP=-1.5:LRA=10"

line() {
  local key="$1" voice="$2" rate="$3" chain="$4" text="$5"
  echo "  $key  -  $voice"
  say -v "$voice" -r "$rate" --file-format=WAVE --data-format=LEF32@48000 \
    -o "$TMP/$key.wav" "$text"
  ffmpeg -y -hide_banner -loglevel error -i "$TMP/$key.wav" \
    -af "$chain" -ar 44100 -ac 1 -codec:a libmp3lame -b:a 192k \
    "$OUT/$key.mp3"
}

echo "Generating the voice pack in $OUT"

# --- The Thunder (protagonist / Kratos-adjacent) ---------------------------
line storm-intro        "Reed (English (US))" 108 "$THUNDER" "The God of Rage."
line storm-outside      "Reed (English (US))" 116 "$THUNDER" "The storm feeds on you. Move."
line storm-low-health   "Reed (English (US))" 112 "$THUNDER" "Your blood is loud. It calls them."
line storm-boss         "Reed (English (US))" 104 "$THUNDER" "A colossus. Finally, a fight."
line storm-revive       "Reed (English (US))" 112 "$THUNDER" "The storm is not done with you."
line storm-drop         "Reed (English (US))" 100 "$AGGRO"   "Drop."

# --- The aggressive short lines -------------------------------------------
line storm-kill         "Rocko (English (US))" 98 "$AGGRO" "Die."
line storm-rage         "Rocko (English (US))" 88 "$AGGRO" "Rage."

# --- The narrator / the gods ----------------------------------------------
line storm-match-start  "Daniel" 108 "$NARRATOR" "The gods have sent their children to die."
line storm-phase-1      "Daniel" 112 "$NARRATOR" "The storm is closing. Good."
line storm-phase-2      "Daniel" 112 "$NARRATOR" "They are watching. Let them."
line storm-phase-3      "Daniel" 110 "$NARRATOR" "There is less world now. Less to hide behind."
line storm-phase-4      "Daniel" 108 "$NARRATOR" "The last circle. The last god."
line storm-final        "Daniel" 106 "$NARRATOR" "Nowhere left to run. Only thunder."
line storm-wave         "Daniel" 114 "$NARRATOR" "They come again."
line storm-defeat       "Daniel" 108 "$NARRATOR" "You fall. The gods laugh."
line storm-victory      "Daniel" 106 "$NARRATOR" "The storm is yours. The gods are silent."
line storm-eliminated   "Daniel" 112 "$NARRATOR" "One more name for the storm."

# --- The herald ------------------------------------------------------------
line herald-count-ten   "Flo (English (UK))" 138 "$HERALD" "Ten seconds."
line herald-final-ring  "Flo (English (UK))" 132 "$HERALD" "Final ring."
line herald-zone-sealed "Flo (English (UK))" 132 "$HERALD" "The arena is sealed."

echo
echo "Done. $(ls -1 "$OUT"/*.mp3 | wc -l | tr -d ' ') files written."

# ---------------------------------------------------------------------------
# A final loudness trim. Short lines can slip past a single loudnorm pass, so
# measure every finished file and bring it to a consistent -15 LUFS.
# ---------------------------------------------------------------------------
echo "Normalising to -15 LUFS…"
for f in "$OUT"/*.mp3; do
  measured=$(ffmpeg -hide_banner -nostats -i "$f" -af loudnorm=I=-15:TP=-1.5:print_format=json -f null - 2>&1 \
    | grep -o '"input_i" : *"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
  gain=$(awk -v i="$measured" 'BEGIN { g = -15 - i; if (g > 12) g = 12; if (g < -6) g = -6; printf "%.1f", g }')
  ffmpeg -y -hide_banner -loglevel error -i "$f" \
    -af "volume=${gain}dB,alimiter=limit=0.891" \
    -ar 44100 -ac 1 -codec:a libmp3lame -b:a 192k "$TMP/norm.mp3"
  mv "$TMP/norm.mp3" "$f"
  printf "  %-30s %+5.1f dB\n" "$(basename "$f")" "$gain"
done
