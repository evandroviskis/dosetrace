#!/bin/bash
# Founder rule 2026-11-24: every reply ends with the full list of pending decisions.
F="$HOME/Desktop/Second Brain/dosetrace/91-decisoes-pendentes.md"
[ -f "$F" ] || exit 0
echo "DECISÕES PENDENTES (regra do Evandro 2026-11-24): ANTES de responder, leia a página de decisões (ArtifactData list, url https://claude.ai/artifact/GkAUg1YcjEgzWJPF5JZw5u, coleção decisions) e registre o que ele marcou; termine a resposta com a lista abaixo COMPLETA e atualizada. Arquivo: dosetrace/91-decisoes-pendentes.md"
grep -E '^[0-9]+\. ' "$F"
exit 0
