# Programa de criadores (afiliados) — spec e lista de aceite

Escrita em 2026-11-13 pela sessão do painel, a partir de `Second Brain/dosetrace/admin-panel/HANDOFF-afiliados.md`
(pedido do Evandro na sessão Dosetrace Ads, 2026-11-13) e das notas 021, 022 e 023.
Estado: **APROVADA pelo Evandro em 2026-11-20** ("Pode construir a spec e os desenhos"). Construída com teste antes. **Go do Evandro em 2026-11-20: migração aplicada e publicada em main ccc98df4** (anon 42501 nas 11 tabelas; recusas conferidas ao vivo). Falta: CREATOR_DATA_KEY e RC_WEBHOOK_AUTH na Vercel, webhook no RevenueCat, criador TESTE e prova no S25. Desenhos: `docs/design/adm-criadores.html`.
Parte do app: `docs/specs/creators-app-side.md` (vai para a sessão do app, que passa pelo dt-council).

Registro consultado antes de propor (`scripts/checar-decisoes.sh afiliado influenciador criador referral webhook A-179`):
- Tabelas `referral_codes` / `referrals` existem no servidor, mas nenhum código do app as usa (`../40-dados.md:128`). São de indicação entre usuários e não servem aqui (uma linha por usuário, sem plataforma, sem receita). Ficam como estão.
- Webhook do RevenueCat: "PENDENTE (ele decide depois)" (`02-decisoes.md`, 2026-11-02 22:05, resposta 7). **Fato novo:** em 2026-11-13 o Evandro pediu o sistema "já linkado com o RevenueCat", e cada venda tem de aparecer sozinha. Sem webhook isso não é possível. A pergunta P2 abaixo pede a confirmação.
- A-179 (política e termos) continua adiada; ela trata das respostas de perfil. Aqui a finalidade é outra (comissão do criador), mas também pede uma linha na política: ver CR-PRIV.
- Links de campanha e o redirecionador `/go/<canal>` (nota 023) ainda não foram construídos. Esta spec os constrói junto, no formato `/go/<criador>/<plataforma>`.
- Contas de teste nunca entram em número nenhum e não há vista "bruta" (2026-10-16). A prova de ponta a ponta precisa ver dados de teste. Proposta: só na tela do criador de teste, com faixa TESTE (pergunta P5).
- "Parceiros" já é o nome da visão futura para personal trainers (2026-11-02 22:05, item 6). Por isso a aba se chama **Criadores**.

## 1. O que o programa faz (em uma frase por parte)
1. **Criar em 1 clique.** "Novo criador" grava o criador, gera o código, um código e um link por plataforma e o link de convite. Não sobra nada para fazer à mão.
2. **Convite e cadastro.** O criador abre o convite e escolhe o país. Depois preenche contato e forma de pagamento (os campos mudam conforme o país) e aceita as regras. O Evandro aprova.
3. **Cliques por plataforma.** `dosetrace.io/go/<criador>/<plataforma>` conta o toque, sem guardar IP, e manda cada aparelho para a loja certa com o parâmetro de campanha.
4. **Receita automática.** O webhook do RevenueCat grava cada evento de compra num livro-razão. A receita, os clientes, as renovações e os reembolsos por criador e por mês saem desse livro. Ninguém digita receita.
5. **Aba Criadores.** Mostra a receita total, por criador e por plataforma, o ranking, o valor a pagar por mês e o botão "marcar como pago".
6. **Portal do criador.** O criador vê só os números dele, sempre agregados.
7. **Comissão configurável por criador.** A estratégia **não está decidida**. O painel aceita vários modelos, e o padrão é "a definir": o painel mede, mas não calcula comissão.
8. **Pronto e parado.** Uma trava geral, "Pagamentos liberados", fica DESLIGADA até o contador e o advogado revisarem e o Evandro dizer "go". Até lá só existe o criador de teste.

