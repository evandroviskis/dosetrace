# HANDOFF → Claude Code · Calculadora de gasto energético do DoseTrace

**De:** sessão Cowork, 26/08/2026
**Para:** Claude Code, trabalhando em `~/Desktop/DoseTrace`
**Solicitante:** Evandro

---

## ⛔ Regra número um desta tarefa

**NÃO altere o comportamento da calculadora atual do app.**

Este handoff é um **pacote de conhecimento**, não uma ordem de refatoração. O Evandro quer tudo catalogado no projeto para decidir depois, com calma, o que vale mudar. Seu trabalho aqui é *arquivar e auditar*, não *corrigir*.

Se ao ler o código você achar um bug que queira consertar: **anote no relatório de auditoria e siga em frente.** A decisão é dele.

O único código novo que você vai adicionar é um módulo isolado, sem imports em nenhuma tela — inerte até alguém decidir integrá-lo.

---

## 1. O que aconteceu antes deste handoff

O Evandro pediu uma engenharia reversa da calculadora de **nutriesdras.com/calculadora**, que ele quer usar como referência para melhorar a calculadora de TMB que já existe no DoseTrace.

Foi feito, via automação de browser:

1. Extraído o código-fonte real do motor de cálculo — módulo Joomla `mod_calculadora_gasto_energetico`, arquivo `assets/js/calculo.js` (5.448 bytes, jQuery + ionRangeSlider).
2. Lidas as tabelas de `data-valor` dos cards de perfil e de nível de atividade.
3. Rodados **16 cenários** na calculadora real, cobrindo os 3 métodos, ambos os sexos e os extremos de todos os sliders.
4. Reimplementadas as fórmulas e confrontadas com os 16 resultados: **16/16 exatos, erro zero.**

As fórmulas neste handoff não são inferência estatística nem chute a partir de saídas. São o código-fonte deles, confirmado empiricamente.

---

## 2. O que a calculadora do nutriesdras faz

Fluxo de 4 telas. A tela 1 escolhe o perfil — e a **única** função dessa escolha é selecionar qual equação será usada.

| Card exibido | `data-valor` | Equação |
|---|---|---|
| Abaixo do Peso Ideal | `HB` | Harris-Benedict 1919 |
| Próximo do Peso Ideal | `HB` | **idêntica à de cima** |
| Muito acima do Peso | `MJ` | Mifflin-St Jeor |
| Atleta | `T` | Tinsley (massa corporal) |

```
HB  ♀  TMB = 655 + (9,6 × P) + (1,9 × A) − (4,7 × I)
    ♂  TMB = 66  + (13,8 × P) + (5,0 × A) − (6,8 × I)

MJ  ♀  TMB = (10 × P) + (6,25 × A) − (5,0 × I) − 161
    ♂  TMB = (10 × P) + (6,25 × A) − (5,0 × I) + 5

T   ambos: TMB = (24,8 × P) + 10      ← ignora sexo, idade e altura

GET         = round(TMB × FA)     FA ∈ {1,2 · 1,4 · 1,5 · 1,7}
Proteína    = round(P × 2)        ← peso corporal TOTAL, coeficiente fixo
Emagrecer   = GET − 500           ← valor absoluto, sem piso
Hipertrofia = GET + 500
Manter      = GET
```

P = peso (kg) · A = altura (cm) · I = idade (anos)

Ranges dos sliders: idade 19–80 · altura 130–230 cm · peso 40–180 kg.

---

## 3. Os problemas que essa calculadora tem

Vale conhecê-los porque **é bem possível que a calculadora do DoseTrace tenha os mesmos** — várias dessas são as escolhas ingênuas padrão de qualquer calculadora de TMB.

### 3.1 Riscos clínicos

**Déficit fixo de 500 kcal sem piso de segurança.** É a falha mais grave. Cenário real medido no site — mulher, 19 anos, 130 cm, 40 kg, sedentária: GET 1.148 → o site prescreve **648 kcal/dia para emagrecer**, sem qualquer alerta. Um valor absoluto aplicado a um TDEE pequeno produz prescrições perigosas, e não há piso nem checagem contra a própria TMB.

**Proteína a 2 g/kg de peso total, sem teto.** Pessoa de 180 kg → **360 g de proteína/dia**. Em obesidade, o coeficiente tem que incidir sobre massa magra ou peso ajustado, nunca sobre peso total.

### 3.2 Erros de lógica

**Dois cards são o mesmo botão.** "Abaixo do peso ideal" e "próximo do peso ideal" têm `data-valor="HB"` os dois. O usuário acredita que a escolha importa; ela não muda nada.

