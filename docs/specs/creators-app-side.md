# Programa de criadores — parte do app (para a sessão do app; passa pelo dt-council + ship-check)

Escrita em 2026-11-13 pela sessão do painel; atualizada em 2026-11-20 (spec do painel APROVADA e construída do lado do servidor; migração ainda não aplicada). Spec do programa: `docs/specs/creators.md` (painel).
Nada daqui é construído antes de o Evandro aprovar a spec do painel e esta parte passar pelo dt-council
(journey-review incluído). Dono: sessão do app (`Second Brain/dosetrace/codigo`, branch do app). O painel
não mexe no app.

## O que o app precisa fazer
| # | O quê | Detalhe |
|---|---|---|
| AP1 | Campo "Código do criador" | Três lugares: (a) paywall, com o link "Tenho um código de criador"; (b) Ajustes › Código do criador; (c) **não** no onboarding de 8 passos (regra do conselho: nada novo no onboarding), salvo decisão do Evandro. Aceita letras, números e hífen; converte para maiúsculas; tira espaços. |
| AP2 | Validação | `GET https://dosetrace.io/api/creator-code?c=ANA-IG` → `{ valid, platform, benefit_text }`, ou `{ valid:false, reason:'unknown'|'ended' }`. Código inválido: a mensagem diz o motivo e deixa corrigir. O app nunca mostra outros dados do criador. |
| AP3 | Uma vez por conta, travado depois da compra | Sem compra: dá para trocar o código. Depois da primeira compra (inclusive teste grátis): só leitura. A regra do servidor ignora código digitado depois da compra; o app explica isso antes de travar. |
| AP4 | Atributos no RevenueCat | Assim que o código é aceito, e **antes** de qualquer compra: `Purchases.setAttributes({ creator_code: 'ANA-IG', creator_source: 'typed' \| 'link' \| 'play_referrer' })`. Os atributos precisam estar no RevenueCat antes do INITIAL_PURCHASE, senão a compra não conta. Conferir no journey-review: usuário anônimo (`$RCAnonymousID`) que digita o código e só depois entra na conta. O `logIn` preserva os atributos? |
| AP5 | Registro no servidor | `POST https://dosetrace.io/api/creator-attribution` com o JWT do usuário e `{ code, source }`. Grava `creator_attributions` (uma linha por conta, primeiro toque). Se falhar sem rede, tenta de novo na próxima abertura. Nada mais é enviado. |
| AP6 | Link que já preenche o código | `https://dosetrace.io/c/<CODIGO>` como Universal Link (iOS) e App Link (Android). Com o app instalado, abre o app com o código preenchido (`creator_source = 'link'`). Sem o app, a página web mostra as lojas. Precisa de `apple-app-site-association` e `assetlinks.json` em dosetrace.io (o site; combinar com o painel, que serve o domínio). |
| AP7 | Play Install Referrer (Android) | Lê uma vez, na primeira abertura depois da instalação (módulo nativo, então exige build). Se `utm_medium=creator`, o código vem de `utm_content` (ex.: `ANA-IG`): preencher, aplicar AP4 com `creator_source = 'play_referrer'` e AP5. Não ler mais nada do referrer. |
| AP8 | Benefício ao público | **Decidido em 2026-11-19** (arquivo `65-oferta-entrada-e-indicacao.md`, caminho A): o código dá **1 mês extra de Premium depois do primeiro pagamento**. A mecânica (concessão promocional no RevenueCat depois do 1º pagamento, ou oferta da loja) é da sessão do app e do projeto 65. O app mostra `benefit_text` vindo do servidor. |
| AP9 | Exclusão de conta | O `delete-user` apaga `creator_attributions` da conta (a tabela também tem `on delete cascade`) **e as linhas de `rc_events` com `app_user_id` = o id da conta** (o livro do webhook guarda eventos de compra por id). |
| AP10 | Privacidade | Uma linha na política (e nas fichas das lojas, se mudar algo): "Se você usar o código de um criador, registramos esse código para calcular a comissão dele; o criador vê apenas totais, nunca quem você é." O texto é do advogado (CR-PRIV na spec do painel). Não publicar antes disso. |
| AP11 | 6 idiomas, dois temas, sem emoji | Tudo que for novo na tela, nos 6 idiomas e nos dois temas. |

## Casos para o journey-review (o que pode já ter acontecido antes)
- A pessoa já assinou antes de existir o programa e agora digita o código: aceita e grava, mas não gera comissão (AP3).
- Instalou pelo link do Android, mas entrou com outra conta: o referrer vale para a conta que estiver logada na hora de aplicar.
- Reinstalou o app: o referrer da reinstalação não substitui o primeiro toque já gravado.
- Trocou de aparelho: a regra de um aparelho por vez vale. O código está na conta (servidor e RevenueCat), não no aparelho.
- Criador encerrado: o código para de ser aceito para novas contas; quem já usou continua atribuído (a regra de duração decide se ainda gera comissão).
- Assinatura feita no iPhone e usada no Android (ou o contrário): o RevenueCat junta pela conta; a atribuição é da conta.
- Teste grátis que não converte: aparece como "teste grátis iniciado", sem receita.

## Prova esperada (junto da prova do painel)
No S25, com a conta de teste: abrir `dosetrace.io/go/teste/instagram` → instalar pelo Play (faixa de teste interno; conferir se o referrer chega nessa faixa) → código preenchido → compra sandbox → o evento chega ao `rc-webhook` com `creator_code` → aparece na tela do criador de teste. iPhone (TestFlight, sandbox): digitar o código `TESTE-YT` → compra sandbox → mesmo resultado, plataforma YouTube.

## Contrato já no ar quando o painel publicar (servidor pronto, testado)
- `GET https://dosetrace.io/api/creator?op=code&c=ANA-IG` → `{ "valid": true, "code": "ANA-IG", "platform": "instagram", "benefit_text": "…" | null }` ou `{ "valid": false, "reason": "unknown" | "ended" }`.
- `POST https://dosetrace.io/api/creator` com `Authorization: Bearer <JWT do usuário>` e `{ "op": "attribution", "code": "ANA-IG", "source": "typed" | "link" | "play_referrer" }` → `{ "ok": true, "recorded": true|false, "code": "ANA-IG" }` (`recorded: false` = a conta já tinha um código: vale o primeiro). Sem JWT → 401.
- Atributos do RevenueCat lidos pelo webhook: `creator_code` (ex.: `ANA-IG`) e `creator_source`. Nenhum outro atributo é gravado.
- Referrer do Play: `utm_source=<plataforma>&utm_medium=creator&utm_campaign=<slug>&utm_content=<CÓDIGO-SUF>`.
- Link que preenche o código: `https://dosetrace.io/c/<CÓDIGO>` (sem o app, mostra a página do código com as lojas).
- Criador de teste para a prova: será criado pelo painel com o código `TESTE` (TESTE-IG, TESTE-YT).
