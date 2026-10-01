# HANDOFF — sessão do app (main) — 2026-09-30

Leia primeiro: `CLAUDE.md`, `STATE.md`, `docs/review/features.md` (registro + escopo 1.2.5),
`docs/specs/fixes-1.2.5.md`. Este arquivo é só o resumo; a fonte da verdade é o registro.

## 1. O que estamos fazendo

- Fechando o **pacote de trabalho "1.2.5"** no branch `main` (correções do app atual, comportamento
  + testes; nada de visual novo).
- Depois vem o **redesign "Graduated"** no branch `redesign/graduated` (hoje só tem `docs/design`,
  commit 136cb55; nenhum código de tela ainda).
- **Um único envio às lojas**, depois dos dois, com a versão **1.3.0**. "1.2.5" continua sendo só
  o nome do pacote de trabalho no registro.

Estado do git: `main` em `b04217b`, **7 commits à frente do GitHub, sem push** (o git é o único
backup deste Mac — perguntar ao fundador e fazer o push).

Suíte: 382 testes — 374 passam, 1 falha conhecida (`docs/research/bmr-calculator/reference/energy.test.ts`),
7 todo. `npx expo export --platform ios` passa.

## 2. Feito nesta sessão

| Item | Estado | Commit |
|---|---|---|
| S-17 (A-40) "Pendente de ontem" | FECHADO com testes de relógio simulado (o fundador dispensou a espera de 12 h no aparelho) | d38f2bd |
| A-55 / FX-21 (item 26 do design) local digitado não é mais apagado | Construído, testes vermelho → verde | 7a584fe |
| S-20 (A-39) seletor de local após "Marcar como tomado" | CONSTRUÍDO (não fechado — ver seção 5) | bda1baf |
| S-18 (A-43) dose registrada cedo no mesmo dia não gera "Perdida" falsa | FECHADO | b04217b |
| Registro: itens 23/24/26/29 do design dentro do 1.2.5 (S-21..S-24, FX-17..FX-21) | Registrado | bc61a08 |
| Registro: um envio só; versão 1.3.0 | Registrado | e4ce7df, d51166d |

## 3. Decisões do fundador (não perguntar de novo)

**Lançamento**
- O 1.2.5 NÃO vai sozinho para as lojas. Terminar o 1.2.5 no `main` → redesign no
  `redesign/graduated` (fazer merge do `main` antes) → UM envio, versão 1.3.0.
- Nunca fazer merge do código de app do branch `design/hybrid` (experimento antigo). Só `docs/design`.
- No `main`, S-20 e os demais são **só comportamento**, com o mínimo de ligação na tela atual.
  O visual novo (seletor com manequins etc., item 27) fica para o `redesign/graduated`.

**Itens do design que entraram no 1.2.5**
- Item 26 → dentro do S-20 (feito).
- Item 23 → S-21: links "Termos de Uso (EULA)" e "Política de Privacidade" no paywall, 6 idiomas,
  iOS e Android. Renomear Pro → Premium no App Store Connect é tarefa de console, não de código.
- Item 29 → S-22: "Pro" → "Premium" em todo o texto; `settings_premium_feat_3` = "AI food log,
  every day". O fundador aprova o texto nos 6 idiomas ANTES do commit.
- Item 24 em duas partes:
  - S-23 (servidor): Premium = 20 scans/mês via checagem do RevenueCat em `extract-bloodwork`;
    grátis continua 3. Precisa da **chave secreta do RevenueCat** (o fundador coloca direto nos
    secrets do Supabase — nunca colar no chat). Gate B. Pode ir ao ar antes do build.
  - S-24 (texto): "Unlimited scans" → "20 scans a month", 6 idiomas. Só entra se o S-23 já
    estiver no ar e verificado.
  - Hoje (verificado): o servidor limita TODOS a 3 scans (`extract-bloodwork/index.ts:14`),
    enquanto ~15 textos prometem "ilimitado" ao Premium.

**S-17 (Pendente de ontem)**
- Opção 1: o bloco aparece da meia-noite até o horário da dose + 12 h.
- "Tomada" registra no horário de ontem; "Pulada" grava uma linha Skipped no horário de ontem.
- Tocar "Marcar como tomado" hoje com dose pendente → pergunta: ontem (padrão) ou hoje (= pula ontem).
- Notificação tocada depois da meia-noite, dentro de +12 h → registra na dose de ontem.

