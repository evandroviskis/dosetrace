#!/bin/bash
# checar-decisoes.sh <palavra> [palavra…] — founder 2026-10-23 ("check the record before proposing").
# Case-insensitive search of the project's record: STATE.md, docs/decisions.md, docs/specs/*.md,
# docs/product/DIVERGENCES.md, CLAUDE.md, and the Second Brain (01-decisoes.md — only DoseTrace and
# Geral lines — and dosetrace/). Prints file:line + excerpt, the lines matching the most words first;
# Second Brain lines show their state (VIGENTE / SUBSTITUÍDA). Read-only.
# Nothing found → "NENHUMA DECISÃO REGISTRADA para: <palavras>".
# Env: CHECAR_MAX (default 30) = how many lines to print.

if [ "$#" -eq 0 ]; then echo "uso: scripts/checar-decisoes.sh <palavra> [palavra…]"; exit 2; fi
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SB="$HOME/Desktop/Second Brain"
MAX="${CHECAR_MAX:-30}"

FILES=()
for f in "$ROOT/STATE.md" "$ROOT/docs/decisions.md" "$ROOT/docs/product/DIVERGENCES.md" "$ROOT/CLAUDE.md" "$ROOT"/docs/specs/*.md; do
  [ -f "$f" ] && FILES+=("$f")
done
SBFILES=()
[ -f "$SB/01-decisoes.md" ] && SBFILES+=("$SB/01-decisoes.md")
if [ -d "$SB/dosetrace" ]; then
  # repositorio/ is the mirror of the repos already searched above (would only repeat them). The admin
  # panel is its own conversation (founder 2026-10-23 20:21): the panel worktree searches admin-panel/,
  # the app worktrees search dosetrace/ without admin-panel/.
  case "$ROOT" in
    *dosetrace-admin*) SBDIR="$SB/dosetrace/admin-panel"; SBNOT="$SB/dosetrace/admin-panel/repositorio/*" ;;
    *) SBDIR="$SB/dosetrace"; SBNOT="$SB/dosetrace/admin-panel/*" ;;
  esac
  while IFS= read -r f; do SBFILES+=("$f"); done < <(find "$SBDIR" -type f -name '*.md' -not -path "$SB/dosetrace/repositorio/*" -not -path "*/codigo/*" -not -path "*/notas-de-trabalho/*" -not -path "$SBNOT" | sort)
fi

ARGS=()
for w in "$@"; do ARGS+=(-e "$w"); done
WORDS="$*"

out="$(
  {
    [ "${#FILES[@]}" -gt 0 ] && grep -i -n -F -H "${ARGS[@]}" "${FILES[@]}" 2>/dev/null | sed "s|^$ROOT/||" | sed 's/^/R\t/'
    [ "${#SBFILES[@]}" -gt 0 ] && grep -i -n -F -H "${ARGS[@]}" "${SBFILES[@]}" 2>/dev/null | sed "s|^$SB/|Second Brain/|" | sed 's/^/S\t/'
  } | awk -v words="$WORDS" -v max="$MAX" -v adm="$([ "${ROOT#*dosetrace-admin}" != "$ROOT" ] && echo 1 || echo 0)" '
    BEGIN { n = split(tolower(words), w, " ") }
    {
      kind = substr($0, 1, 1); line = substr($0, 3)
      # Second Brain 01-decisoes: only DoseTrace and Geral decisions
      if (kind == "S" && line ~ /01-decisoes\.md:[0-9]+:- \[/ && line !~ /\| (DoseTrace|Geral)[^|]*\|/) next
      if (kind == "S" && !adm && line ~ /01-decisoes\.md:[0-9]+:- \[/ && line ~ /\| DoseTrace \(painel admin\)/) next
      low = tolower(line); score = 0
      for (i = 1; i <= n; i++) if (w[i] != "" && index(low, w[i]) > 0) score++
      state = ""
      if (kind == "S") {
        if (line ~ /SUBSTITU/) state = " [SUBSTITUÍDA]"; else if (line ~ /VIGENTE/) state = " [VIGENTE]"
      }
      # file:line: excerpt (trimmed)
      split(line, parts, ":"); loc = parts[1] ":" parts[2]
      text = substr(line, length(loc) + 2)
      gsub(/[ \t]+/, " ", text)
      if (length(text) > 220) text = substr(text, 1, 217) "..."
      printf "%d\t%s%s: %s\n", score, loc, state, text
    }' | sort -t $'\t' -k1,1nr -s | head -n "$MAX" | cut -f2-
)"

if [ -z "$out" ]; then
  echo "NENHUMA DECISÃO REGISTRADA para: $WORDS"
else
  echo "$out"
fi