## 2. Limites honestos (aparecem na página, junto do número)
| Número | Android | iPhone | Rótulo |
|---|---|---|---|
| Cliques por plataforma | exato | exato | **Medido.** Conta toques no link, não pessoas, porque sem IP não dá para tirar repetidos. |
| Instalações por plataforma | Play Install Referrer (o app lê e envia) | a Apple não liga clique a instalação sem MMP e consentimento de rastreio | Android: **Medido**. iPhone: **Não medido — a Apple não informa**. As instalações por `ct` ficam no App Store Connect, sem ligação com a conta. |
| Contas com o código | referrer ou código digitado | só se a pessoa digitar o código (ou abrir o link com o app já instalado) | **Medido.** Quem chega pelo iPhone sem digitar o código não aparece, e a página diz isso. |
| Teste grátis, pagantes, renovações, reembolsos, receita | webhook do RevenueCat | webhook do RevenueCat | **Medido.** O webhook só registra eventos a partir do dia em que é ligado. |
| Plataforma de quem pagou | referrer ou código da plataforma (`ANA-YT`) | só pelo código da plataforma | Quando o código não indica a plataforma: **Plataforma não informada**. |
Regra do painel mantida: **nunca estimar.** Onde não há medida aparece "Não medido — motivo", nunca um número calculado por proporção.

## 3. Códigos e links
- **Código base**: de 3 a 12 caracteres, A–Z e 0–9, único (ex.: `ANA`). O painel sugere a partir do nome, e o Evandro pode editar antes de salvar. Depois do primeiro uso o código não muda.
- **Código por plataforma**: base + sufixo fixo: `-IG` Instagram, `-YT` YouTube, `-TT` TikTok, `-FB` Facebook, `-X` X, `-SITE` site/blog, `-OUT` outro. No iPhone, o código é o único jeito de saber a plataforma, por isso o criador fala ou mostra o código da plataforma em cada post.
- **Link por plataforma**: `https://dosetrace.io/go/ana/instagram` (minúsculas). Um link por plataforma marcada no cadastro.
- **Redirecionador** (`api/go.js`, regra de reescrita `/go/:criador/:plataforma` na Vercel):
  - iPhone/iPad → App Store com `pt=<pt do ASC>&ct=cr-ana-ig` (o `pt` ainda falta: nota 023). Se a resposta P4 for sim, antes passa por uma página curta com o código grande, um botão "Copiar código" e um botão "Abrir a App Store".
  - Android → Play com `referrer=utm_source%3Dinstagram%26utm_medium%3Dcreator%26utm_campaign%3Dana%26utm_content%3DANA-IG`. Nunca encurtar, porque o encurtador apaga o referrer (nota 023).
  - Computador → página `dosetrace.io/c/ana` com os dois botões das lojas e o código.
  - Contagem: soma 1 em `creator_clicks (criador, plataforma, dia UTC, tipo de aparelho)`. Não grava IP, user-agent, cookie nem referer. Robôs de pré-visualização de link (`facebookexternalhit`, `Twitterbot`, `Slackbot`, `WhatsApp`, `TelegramBot` e outros, lista no código) não contam.
  - Criador pausado ou encerrado → loja genérica, sem contar. Criador inexistente → página inicial do site.
- **Convite**: `https://dosetrace.io/criador/convite#<token>`. O token vai depois do `#`, então nunca chega ao servidor, ao log nem ao referer: a página o lê e o envia no corpo do pedido. São 32 bytes aleatórios, e só o hash sha256 é guardado. Vale 14 dias e pode ser gerado de novo (o anterior para de valer na hora).

## 4. Fluxo do criador
1. **Evandro → Novo criador** (painel). Campos: nome público, código (sugerido), plataformas (marcar), país (opcional, o criador confirma), modelo de comissão (padrão "a definir"), "é criador de teste". Salvar mostra o cartão de resultado: códigos e links com botão Copiar, o link de convite e uma **mensagem pronta para copiar** em pt/en/es. O painel não envia nada (mesmo princípio do Q5, 2026-10-21).
2. **Criador → convite.** Idioma (6), depois País (primeiro campo), depois Contato, Pagamento (conforme o país), Regras do programa, Revisar e enviar. Um rascunho fica salvo no próprio aparelho dele enquanto o convite vale.
3. **Painel → "Precisa de você": cadastro aguardando aprovação.** As opções são Aprovar, Pedir correção (com nota; o criador corrige pelo mesmo link) e Recusar. Na aprovação nasce o acesso ao portal (P3).
4. **Criador → portal.** Mostra só os números dele (seção 7).
5. Estados: `convidado → enviado → aprovado (ativo) → pausado → encerrado`. Encerrar desliga os links (passam a ir para a loja genérica) e para a comissão nova. O que já era devido continua devido.

