/**
 * Testes do módulo de referência de gasto energético.
 *
 * Roda sem framework: `node --experimental-strip-types tests/energy.test.ts`
 * (Node 22+). Para integrar no DoseTrace, converta os blocos `scenario(...)`
 * em `it(...)` do Jest — os dados e os valores esperados não mudam.
 *
 * A seção 1 é o contrato mais importante: são os 16 cenários coletados
 * clicando na calculadora real do nutriesdras.com em 26/08/2026. Se algum
 * deles falhar, a engenharia reversa das fórmulas está errada.
 */

import {
  ACTIVITY_FACTORS,
  CALORIE_FLOOR,
  adjustedBodyWeight,
  calculateBmi,
  calculateEnergy,
  classifyBmi,
  cunningham,
  harrisBenedict1984,
  mifflinStJeor,
  nutriesdrasReference,
  selectEquation,
  type Sex,
} from '../src/energy.ts';

// ---------------------------------------------------------------------------
// mini harness
// ---------------------------------------------------------------------------
let passed = 0;
const failures: string[] = [];

function scenario(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
  } catch (err) {
    failures.push(`${name}\n    ${(err as Error).message}`);
  }
}

function expectEqual(actual: unknown, expected: unknown, label = ''): void {
  if (actual !== expected) {
    throw new Error(`${label} esperado ${String(expected)}, recebido ${String(actual)}`);
  }
}

function expectClose(actual: number, expected: number, tol: number, label = ''): void {
  if (Math.abs(actual - expected) > tol) {
    throw new Error(
      `${label} esperado ~${expected} (±${tol}), recebido ${actual.toFixed(2)}`,
    );
  }
}

function expectTrue(cond: boolean, label: string): void {
  if (!cond) throw new Error(label);
}

// ===========================================================================
// 1. PARIDADE COM O NUTRIESDRAS — 16 cenários medidos no site real
// ===========================================================================
// Colunas: método, sexo, idade, altura, peso, FA, TDEE observado no site.
// TDEE foi lido do label #lblGastoEnergetico. Proteína/emagrecer/hipertrofia
// conferidos nos demais labels.

interface SiteCase {
  method: 'HB' | 'MJ' | 'T';
  sex: Sex;
  age: number;
  h: number;
  w: number;
  fa: number;
  tdee: number;
}

const SITE_CASES: SiteCase[] = [
  { method: 'HB', sex: 'female', age: 35, h: 170, w: 100, fa: 1.2, tdee: 2128 },
  { method: 'HB', sex: 'male', age: 35, h: 170, w: 100, fa: 1.2, tdee: 2470 },
  { method: 'HB', sex: 'female', age: 25, h: 160, w: 55, fa: 1.4, tdee: 1917 },
  { method: 'HB', sex: 'male', age: 45, h: 180, w: 90, fa: 1.7, tdee: 3233 },
  { method: 'MJ', sex: 'female', age: 35, h: 170, w: 100, fa: 1.2, tdee: 2072 },
  { method: 'MJ', sex: 'male', age: 35, h: 170, w: 100, fa: 1.2, tdee: 2271 },
  { method: 'MJ', sex: 'female', age: 60, h: 155, w: 120, fa: 1.5, tdee: 2562 },
  { method: 'MJ', sex: 'male', age: 19, h: 190, w: 140, fa: 1.7, tdee: 4246 },
  { method: 'T', sex: 'female', age: 35, h: 170, w: 100, fa: 1.2, tdee: 2988 },
  { method: 'T', sex: 'male', age: 35, h: 170, w: 100, fa: 1.2, tdee: 2988 },
  { method: 'T', sex: 'female', age: 80, h: 130, w: 40, fa: 1.7, tdee: 1703 },
  { method: 'T', sex: 'male', age: 19, h: 230, w: 180, fa: 1.2, tdee: 5369 },
  { method: 'HB', sex: 'female', age: 19, h: 130, w: 40, fa: 1.2, tdee: 1436 },
  { method: 'HB', sex: 'male', age: 80, h: 230, w: 180, fa: 1.7, tdee: 5365 },
  { method: 'MJ', sex: 'female', age: 19, h: 130, w: 40, fa: 1.2, tdee: 1148 },
  { method: 'MJ', sex: 'male', age: 80, h: 230, w: 180, fa: 1.7, tdee: 4832 },
];

for (const c of SITE_CASES) {
  scenario(
    `[site] ${c.method} ${c.sex} ${c.age}a ${c.h}cm ${c.w}kg FA${c.fa} => ${c.tdee}`,
    () => {
      const r = nutriesdrasReference({
        method: c.method,
        sex: c.sex,
        age: c.age,
        heightCm: c.h,
        weightKg: c.w,
        activityFactor: c.fa,
      });
      expectEqual(r.tdee, c.tdee, 'TDEE:');
      expectEqual(r.protein, Math.round(c.w * 2), 'proteína:');
      expectEqual(r.lose, c.tdee - 500, 'emagrecer:');
      expectEqual(r.gain, c.tdee + 500, 'hipertrofia:');
    },
  );
}

