#!/bin/bash
# usage: shot.sh name  -> fold/<name>.png downscaled to 1000px high
D=/private/tmp/claude-501/-Users-evandrosantos-Desktop-dosetrace/471f2548-5ba0-4cd3-9104-9a98d6108669/scratchpad/fold
adb exec-out screencap -p > "$D/$1.raw"
python3 - "$D/$1.raw" "$D/$1.full.png" <<'PY'
import sys
d=open(sys.argv[1],'rb').read(); i=d.find(b'\x89PNG'); open(sys.argv[2],'wb').write(d[i:])
PY
sips -Z 1000 "$D/$1.full.png" --out "$D/$1.png" >/dev/null
rm -f "$D/$1.raw"
echo "$D/$1.png $(adb shell wm size | tail -1)"