## 5. Campos do cadastro (o mínimo) e onde ficam
| Campo | Brasil | EUA | Outros países | Guarda |
|---|---|---|---|---|
| País de residência fiscal | sim | sim | sim | texto |
| Nome público, @ por plataforma | sim | sim | sim | texto |
| Nome legal (titular) | sim | sim | sim | texto |
| E-mail de contato | sim | sim | sim | texto |
| Telefone/WhatsApp com DDI | sim | sim | sim | **cifrado** |
| Forma de pagamento | PIX | PayPal, Wise ou transferência bancária pelo serviço de pagamento (ACH) | Wise ou PayPal | texto |
| PIX: tipo de chave + chave | sim | — | — | **cifrado** |
| CPF ou CNPJ (+ "emite nota? MEI / empresa / não") | sim | — | — | **cifrado** (pergunta ao contador: MEI precisa emitir nota?) |
| E-mail PayPal / Wise | — | se escolher | se escolher | texto |
| Formulário fiscal | — | W-9: só "enviado em" | W-8BEN: só "enviado em" (se a pagadora for empresa dos EUA) | só o estado, nunca o documento |
- **Número de conta e routing: nunca** entram no formulário do DoseTrace. Nos EUA, a transferência bancária só existe pelo serviço de pagamento, onde o próprio criador digita os dados (seção 9). O Claude nunca digita número de conta.
- **W-9 / W-8BEN**: o painel não recebe o documento (ele leva SSN/ITIN). Ou o serviço de pagamento recolhe, ou o criador manda direto ao contador. O painel guarda só "enviado em <data>".
- **Cifragem**: AES-256-GCM no servidor, com a chave `CREATOR_DATA_KEY` (variável sensível na Vercel, nunca no repositório). O painel mostra os campos mascarados (`•••.456.789-••`). "Revelar" exige o step-up (navegador: código de 15 min; DT Admin: digital) e grava uma linha em `admin_actions_log`.
- Validação no servidor: dígitos do CPF/CNPJ, formato de cada tipo de chave PIX, e-mail e telefone E.164. Limite de tamanho em todo campo.
- **Regras do programa** (aceite obrigatório, com a versão gravada): marcar #publi (CONAR) / "paid partnership" (FTC) em todo post; nada de promessa de resultado, antes/depois ou orientação de dose; nunca vender nem linkar compostos, nunca EvoxBiolabs nem vendedor; não usar o próprio código; o DoseTrace pode encerrar a parceria. **O texto final é do advogado** antes do primeiro criador real. Até lá a página mostra o rascunho com a faixa "RASCUNHO — NÃO ASSINAR".

## 6. Receita: webhook do RevenueCat e livro-razão
- **Edge function `rc-webhook`** (Supabase). O RevenueCat chama com um `Authorization` secreto, que a função compara em tempo constante; sem ele, 401. Ela responde 200 em seguida e é idempotente pelo `event.id`.
- **Tabela `rc_events`**: id do evento (único), tipo, `environment` (SANDBOX/PRODUCTION), `app_user_id`, `original_app_user_id`, produto, loja, `period_type`, `is_trial_conversion`, `renewal_number`, `cancel_reason`, datas de compra e de expiração, `price` (USD), `price_in_purchased_currency`, `currency`, `tax_percentage`, `commission_percentage`, `country_code`, `transaction_id`, `original_transaction_id`, e **só** os atributos `creator_code` e `creator_source`. Os demais atributos do assinante (e-mail, telefone etc.) nunca são gravados.
- **Receita líquida** de um evento = `price × (1 − tax_percentage) × (1 − commission_percentage)`. A fórmula exata e o sinal dos reembolsos são **conferidos no primeiro evento sandbox** e na documentação do RevenueCat antes de qualquer número aparecer (linha CR-LED3).
- Tipos usados: INITIAL_PURCHASE (teste grátis quando `period_type = TRIAL` e preço 0), RENEWAL (com `is_trial_conversion`), PRODUCT_CHANGE, CANCELLATION (com `cancel_reason = CUSTOMER_SUPPORT` = reembolso), UNCANCELLATION, EXPIRATION, BILLING_ISSUE, REFUND_REVERSED, TRANSFER (fica marcado para revisão manual). Os outros são gravados e ignorados nos cálculos.
- **Atribuição** (`creator_attributions`, uma linha por conta, decidida no primeiro toque):
  - Fonte 1: o app grava (`api/creator-attribution`, com o JWT do usuário) o código e a origem (digitado / link / referrer do Play) quando a pessoa usa um código. Essa é a linha "contas com o código".
  - Fonte 2: o atributo `creator_code` no evento do RevenueCat.
  - Regra: a conta conta para o criador **só se o código existia antes da primeira compra** (INITIAL_PURCHASE, inclusive teste grátis). Código digitado depois da compra fica registrado, mas não gera comissão ("chegou depois da compra"). Depois disso a atribuição não muda (o primeiro toque vence).
  - Contas de teste (`admin_is_test`) e eventos SANDBOX ficam fora de todo total, ranking e pagamento. Aparecem só na tela do criador de teste (P5).
