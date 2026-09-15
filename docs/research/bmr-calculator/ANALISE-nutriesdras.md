# Engenharia reversa — Calculadora de Gasto Energético (nutriesdras.com)

**Fonte:** https://nutriesdras.com/calculadora/
**Motor:** módulo Joomla `mod_calculadora_gasto_energetico`, arquivo `assets/js/calculo.js` (5.448 bytes, jQuery + ionRangeSlider)
**Data da análise:** 26/08/2026
**Status:** fórmulas extraídas do código-fonte e confirmadas em 16/16 simulações (erro zero)

---

## 1. Fluxo da calculadora (4 steps)

| Step | O que coleta | Valores |
|---|---|---|
| 1 | Perfil → **escolhe a equação** | `HB`, `HB`, `MJ`, `T` |
| 2 | Gênero, idade, altura, peso | sliders |
| 3 | Fator de atividade (FA) | 1.2 / 1.4 / 1.5 / 1.7 |
| 4 | Resultado | GET, proteína, emagrecer, hipertrofia, manter |

### Step 1 — cards e o `data-valor` real

| Card exibido | Rótulo do método | `data-valor` |
|---|---|---|
| Abaixo do Peso Ideal | (Harris-Benedict) | `HB` |
| Próximo do Peso Ideal | (Harris-Benedict) | `HB` |
| Muito acima do Peso | (Mifflin-St Jeor) | `MJ` |
| Atleta | (Tinsley) | `T` |

> **Os dois primeiros cards são funcionalmente idênticos** — mesmo `data-valor`, mesmo resultado. A escolha entre "abaixo do peso" e "próximo do peso ideal" não altera nada no cálculo.

### Step 2 — ranges dos sliders

| Campo | Mín | Máx | Default | Passo |
|---|---|---|---|---|
| Gênero | Feminino (=1) / Masculino (=2) | — | Feminino | radio |
| Idade | 19 anos | 80 anos | 35 | 1 |
| Altura | 130 cm | 230 cm | 170 | 1 |
| Peso | 40 kg | 180 kg | 100 | 1 |

### Step 3 — fatores de atividade

| Rótulo | FA | Descrição |
|---|---|---|
| Sedentário | **1.2** | Pouco ou nenhum exercício |
| Pouco Ativo | **1.4** | Exercícios leves ou esportes 1-3 dias/semana |
| Moderadamente ativo | **1.5** | Exercício moderado ou esportes 3-5 dias/semana |
| Muito ativo | **1.7** | Exercícios intensos ou esportes 6-7 dias/semana |

---

## 2. As fórmulas exatas (verbatim do código)

### TMB / RMR

```
HB (Harris-Benedict ORIGINAL, 1919)
  Feminino:  TMB = 655 + (9.6 × P) + (1.9 × A) − (4.7 × I)
  Masculino: TMB = 66  + (13.8 × P) + (5.0 × A) − (6.8 × I)

MJ (Mifflin-St Jeor, 1990)
  Feminino:  TMB = (10 × P) + (6.25 × A) − (5.0 × I) − 161
  Masculino: TMB = (10 × P) + (6.25 × A) − (5.0 × I) + 5

T (Tinsley)
  Ambos os sexos: TMB = (24.8 × P) + 10
  → ignora gênero, idade e altura
```
P = peso (kg), A = altura (cm), I = idade (anos)

### Derivados

```
GET          = round(TMB × FA)          ← único arredondamento, só no final
Proteína     = round(P × 2)             ← 2 g/kg de PESO CORPORAL TOTAL, fixo
Emagrecer    = GET − 500                ← déficit absoluto fixo
Hipertrofia  = GET + 500                ← superávit absoluto fixo
Manter       = GET
```

Formatação de saída: `toLocaleString("pt-BR")` (separador de milhar com ponto).

---

## 3. Matriz de simulações — validação numérica

16 cenários executados na calculadora real vs. reimplementação em Python. **Todos bateram exatamente.**

| # | Método | Gên | Idade | Alt | Peso | FA | TMB | GET site | GET calc | ✓ |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | HB | F | 35 | 170 | 100 | 1.2 | 1773,5 | 2.128 | 2128 | ✓ |
| 2 | HB | M | 35 | 170 | 100 | 1.2 | 2058,0 | 2.470 | 2470 | ✓ |
| 3 | HB | F | 25 | 160 | 55 | 1.4 | 1369,5 | 1.917 | 1917 | ✓ |
| 4 | HB | M | 45 | 180 | 90 | 1.7 | 1902,0 | 3.233 | 3233 | ✓ |
| 5 | MJ | F | 35 | 170 | 100 | 1.2 | 1726,5 | 2.072 | 2072 | ✓ |
| 6 | MJ | M | 35 | 170 | 100 | 1.2 | 1892,5 | 2.271 | 2271 | ✓ |
| 7 | MJ | F | 60 | 155 | 120 | 1.5 | 1707,8 | 2.562 | 2562 | ✓ |
| 8 | MJ | M | 19 | 190 | 140 | 1.7 | 2497,5 | 4.246 | 4246 | ✓ |
| 9 | T | F | 35 | 170 | 100 | 1.2 | 2490,0 | 2.988 | 2988 | ✓ |
| 10 | T | M | 35 | 170 | 100 | 1.2 | 2490,0 | 2.988 | 2988 | ✓ |
| 11 | T | F | 80 | 130 | 40 | 1.7 | 1002,0 | 1.703 | 1703 | ✓ |
| 12 | T | M | 19 | 230 | 180 | 1.2 | 4474,0 | 5.369 | 5369 | ✓ |
| 13 | HB | F | 19 | 130 | 40 | 1.2 | 1196,7 | 1.436 | 1436 | ✓ |
| 14 | HB | M | 80 | 230 | 180 | 1.7 | 3156,0 | 5.365 | 5365 | ✓ |
| 15 | MJ | F | 19 | 130 | 40 | 1.2 | 956,5 | 1.148 | 1148 | ✓ |
| 16 | MJ | M | 80 | 230 | 180 | 1.7 | 2842,5 | 4.832 | 4832 | ✓ |

