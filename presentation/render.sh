#!/bin/bash
# Render deck.html → PDF via headless Chrome. 1280x720 slides = 13.33x7.5in (16:9).
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
DIR="/tmp/ddos-deck-v2"
"$CHROME" --headless --disable-gpu --no-sandbox \
  --no-pdf-header-footer \
  --virtual-time-budget=8000 \
  --print-to-pdf="$DIR/DueDiligenceOS.pdf" \
  "file://$DIR/deck.html"
echo "exit: $?"
ls -la "$DIR/DueDiligenceOS.pdf"