**A equação é escolhida por autopercepção.** Perguntar "qual condicionamento mais se assemelha ao seu?" delega ao usuário uma decisão técnica que o app pode tomar sozinho com o IMC — e autopercepção de peso corporal é notoriamente imprecisa.

**`valorStep3` é string.** `gastoEnergetico * valorStep3` só funciona por coerção do JS. Se nenhum FA for selecionado, o valor é `0` e o GET zera. A única proteção é o `disabled` do botão.

### 3.3 Escolhas metodológicas discutíveis

**Harris-Benedict superestima.** Medido em 10 perfis, a HB devolve em média **156 kcal a mais** que a Mifflin-St Jeor, chegando a 321 kcal. Como o site aplica HB em dois dos quatro perfis — incluindo o caso mais comum —, tende a inflar o gasto na maior parte da base.

> **Correção registrada:** numa primeira versão da análise eu afirmei que trocar a HB de 1919 pela revisão Roza & Shizgal de 1984 mudaria a TMB em ~380 kcal. **Estava errado**, foi erro aritmético meu, pego depois pela suíte de testes. A diferença real entre as duas versões da HB é de ~25 kcal em média (máximo 59). Trocar a *versão* da HB não resolve nada; trocar HB *por Mifflin* é que resolve. Deixo o erro registrado porque o número errado pode ter circulado.

**Fatores de atividade fora do padrão.** O site usa 1,2 / 1,4 / 1,5 / 1,7. A escala canônica é 1,2 / 1,375 / 1,55 / 1,725 / 1,9. Os deles têm degraus irregulares (0,2 · 0,1 · 0,2) e não têm o nível superior, o que teto-limita atletas de alto volume.

**Tinsley sobre peso total.** Para o perfil "Atleta" eles usam `24,8 × P + 10`, que penaliza quem carrega mais gordura. Existe a variante sobre massa livre de gordura, mais precisa. ⚠️ Os coeficientes batem com o comportamento do site, mas **não** foram confirmados contra o texto completo do artigo (Tinsley et al. 2019, doi:10.1139/apnm-2018-0412 — paywall). Tratar como não-verificado.

**Ausências.** Sem IMC, sem faixa de peso ideal, sem gordura e carboidrato (só proteína), sem projeção temporal, sem disclaimer clínico.

### 3.4 O que eles fizeram bem

Vale copiar: **escolher a equação por perfil** é conceitualmente certo e bem apoiado na literatura — só a execução falha; **arredondar só no final**, evitando acúmulo de erro; **um dado por tela com sliders** em vez de campos numéricos livres; **mostrar o nome da equação** sob cada card, transparência que quase nenhuma calculadora tem; e **entregar as três metas juntas** em vez de exigir que o usuário escolha o objetivo antes.

---

## 4. O que está neste pacote

```
HANDOFF.md                  este documento
ANALISE-nutriesdras.md      análise longa, com a matriz completa dos 16 cenários
src/energy.ts               módulo de cálculo de referência (TypeScript puro)
tests/energy.test.ts        46 testes, todos passando
```

### `src/energy.ts`

Módulo **puro**: zero imports de React, React Native, Expo ou Supabase. Só funções e tipos.

Contém as seis equações (HB 1919, HB 1984, Mifflin-St Jeor, Tinsley-BM, Tinsley-FFM, Cunningham), seleção automática por IMC com override manual, os fatores de atividade canônicos, cálculo completo de macros e as guardas de segurança.

Duas peças que merecem atenção:

- **`calculateEnergy(input)`** — a entrada principal. Devolve TMB, TDEE, metas para os três objetivos, macros, IMC, faixa de peso saudável e um array `warnings[]`. Os warnings existem por razão de segurança clínica; se algum dia isso for para a UI, eles precisam aparecer.
- **`nutriesdrasReference(...)`** — reproduz o cálculo do site **exatamente**, incluindo as partes erradas. Serve para provar que a engenharia reversa está correta e para montar comparativos lado a lado. Não é para produção, e está marcado como tal.

### `tests/energy.test.ts`

46 testes sem framework, rodando em Node 22+:

```bash
node --experimental-strip-types tests/energy.test.ts
```

Os 16 primeiros são o contrato mais importante do pacote: os cenários medidos no site real. **Se algum deles quebrar, a engenharia reversa está errada.** Os demais cobrem as guardas de segurança, a seleção de equação, os utilitários e a validação de entrada.

Foi um desses testes que pegou o erro de aritmética descrito em 3.3 — vale manter a suíte viva por isso.

Para integrar ao Jest do projeto, troque os blocos `scenario(...)` por `it(...)`. Os dados e os valores esperados não mudam.