**Confirmações dos cenários 9 e 10:** Tinsley produz resultado idêntico para F e M — confirma que gênero/idade/altura são descartados.

---

## 4. Achados críticos e oportunidades para o Dosetrace

### 4.1 Riscos de segurança clínica (prioridade máxima)

**A. Déficit fixo de 500 kcal sem piso de segurança.**
Cenário 15 (mulher, 19a, 130cm, 40kg, sedentária): GET = 1.148 → **"para emagrecer: 648 kcal/dia"**. Isso está muito abaixo de qualquer piso clínico razoável (≈1.200 kcal/dia para mulheres, ≈1.500 para homens) e é prescrito sem qualquer alerta.
→ *No Dosetrace:* usar **déficit percentual (15–25% do GET)** em vez de valor absoluto, com **piso rígido**: nunca abaixo da TMB, e nunca abaixo de 1.200/1.500 kcal.

**B. Proteína a 2 g/kg de peso corporal total, sem teto.**
Cenário 12 (180 kg) → **360 g de proteína/dia**. Para pessoas com obesidade isso é irreal e clinicamente inadequado.
→ *No Dosetrace:* calcular sobre **massa magra** ou **peso ajustado** (`peso ideal + 0,25 × (peso real − peso ideal)`) quando IMC ≥ 30, e escalonar o coeficiente por objetivo (1,6–2,2 g/kg conforme cutting/manutenção/bulking) em vez de 2,0 fixo.

### 4.2 Erros de lógica / UX

**C. Dois cards idênticos.** "Abaixo do peso ideal" e "Próximo do peso ideal" retornam exatamente o mesmo número. O usuário acredita que a escolha importa.
→ *No Dosetrace:* ou diferenciar de fato (ex.: abaixo do peso → HB; próximo do ideal → Mifflin, que é o padrão-ouro para eutróficos), ou **selecionar a equação automaticamente pelo IMC calculado** em vez de pedir autopercepção ao usuário. A autopercepção de "estou muito acima do peso" é notoriamente imprecisa e aqui ela muda o resultado em até ~200 kcal.

**D. `valorStep3` é string, não número.** `gastoEnergetico * valorStep3` funciona só por coerção do JS. Se nenhum FA for selecionado, `valorStep3 = 0` → GET = 0. O `disabled` do botão é a única proteção.

**E. Sem validação, sem persistência, sem unidades imperiais, sem estado na URL.** Cada visita recomeça do zero; não dá para compartilhar/reabrir um resultado.

### 4.3 Escolhas metodológicas discutíveis

**F. Harris-Benedict na versão original de 1919 — e o problema não é a versão.**

> ⚠️ **Correção.** Numa versão anterior desta análise eu afirmei que trocar a HB original pela revisão de **Roza & Shizgal (1984)** mudaria a TMB em ~380 kcal. **Isso estava errado** — foi um erro aritmético meu, pego depois pela suíte de testes. Os números reais, medidos em 10 perfis:

```
Fem:  447,593 + (9,247 × P) + (3,098 × A) − (4,330 × I)
Masc:  88,362 + (13,397 × P) + (4,799 × A) − (5,677 × I)
```

| Comparação | Diferença mín | máx | média |
|---|---|---|---|
| HB 1984 − HB 1919 | −58,8 | +0,4 | **−25,2 kcal** |
| Mifflin − HB 1919 | −321,3 | −47,0 | **−155,8 kcal** |

A revisão de 1984 é uma recalibração modesta: dezenas de kcal, não centenas. **Trocar 1919 → 1984 não é onde está o ganho.**

O achado que de fato importa é o da segunda linha: a Harris-Benedict — em *qualquer* versão — **superestima sistematicamente** em relação à Mifflin-St Jeor, com média de ~156 kcal e picos de 321 kcal. Como o nutriesdras aplica HB em dois dos quatro perfis (incluindo "próximo do peso ideal", que é o caso mais comum), a calculadora deles tende a inflar o gasto justamente na população maior. É por isso que a recomendação abaixo é usar Mifflin como padrão para adultos, e não simplesmente atualizar a versão da HB.

