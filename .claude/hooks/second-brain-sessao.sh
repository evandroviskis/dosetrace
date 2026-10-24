#!/bin/bash
# SessionStart hook (founder 2026-10-23: "a pasta Second Brain seja visualizada e consultada a cada
# resposta"). At every session start, resume, /clear and after a context compaction, prints the Second
# Brain entry point (LEIA-PRIMEIRO.md) and the current DoseTrace state, so the session starts from the
# folder, not from memory. Never blocks: any failure prints nothing and exits 0.
SB="$HOME/Desktop/Second Brain"
[ -d "$SB" ] || exit 0
{
  echo "SECOND BRAIN = MEMÓRIA OBRIGATÓRIA (regra do Evandro, 2026-10-23). Pasta: ~/Desktop/Second Brain."
  echo "Antes de cada resposta: confronte o que você lembra com a pasta. Se a memória e a pasta divergem, vale a pasta (e avise)."
  echo
  [ -f "$SB/dosetrace/LEIA-PRIMEIRO.md" ] && cat "$SB/dosetrace/LEIA-PRIMEIRO.md"
  echo
  echo "=== dosetrace/01-estado.md (início) ==="
  [ -f "$SB/dosetrace/01-estado.md" ] && head -c 2000 "$SB/dosetrace/01-estado.md"
  echo
  echo "=== Últimas decisões (dosetrace/02-decisoes.md, fim) ==="
  [ -f "$SB/dosetrace/02-decisoes.md" ] && tail -n 5 "$SB/dosetrace/02-decisoes.md" | cut -c1-220
} | head -c 9800
exit 0
