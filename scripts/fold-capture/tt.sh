#!/bin/bash
# tt.sh "<exact text>" [index] -> taps the center of the Nth element whose text equals it
N=${2:-1}
B=$(adb exec-out uiautomator dump /dev/tty 2>/dev/null | grep -o "text=\"$1\"[^>]*bounds=\"\[[0-9]*,[0-9]*\]\[[0-9]*,[0-9]*\]\"" | sed -n "${N}p" | sed 's/.*bounds="\[\([0-9]*\),\([0-9]*\)\]\[\([0-9]*\),\([0-9]*\)\]"/\1 \2 \3 \4/')
if [ -z "$B" ]; then echo "NOTFOUND: $1"; exit 1; fi
set -- $B
X=$(( ($1+$3)/2 )); Y=$(( ($2+$4)/2 ))
adb shell input tap $X $Y; echo "tap $X $Y"
