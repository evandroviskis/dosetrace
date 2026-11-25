#!/bin/bash
# Keeps the masked copy of this conversation current in ~/Desktop/Second Brain/dosetrace/conversas-claude/
# (founder 2026-11-24: "Salvar toda a conversa... no Second Brain, dentro da pasta do projeto";
#  "preciso que seja seguro trocar de computador e manter o contexto todo").
# Runs in the background on Stop / SessionEnd; never blocks the session; secrets are hidden by the script.
input=$(cat)
export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH"
script="${CLAUDE_PROJECT_DIR}/scripts/arquivar-conversas.cjs"
[ -f "$script" ] || exit 0
printf '%s' "$input" | nohup node "$script" --hook >/dev/null 2>&1 &
exit 0
