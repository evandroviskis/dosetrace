#!/bin/bash
# The app session's watcher for the admin panel's Decisions tab (founder 2026-11-24/26, item 81 "Avisar as
# sessões"): calls the signal RPC with this session's key (codigo/segredos/painel-sinal-app.key, git-ignored;
# only its sha256 is in the database) and the app's public anon key (eas.json). Prints one line:
#   aguardando=<n> ultima_resposta=<iso> ultimo_aviso=<iso>   (or nothing on any failure).
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KEY_FILE="$ROOT/segredos/painel-sinal-app.key"
[ -f "$KEY_FILE" ] || exit 0
URL="$(grep -o '"EXPO_PUBLIC_SUPABASE_URL": *"[^"]*"' "$ROOT/eas.json" | head -1 | sed -E 's/.*: *"([^"]*)"/\1/')"
ANON="$(grep -o '"EXPO_PUBLIC_SUPABASE_ANON_KEY": *"[^"]*"' "$ROOT/eas.json" | head -1 | sed -E 's/.*: *"([^"]*)"/\1/')"
[ -n "$URL" ] && [ -n "$ANON" ] || exit 0
body="$(printf '{"p_token":"%s"}' "$(cat "$KEY_FILE")")"
out="$(curl -s -m 8 -X POST "$URL/rest/v1/rpc/founder_decisions_signal" -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -H 'Content-Type: application/json' -d "$body" 2>/dev/null)" || exit 0
printf '%s' "$out" | jq -r 'select(type=="object") | .app // empty | "aguardando=\(.aguardando // 0) ultima_resposta=\(.ultima_resposta // "-") ultimo_aviso=\(.ultimo_aviso // "-")"' 2>/dev/null
exit 0
