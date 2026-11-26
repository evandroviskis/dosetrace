#!/bin/bash
# Founder rule 2026-11-24: every reply ends with the full list of pending decisions.
F="$HOME/Desktop/Second Brain/dosetrace/91-decisoes-pendentes.md"
[ -f "$F" ] || exit 0
echo "DECISÕES PENDENTES (regra do Evandro 2026-11-24): ANTES de responder, leia a aba Decisões do painel admin (Supabase execute_sql, projeto mqfvnqfusqyhqhowfweh: select id,title,status,choice,note,decided_at from public.founder_decisions where origem = 'app' and status in ('aprovado','recusado','ajustar') and executed_at is null; 'depois' = guardada, não executar, listar em 'Guardadas para depois') e a página reserva https://claude.ai/artifact/GkAUg1YcjEgzWJPF5JZw5u; execute o que ele decidiu e marque executed_at/executed_note; termine a resposta com a lista abaixo COMPLETA e atualizada. Arquivo: dosetrace/91-decisoes-pendentes.md"
grep -E '^[0-9]+\. ' "$F"
# Item 81 (founder 2026-11-26): the panel's signal for this session — answers waiting and the last "Avisar as sessões".
SIG="$("${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}/scripts/vigia-painel.sh" 2>/dev/null)"
[ -n "$SIG" ] && echo "PAINEL (sinal da sessão app): $SIG — 'aguardando' conta respostas dele ainda sem executed_at; um 'ultimo_aviso' novo = ele tocou em Avisar as sessões: leia a aba já."
exit 0