- **Conciliação mensal**: soma líquida do livro no mês × gráfico Revenue do RevenueCat no mesmo mês (o total, não por criador). A diferença aparece com o motivo provável: dias antes do webhook, teste, sandbox. Por criador, a conferência é a lista de clientes do RevenueCat filtrada pelo atributo `creator_code`, se o filtro existir; senão "conferência manual".

## 7. Telas
### 7.1 Aba Criadores (admin; desktop e 390 px; dois temas)
- **Faixa de 4 números (mês escolhido)**: receita líquida trazida por criadores; assinantes pagantes ativos vindos de criadores; comissão a pagar (vencida + a vencer); cliques no mês.
- **Ranking por receita líquida do mês** (ordem por qualquer coluna): posição, criador, país, cliques, contas com código, testes grátis, pagantes ativos, receita do mês, receita acumulada, comissão do mês, **plataforma que mais rende** e situação do pagamento.
- **Por plataforma** (todos os criadores): cliques, contas, pagantes e receita, com o rótulo Medido / Não medido em cada coluna.
- **Receita por mês**: barras dos últimos 12 meses (meses antes do webhook: "sem dados — webhook ligado em <data>").
- **Pagamentos**: lista do mês com valor, prazo ("liberado em 31/12, fim do prazo de reembolso") e situação. O botão "Marcar como pago" abre uma janela com data, valor pago, moeda, câmbio, forma, referência (ex.: id da transferência) e Confirmar. Tudo vai para o log. Com a trava "Pagamentos liberados" desligada, o botão aparece desabilitado com o motivo, exceto para o criador de teste.
- **Precisa de você** (no Resumo também): cadastro aguardando aprovação; pagamento vencido; criador ativo sem modelo de comissão; evento TRANSFER para revisar.
- **Configuração do programa**: trava "Pagamentos liberados" (só liga com "contador revisou" + "advogado revisou" marcados, e grava quem e quando); valor mínimo para pagar (o saldo menor passa para o mês seguinte); prazo padrão de reembolso (30 dias); texto do benefício ao público ("a definir").

### 7.2 Tela do criador (admin) — "cada criador gera uma tela"
Cabeçalho com nome, código, país, situação e os botões Pausar / Encerrar / Gerar convite de novo / Gerar acesso ao portal de novo. Depois: links e códigos com Copiar; números do mês e acumulados por plataforma; meses (tabela); modelo de comissão (versões, com "vale a partir de"); extrato de pagamentos; dados de pagamento mascarados com Revelar (step-up). Clientes: só contagens. Para conferir um caso, a aba Contas ganha o filtro "veio do criador X". O painel admin já mostra contas; nada disso vai para o criador.

### 7.3 Convite e cadastro (o criador vê; desenho primeiro, regra de 2026-10-22)
Uma coluna, passos numerados (é uma sequência de verdade), país primeiro. Os campos de pagamento mudam com o país. "Revisar e enviar" antes de mandar. Seis idiomas, dois temas, 390 px primeiro.