**S-20 (seletor de local)** — também em `features.md`, "S-20 product decisions"
- Locais de aplicação são OPCIONAIS (ajudam no rodízio). Dose tomada pode ficar sem local.
- Cancelar / X (seletor aberto pelo "Marcar como tomado") = desfaz aquela dose + aviso.
- Pular = mantém a dose, sem local. Salvar = grava o local.
- Voltar do Android (botão ou gesto) = pede confirmação (ficar / sair); só sair confirmado desfaz.
- Seletor aberto pelo usuário ("Adicionar local", linha do Registro de doses): Cancelar / voltar só fecham.
- "Remover local": limpa o local salvo SEM desfazer a dose; trocar de local funciona igual.
- Local digitado antigo ("left glute") nunca é apagado por um Salvar vazio.
- Segurança do desfazer: cada seletor desfaz a SUA dose; o estoque volta 1 dose a partir do valor
  atual; nunca dois frascos ativos; nunca desfaz duas vezes.
- Textos ×6 aprovados: `today_pick_site_skip`, `today_take_undone`, `bodymap_remove_site`,
  `today_site_back_title/_msg/_stay/_leave`.

**S-18**
- Janela de cobertura começa no menor entre (horário − 3 h) e a meia-noite local do dia da dose.
- Linhas "Perdida" falsas que já existem NÃO são corrigidas (seria outro item).

**Regras permanentes**
- Testes só na conta de teste Test03 (evandro1985@gmail.com); confirmar na tela antes de escrever.
- Nunca escrever linhas de teste em produção via SQL. Nenhum DDL de produção sem aprovação explícita.
- Nunca digitar senhas; o fundador faz o login.
- Sem push e sem build EAS sem o "go" do fundador.
- Um item do registro por sessão; teste primeiro (vermelho → verde); suíte inteira verde.
- Cores só dos tokens de `lib/theme.js`; conferir tema claro E escuro; 6 idiomas em paridade.
- Toda resposta: parte para o fundador + nota numerada para o Grok, salva em `grok/` (próxima: **115**).

## 4. Onde paramos

S-19 (A-49, guarda de fuso horário) FECHADO em 30/09: quando o NOME do fuso do aparelho muda,
a varredura de "Perdidas" passa a começar de agora, e o bloco "Pendente de ontem" não oferece
doses de antes da troca (aprovado pelo fundador). Primeira execução só guarda o fuso; horário de
verão não dispara. Custo aceito: uma dose realmente perdida logo antes da troca pode não ser
registrada. Correção completa = A-51 (1.2.6). Não visto em aparelho.

## 5. Próximos passos, em ordem

1. S-21 (links EULA/Privacidade) e S-22 (Pro → Premium) — propor os textos ×6 e esperar aprovação.
2. S-23 (servidor, 20 scans) — pedir a chave secreta do RevenueCat de forma segura; Gate B.
   Depois S-24 (texto).
3. S-16 / FX-15 (pesagens nunca atrás do paywall) — está no escopo, ainda sem lugar na ordem.
4. Itens abertos do escopo original: S-04 a S-15 (ver tabela em `features.md`). O
   `node scripts/spec-audit.cjs` precisa passar antes de qualquer build.
5. Quando o 1.2.5 fechar: redesign tela por tela no `redesign/graduated` (Today primeiro,
   `docs/design/today-build-handoff.md` itens 1–22), o fundador confere cada tela no simulador.
6. Antes do build único (1.3.0): dt-council → ship-check → passada completa do app nos dois
   temas → "go" do fundador → build → `/tf-status`.

**Pendências de verificação para a passada pré-build (nunca vistas na tela):**
- S-17: toque real no aparelho; bloco "Pendente de ontem" no tema escuro.
- S-20: confirmação do voltar no Android (precisa de Android); rótulo do local digitado; dois
  seletores em sequência; caso do aviso "iniciar novo frasco".
- S-02: botão de ação da notificação no aparelho.
- A camada que grava no banco (`recordDoseTaken` / `recordSkipPending`) só foi verificada por
  leitura de código (teste dessa camada = A-38(a), 1.2.6).

**Aguardando o fundador:**
- Push do `main` (o push pelo Claude foi bloqueado pela permissão; rodar `git push origin main`).
- A-54: incluir idade / dia de nascimento opcional e os achados de objetivo, país/unidades e
  idioma/tema; regra de quem vence na migração.
- Onde o S-16 entra na ordem.

**Dados na conta de teste (Test03):** uma dose BPC-157 "Tomada" em 30/09 09:06 sem local (frasco
com 1 dose restante); linhas 132–138 "Perdida" falsas do teste de fuso de Tóquio (ficam; nunca
corrigir via SQL).