scenario('[site] Tinsley ignora sexo, idade e altura', () => {
  const a = nutriesdrasReference({
    method: 'T', sex: 'female', age: 20, heightCm: 150, weightKg: 80, activityFactor: 1.2,
  });
  const b = nutriesdrasReference({
    method: 'T', sex: 'male', age: 70, heightCm: 200, weightKg: 80, activityFactor: 1.2,
  });
  expectEqual(a.tdee, b.tdee, 'Tinsley deveria ser idêntico:');
});

// ===========================================================================
// 2. EQUAÇÕES — valores de referência independentes
// ===========================================================================

scenario('[eq] Mifflin-St Jeor masculino', () => {
  // 10*80 + 6.25*180 - 5*30 + 5 = 800 + 1125 - 150 + 5
  expectClose(
    mifflinStJeor({ sex: 'male', age: 30, heightCm: 180, weightKg: 80 }),
    1780,
    0.01,
  );
});

scenario('[eq] Mifflin-St Jeor feminino', () => {
  // 10*65 + 6.25*165 - 5*30 - 161 = 650 + 1031.25 - 150 - 161
  expectClose(
    mifflinStJeor({ sex: 'female', age: 30, heightCm: 165, weightKg: 65 }),
    1370.25,
    0.01,
  );
});

scenario('[eq] Harris-Benedict revisada muda pouco em relação à original', () => {
  const args = { sex: 'female' as Sex, age: 35, heightCm: 170, weightKg: 100 };
  const revised = harrisBenedict1984(args);
  // original (nutriesdras) = 1773.5
  expectClose(revised, 1747.4, 0.5, 'HB1984:');
  // A revisão de Roza & Shizgal é uma recalibração modesta: a diferença fica
  // na casa das dezenas de kcal, não das centenas. Trocar 1919 -> 1984 NÃO é
  // onde está o ganho.
  expectTrue(
    Math.abs(1773.5 - revised) < 100,
    'diferença entre versões da HB deveria ser menor que 100 kcal',
  );
});

scenario('[eq] o salto relevante é Harris-Benedict -> Mifflin-St Jeor', () => {
  // Este é o achado que importa: a HB (qualquer versão) superestima
  // sistematicamente em relação à Mifflin. Em 10 perfis testados a média
  // ficou em ~156 kcal, chegando a 321 kcal.
  const args = { sex: 'male' as Sex, age: 19, heightCm: 190, weightKg: 140 };
  const hb = 2818.8; // HB1919
  const mj = mifflinStJeor(args);
  expectTrue(hb - mj > 300, `diferença HB->Mifflin foi só ${(hb - mj).toFixed(0)} kcal`);
});

scenario('[eq] Cunningham sobre massa magra', () => {
  // 370 + 21.6*64 = 370 + 1382.4
  expectClose(cunningham({ sex: 'male', age: 30, heightCm: 180, weightKg: 80, fatFreeMassKg: 64 }), 1752.4, 0.01);
});

scenario('[eq] Cunningham exige massa magra', () => {
  let threw = false;
  try {
    cunningham({ sex: 'male', age: 30, heightCm: 180, weightKg: 80 });
  } catch {
    threw = true;
  }
  expectTrue(threw, 'deveria lançar erro sem fatFreeMassKg');
});

// ===========================================================================
// 3. GUARDAS DE SEGURANÇA — a razão principal deste módulo existir
// ===========================================================================

scenario('[segurança] o caso que quebra o nutriesdras: mulher 40kg sedentária', () => {
  // No site: TDEE 1148 => "emagrecer: 648 kcal/dia". Inaceitável.
  const r = calculateEnergy({
    sex: 'female', age: 19, heightCm: 130, weightKg: 40,
    activityLevel: 'sedentary', goal: 'lose',
  });
  expectTrue(
    r.targetCalories >= CALORIE_FLOOR.female,
    `meta ${r.targetCalories} deveria respeitar o piso de ${CALORIE_FLOOR.female}`,
  );
  expectTrue(
    r.warnings.some((w) => w.code === 'CALORIE_FLOOR_APPLIED' || w.code === 'BMR_FLOOR_APPLIED'),
    'deveria emitir aviso de piso aplicado',
  );
});