**G. Fatores de atividade não-padrão.** Os FA clássicos são 1,2 / 1,375 / 1,55 / 1,725 / 1,9. O site usa 1,2 / 1,4 / 1,5 / 1,7 — arredondados e **sem o nível "extremamente ativo" (1,9)**, o que teto-limita atletas de alto volume. Note também que 1,4→1,5 é um degrau de só 0,1 enquanto 1,5→1,7 é 0,2: a escala é irregular.

**H. Tinsley para "Atleta" usa peso corporal total.** A equação `24,8 × P + 10` corresponde à versão baseada em massa corporal de Tinsley et al. (2019). ⚠️ *Não consegui abrir o texto completo do artigo para confirmar os coeficientes — vale checar antes de replicar.* O ponto relevante: existe também a variante baseada em **massa livre de gordura** (`≈25,9 × MLG + 284`), consideravelmente mais precisa para atletas. Usar peso total num atleta com maior % de gordura infla bastante o resultado.
→ *No Dosetrace:* se você tiver %gordura (bioimpedância, dobras), oferecer **Katch-McArdle / Cunningham** (`370 + 21,6 × MLG`), que é o padrão para populações treinadas.

**I. Ausências relevantes.** Não há: IMC, faixa de peso ideal, distribuição de macros (só proteína — falta gordura e carboidrato), TDEE por dia da semana, projeção de perda/ganho ao longo do tempo, nem água.

### 4.4 O que vale copiar (é bom)

1. **Seleção de equação por perfil** é a ideia central e é boa — a literatura de fato recomenda equações diferentes por população (Mifflin para obesidade, Cunningham/Tinsley para atletas). A execução é que falha.
2. **Arredondamento só no final** — evita acúmulo de erro. Mantenha isso.
3. **Fluxo em steps com um dado por tela** e sliders em vez de campos numéricos — reduz atrito e entrada inválida. Boa referência de UX.
4. **Rotular a equação embaixo de cada card** — transparência metodológica que a maioria das calculadoras não tem.
5. **Entregar 3 metas de calorias** (emagrecer/manter/hipertrofia) na mesma tela, em vez de exigir que o usuário escolha o objetivo antes.

---

## 5. Especificação sugerida para o Dosetrace (rascunho para o handoff)

```
ENTRADAS
  sexo, idade, altura_cm, peso_kg
  percentual_gordura (opcional) → habilita Katch-McArdle/Cunningham e Tinsley-MLG
  nivel_atividade (5 níveis, FA padrão)
  objetivo (perder / manter / ganhar)

SELEÇÃO DE EQUAÇÃO (automática pelo IMC, com override manual)
  IMC < 18,5            → Harris-Benedict revisada (Roza & Shizgal 1984)
  18,5 ≤ IMC < 30       → Mifflin-St Jeor        ← padrão para a maioria
  IMC ≥ 30              → Mifflin-St Jeor com peso real
  atleta / %gordura ok  → Cunningham (370 + 21,6 × MLG)
  (o ganho real vem de usar Mifflin em vez de Harris-Benedict,
   não de atualizar a versão da Harris-Benedict — ver seção 4.3-F)

FA (padrão da literatura)
  1,2 / 1,375 / 1,55 / 1,725 / 1,9

SAÍDAS
  TMB, GET
  meta_kcal = GET × (1 − deficit%) | GET | GET × (1 + surplus%)
    deficit  = 15–25%, com PISO: max(meta, TMB, 1200♀/1500♂)
    surplus  = 10–20%
  macros:
    proteína  = coef × (MLG se disponível, senão peso ajustado se IMC≥30, senão peso)
                coef: 1,6 ganho / 1,8–2,2 cutting / 1,6 manutenção
    gordura   = 20–30% das kcal (mín. 0,6 g/kg)
    carboidrato = restante
  IMC + faixa de peso ideal
  projeção de peso em 4/8/12 semanas

REGRAS DE SEGURANÇA (bloqueantes)
  - nunca prescrever abaixo de TMB
  - nunca abaixo de 1200 kcal (♀) / 1500 kcal (♂)
  - teto de proteína (ex.: 2,5 g/kg de MLG)
  - disclaimer: estimativa, não substitui avaliação profissional
```

---

## 6. Referências

- Mifflin MD, St Jeor ST, et al. (1990) — equação Mifflin-St Jeor
- Roza AM, Shizgal HM (1984) — revisão da Harris-Benedict
- Tinsley GM, Graybeal AJ, et al. (2019). *Resting metabolic rate in muscular physique athletes: validity of existing methods and development of new prediction equations.* Appl Physiol Nutr Metab. doi:10.1139/apnm-2018-0412 — https://cdnsciencepub.com/doi/abs/10.1139/apnm-2018-0412
- Cunningham JJ (1991) — equação sobre massa livre de gordura (frequentemente citada como "Katch-McArdle")
- Comparativo de equações em atletas: https://link.springer.com/article/10.1007/s40279-023-01896-z
- Coeficientes Harris-Benedict revisada / Mifflin / Cunningham: https://www.fatcalc.com/rmr-calculator