### 7.4 Portal do criador (o criador vê)
- Topo: nome, mês (seletor), "Atualizado em".
- Quatro números: cliques; contas com o seu código; pagantes ativos; sua comissão do mês ("mês aberto — parcial" até fechar).
- Por plataforma: cliques (Medido), contas (Medido; "iPhone sem código: não medido"), pagantes.
- Meses: tabela com receita gerada, comissão e situação do pagamento (em apuração / aguardando o prazo de reembolso até dd/mm / a pagar / pago em dd/mm).
- Seus links e códigos (Copiar); regras do programa; dados de pagamento mascarados com "Pedir alteração" (o Evandro gera um novo convite).
- **Privacidade**: nunca uma linha por pessoa, nunca e-mail, país ou data de quem usou o código. Contagens menores que 5 aparecem como "<5". O dinheiro aparece exato, porque é a base do pagamento e do contrato (ponto para o advogado: CR-PRIV).

## 8. Modelo de comissão (configurável; a estratégia NÃO está decidida)
Uma versão por criador, com data de início. Mudar cria uma versão nova, e os meses passados ficam com a versão que valia neles.
| Campo | Opções |
|---|---|
| Percentual da receita líquida | 0–100 % (0 = só fixo) |
| Duração | vitalícia · enquanto o cliente continuar assinando (termina na primeira expiração; voltar não conta) · N meses desde a primeira compra do cliente |
| Base | só a primeira compra · primeira compra + renovações |
| Fixo opcional | valor por mês ativo · valor por post (o Evandro registra os posts) |
| Prazo de reembolso | dias depois do fim do mês até o valor ficar "a pagar" (padrão 30: o mês M é pago no fim de M+1) |
| Moeda do cálculo | USD (o RevenueCat dá o preço em USD); o valor pago em BRL/EUR e o câmbio entram no "marcar como pago" |
| Contrato | data de assinatura + referência do arquivo (o contrato fica fora do painel) |
- O cálculo é uma função pura, com teste antes: eventos atribuídos + versões → linhas do mês. Um reembolso de um evento que já gerou comissão gera uma linha negativa no mês do reembolso (estorno).
- Fechar o mês grava um extrato congelado por criador (`creator_payouts`). Situações: `em apuração → aguardando prazo → a pagar → pago`. Pagamento abaixo do mínimo passa para o mês seguinte.
- Modelos de exemplo (para escolher num clique; **não são decisão**): "a definir"; "20 % da receita líquida por 12 meses, com renovações"; "US$ X por post + 10 % vitalício". A faixa de mercado que a sessão de marketing anotou, 20–50 % por 12 meses, é consenso de praticante, não regra.

## 9. Serviço de pagamento
O pagamento em si é feito pelo Evandro, no site do serviço. O painel calcula, mostra o valor e registra "pago". **A v1 não paga por API**: com 1 a 10 criadores, isso evita guardar mais dados e mais chaves. A comparação dos serviços está na seção 9a.

### 9a. Comparação (pesquisa de 2026-11-13 nas páginas oficiais; o contador confirma antes do primeiro pagamento)
| Serviço | Brasil (PIX) | EUA (ACH) | Outros | O criador digita os próprios dados? | Formulários fiscais | Custo (volume pequeno) |
|---|---|---|---|---|---|---|
| **Wise Business** | **Sim, chave PIX** (a Wise pede o CPF do recebedor) | provável (não confirmado) | 40+ moedas; lote de até 1.000 | em parte ("enviar para e-mail": o recebedor digita os dados no site da Wise, em até 10 dias) | não | US$ 31 uma vez; a partir de 0,23 % por envio (US$ 500 para o Brasil ≈ US$ 4–6, estimativa de terceiros) |
| **Stripe Connect Express** | **Não** (empresa dos EUA paga fora só para EUA, Reino Unido, EEE, Canadá e Suíça) | sim | PT e UK sim; MX e BR não | **sim** (cadastro na página da Stripe) | **1099-NEC sim** (US$ 2,99 por formulário); W-9/W-8 só em prévia | US$ 2 por conta ativa por mês + 0,25 % + US$ 0,25 por pagamento; não exige vender pela Stripe (o saldo entra por "top-up") |
| PayPal Payouts | sem PIX (conta PayPal BR, câmbio do PayPal) | para o saldo PayPal, não ACH | 96 países | sim (só o e-mail) | não | 2 % com teto; **exige aprovação** |
| Tipalti / Trolley | — | — | — | sim | sim | a partir de US$ 249/mês / US$ 2.399/ano: caro para agora |
| Insert Affiliate | paga pela Stripe (o Brasil herda o limite) | pela Stripe | pela Stripe | painel próprio | não informa | grátis até 2 afiliados; depois £ 20/mês + 10 % |
**Recomendação para a v1** (a decisão é do Evandro com o contador, depois da aprovação):
- **Brasil:** Wise Business para a chave PIX. Por isso o cadastro guarda a chave PIX e o CPF cifrados: a Wise precisa dos dois.
- **EUA:** Stripe Connect Express. O criador cadastra o banco na página da Stripe, e a Stripe arquiva o 1099-NEC (limite atual: US$ 2.000 por ano). Alternativa sem conta nova: PayPal ou Wise para o e-mail.
- **Outros países:** Wise para o e-mail. W-8BEN recolhido pelo contador, não pelo painel.
- Fora por enquanto: Tipalti, Trolley (mínimo alto) e Hyperwallet. O PayPal fica como alternativa, porque exige aprovação e tem câmbio pior.
- Não confirmado: a tarifa exata da Wise USD→BRL e do ACH nos EUA; se o "enviar para e-mail" da Wise funciona para PIX; as tarifas do PayPal nos EUA (a página não abriu). Conferir no site antes do primeiro pagamento.