scenario('[segurança] meta nunca fica abaixo da TMB', () => {
  const cases = [
    { sex: 'female' as Sex, age: 30, h: 155, w: 50 },
    { sex: 'male' as Sex, age: 45, h: 170, w: 60 },
    { sex: 'female' as Sex, age: 70, h: 150, w: 45 },
  ];
  for (const c of cases) {
    const r = calculateEnergy({
      sex: c.sex, age: c.age, heightCm: c.h, weightKg: c.w,
      activityLevel: 'sedentary', goal: 'lose',
    });
    expectTrue(
      r.targetCalories >= Math.round(r.bmr),
      `meta ${r.targetCalories} < TMB ${Math.round(r.bmr)} para ${c.sex} ${c.w}kg`,
    );
  }
});

scenario('[segurança] proteína de pessoa com obesidade não explode', () => {
  // No site: 180 kg => 360 g/dia.
  const r = calculateEnergy({
    sex: 'male', age: 40, heightCm: 175, weightKg: 180,
    activityLevel: 'sedentary', goal: 'lose',
  });
  expectTrue(
    r.macros.proteinG < 250,
    `proteína ${r.macros.proteinG}g deveria ficar bem abaixo dos 360g do site`,
  );
  expectEqual(r.macros.proteinBasis, 'adjusted_weight', 'base da proteína:');
});

scenario('[segurança] proteína usa massa magra quando %gordura é informado', () => {
  const r = calculateEnergy({
    sex: 'male', age: 30, heightCm: 180, weightKg: 90,
    bodyFatPercent: 15, isAthlete: true,
    activityLevel: 'very', goal: 'gain',
  });
  expectEqual(r.macros.proteinBasis, 'fat_free_mass', 'base da proteína:');
  expectEqual(r.equationUsed, 'cunningham', 'equação:');
  expectClose(r.fatFreeMassKg ?? 0, 76.5, 0.1, 'massa magra:');
});

scenario('[segurança] gordura respeita o piso fisiológico', () => {
  const r = calculateEnergy({
    sex: 'female', age: 30, heightCm: 160, weightKg: 55,
    activityLevel: 'sedentary', goal: 'lose',
  });
  expectTrue(r.macros.fatG >= 0.6 * 55 - 1, `gordura ${r.macros.fatG}g abaixo do piso`);
});

scenario('[segurança] macros fecham com a meta calórica', () => {
  const r = calculateEnergy({
    sex: 'male', age: 35, heightCm: 178, weightKg: 82,
    activityLevel: 'moderate', goal: 'maintain',
  });
  const kcal = r.macros.proteinG * 4 + r.macros.carbsG * 4 + r.macros.fatG * 9;
  expectClose(kcal, r.targetCalories, 15, 'soma dos macros:');
});

scenario('[segurança] sempre há disclaimer de estimativa', () => {
  const r = calculateEnergy({
    sex: 'male', age: 30, heightCm: 175, weightKg: 75,
    activityLevel: 'moderate', goal: 'maintain',
  });
  expectTrue(
    r.warnings.some((w) => w.code === 'ESTIMATE_ONLY'),
    'faltou o aviso ESTIMATE_ONLY',
  );
});

// ===========================================================================
// 4. SELEÇÃO DE EQUAÇÃO
// ===========================================================================

scenario('[seleção] abaixo do peso => Harris-Benedict revisada', () => {
  expectEqual(selectEquation({ bmi: 17, hasBodyFat: false }), 'harris_benedict_1984');
});

scenario('[seleção] eutrófico e obesidade => Mifflin-St Jeor', () => {
  expectEqual(selectEquation({ bmi: 22, hasBodyFat: false }), 'mifflin_st_jeor');
  expectEqual(selectEquation({ bmi: 34, hasBodyFat: false }), 'mifflin_st_jeor');
});

scenario('[seleção] atleta com %gordura => Cunningham', () => {
  expectEqual(
    selectEquation({ bmi: 26, hasBodyFat: true, isAthlete: true }),
    'cunningham',
  );
});

scenario('[seleção] atleta sem %gordura não cai em Cunningham', () => {
  expectEqual(
    selectEquation({ bmi: 26, hasBodyFat: false, isAthlete: true }),
    'mifflin_st_jeor',
  );
});

scenario('[seleção] override manual é respeitado', () => {
  const r = calculateEnergy({
    sex: 'female', age: 30, heightCm: 165, weightKg: 60,
    activityLevel: 'light', goal: 'maintain',
    equationOverride: 'harris_benedict_1919',
  });
  expectEqual(r.equationUsed, 'harris_benedict_1919', 'equação:');
});

// ===========================================================================
// 5. UTILITÁRIOS
// ===========================================================================

scenario('[util] IMC e classificação', () => {
  expectClose(calculateBmi(80, 180), 24.69, 0.01);
  expectEqual(classifyBmi(17), 'underweight');
  expectEqual(classifyBmi(22), 'normal');
  expectEqual(classifyBmi(27), 'overweight');
  expectEqual(classifyBmi(32), 'obese_1');
  expectEqual(classifyBmi(45), 'obese_3');
});

