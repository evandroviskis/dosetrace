# Aba Decisões — como a sessão do Claude usa

Aprovada pelo Evandro em 2026-11-24. Ele decide no painel (dosetrace.io/adm › Decisões, também no DT Admin), mesmo sem o Claude aberto; depois diz "tomei decisões no painel, veja e execute". Tabela `public.founder_decisions` (migrações `supabase/migrations/20261124000000_founder_decisions.sql` e `20261124010000_founder_decisions_alterando.sql`), API `api/adm-decisions.js`, tela `web/adm-decisions.js`.

Regras: escrever **tudo** o que ele precisa para decidir sem perguntar (o que decidir, a explicação completa, o que foi conversado, as palavras dele com data, a recomendação); português formal; nunca segredo, e-mail de usuário ou dado de saúde. O painel só grava `status`, `choice`, `note` e `decided_at`; o resto é da sessão, por SQL (editor SQL do Supabase ou conector MCP, como dono do banco).

## 1. Criar uma decisão

```sql
insert into public.founder_decisions (origem, area, kind, title, question, context, founder_said, recommendation, options, links, images, source)
values (
  'app',                       -- origem = a sessão que envia: app (App) | adm (Painel admin) | ads (Publicidade)
  'app',                       -- app | painel | site | divulgacao | outro
  'visual',                    -- visual | texto | regra | outro
  'Botão "Registrar dose" na tela Hoje',
  'Qual dos dois botões entra na próxima build: A ou B?',
  $ctx$Explicação completa, com quebras de linha.
O que foi conversado, o que muda para o usuário, riscos.$ctx$,
  $said$"Esse botão está muito pequeno." (2026-11-24 10:12)$said$,
  'A, porque ...',
  '["A — azul, cantos arredondados", "B — verde, pílula"]'::jsonb,   -- '[]' quando for só aprovar/recusar
  '[{"label": "Desenho lado a lado", "url": "https://claude.ai/artifact/..."}]'::jsonb,  -- só https
  '[{"label": "A e B, tema claro", "path": "app/2026-11-24-botao-claro.png"}]'::jsonb,
  'sessão do app 2026-11-24'
) returning id;
```

Imagens: PNG/JPEG/WebP (até 10 MB) no bucket privado `founder-decisions`, no caminho usado em `images[].path` (letras, números, `.`, `_`, `-`, `/`; nunca `..`). Enviar pelo painel do Supabase (Storage › founder-decisions › Upload) ou, com a chave só no ambiente (nunca em arquivo, nota ou log):

```bash
curl -sS -X POST "$SUPABASE_URL/storage/v1/object/founder-decisions/app/2026-11-24-botao-claro.png" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H "Content-Type: image/png" --data-binary @docs/design/botao-claro.png
```

O painel mostra cada imagem por um link assinado de 10 minutos. Prefira PNG (claro e escuro lado a lado): um arquivo `.html` aparece só como botão "Abrir o desenho" e o Storage pode servi-lo como texto; para HTML interativo, use `links` (artefato).

## 2. Ler o que ele decidiu e ainda não foi executado

```sql
select id, area, kind, title, status, choice, note, decided_at
  from public.founder_decisions
 where status in ('aprovado', 'recusado', 'ajustar') and executed_at is null  -- nunca status <> 'pendente': pegaria 'depois' (Vou fazer depois, em desenho, sort 76) e 'alterando'
 order by decided_at;
```

Grupos no painel (Evandro, 2026-11-24): **Pendentes** (`pendente`) · **Alteração em andamento** (`alterando`, só leitura) · **Decididas** (a resposta dele; as executadas ficam dentro, depois das que aguardam execução). O número na aba conta só `pendente`. No topo, a aba separa pela sessão que enviou (`origem`): Todas · App · Painel admin · Publicidade, cada uma com as suas pendentes; cada sessão lê as suas com `and origem = 'app'` (ou `'adm'`, `'ads'`) nas consultas abaixo.

`status`: `aprovado` (Aprovo) · `recusado` (Não aprovo) · `ajustar` (Precisa ajustar; o que mudar está em `note`). `choice` = a opção escolhida (ou nulo). Histórico de cada gravação dele: `select * from public.founder_decision_events where decision_id = '<id>' order by at;`.

## 3. Marcar como executada (depois de fazer e verificar)

```sql
update public.founder_decisions
   set executed_at = now(), executed_note = 'O que foi feito, onde (commit/branch/build) e como foi verificado.'
 where id = '<id>' and status in ('aprovado', 'recusado', 'ajustar') and executed_at is null;
```

Executada fica só leitura no painel (ele vê "Executado em … — nota").

## 4. "Precisa ajustar": alteração em andamento e nova versão

Ao começar a refazer (o painel deixa de aceitar decisão nela e mostra "Em alteração pelo Claude desde …" com a última resposta dele):

```sql
update public.founder_decisions set status = 'alterando', rework_at = now()
 where id = '<id>' and status = 'ajustar' and executed_at is null;
```

Quando a nova versão estiver pronta, volta para Pendentes com o conteúdo novo. A resposta anterior dele vai para `founder_said` (com a data), para ele ver o que pediu; o histórico completo fica em `founder_decision_events`:

```sql
update public.founder_decisions
   set status = 'pendente', rework_at = null, decided_at = null, choice = null,
       founder_said = coalesce(founder_said || E'\n\n', '') || 'Pedido de ajuste (' || to_char(decided_at at time zone 'America/New_York', 'YYYY-MM-DD HH24:MI') || '): ' || coalesce(note, ''),
       note = null,
       question = 'Nova versão: ...', context = $ctx$O que mudou e por quê.$ctx$,
       options = '[...]'::jsonb, images = '[...]'::jsonb, links = '[...]'::jsonb
 where id = '<id>' and status = 'alterando';
```

Reabrir por engano (só antes de executar): `update public.founder_decisions set status = 'pendente', choice = null, decided_at = null, rework_at = null where id = '<id>' and executed_at is null;`

## Aceite (2026-11-24)

| # | Critério | Prova |
|---|---|---|
| DC1 | Mesma sessão das outras abas: sem token 401, token falso 401, não admin 403; gravar exige Origin, papel admin e código de 15 min (ou o aparelho DT Admin) | `__tests__/admDecisions.test.js` DC1 |
| DC2 | Lista com contagem por grupo (Pendentes / Alteração em andamento / Decididas, executadas dentro de Decididas), filtro por área; uma decisão traz as imagens com link assinado de 10 min; links só https | DC2 |
| DC3 | Só `status`, `choice`, `note` graváveis (qualquer outro campo 400); observação até 4000 caracteres; corpo acima de 16 KB 413; executada 409; opção fora da lista 400; 60 gravações por hora 429 | DC3 |
| DC4 | RLS ligada sem política, service_role só SELECT, gravação só pela função definer, bucket privado | DC4 + provas no fim da migração |
| DC6 | `alterando` só pela sessão (SQL): só leitura no painel, gravação recusada (409), grupo próprio; migração separada sobre a aplicada | DC3 + DC6 |
| DC7 | Separada pela sessão que enviou (`origem` app/adm/ads; migração 20261124020000, já no ar): controle no topo com as pendentes de cada uma, rótulo em cada cartão, número da aba = total pendente | DC2 + DC7 |
| DC5 | Aba no computador e no celular com o número de pendentes, 6 idiomas, tokens dos dois temas, botões de 56 px, texto 17 px, voltar do Android fecha uma camada | DC5 + `docs/evidence/decisoes/` (390 px, claro e escuro) |

## 5. "Vou fazer depois", "Tarefa sua", "Atualizar" e "Avisar as sessões" (Evandro, 2026-11-24; construído, migração NÃO aplicada)

Desenhos: `docs/specs/desenhos/vou-fazer-depois.html` e `docs/specs/desenhos/avisar-sessoes.html` (aprovados com "4 aprovo", sem opção escolhida: executada a segunda, construir e mostrar antes da migração). Prova: `docs/evidence/decisoes/11-*` a `18-*` (390 px e computador, claro e escuro) e `prova-depois-avisos.html`. Migração: `supabase/migrations/20261125000000_founder_decisions_depois_avisos.sql` (aplicar ANTES de publicar o código: a lista lê `later_at`).

- `status = 'depois'`: ele guardou para depois. `decided_at` nulo, `later_at` = desde quando, `note` = a observação dele. **Não executar; continuar listando** no fim de cada resposta, na parte "Guardadas para depois". Ele decide dali ou volta para Pendentes (`status = 'pendente'`).
- `kind = 'tarefa'`: pendência que só ele pode fazer (login, acesso, apagar algo). Rótulo "Tarefa sua".
- Ler as respostas sempre com `status in ('aprovado', 'recusado', 'ajustar') and executed_at is null`.
- "Avisar as sessões" grava uma linha em `founder_decision_pings` (origem nula = as três). Cada sessão lê o sinal com `select public.founder_decisions_signal('<a chave dela>')` (anon), que devolve por origem `{ aguardando, ultima_resposta, ultimo_aviso }` ou null. A chave fica no Mac, fora do git; no banco vai só `insert into public.founder_decision_signal_keys (label, hash) values ('<app|adm|ads>', '<shasum -a 256 da chave>');`.

| # | Critério | Prova |
|---|---|---|
| DL1 | "Vou fazer depois" e "Voltar para Pendentes" passam só pela função de gravação; o grupo Depois tem contagem própria; o número da aba conta só Pendentes; transição recusada 409 | `__tests__/admDecisionsLater.test.js` DL1 |
| DL2 | Migração: `depois` com `later_at` (sem `decided_at`), `tarefa`, histórico aceita as duas, a função só aceita depois a partir de pendente e pendente a partir de depois; as três migrações aplicadas intactas | DL2 |
| DL3 | Tela: quatro grupos; a quarta resposta separada abaixo das três; aviso "Guardada para depois" com a observação; rótulo Tarefa sua; 6 idiomas | DL3 + DC5 + capturas 12-16 |
| DA1 | "Avisar as sessões" = POST ping com a mesma regra de gravação (Origin, admin, código ou aparelho), 20 por hora; a lista traz `last_ping_at` | DA1 |
| DA2 | Avisos e chaves com RLS e sem política; só a impressão da chave; o sinal devolve só números e horas, executável pelo anon | DA2 |
| DA3 | Tela: Atualizar e Avisar no topo; o aviso segue a sessão escolhida e mostra quantas respostas aguardam; Novidades = o que as sessões fizeram desde a última vez | DA3 + capturas 11, 15, 17 |