## 10. Banco (migrações só com o "go"; RLS ligado, 0 políticas, só service_role, como as tabelas admin_*)
`creators`, `creator_platforms`, `creator_invites`, `creator_portal_tokens`, `creator_payout_profiles` (campos cifrados), `creator_terms`, `creator_clicks`, `creator_attributions`, `creator_posts`, `creator_payouts`, `rc_events`, `creator_program_settings`. Ações do admin vão para `admin_actions_log`. `creator_attributions` usa `on delete cascade` em `auth.users`, e o `delete-user` passa a apagá-la (sessão do app).

## 11. Segurança
- Rotas do admin passam pelo `_admAuth` (sessão + aal2 ou chave do aparelho). Escritas pedem Origin válido; Revelar e Marcar como pago pedem step-up.
- Rotas públicas: `/go/*` (sem login, só soma contador, com limite por minuto); convite e portal (token no corpo, hash no banco, limite de tentativas, 401 sem token válido); `api/creator-code` (o app confere se o código existe; devolve só "válido", a plataforma e o texto do benefício); `api/creator-attribution` (JWT do usuário do app).
- Nenhum token, chave PIX, documento, e-mail ou telefone em log. As páginas novas usam a mesma CSP do `/adm`, `Referrer-Policy: no-referrer` e `noindex`.
- Criador encerrado: os dados de pagamento ficam pelo prazo fiscal que o contador indicar e depois são apagados. O criador pode pedir para apagar antes (respeitando a obrigação fiscal).

## 12. Fora do escopo (não construir)
MMP, SDK ou pixel no app (regra do conselho, nota 022); rastrear por código de oferta da loja (a Apple limita a 10 ofertas e registra preço 0; o Google exige 2.000 resgates); pagamento por API (v2, se crescer); assinatura de contrato dentro do painel; LTV, CAC ou projeção. Alternativa paga, se crescer: Insert Affiliate (parceiro oficial do RevenueCat).

## CR-PRIV — o que depende de advogado e contador (antes do primeiro criador real)
1. Política de privacidade do app: uma linha dizendo que, se a pessoa usar o código de um criador, o DoseTrace registra o código para calcular a comissão e o criador vê só totais. Também os formulários das lojas (App Privacy / Data safety), se mudar algo. Junto com o advogado da A-179.
2. Regras do programa e cláusula do contrato (pendente desde 2026-11-02, `../60-divulgacao.md`).
3. Contador: CPF/CNPJ e nota fiscal (MEI); W-9 e 1099-NEC acima do limite do IRS; W-8BEN para pessoa de fora; prazo de guarda dos dados de pagamento.

