#!/bin/bash
# Founder rule 2026-11-24: every reply ends with the full list of pending decisions.
F="$HOME/Desktop/Second Brain/dosetrace/91-decisoes-pendentes.md"
[ -f "$F" ] || exit 0
echo "DECISÕES PENDENTES (regra do Evandro 2026-11-24): ANTES de responder, leia a aba Decisões do painel admin (Supabase execute_sql, projeto mqfvnqfusqyhqhowfweh: select id,title,status,choice,note,decided_at from public.founder_decisions where status <> 'pendente' and executed_at is null) e a página reserva https://claude.ai/artifact/GkAUg1YcjEgzWJPF5JZw5u; execute o que ele decidiu e marque executed_at/executed_note; termine a resposta com a lista abaixo COMPLETA e atualizada. Arquivo: dosetrace/91-decisoes-pendentes.md"
grep -E '^[0-9]+\. ' "$F"
exit 0
