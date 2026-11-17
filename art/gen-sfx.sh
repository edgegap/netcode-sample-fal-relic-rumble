#!/usr/bin/env bash
# Sound effects (elevenlabs/sound-effects/v3). Run from the repo root.
sfx() {
  genmedia run elevenlabs/sound-effects/v3 --text "$2" --duration_seconds "$3" --output_format mp3_44100_64 \
    --download "client/assets/sfx/$1.mp3" --json > "art/raw/sfx-$1.json" 2>&1
  echo "$1 exit $?"
}
sfx pickup "Short bright magical chime as a small golden treasure is picked up, cartoon game sound, dry, no reverb tail" 0.7 &
sfx score "Triumphant short two-note marimba and bell fanfare for scoring a point in a party game" 1.2 &
sfx shove "Quick cartoon whoosh of a hard push, air swish" 0.5 &
sfx hit "Cartoon thud and comic bonk as a character is knocked back" 0.6 &
sfx win "Joyful short victory jingle with bells and a small crowd cheer, party game" 3 &
wait
