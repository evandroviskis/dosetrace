# Auditoria — Calculadora de gasto energético do DoseTrace

**Data:** 2026-08-26 · **Auditor:** Claude Code · **Escopo:** somente leitura — nada foi alterado.
**Par deste documento:** `ANALISE-nutriesdras.md` (a calculadora dos outros) + `reference/energy.ts` (o módulo de referência). Este arquivo é a metade que faltava: a calculadora NOSSA.

**Código auditado:** `lib/energyCalc.js` (119 linhas, motor puro) + `screens/components/CalculatorSection.js` (UI). Testes: `__tests__/energyCalc.test.js` (14 testes, todos passando em 2026-08-26).

---

## 1. Sobre o cálculo

### Equações usadas (arquivo + linha)

| Equação | Fórmula no código | Onde |
|---|---|---|
| **Katch-McArdle** | `370 + 21.6 × LBM` | `lib/energyCalc.js:16` |
| **"Cunningham"** (1980) | `500 + 22 × LBM` | `lib/energyCalc.js:18` |
| **Mifflin-St Jeor** | `10P + 6.25A − 5I ± (5/−161)` | `lib/energyCalc.js:20-23` |

⚠️ **Conflito de nomenclatura com o módulo de referência:** o que o DoseTrace chama de `katch` (370 + 21,6×MLG) é o que o `energy.ts` chama de `cunningham` (Cunningham **1991**). O que o DoseTrace chama de `cunningham` é a versão de **1980** (500 + 22×MLG), que o módulo de referência nem tem. As duas convenções existem na literatura, mas ao comparar os dois códigos é fácil se enganar. Para MLG=64 kg: 1991→1.752 kcal, 1980→1.908 kcal — **156 kcal de diferença entre "Cunninghams"**.

### Como a equação é escolhida (`computeBMR`, `lib/energyCalc.js:27-44`)

Automática **pelos dados disponíveis**, não por IMC nem por autopercepção:
1. Se há MLG (direta ou via %gordura): `katch`; com flag `resistanceTrained`: `cunningham` (1980).
2. Senão, com peso+altura+idade+sexo: `mifflin`.
3. Senão: `null` (UI não mostra resultado).

Não há override manual de equação. Não usa Harris-Benedict em nenhuma versão (**bom** — evita a superestimação sistemática do nutriesdras). A escolha por *dados disponíveis* é diferente (e mais defensável) que a escolha por IMC do módulo de referência; o que falta é só o degrau IMC≥30 para proteína (ver §2).

### Fatores de atividade (`lib/energyCalc.js:48-54`)

`1.2 / 1.375 / 1.55 / 1.725 / 1.9` — **escala canônica completa, 5 níveis** ✅ (nutriesdras: 4 níveis irregulares sem o topo). Rotulados por comportamento via i18n (`cal_act_*`).

### Macros

Só **proteína** (`proteinTarget`, `lib/energyCalc.js:69-77`):
- Com MLG: **2,0–2,4 g/kg MLG** (rec 2,2), base `lbm` ✅
- Sem MLG: **1,6–2,2 g/kg de PESO TOTAL** (rec 1,9), base `weight` ⚠️ sem peso ajustado p/ obesidade
- Coeficiente **não** varia por objetivo (o módulo de referência usa 2,0 cutting / 1,6 manutenção / 1,8 bulking).
- **Não calcula gordura nem carboidrato** (o módulo de referência calcula os três e fecha com a meta calórica).

### Déficit / superávit (`goalCalories`, `lib/energyCalc.js:61-65`)

**Percentual, nunca absoluto** ✅ — lose: −15..20% (mid −17,5%); gain: +10..15% (assimétrico de propósito, comentado no código). Melhor que os −500 fixos do nutriesdras. **Porém sem nenhum piso** (ver §2).

### Arredondamento

O motor devolve floats crus; arredonda-se **só na UI** (`CalculatorSection.js:37-38` `round10`/`round5`; snapshots com `Math.round` nas linhas 187-188). Mesma filosofia "arredonda no fim" do nutriesdras/referência ✅.

---

