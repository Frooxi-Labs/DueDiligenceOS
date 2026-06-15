#!/bin/bash
# Regenerate the deck: HTML -> PDF (one slide/page) -> PNGs -> PPTX.
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
DIR="$(cd "$(dirname "$0")" && pwd)"
"$CHROME" --headless --disable-gpu --no-sandbox --no-pdf-header-footer \
  --virtual-time-budget=9000 --print-to-pdf="$DIR/DueDiligenceOS.pdf" "file://$DIR/deck.html"
pdftoppm -png -r 200 "$DIR/DueDiligenceOS.pdf" "$DIR/slide"   # needs poppler
node "$DIR/buildpptx.js"                                       # needs pptxgenjs
rm -f "$DIR"/slide-*.png
echo "done: DueDiligenceOS.pdf + DueDiligenceOS.pptx"
