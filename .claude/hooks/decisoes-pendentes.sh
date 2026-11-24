#!/bin/bash
# Founder rule 2026-11-24: every reply ends with the full list of pending decisions.
F="$HOME/Desktop/Second Brain/dosetrace/91-decisoes-pendentes.md"
[ -f "$F" ] || exit 0
echo "DECISÕES PENDENTES (regra do Evandro 2026-11-24): termine a resposta com a lista abaixo COMPLETA e atualizada (tire o que ele respondeu agora, acrescente o que surgir). Arquivo: dosetrace/91-decisoes-pendentes.md"
sed -n '/^1\./,$p' "$F"
exit 0