## Lista de aceite (marcar com evidência; nada marcado ainda)
| # | Critério | Prova |
|---|---|---|
| CR-D1 | Desenhos aprovados: aba Criadores, Novo criador, tela do criador, convite/cadastro (BR, EUA, outro país), portal; desktop e 390 px; dois temas | "aprovo" do Evandro |
| CR-1 | Novo criador grava a linha, o código único, os códigos e links por plataforma e o convite numa transação; código repetido é recusado | teste + prova no S25 |
| CR-2 | `/go/<c>/<p>`: iPhone → App Store com `ct`; Android → Play com referrer; computador → página; o contador soma 1 por plataforma/dia/aparelho; robôs não contam; nada de IP/UA no banco | teste + curl com 4 UAs + S25 |
| CR-3 | Convite: o token só existe como hash; o link vale 14 dias; gerar de novo invalida o anterior; país primeiro; campos por país (BR/EUA/outro); validação de CPF/CNPJ/PIX; nunca pede número de conta | teste + render dos 3 países nos dois temas + S25 |
| CR-4 | Campos sensíveis cifrados no banco (o select direto mostra texto cifrado); o painel mostra mascarado; Revelar pede step-up e grava log | teste + consulta MCP |
| CR-5 | Aprovar / Pedir correção / Recusar; "Precisa de você" mostra o cadastro pendente | teste + S25 |
| CR-LED1 | Webhook: 401 sem segredo; idempotente pelo id; grava só os campos da lista; sem e-mail | teste + evento de teste do RevenueCat |
| CR-LED2 | Atribuição pelo primeiro toque, só com o código antes da primeira compra; teste e sandbox fora dos totais | teste |
| CR-LED3 | Fórmula da receita líquida e sinal do reembolso conferidos com evento sandbox real e a documentação | evento sandbox + nota |
| CR-COM1 | Função de comissão: percentual, as 3 durações, só primeira vs renovações, fixo por mês/post, prazo, estorno, mínimo que passa para o mês seguinte, versões | testes unitários (tabela de casos) |
| CR-COM2 | Fechar o mês congela o extrato; Marcar como pago grava data, valor, moeda, câmbio, referência e autor; desligado enquanto a trava estiver desligada (menos o criador de teste) | teste + S25 |
| CR-UI1 | Aba Criadores: faixa, ranking ordenável, por plataforma, receita por mês, pagamentos, rótulos Medido/Não medido | render dois temas + S25 |
| CR-UI2 | Portal: só os números do criador; "<5"; nada por pessoa; outro token → 401 | teste + render + S25 |
| CR-E2E | Criador de teste com 2 plataformas: toques no S25 aparecem por plataforma; compra sandbox na conta de teste com o código aparece na tela do criador de teste (faixa TESTE) e fora de todos os totais | S25 + MCP |
| CR-REC | Ranking e comissão conferidos contra o RevenueCat no mês do teste | tabela de conferência |
| CR-OFF | Estado final: nenhum criador real, trava desligada, nenhum contrato; o criador de teste pode ficar ou ser apagado (decisão do Evandro) | consulta MCP |
| CR-APP | Parte do app especificada e entregue à sessão do app (`creators-app-side.md`) | mensagem enviada |

## Perguntas ao Evandro (uma rodada; só o que é dele)
- **P1** Aprova os desenhos e esta spec? (CR-D1)
- **P2** Liga o webhook do RevenueCat agora? Isso fecha a pendência 7 de 02/11. Depois do deploy você cola a URL e o segredo no site do RevenueCat; o histórico começa nesse dia.
- **P3** Acesso do criador ao portal: (a) **link privado** (recomendado na v1: sem senha, não cria conta no Supabase do app, pode ser trocado a qualquer momento, mostra só totais e dados mascarados) ou (b) e-mail + código (precisa de um serviço de e-mail novo). Login pelo Supabase Auth está descartado, porque criaria uma "conta" do app para cada criador e misturaria os números.
- **P4** iPhone: passar por uma página curta com o código antes da App Store (recomendado: no iPhone o código é a única atribuição) ou ir direto para a loja?
- **P5** Exceção à regra "sem vista de teste": só a tela do criador de teste mostra os próprios dados de teste/sandbox, com a faixa TESTE, e nunca entram em total ou ranking. Aceita?
Não são perguntas de agora (marketing/finanças, contador, advogado): a estratégia de comissão, o benefício ao público e o serviço de pagamento definitivo.


