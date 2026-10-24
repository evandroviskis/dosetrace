#!/bin/bash
# mudar-para-second-brain.sh — founder 2026-10-23: "O objetivo é ficar só com a pasta dentro do desktop,
# chamada Second Brain. E todo mais fica dentro dela." Keys go to the external drive Arquivos >
# Trabalho > Dosetrace (founder's answer), never into the Second Brain.
#
# Without arguments it only PRINTS what it would do (dry run). With --executar it does it.
# Run it with every Claude Code session of the app AND of the admin panel closed, and Metro stopped.
#
#   1. keys (.env, google-play-service-account.json, stray AuthKey_XS7855AJC9.p8) → the drive; the
#      repos get symbolic links to them (the drive must be connected for builds/submits/local runs)
#   2. ~/Desktop/dosetrace          → Second Brain/dosetrace/codigo/dosetrace
#      ~/Desktop/dosetrace-1.3.1    → Second Brain/dosetrace/codigo/dosetrace-1.3.1
#      ~/Desktop/dosetrace-admin    → Second Brain/dosetrace/admin-panel/codigo/dosetrace-admin
#      then git worktree repair
#   3. "Admin Panel Files" (panel working notes) → Second Brain/dosetrace/admin-panel/notas-de-trabalho
#   4. the read-only repo copies (repositorio/) are removed: the code itself now lives in the Second Brain
#   5. Claude Code memory: the Second Brain folder dosetrace/memoria-claude becomes the real memory
#      (old and new project memory paths are links to it)
#   6. the two loose Desktop images → Second Brain/_soltos-do-desktop/
set -euo pipefail

D="$HOME/Desktop"
SB="$D/Second Brain"
HD="/Volumes/Arquivos/Trabalho/Dosetrace"
APP_OLD="$D/dosetrace"; R131_OLD="$D/dosetrace-1.3.1"; ADM_OLD="$D/dosetrace-admin"
APP="$SB/dosetrace/codigo/dosetrace"; R131="$SB/dosetrace/codigo/dosetrace-1.3.1"
ADM="$SB/dosetrace/admin-panel/codigo/dosetrace-admin"
NOTAS="$SB/dosetrace/admin-panel/notas-de-trabalho"
SBMEM="$SB/dosetrace/memoria-claude"
MEM_OLD="$HOME/.claude/projects/-Users-evandrosantos-Desktop-dosetrace/memory"

RUN=0; [ "${1:-}" = "--executar" ] && RUN=1
run() { echo "+ $*"; if [ "$RUN" = 1 ]; then "$@"; fi; }
fail() { echo "PARADO: $*" >&2; exit 1; }
key() { printf '%s' "$1" | sed 's#[^A-Za-z0-9]#-#g'; }   # Claude Code's project folder name

[ "$RUN" = 1 ] && echo "== EXECUTANDO ==" || echo "== SIMULAÇÃO (nada muda; rode com --executar) =="

# ---- checks -------------------------------------------------------------------------------------
[ -d "$SB" ] || fail "não achei $SB"
[ -d "$HD" ] || fail "o HD Arquivos não está conectado ($HD)"
for d in "$APP_OLD" "$R131_OLD" "$ADM_OLD"; do [ -d "$d" ] || fail "não achei $d"; done
for d in "$APP" "$R131" "$ADM"; do [ -e "$d" ] && fail "o destino já existe: $d"; done
for d in "$APP_OLD" "$R131_OLD" "$ADM_OLD"; do
  g="$(git -C "$d" rev-parse --git-dir)"
  for s in rebase-merge rebase-apply MERGE_HEAD CHERRY_PICK_HEAD; do
    [ -e "$g/$s" ] && fail "$d está no meio de um $s"
  done
done
if pgrep -f "expo start" >/dev/null; then
  [ "$RUN" = 1 ] && fail "o Metro (expo start) está rodando; pare antes"
  echo "AVISO: o Metro (expo start) está rodando; pare antes de executar"
