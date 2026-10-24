#!/bin/bash
# UserPromptSubmit hook (founder 2026-10-23 20:15 and 20:18 EDT): HANDOFF.md is always ready for a new
# session. Two triggers: (1) the message talks about a build (asking for one, council, ship-check,
# TestFlight); (2) the message says a stage or the session is done. Prints the reminder to rewrite
# ~/Desktop/Second Brain/dosetrace/HANDOFF.md at the right moment. Never blocks: failures print nothing.
prompt="$(jq -r '.prompt // empty' 2>/dev/null)" || exit 0
[ -z "$prompt" ] && exit 0
low="$(printf '%s' "$prompt" | tr '[:upper:]' '[:lower:]')"
B='[^a-záéíóúâêôãõç]'
if printf '%s' "$low" | grep -Eq "(^|$B)(build|builds|bild|council|conselho|ship-check|testflight|eas)($B|$)"; then
  cat <<'EOF'
REGRA DO HANDOFF NO CICLO DE BUILD (Evandro, 2026-10-23 20:18 EDT): reescreva ~/Desktop/Second Brain/dosetrace/HANDOFF.md
por inteiro em CADA um destes momentos, antes de seguir: (1) o build foi pedido / a lista está pronta → "pronto para o
build N, council AINDA NÃO feito"; (2) o dt-council terminou → veredito e o que ele mandou mudar; (3) ship-check e build
feitos → ids, versão, /tf-status e o que falta testar. Sempre como se a sessão pudesse acabar logo depois.
EOF
fi
if printf '%s' "$low" | grep -Eq "(^|$B)(pronto|está pronto|esta pronto|pode fechar|pode encerrar|encerrar|fim da sessão|fim da sessao|terminamos|acabou|finalizar|concluído|concluido|done|wrap up)($B|$)"; then
  echo "REGRA DO HANDOFF (Evandro, 2026-10-23 20:15 EDT): uma etapa ou a sessão terminou. Antes de responder, reescreva ~/Desktop/Second Brain/dosetrace/HANDOFF.md por inteiro (pasta e branch, HEAD e o que está sem commit, feito e verificado com evidência, pendências com 'depende de' e 'quem', PRÓXIMO PASSO exato, perguntas abertas) e atualize 01-estado.md, 90-pendencias.md, 02-decisoes.md e ../01-decisoes.md."
fi
exit 0