## Decisões de 2026-11-20 (respostas P1–P5; detalhe em `Second Brain/dosetrace/admin-panel/02-decisoes.md`)
- P1 spec e desenhos aprovados; correções depois de ele ver funcionando.
- P2 webhook do RevenueCat ligado (fecha a pendência de 02/11).
- P3 portal por link privado, sem senha; o link fica guardado **cifrado** para o Evandro ver e copiar de novo quando quiser. "Novo link" desliga o anterior.
- P4 a Apple não passa o código pela loja → no iPhone sempre aparece a página com o código e o botão da App Store. No Android, direto para a Play (o referrer leva o código).
- P5 a tela do criador de teste mostra os dados de teste com a faixa TESTE. **Regra geral nova:** contas de teste ficam fora só dos números de usuários reais; para testar, pode criar e mostrar onde precisar, identificado.
- Fato do registro aplicado (arquivo `../../65-oferta-entrada-e-indicacao.md`, 2026-11-19): o modelo padrão de cada criador novo é **35 % da receita líquida por 12 meses, só assinatura paga confirmada**. Continua configurável por criador. O benefício ao público ("1 mês extra de Premium depois do primeiro pagamento") é da sessão do app; o painel só guarda o texto.

## Desvios aceitos pelo Evandro (construído diferente do texto acima)
**Aceitos os cinco em 2026-11-24 18:44 EST, na aba Decisões (sort 71): "Aceito as 5".** O DV-4 pode ir para o Resumo depois, se ele pedir.
| # | O quê | Por quê |
|---|---|---|
| DV-1 | Webhook como função da Vercel (`api/rc-webhook.js`), não edge function do Supabase | Mesmos testes e mesmo deploy das outras funções do painel. Para o RevenueCat é só uma URL. |
| DV-2 | "Instalações Android" por criador não aparece como número; a página diz "Android: ver Play Console" | O servidor só vê a conta quando o app manda o código (AP5). A instalação sem cadastro fica só no Play Console, por `utm_campaign`. Nada é estimado. |
| DV-3 | O extrato congela quando o mês é **marcado como pago**, não num "fechar o mês" separado | Um botão a menos. Até o pagamento, um reembolso tardio ainda reduz o valor, o que está certo. Depois de pago, o valor fica gravado. |
| DV-4 | O "Precisa de você" dos criadores aparece na aba Criadores, ainda não no Resumo | Mantém o Resumo como está. Entra no Resumo se o Evandro quiser. |
| DV-5 | O convite vale 14 dias; o link do portal não vence | P3 pede que o portal continue valendo. O convite leva dados de pagamento, por isso vence (dá para gerar outro). |

## Estado da lista de aceite (2026-11-20)
| # | Estado | Evidência |
|---|---|---|
| CR-D1 | feito | "Pode construir a spec e os desenhos" (2026-11-20) |
| CR-1 | testes ok; falta S25 | `__tests__/creatorsApi.test.js` CR-1 |
| CR-2 | testes ok; falta S25 e curl ao vivo | CR-2, CR-2a/b/c/d |
| CR-3 | testes ok; render dos 3 países nos dois temas; falta S25 | CR-3a/b, CR-3/4/5; renders do convite |
| CR-4 | testes ok; falta consulta MCP ao vivo | CR-4a, CR-3/4/5 |
| CR-5 | testes ok; falta S25 | CR-3/4/5 |
| CR-LED1 | testes ok; falta o evento de teste do RevenueCat ao vivo | CR-LED1, CR-LED1a |
| CR-LED2 | testes ok | CR-LED2a, CR-E2E (memória) |
| CR-LED3 | **aberto**: fórmula e sinal do reembolso a conferir com o primeiro evento sandbox real | CR-LED3a cobre a fórmula escrita |
| CR-COM1 | testes ok | CR-COM1a/b/c/d/e |
| CR-COM2 | testes ok; falta S25 | CR-COM2, CR-E2E |
| CR-UI1 | render dois temas, desktop e 390 px; falta S25 | renders da aba e da tela do criador |
| CR-UI2 | testes ok; render dois temas; falta S25 | CR-UI2a, CR-E2E |
| CR-E2E | só em memória; **ao vivo depende** de migração + deploy + webhook + build do app (AP4/AP5/AP7) | CR-E2E (memória) |
| CR-REC | aberto (depois do E2E ao vivo) | — |
| CR-OFF | aberto (estado final) | — |
| CR-APP | enviado à sessão do app em 2026-11-20 | mensagem |