---

## 5. Sua tarefa

### 5.1 Arquivar o pacote

Coloque os quatro arquivos no projeto, em um diretório de documentação/referência. Sugestão, adapte à convenção que já existir no repo:

```
docs/research/bmr-calculator/
  HANDOFF.md
  ANALISE-nutriesdras.md
  reference/energy.ts
  reference/energy.test.ts
```

`energy.ts` **não deve ser importado por nenhuma tela.** Se o linter reclamar de arquivo órfão, adicione um ignore com comentário explicando que é referência, não código morto.

### 5.2 Auditar a calculadora atual do DoseTrace

Esta é a metade que falta do "banco de dados" — sem ela o Evandro só tem informação sobre a calculadora dos outros.

Localize a calculadora de TMB existente no app (procure por `bmr`, `tmb`, `metabolic`, `calorie`, `tdee`, `harris`, `mifflin`) e produza `docs/research/bmr-calculator/AUDITORIA-dosetrace.md` respondendo:

**Sobre o cálculo**
- Qual(is) equação(ões) usa, e onde exatamente estão no código (arquivo + linha)?
- Como o usuário escolhe a equação — ou é fixa?
- Que fatores de atividade usa, e quais valores exatos?
- Calcula macros? Proteína sobre qual base, com qual coeficiente?
- Como calcula déficit e superávit — percentual ou absoluto?
- Onde arredonda?

**Sobre segurança** — cada item com resposta sim/não e a evidência no código:
- Existe piso calórico absoluto?
- Existe checagem contra a própria TMB?
- Existe teto de proteína?
- A entrada é validada (ranges, NaN, negativos)?
- Existe disclaimer de que é estimativa?

**Sobre a estrutura**
- A lógica está separada da UI ou embutida no componente?
- Existe teste? Qual cobertura?
- O resultado é persistido no Supabase? Em qual tabela/coluna?
- Tem i18n nas seis línguas do app?

**Comparativo** — rode os mesmos perfis do módulo de referência pela calculadora atual do app e monte uma tabela de três colunas: **DoseTrace hoje · nutriesdras · módulo de referência**. Essa tabela é o principal insumo da decisão dele. Se a lógica atual estiver acoplada demais à UI para ser chamada isolada, diga isso em vez de forçar — já é um achado relevante.

**Fecho** — uma lista priorizada de divergências, cada uma marcada como `[segurança]`, `[precisão]` ou `[funcionalidade]`, **sem implementar nenhuma**.

### 5.3 Não faça

- Não modifique a calculadora existente
- Não troque equações, fatores ou coeficientes
- Não mexa em telas, navegação ou schema do Supabase
- Não integre `energy.ts` a nada
- Não instale dependências

---

## 6. Perguntas em aberto para o Evandro

Levante-as no fim da auditoria, não decida por ele:

1. **%gordura corporal** — o DoseTrace já coleta ou tem como coletar? É o que destrava Cunningham/Katch-McArdle, bem mais preciso para o público de peptídeos e provavelmente o maior ganho isolado de precisão disponível.
2. **Público-alvo real** — usuários de protocolos de peptídeos tendem a ser treinados e a monitorar composição corporal. Isso empurra a escolha default de equação para longe da Mifflin.
3. **Posicionamento clínico** — um app que trata de protocolos hormonais e de bloodwork tem exposição maior que uma calculadora de blog. Vale calibrar o quão conservadoras devem ser as guardas.
4. **Bloodwork** — já existe extração de PDF de exames via Claude API. Marcadores de tireoide (TSH, T3, T4) afetam gasto energético de forma relevante. Existe aí um cruzamento que nenhuma calculadora genérica consegue fazer, e que seria diferencial real do DoseTrace.

---

## 7. Referências

- Mifflin MD, St Jeor ST, et al. (1990) — Mifflin-St Jeor
- Roza AM, Shizgal HM (1984) — revisão da Harris-Benedict
- Cunningham JJ (1991) — equação sobre massa livre de gordura, comumente citada como "Katch-McArdle"
- Tinsley GM, Graybeal AJ, et al. (2019). *Resting metabolic rate in muscular physique athletes.* Appl Physiol Nutr Metab. doi:10.1139/apnm-2018-0412 — https://cdnsciencepub.com/doi/abs/10.1139/apnm-2018-0412 ⚠️ coeficientes não verificados no texto completo
- Comparativo de equações em atletas — https://link.springer.com/article/10.1007/s40279-023-01896-z
- Coeficientes HB revisada / Mifflin / Cunningham — https://www.fatcalc.com/rmr-calculator
- Fonte analisada — https://nutriesdras.com/calculadora/