## 2. Sobre segurança (sim/não + evidência)

| Guarda | Existe? | Evidência |
|---|---|---|
| Piso calórico absoluto (1200♀/1500♂) | **NÃO** | `goalCalories` retorna `tdee×0.80` sem qualquer piso. **Medido:** mulher 19a/130cm/40kg sedentária → meta lose mid **947 kcal** (low 918). Mesma classe de falha do nutriesdras (lá: 648). |
| Checagem contra a própria TMB | **NÃO** | Mulher 35a/170cm/100kg sedentária: TMB 1.726, lose low **1.657** — abaixo da TMB, sem aviso. Em 3 dos 4 perfis medidos o low ficou abaixo da TMB. |
| Teto de proteína | **NÃO** | Homem 180 kg sem %gordura → rec **342 g/dia** (faixa até **396 g**) — pior que os 360 g do nutriesdras. Sem peso ajustado quando IMC≥30 (IMC nem é calculado). |
| Validação de entrada (ranges/NaN/negativos) | **PARCIAL** | Guardas de positividade e NaN funcionam (`peso NaN → bmr null` ✅). Mas **sem ranges**: idade 500 → TMB **−651 kcal** (negativa!) aceita sem erro (`lib/energyCalc.js:40` só exige `age > 0`). Os sliders/inputs da UI limitam na prática, mas o motor não se defende. |
| Disclaimer de estimativa | **SIM** | `cal_estimate_note` na UI (`CalculatorSection.js:334`) + texto "reality check, not a food tracker" no hero + comentário de contrato no topo do motor (`energyCalc.js:1-4`). |
| Citações científicas | **SIM (diferencial)** | 5 referências com DOI na UI (`REFERENCES`, `CalculatorSection.js:44-49`) — exigência 1.4.1 da Apple já atendida; nem o nutriesdras nem o módulo de referência têm isso. |

---

## 3. Sobre a estrutura

- **Lógica separada da UI:** ✅ `lib/energyCalc.js` é CommonJS puro, zero imports de RN/Expo — roda direto no Node (foi assim que esta auditoria mediu os números).
- **Testes:** ✅ `__tests__/energyCalc.test.js` — **14 testes, 14 passando**. Cobrem as equações, seleção, conversões e o reality check. **Não cobrem** os casos de segurança (não existem guardas a testar).
- **Persistência:** Supabase **`auth.users.user_metadata`**, não tabela própria: `calc_snapshots` (cap 50, `SNAP_CAP`), `calc_reality_checks`, `calc_inputs` (`CalculatorSection.js:92-96,195`). Sem RLS própria, sem sync via SQLite — é metadata do usuário.
- **i18n:** ✅ 6/6 línguas (`cal_act_sedentary` presente 6×; idem para as demais chaves `cal_*`).
- **Exclusivo nosso (nenhuma das outras duas tem):** `realityCheckTDEE` — TDEE **real** a partir de duas pesagens + ingestão reportada (`energyCalc.js:91-98`), com estados `too_short`/`maintenance`/`implausible`; e `weeklyRateKg`. É o "reality check" que o hero da UI anuncia.

---

## 4. Comparativo — mesmos perfis nas três calculadoras (objetivo: emagrecer)

Medido em 2026-08-26 rodando `lib/energyCalc.js` no Node (motor real do app, método Mifflin em todos — sem %gordura os três usam a mesma equação-base, o que isola as POLÍTICAS).

| Perfil | **DoseTrace hoje** | **nutriesdras** | **módulo de referência** |
|---|---|---|---|
| ♀ 35a · 170cm · 100kg · sed. | **1.709 kcal** · 190 g prot (peso total) | 1.628 kcal · 200 g | 1.727 kcal · **145 g** (peso ajustado) |
| ♂ 45a · 180cm · 90kg · muito ativo | **2.569 kcal** · 171 g | 1.782* kcal · 180 g | 1.805* kcal · 180 g |
| ♀ 19a · 130cm · 40kg · sed. | **947 kcal** ⚠️ · 76 g | 936** kcal ⚠️ · 80 g | **1.200 kcal (piso)** · 80 g |
| ♂ 40a · 175cm · 180kg · sed. | 2.672 kcal · **342 g prot** ⚠️ | 2.739 kcal · 360 g ⚠️ | ~2.590 kcal · **~180 g** (peso ajustado) |

