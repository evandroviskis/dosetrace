# Oportunidades — calculadora de energia do DoseTrace

**Data:** 2026-08-26 · Derivado de: ANALISE-nutriesdras.md + AUDITORIA-dosetrace.md + reference/energy.ts.
**Status:** catálogo para decisão do Evandro. NADA implementado.

## 🔴 Segurança (esforço pequeno, valor máximo — corrige falhas MEDIDAS nossas)
1. Piso calórico `max(meta, TMB, 1200♀/1500♂)` em `goalCalories` + aviso visível. Hoje: 947 kcal p/ mulher 40kg sem aviso.
2. Proteína sobre peso ajustado quando IMC≥30 + teto 2,5 g/kg MLG. Hoje: 342–396 g/dia p/ 180 kg. Pré-req: calcular IMC.
3. Validação de faixas no motor (idade 1–120 etc.). Hoje: idade 500 → TMB negativa. Copiar `EnergyInputError` da referência.
4. Canal `warnings[]` estruturado do motor p/ UI (códigos prontos na referência) — testável e traduzível.

## 🟡 Precisão (decidir, depois pouco código)
5. Fork Cunningham: nosso caminho "resistance trained" usa 1980 (500+22×MLG, +156 kcal); 1991 (=nosso `katch`) é a recomendada — possivelmente só APAGAR o branch 1980. Alternativa p/ atletas: Tinsley-FFM (25,9×MLG+284) ⚠️ coeficientes não verificados contra o paper (paywall).
6. Coeficiente de proteína por objetivo (2,0 cut / 1,6 manut. / 1,8 bulk) — alinha com a ISSN que já citamos.

## 🟢 Funcionalidades (já codificadas e testadas na referência)
7. IMC + faixa de peso saudável (dados já coletados).
8. Macros completos (gordura 25% kcal, piso 0,6 g/kg; carbo = resto) — fecha com a meta.
9. Três metas lado a lado (allGoals) — a melhor ideia de UX do nutriesdras. ✅ ENDOSSADO pelo Evandro (2026-08-26): ele gostou explicitamente do layout de cards do resultado deles ("feio mas fácil de ler, visão completa no final"). Direção acordada p/ a tela de resultado: grid de cards com um número grande por card, metas lose/maintain/gain simultâneas, ECO DOS INPUTS no cabeçalho (o slider de altura dele não registrou no site e o resultado saiu p/ 170cm em vez de 177 — o eco previne isso), equação nomeada no card, chips de IMC/faixa + gordura/carbo, e teaser do reality check fechando a tela.
10. Projeção de peso 4/8/12 semanas (7700 kcal/kg) — ninguém tem.
11. Override manual de equação (default continua a nossa auto-seleção por dados).

## 🔵 Diferenciais que SÓ o DoseTrace pode ter
12. **Fechar o loop do reality check:** notificação semanal de medidas (1.1) → pesagens → com 14+ dias, oferecer automaticamente "seu TDEE medido é X; a fórmula dizia Y". Aritmética sobre dados do usuário — never-advisory limpo. Headline de mercado.
13. **Flag informativa de tireoide** (TSH/T3/T4 já extraídos): "equações preditivas não consideram status tireoidiano; seus marcadores estão no lab journal". FLAG, nunca ajuste automático (fronteira never-advisory).
14. **Tendência de massa magra** a partir dos snapshots (peso+%gordura já armazenados, cap 50) — o que o público de peptídeos realmente otimiza.

## ⚪ UX a copiar do nutriesdras
15. Primeiro uso em steps (um dado por tela, sliders); formulário nas edições.
16. Portar a suíte de 46 testes da referência p/ o Jest do projeto (contrato vivo — foi ela que pegou o erro aritmético do próprio Cowork).

## Sequenciamento sugerido
- **Já (1.1/1.2):** 1–4, 5-como-deleção, 16 — só segurança+testes, superfície mínima, MAIS conservador (bom p/ App Review).
- **1.2:** 6–9, 11.
- **Diferenciais 12–14:** design pass próprio; o 12 fica armado pela notificação que já embarcou na 1.1.
