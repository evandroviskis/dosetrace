#!/bin/bash
# UserPromptSubmit hook (founder 2026-10-23 20:15 EDT, "handoff sempre pronto para catástrofe"):
# when the founder's message says a stage or the session is done ("pronto", "está pronto", "pode
# fechar", "encerrar", "fim da sessão", "terminamos", "done", "wrap up"...), print the reminder that
# HANDOFF.md must be rewritten NOW, as if the session could end right after. Never blocks the prompt:
# any failure prints nothing and exits 0.
prompt="$(jq -r '.prompt // empty' 2>/dev/null)" || exit 0
[ -z "$prompt" ] && exit 0
low="$(printf '%s' "$prompt" | tr '[:upper:]' '[:lower:]')"
if printf '%s' "$low" | grep -Eq "(^|[^a-záéíóúâêôãõç])(pronto|prontos|está pronto|esta pronto|tá pronto|ta pronto|pode fechar|pode encerrar|encerra|encerrar|fim da sessão|fim da sessao|terminamos|terminou|acabou|finaliza|finalizar|conclu[ií]do|done|wrap up|we're done|that's it|finish(ed)?)([^a-záéíóúâêôãõç]|$)"; then
  cat <<'EOF'
REGRA DO HANDOFF (Evandro, 2026-10-23 20:15 EDT): a mensagem indica que uma etapa ou a sessão terminou.
ANTES de responder, reescreva por inteiro ~/Desktop/Second Brain/dosetrace/admin-panel/HANDOFF.md como se
esta sessão pudesse acabar agora e a próxima fosse aberta em outra máquina, outro sistema ou outra IA:
pasta e branch, HEAD e o que está sem commit, o que foi feito e verificado (com evidência), o que está
pendente com "depende de" e "quem", o PRÓXIMO PASSO exato, perguntas abertas, onde estão chaves e notas (só
nomes), como retomar sem ferramenta específica. Depois atualize 01-estado.md, 90-pendencias.md,
02-decisoes.md (+ ../../01-decisoes.md) e a nota em conversas/. Diga em uma linha o que gravou e onde.
Mesmo que a mensagem não fosse sobre encerrar, faça isso ao fechar qualquer etapa.
EOF
fi
exit 0