fi
for f in .env google-play-service-account.json AuthKey_XS7855AJC9.p8; do
  [ -e "$HD/$f" ] && [ -f "$APP_OLD/$f" ] && ! cmp -s "$HD/$f" "$APP_OLD/$f" && fail "$HD/$f já existe e é diferente"
done
echo "checagens ok"

# ---- 1. keys → drive, links in the repos ---------------------------------------------------------
for f in .env google-play-service-account.json AuthKey_XS7855AJC9.p8; do
  if [ -f "$APP_OLD/$f" ] && [ ! -L "$APP_OLD/$f" ]; then
    [ -e "$HD/$f" ] || run cp -p "$APP_OLD/$f" "$HD/$f"
    if [ "$RUN" = 1 ]; then cmp -s "$APP_OLD/$f" "$HD/$f" || fail "cópia de $f no HD não confere"; fi
  fi
done
for repo in "$APP_OLD" "$R131_OLD"; do
  for f in .env google-play-service-account.json; do
    if [ -f "$repo/$f" ] && [ ! -L "$repo/$f" ]; then
      if [ "$RUN" = 1 ]; then cmp -s "$repo/$f" "$HD/$f" || fail "$repo/$f difere da cópia no HD"; fi
      run rm "$repo/$f"; run ln -s "$HD/$f" "$repo/$f"
    elif [ -L "$repo/$f" ] && [ "$(readlink "$repo/$f")" != "$HD/$f" ]; then
      # e.g. dosetrace-1.3.1/.env is a link to ~/Desktop/dosetrace/.env, which is about to move
      run rm "$repo/$f"; run ln -s "$HD/$f" "$repo/$f"
    fi
  done
done
[ -f "$APP_OLD/AuthKey_XS7855AJC9.p8" ] && run rm "$APP_OLD/AuthKey_XS7855AJC9.p8"

# ---- 2. repos → Second Brain ---------------------------------------------------------------------
run mkdir -p "$SB/dosetrace/codigo" "$SB/dosetrace/admin-panel/codigo"
run mv "$APP_OLD" "$APP"
run mv "$R131_OLD" "$R131"
run mv "$ADM_OLD" "$ADM"
run git -C "$APP" worktree repair "$R131" "$ADM"
if [ "$RUN" = 1 ]; then
  for d in "$APP" "$R131" "$ADM"; do git -C "$d" status --short >/dev/null || fail "git não abre $d"; done
  git -C "$APP" worktree list
fi

# ---- 3. panel working notes ----------------------------------------------------------------------
if [ -d "$APP/Admin Panel Files" ] || [ "$RUN" = 0 ]; then
  run mkdir -p "$NOTAS"
  run rsync -a "$APP/Admin Panel Files/" "$NOTAS/"
  run rm -rf "$APP/Admin Panel Files"
fi

# ---- 4. repo copies are no longer needed --------------------------------------------------------
run rm -rf "$SB/dosetrace/repositorio" "$SB/dosetrace/admin-panel/repositorio"

# ---- 5. Claude memory lives in the Second Brain --------------------------------------------------
if [ -d "$MEM_OLD" ] && [ ! -L "$MEM_OLD" ]; then
  run rsync -a "$MEM_OLD/" "$SBMEM/"
  run mv "$MEM_OLD" "$MEM_OLD.antes-da-mudanca-2026-10-23"
  run ln -s "$SBMEM" "$MEM_OLD"
fi
for p in "$APP" "$R131"; do
  k="$HOME/.claude/projects/$(key "$p")"
  run mkdir -p "$k"
  [ -e "$k/memory" ] || run ln -s "$SBMEM" "$k/memory"
done

# ---- 6. loose Desktop images ---------------------------------------------------------------------
run mkdir -p "$SB/_soltos-do-desktop"
for f in "$D/Evandro.png" "$D/ChatGPT Image Sep 28, 2026, 09_48_58 PM.png"; do
  [ -f "$f" ] && run mv "$f" "$SB/_soltos-do-desktop/"
done

echo
echo "Pronto. Abra a sessão nova do app em: $APP"
echo "e a do painel em: $ADM"
[ "$RUN" = 1 ] && ls "$D"
exit 0
