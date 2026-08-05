#!/bin/sh
# Screenshot the hold in several states, so a change to the renderer can be LOOKED at.
# Writes PNGs to shots/ (gitignored). Needs Chrome; skips cleanly without it.
set -e
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "Chrome not found at $CHROME — skipping screenshots"; exit 0; }
PORT=8899
mkdir -p shots
python3 -m http.server $PORT >/dev/null 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
sleep 1
for state in "empty=1:new-hold" "lvl=5:level-5" "lvl=12:level-12" "lvl=20:level-20" \
             "lvl=20&threat=1:under-threat" "lvl=12&building=1:building"; do
  q=${state%%:*}; name=${state##*:}
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars \
    --virtual-time-budget=2500 --window-size=616,430 \
    --screenshot="shots/$name.png" "http://localhost:$PORT/tools/scene.html?$q" >/dev/null 2>&1
  echo "  shots/$name.png"
done
echo "Six states written to shots/"
