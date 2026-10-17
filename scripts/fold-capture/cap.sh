#!/bin/bash
# usage: cap.sh <lang> <name> -> store/screenshots/raw-android/<lang>/<name>.png (status bar cropped) + preview
D=/private/tmp/claude-501/-Users-evandrosantos-Desktop-dosetrace/471f2548-5ba0-4cd3-9104-9a98d6108669/scratchpad/fold
OUT=/Users/evandrosantos/Desktop/dosetrace/store/screenshots/raw-android/$1
mkdir -p "$OUT"
adb exec-out screencap -p > "$D/cap.raw"
python3 - "$D/cap.raw" "$D/cap.full.png" <<'PY'
import sys
d=open(sys.argv[1],'rb').read(); i=d.find(b'\x89PNG'); open(sys.argv[2],'wb').write(d[i:])
PY
PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH" node "$D/crop.cjs" "$D/cap.full.png" "$OUT/$2.png" 111
sips -Z 1000 "$OUT/$2.png" --out "$D/prev_$1_$2.png" >/dev/null
rm -f "$D/cap.raw"
sips -g pixelWidth -g pixelHeight "$OUT/$2.png" | tail -2 | tr '\n' ' '; echo
