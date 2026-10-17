#!/bin/bash
# lang4.sh <code> <LanguageLabelInCurrentLang> <TargetNativeName> <OtherDateLabel> <TirzName> <DoneLabel> <BloodTestRegex> <RemCheckRegex>
D=/private/tmp/claude-501/-Users-evandrosantos-Desktop-dosetrace/471f2548-5ba0-4cd3-9104-9a98d6108669/scratchpad/fold
L=$1
# from reminder check: back, top of settings, language
adb shell input tap 140 172; sleep 2
for i in 1 2 3; do adb shell input swipe 540 700 540 2100 200; done; sleep 1
$D/tt.sh "$2" || exit 1; sleep 1.5
$D/tt.sh "$3" || exit 1; sleep 2.5
# 03 protocol detail (Protocols stack keeps the Tirzepatide detail)
adb shell input tap 323 2422; sleep 3
bash $D/cap.sh $L 03_doses
# 01 curve
adb shell input tap 752 2422; sleep 2.5
adb shell input tap 557 1013; sleep 4
adb shell input swipe 540 2000 540 1100 300; sleep 1.5
$D/tt.sh "$4" || exit 1; sleep 2
adb shell input tap 227 2013; sleep 1.2; adb shell input tap 540 1907; sleep 1.2
adb shell input tap 930 1749; sleep 1.5
for i in 1 2 3; do adb shell input swipe 540 700 540 2100 200; done; sleep 1.5
bash $D/cap.sh $L 01_curve
# 05 labs: back to hub, open the lab journal, By marker, Testosterone Total
adb shell input tap 140 172; sleep 2
adb shell input tap 278 600; sleep 3
adb shell input tap 786 604; sleep 2
$D/tt.sh "Testosterone, Total" || exit 1; sleep 3
bash $D/cap.sh $L 05_labs
# 07 reminder check
adb shell input tap 140 172; sleep 1.5; adb shell input tap 140 172; sleep 1.5
adb shell input tap 971 2422; sleep 2.5
B=$(adb exec-out uiautomator dump /dev/tty 2>/dev/null | grep -o "text=\"[^\"]*\"[^>]*bounds=\"[^\"]*\"" | grep -E "$5" | head -1 | sed 's/.*bounds="\[\([0-9]*\),\([0-9]*\)\]\[\([0-9]*\),\([0-9]*\)\]"/\1 \2 \3 \4/')
set -- $B; adb shell input tap $(( ($1+$3)/2 )) $(( ($2+$4)/2 )); sleep 3
bash $D/cap.sh $L 07_reminders