scenario('[util] peso ajustado só age acima do peso ideal', () => {
  // 175cm => ideal IMC22 = 67.375kg
  expectClose(adjustedBodyWeight(60, 175), 60, 0.01, 'abaixo do ideal:');
  const adj = adjustedBodyWeight(180, 175);
  expectTrue(adj > 67 && adj < 100, `peso ajustado ${adj} fora do esperado`);
});

scenario('[util] faixa de peso saudável', () => {
  const r = calculateEnergy({
    sex: 'male', age: 30, heightCm: 175, weightKg: 75,
    activityLevel: 'moderate', goal: 'maintain',
  });
  expectClose(r.healthyWeightRangeKg.min, 56.7, 0.2, 'mín:');
  expectClose(r.healthyWeightRangeKg.max, 76.3, 0.2, 'máx:');
});

scenario('[util] fatores de atividade são a escala canônica', () => {
  expectEqual(ACTIVITY_FACTORS.sedentary, 1.2);
  expectEqual(ACTIVITY_FACTORS.light, 1.375);
  expectEqual(ACTIVITY_FACTORS.moderate, 1.55);
  expectEqual(ACTIVITY_FACTORS.very, 1.725);
  expectEqual(ACTIVITY_FACTORS.extra, 1.9);
});

// ===========================================================================
// 6. VALIDAÇÃO DE ENTRADA
// ===========================================================================

const badInputs: Array<[string, () => void]> = [
  ['idade absurda', () => calculateEnergy({ sex: 'male', age: 500, heightCm: 175, weightKg: 75, activityLevel: 'moderate', goal: 'maintain' })],
  ['altura absurda', () => calculateEnergy({ sex: 'male', age: 30, heightCm: 10, weightKg: 75, activityLevel: 'moderate', goal: 'maintain' })],
  ['peso absurdo', () => calculateEnergy({ sex: 'male', age: 30, heightCm: 175, weightKg: 5, activityLevel: 'moderate', goal: 'maintain' })],
  ['NaN', () => calculateEnergy({ sex: 'male', age: NaN, heightCm: 175, weightKg: 75, activityLevel: 'moderate', goal: 'maintain' })],
  ['%gordura impossível', () => calculateEnergy({ sex: 'male', age: 30, heightCm: 175, weightKg: 75, bodyFatPercent: 95, activityLevel: 'moderate', goal: 'maintain' })],
  ['Cunningham sem %gordura', () => calculateEnergy({ sex: 'male', age: 30, heightCm: 175, weightKg: 75, activityLevel: 'moderate', goal: 'maintain', equationOverride: 'cunningham' })],
];

for (const [label, fn] of badInputs) {
  scenario(`[validação] rejeita ${label}`, () => {
    let threw = false;
    try {
      fn();
    } catch {
      threw = true;
    }
    expectTrue(threw, 'deveria ter lançado EnergyInputError');
  });
}

// ===========================================================================
// 7. COMPARATIVO — quanto muda em relação ao site
// ===========================================================================

scenario('[comparativo] tabela lado a lado', () => {
  const rows = [
    { label: 'Mulher 35a 170cm 100kg sedentária', sex: 'female' as Sex, age: 35, h: 170, w: 100 },
    { label: 'Homem 45a 180cm 90kg muito ativo', sex: 'male' as Sex, age: 45, h: 180, w: 90 },
    { label: 'Mulher 19a 130cm 40kg sedentária', sex: 'female' as Sex, age: 19, h: 130, w: 40 },
  ];
  console.log('\n  Comparativo nutriesdras vs. módulo novo (objetivo: emagrecer)');
  console.log('  ' + '-'.repeat(74));
  for (const row of rows) {
    const site = nutriesdrasReference({
      method: 'HB', sex: row.sex, age: row.age, heightCm: row.h,
      weightKg: row.w, activityFactor: 1.2,
    });
    const novo = calculateEnergy({
      sex: row.sex, age: row.age, heightCm: row.h, weightKg: row.w,
      activityLevel: 'sedentary', goal: 'lose',
    });
    console.log(`  ${row.label}`);
    console.log(
      `    site : ${site.lose} kcal, ${site.protein}g proteína` +
        (site.lose < CALORIE_FLOOR[row.sex] ? '   <-- ABAIXO DO PISO SEGURO' : ''),
    );
    console.log(
      `    novo : ${novo.targetCalories} kcal, ${novo.macros.proteinG}g proteína ` +
        `(${novo.equationUsed}, base ${novo.macros.proteinBasis})`,
    );
  }
  console.log('  ' + '-'.repeat(74));
});

// ===========================================================================

console.log(`\n${passed} passaram, ${failures.length} falharam`);
if (failures.length > 0) {
  console.log('\nFALHAS:');
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log('Todos os testes passaram.\n');
