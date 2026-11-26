#!/bin/bash
# Stop hook (founder 2026-11-26, "as regras estão escapando"): a reply to the founder must end with the
# decisions block ("O que o senhor precisa decidir" or "Nada a decidir"). If the last assistant text lacks it,
# the stop is blocked once with the reason, so Claude fixes the reply before it reaches him. Never loops
# (stop_hook_active), never blocks on any failure.
input="$(cat)"
[ "$(printf '%s' "$input" | jq -r '.stop_hook_active // false' 2>/dev/null)" = "true" ] && exit 0
tp="$(printf '%s' "$input" | jq -r '.transcript_path // empty' 2>/dev/null)"
[ -n "$tp" ] && [ -f "$tp" ] || exit 0
# The text after the last user message only: take the final assistant text block.
final="$(tail -n 3000 "$tp" | jq -rs '[.[] | select(.type=="assistant" or (.type=="user" and ((.message.content|type)=="string" or ([.message.content[]?|select(.type=="text")]|length>0))))] | (map(.type) | rindex("user")) as $u | .[($u // -1)+1:] | map(select(.type=="assistant") | .message.content[]? | select(.type=="text") | .text) | join("\n")' 2>/dev/null)"
[ -z "$final" ] && exit 0 # no text yet after the last message: nothing to check
if printf '%s' "$final" | grep -Eqi "precisa decidir|nada a decidir"; then exit 0; fi
printf '%s\n' '{"decision":"block","reason":"CARTÃO DE REGRAS 9: a resposta ao Evandro não terminou com a lista \"O que o senhor precisa decidir\" (completa e acumulada, ver dosetrace/91-decisoes-pendentes.md) nem com \"Nada a decidir agora.\". Reescreva o fim da resposta. Confira também o cartão inteiro: dosetrace/00-cartao-de-regras.md."}'
exit 0
