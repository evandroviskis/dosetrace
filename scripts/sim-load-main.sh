#!/bin/zsh
# Build the REAL app (current working tree) as an embedded Hermes bundle and load it into
# the iOS simulator used for checks (iPhone 17 Pro Max, 8F0CF1C2-…; account Test03).
# Used for the visual checks of every change (CLAUDE.md: both themes on the simulator).
set -e
# --reset-cache: a stale Metro cache once produced a white screen ("supabaseUrl is required").
export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH"
DEV=8F0CF1C2-1FA6-42A0-8B71-374222A7AD72
OUT="$HOME/.cache/dosetrace-sim/main-embed"
rm -rf "$OUT"; mkdir -p "$OUT/assets"
cd "$(dirname "$0")/.."
# A worktree has no .env (git-ignored): without it the bundle has no Supabase URL and the app
# opens on a white screen ("supabaseUrl is required"). Link it from the main checkout first.
[ -f .env ] || { echo "no .env in $(pwd): ln -s <main checkout>/.env .env"; exit 1; }
npx expo export:embed --platform ios --reset-cache --dev false --bytecode --entry-file index.js --bundle-output "$OUT/main.jsbundle" --assets-dest "$OUT/assets" >/dev/null
APP=$(xcrun simctl get_app_container $DEV io.outcom.dosetrace app)
cp "$OUT/main.jsbundle" "$APP/main.jsbundle"
# assets-dest mirrors the bundle root (assets/node_modules/...): copy into the app root
cp -R "$OUT/assets/." "$APP/"
xcrun simctl terminate $DEV io.outcom.dosetrace >/dev/null 2>&1 || true
xcrun simctl launch $DEV io.outcom.dosetrace >/dev/null
echo "loaded $(git log --oneline -1 | cut -c1-7)$(git diff --quiet || echo ' + uncommitted changes')"
