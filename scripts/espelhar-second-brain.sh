#!/bin/bash
# espelhar-second-brain.sh — founder 2026-10-23: "tudo, absolutamente tudo, tem que ter uma cópia dentro
# do Second Brain. Nada pode ficar para trás." Copies, read-only, into ~/Desktop/Second Brain:
#   dosetrace/repositorio/<repo>/   every git-tracked (and new, not ignored) file of the app repos +
#                                   the gitignored context folders (grok/ review notes), minus secrets
#   dosetrace/admin-panel/repositorio/dosetrace-admin/ and admin-panel/notas-de-trabalho/  the panel
#   dosetrace/memoria-claude/       Claude Code's auto-memory notes for this project
#   _ambiente-claude/               the global Claude Code setup used here (settings, hooks, skills)
# The repositories stay the working base; the copy is refreshed by the Stop hook (.claude/settings.json)
# and can be run by hand. Never copies .env*, keys (.p8), service accounts or google-services.json.
# Only adds and updates files (never deletes inside the Second Brain); a file removed from the repo is
# listed in repositorio/REMOVIDOS.txt instead.

SB="$HOME/Desktop/Second Brain"
DEST="$SB/dosetrace/repositorio"
[ -d "$SB" ] || exit 0
mkdir -p "$DEST" "$SB/dosetrace/memoria-claude" "$SB/_ambiente-claude"

EXCLUDE_RE='(^|/)(\.env[^/]*|[^/]*\.p8|google-services\.json|GoogleService-Info\.plist|[^/]*service-account[^/]*\.json|[^/]*\.keystore|[^/]*\.jks)$'

mirror_repo() { # $1 = repo path, $2 = name in the mirror, $3 = mirror folder (default $DEST)
  local repo="$1" name="$2"
  [ -d "$repo/.git" ] || [ -f "$repo/.git" ] || return 0
  local out="${3:-$DEST}/$name"
  mkdir -p "$out"
  local list
  list="$(mktemp)"
  {
    git -C "$repo" ls-files
    # new files not committed yet (not ignored)
    git -C "$repo" ls-files --others --exclude-standard
    # gitignored context worth keeping (review notes for the second reviewer)
    [ -d "$repo/grok" ] && (cd "$repo" && find grok -type f -name '*.md')
  } | grep -Ev "$EXCLUDE_RE" | sort -u > "$list"
  rsync -a --files-from="$list" "$repo/" "$out/" 2>/dev/null
  # files that were mirrored before but are gone from the repo now
  (cd "$out" && find . -type f ! -name 'ESPELHO.md' ! -name 'REMOVIDOS.txt' | sed 's|^\./||' | sort) > "$list.mirror"
  comm -13 "$list" "$list.mirror" > "$out/REMOVIDOS.txt"
  {
    echo "# Espelho de \`$repo\`"
    echo
    echo "- Branch: \`$(git -C "$repo" rev-parse --abbrev-ref HEAD 2>/dev/null)\`, commit \`$(git -C "$repo" rev-parse --short HEAD 2>/dev/null)\` — $(git -C "$repo" log -1 --format='%s' 2>/dev/null | cut -c1-120)"
    echo "- Atualizado: $(date '+%Y-%m-%d %H:%M %Z')"
    echo "- Remoto: $(git -C "$repo" remote get-url origin 2>/dev/null | sed -E 's#https://[^@]*@#https://#')"
    echo "- Arquivos: $(wc -l < "$list" | tr -d ' ') (todos os do git + notas grok/; sem segredos: .env, .p8, service accounts, google-services.json)"
    echo "- Arquivos que saíram do repositório (ficam aqui, listados): \`REMOVIDOS.txt\`"
    echo
    echo "Cópia só de leitura. O trabalho acontece no repositório; esta pasta é atualizada sozinha."
  } > "$out/ESPELHO.md"
  rm -f "$list" "$list.mirror"
}

mirror_repo "$HOME/Desktop/dosetrace" "dosetrace"
mirror_repo "$HOME/Desktop/dosetrace-1.3.1" "dosetrace-1.3.1"
# The admin panel is its own conversation and its own Second Brain folder (founder 2026-10-23 20:21):
# its repo copy and its working notes (Admin Panel Files, kept out of git) live under admin-panel/.
ADM="$SB/dosetrace/admin-panel"
if [ -d "$ADM" ]; then
  mkdir -p "$ADM/repositorio" "$ADM/notas-de-trabalho"
  mirror_repo "$HOME/Desktop/dosetrace-admin" "dosetrace-admin" "$ADM/repositorio"
  [ -d "$HOME/Desktop/dosetrace/Admin Panel Files" ] &&
    rsync -a "$HOME/Desktop/dosetrace/Admin Panel Files/" "$ADM/notas-de-trabalho/" 2>/dev/null
fi

# Claude Code's auto-memory for this project
MEM="$HOME/.claude/projects/-Users-evandrosantos-Desktop-dosetrace/memory"
[ -d "$MEM" ] && rsync -a "$MEM/" "$SB/dosetrace/memoria-claude/" 2>/dev/null

# The global Claude Code environment used on this Mac (no credentials)
AMB="$SB/_ambiente-claude"
[ -f "$HOME/.claude/settings.json" ] && cp "$HOME/.claude/settings.json" "$AMB/settings.json"
[ -d "$HOME/.claude/hooks" ] && rsync -a "$HOME/.claude/hooks/" "$AMB/hooks/" 2>/dev/null
[ -d "$HOME/.claude/skills" ] && rsync -a --exclude 'node_modules' "$HOME/.claude/skills/" "$AMB/skills/" 2>/dev/null
[ -f "$HOME/.claude/CLAUDE.md" ] && cp "$HOME/.claude/CLAUDE.md" "$AMB/CLAUDE.md"
date '+%Y-%m-%d %H:%M %Z' > "$AMB/ATUALIZADO.txt"
exit 0
