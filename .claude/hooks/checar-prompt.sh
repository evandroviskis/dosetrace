#!/bin/bash
# UserPromptSubmit hook (founder 2026-10-23, "check the record before proposing"): takes the words of
# the founder's message (4+ letters, minus very common ones), runs scripts/checar-decisoes.sh with them
# and prints the result, which Claude Code adds to the context. Never blocks the prompt: any failure
# prints nothing and exits 0.
ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
prompt="$(jq -r '.prompt // empty' 2>/dev/null)" || exit 0
[ -z "$prompt" ] && exit 0

# Founder 2026-10-23: the Second Brain is the memory and is consulted at EVERY answer, not only memory.
case "$ROOT" in *dosetrace-admin*) SBP="dosetrace/admin-panel" ;; *) SBP="dosetrace" ;; esac
echo "SECOND BRAIN (obrigatório a cada resposta): confronte sua memória com ~/Desktop/Second Brain — $SBP/HANDOFF.md, $SBP/01-estado.md, 02-decisoes.md, 90-pendencias.md, Instrucoes/00-regras-gerais.md (somente leitura). Leia o arquivo do assunto antes de responder; se a pasta e sua memória divergem, vale a pasta e você avisa."

STOP=" para pode isso esse essa este esta mais muito como quando onde porque sobre entre depois antes
 ainda agora tudo todos todas nada algo alguma algum fazer feito tem temos tinha estou está estava
 você vocês voce gente coisa coisas aqui então entao também tambem mesmo mesma seja sendo seria será
 sera quer queria acho acha olha olhe veja segue seguir favor obrigado certo isso, bem sim não nao
 that this with from have what when where which there their about would could should into your
 just like then than them they been were will also only some more most very each other does done
 make made need want please thanks okay yeah "

# Deferred-item triggers (founder 2026-10-23): when the message touches the topic of a deferred item,
# print its reminder so Claude raises it. A-179: privacy policy / terms must change BEFORE profile numbers
# are used for another Outcom app or shown to anyone.
low="$(printf '%s' "$prompt" | tr '[:upper:]' '[:lower:]')"
if printf '%s' "$low" | grep -Eq "(segundo (app|aplicativo)|novo (app|aplicativo)|outro (app|aplicativo)|personal trainer|personal training|academia|gym|clínica|clinica|médico|medico|números da base|numeros da base|faixa etária|faixa etaria|audiência|audiencia|parceria|marketing)"; then
  echo "LEMBRETE A-179 (adiada pelo Evandro em 2026-10-23 19:41 EDT): antes de usar respostas de perfil para outro app da Outcom ou mostrar números da base a alguém, a política de privacidade, os termos, os textos do onboarding e os formulários das lojas precisam mudar (docs/review/features.md A-179; Second Brain dosetrace/90-pendencias.md). Avise o Evandro em uma linha."
fi

words="$(printf '%s' "$prompt" | tr '[:upper:]' '[:lower:]' | tr -c '[:alnum:]À-ÿ\n-' ' ' | tr ' ' '\n' |
  awk -v stop="$(printf %s "$STOP" | tr '\n' ' ')" 'length($0) >= 4 && index(stop, " " $0 " ") == 0 && !seen[$0]++' | head -n 8 | tr '\n' ' ')"
[ -z "${words// /}" ] && exit 0

# shellcheck disable=SC2086
res="$(CHECAR_MAX=15 "$ROOT/scripts/checar-decisoes.sh" $words 2>/dev/null)" || exit 0
[ -z "$res" ] && exit 0
printf 'DECISÕES JÁ REGISTRADAS SOBRE ESTE PEDIDO:\n%s\n' "$res" | head -c 9000
exit 0
