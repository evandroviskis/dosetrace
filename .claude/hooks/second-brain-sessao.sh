#!/bin/bash
# SessionStart hook (founder 2026-10-23: "a pasta Second Brain seja visualizada e consultada a cada
# resposta"). At every session start, resume, /clear and after a context compaction, prints the Second
# Brain entry point (LEIA-PRIMEIRO.md) and the current DoseTrace state, so the session starts from the
# folder, not from memory. Never blocks: any failure prints nothing and exits 0.
SB="$HOME/Desktop/Second Brain"
[ -d "$SB" ] || exit 0
# The admin panel worktree is its own conversation with its own folder (founder 2026-10-23 20:21).
ROOT="${CLAUDE_PROJECT_DIR:-$PWD}"
case "$ROOT" in
  *dosetrace-admin*) P="dosetrace/admin-panel"; ENTRY="$SB/$P/HANDOFF.md" ;;
  *) P="dosetrace"; ENTRY="$SB/$P/LEIA-PRIMEIRO.md" ;;
esac
{
  echo "SECOND BRAIN = MEMÓRIA OBRIGATÓRIA (regra do Evandro, 2026-10-23). Pasta: ~/Desktop/Second Brain."
  echo "Antes de cada resposta: confronte o que você lembra com a pasta. Se a memória e a pasta divergem, vale a pasta (e avise)."
  echo
  [ -f "$ENTRY" ] && head -c 6000 "$ENTRY"
  echo
  echo "=== $P/01-estado.md (início) ==="
  [ -f "$SB/$P/01-estado.md" ] && head -c 2000 "$SB/$P/01-estado.md"
  echo
  echo "=== Últimas decisões ($P/02-decisoes.md, fim) ==="
  [ -f "$SB/$P/02-decisoes.md" ] && tail -n 5 "$SB/$P/02-decisoes.md" | cut -c1-220
} | head -c 9800
exit 0