\* linha do homem: nutriesdras/referência medidos com FA sedentário no teste comparativo original; DoseTrace com 1,725 — comparar a POLÍTICA, não o valor absoluto. \*\* nutriesdras com HB; com Mifflin seria 648.

**Leituras da tabela:**
1. Na mulher pequena, o percentual do DoseTrace suaviza (947 vs 648 do déficit fixo) mas **não elimina** o problema — só o piso da referência elimina.
2. Na proteína de obesidade, DoseTrace ≈ nutriesdras (342 vs 360 g) — a referência corta quase pela metade via peso ajustado.
3. No caso comum (perfil 1) as metas calóricas praticamente empatam — as divergências são de **guarda**, não de fórmula.

---

## 5. Fecho — divergências priorizadas (NADA implementado)

1. `[segurança]` **Sem piso calórico** (1200♀/1500♂) nem checagem contra a TMB — meta de 947 kcal sai hoje sem aviso. Correção pequena em `goalCalories` + 1 warning na UI.
2. `[segurança]` **Proteína sem teto e sem peso ajustado** quando IMC≥30 e %gordura ausente — 342–396 g/dia para 180 kg. Requer calcular IMC (hoje não existe) + `adjustedBodyWeight`.
3. `[segurança]` **Motor aceita idade/altura/peso fora de faixa** (idade 500 → TMB negativa). A UI protege por acaso; o motor deveria validar (a referência lança `EnergyInputError`).
4. `[precisão]` **"Cunningham" 1980 vs 1991** para treinados: +156 kcal na versão que usamos. Decidir qual variante representa melhor o público (a literatura recente prefere 1991/Katch; Tinsley-FFM fica no meio). Também: nomenclatura conflita com o módulo de referência.
5. `[precisão]` **Coeficiente de proteína não varia por objetivo** (fixo 1,9–2,2) — referência usa 2,0 cutting / 1,6 manutenção / 1,8 bulking.
6. `[funcionalidade]` **Sem gordura/carboidrato** — só proteína. Referência fecha os três macros com a meta.
7. `[funcionalidade]` **Sem IMC, faixa de peso saudável e projeção temporal** — a referência calcula IMC/faixa; projeção ninguém tem.
8. `[funcionalidade]` **Sem override manual de equação** — irrelevante para a maioria, mas a referência oferece.

**O que já está MELHOR que o nutriesdras e não deve regredir:** déficit percentual; escala FA canônica de 5 níveis; Mifflin (nunca Harris-Benedict); proteína sobre MLG quando disponível; motor puro + testado; citações científicas na UI; reality check de TDEE (exclusivo); arredondamento só no fim; i18n 6 línguas.

---

## 6. Perguntas abertas para o Evandro (do handoff §6 — sem decidir por ele)

1. **%gordura corporal** — o app JÁ coleta (`bodyFatPercent` com fonte: dexa/gym/calipers/scale). O caminho Katch/Cunningham já existe. A pergunta real vira: qual variante de Cunningham para treinados (item 4 acima)?
2. **Público-alvo** — usuários de peptídeos tendem a ser treinados e monitorar composição. Isso valoriza ainda mais decidir bem o item 4 e talvez expor Tinsley-FFM.
3. **Posicionamento clínico** — o app já é never-advisory e os textos da calculadora estão calibrados ("reality check, not a food tracker"). Adotar pisos/tetos (itens 1–2) é coerente com esse posicionamento — e ironicamente é a referência externa que está mais conservadora que nós hoje.
4. **Bloodwork × TDEE** — TSH/T3/T4 já são extraídos pelo lab journal. Cruzar tireoide com gasto energético seria diferencial real, mas toca a fronteira never-advisory (interpretar exame). Se algum dia, apenas como flag informativa "seus marcadores de tireoide existem no app; equações preditivas não os consideram", nunca como ajuste automático.
