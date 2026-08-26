/**
 * DoseTrace — Módulo de referência para cálculo de gasto energético.
 *
 * Módulo PURO: sem dependências de React, React Native, Expo ou Supabase.
 * Só funções e tipos. Pode ser importado por qualquer tela ou testado isolado.
 *
 * Origem: engenharia reversa da calculadora nutriesdras.com/calculadora
 * (fórmulas confirmadas em 16/16 simulações) + correções das falhas encontradas
 * lá. Ver HANDOFF.md e ANALISE-nutriesdras.md.
 *
 * ⚠️ Este módulo é REFERÊNCIA, ainda não está integrado. Não altere o
 * comportamento da calculadora atual do app sem decisão explícita do Evandro.
 */

// ============================================================================
// Tipos
// ============================================================================

export type Sex = 'female' | 'male';

export type Goal = 'lose' | 'maintain' | 'gain';

/** Equações de TMB/RMR suportadas. */
export type EquationId =
  | 'harris_benedict_1919' // original — usada pelo nutriesdras
  | 'harris_benedict_1984' // revisão Roza & Shizgal — mais precisa
  | 'mifflin_st_jeor' // padrão-ouro para população geral
  | 'tinsley_bm' // atletas, sobre massa corporal total
  | 'tinsley_ffm' // atletas, sobre massa livre de gordura
  | 'cunningham'; // "Katch-McArdle", sobre massa livre de gordura

/** Níveis de atividade com os fatores padrão da literatura. */
export type ActivityLevel =
  | 'sedentary'
  | 'light'
  | 'moderate'
  | 'very'
  | 'extra';

export interface EnergyInput {
  sex: Sex;
  /** anos */
  age: number;
  /** centímetros */
  heightCm: number;
  /** quilogramas */
  weightKg: number;
  activityLevel: ActivityLevel;
  goal: Goal;
  /**
   * Percentual de gordura corporal (0–100). Opcional.
   * Quando presente, habilita as equações sobre massa livre de gordura
   * (Cunningham / Tinsley-FFM), que são mais precisas.
   */
  bodyFatPercent?: number;
  /**
   * Força uma equação específica em vez da escolha automática por IMC.
   * Use para dar ao usuário um override manual.
   */
  equationOverride?: EquationId;
  /**
   * Marca o usuário como atleta/treinado. Junto com bodyFatPercent,
   * direciona para Cunningham.
   */
  isAthlete?: boolean;
}

export interface MacroTargets {
  proteinG: number;
  fatG: number;
  carbsG: number;
  /** Sobre qual peso a proteína foi calculada, e qual coeficiente foi usado. */
  proteinBasis: 'fat_free_mass' | 'adjusted_weight' | 'body_weight';
  proteinCoefficient: number;
}

export interface EnergyResult {
  /** Taxa metabólica basal / de repouso, kcal/dia (não arredondada). */
  bmr: number;
  /** Gasto energético total = bmr × fator de atividade, arredondado. */
  tdee: number;
  /** Meta calórica para o objetivo escolhido, já com as guardas aplicadas. */
  targetCalories: number;
  /** Metas para os três objetivos, para exibir lado a lado. */
  allGoals: { lose: number; maintain: number; gain: number };
  macros: MacroTargets;
  bmi: number;
  bmiCategory: BmiCategory;
  /** Faixa de peso saudável para a altura informada (IMC 18,5–24,9). */
  healthyWeightRangeKg: { min: number; max: number };
  /** Massa livre de gordura, se bodyFatPercent foi informado. */
  fatFreeMassKg?: number;
  equationUsed: EquationId;
  activityFactor: number;
  /**
   * Avisos acionados. SEMPRE exiba estes no app — vários existem por
   * razão de segurança clínica.
   */
  warnings: Warning[];
}

export interface Warning {
  code: WarningCode;
  /** Mensagem pronta em pt-BR. */
  message: string;
  severity: 'info' | 'caution';
}

export type WarningCode =
  | 'CALORIE_FLOOR_APPLIED'
  | 'BMR_FLOOR_APPLIED'
  | 'PROTEIN_CAP_APPLIED'
  | 'PROTEIN_ON_ADJUSTED_WEIGHT'
  | 'AGE_OUT_OF_VALIDATION_RANGE'
  | 'BMI_EXTREME'
  | 'ESTIMATE_ONLY';

export type BmiCategory =
  | 'underweight'
  | 'normal'
  | 'overweight'
  | 'obese_1'
  | 'obese_2'
  | 'obese_3';

// ============================================================================
// Constantes
// ============================================================================

/**
 * Fatores de atividade padrão da literatura.
 *
 * NOTA: o nutriesdras usa 1.2 / 1.4 / 1.5 / 1.7 — arredondados, com degraus
 * irregulares (0.2, 0.1, 0.2) e sem o nível "extra". Estamos usando a escala
 * canônica, que é regular e cobre atletas de alto volume.
 */
export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2, // pouco ou nenhum exercício
  light: 1.375, // exercício leve 1–3 dias/semana
  moderate: 1.55, // exercício moderado 3–5 dias/semana
  very: 1.725, // exercício intenso 6–7 dias/semana
  extra: 1.9, // trabalho físico pesado ou 2 treinos/dia
};

/**
 * Pisos calóricos absolutos. NUNCA prescrever abaixo destes valores.
 * Esta é a falha mais grave do nutriesdras: lá, uma mulher de 40 kg
 * sedentária recebe "648 kcal/dia para emagrecer", sem nenhum alerta.
 */
export const CALORIE_FLOOR: Record<Sex, number> = {
  female: 1200,
  male: 1500,
};

/** Déficit e superávit como percentual do TDEE, não valor absoluto. */
export const DEFICIT_PERCENT = 0.2; // 20% — faixa segura é 15–25%
export const SURPLUS_PERCENT = 0.12; // 12% — faixa comum é 10–20%

/** Coeficientes de proteína em g por kg da base escolhida. */
export const PROTEIN_COEFFICIENT: Record<Goal, number> = {
  lose: 2.0, // maior em déficit, para preservar massa magra
  maintain: 1.6,
  gain: 1.8,
};

/** Teto de segurança para proteína, em g/kg de massa livre de gordura. */
export const PROTEIN_CAP_PER_KG_FFM = 2.5;

/** Percentual das calorias vindo de gordura. */
export const FAT_PERCENT_OF_CALORIES = 0.25;
/** Mínimo fisiológico de gordura, g/kg de peso corporal. */
export const MIN_FAT_PER_KG = 0.6;

const KCAL_PER_G_PROTEIN = 4;
const KCAL_PER_G_CARB = 4;
const KCAL_PER_G_FAT = 9;

// ============================================================================
// Equações de TMB
// ============================================================================

export interface BmrArgs {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  /** Massa livre de gordura em kg — obrigatória para cunningham e tinsley_ffm. */
  fatFreeMassKg?: number;
}

/**
 * Harris-Benedict ORIGINAL (1919).
 * É a versão que o nutriesdras usa. Mantida aqui só para paridade/comparação —
 * superestima em ~380 kcal no cenário padrão. Prefira a de 1984.
 */
export function harrisBenedict1919({ sex, age, heightCm, weightKg }: BmrArgs): number {
  return sex === 'female'
    ? 655 + 9.6 * weightKg + 1.9 * heightCm - 4.7 * age
    : 66 + 13.8 * weightKg + 5.0 * heightCm - 6.8 * age;
}

/** Harris-Benedict revisada por Roza & Shizgal (1984). */
export function harrisBenedict1984({ sex, age, heightCm, weightKg }: BmrArgs): number {
  return sex === 'female'
    ? 447.593 + 9.247 * weightKg + 3.098 * heightCm - 4.33 * age
    : 88.362 + 13.397 * weightKg + 4.799 * heightCm - 5.677 * age;
}

/** Mifflin-St Jeor (1990). Padrão-ouro para adultos não-atletas. */
export function mifflinStJeor({ sex, age, heightCm, weightKg }: BmrArgs): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5.0 * age;
  return sex === 'female' ? base - 161 : base + 5;
}

/**
 * Tinsley — versão sobre massa corporal total. É a que o nutriesdras usa
 * para o perfil "Atleta". Ignora sexo, idade e altura.
 *
 * ⚠️ Coeficientes conferidos contra o comportamento do nutriesdras, mas NÃO
 * contra o texto completo do artigo (Tinsley et al. 2019, doi:10.1139/apnm-2018-0412
 * — paywall). Confirme antes de usar em produção.
 */
export function tinsleyBodyMass({ weightKg }: BmrArgs): number {
  return 24.8 * weightKg + 10;
}

/**
 * Tinsley — versão sobre massa livre de gordura. Mais precisa que a de massa
 * corporal para atletas, porque não penaliza quem carrega mais gordura.
 * ⚠️ Mesma ressalva de verificação dos coeficientes.
 */
export function tinsleyFatFreeMass({ fatFreeMassKg }: BmrArgs): number {
  if (fatFreeMassKg == null) {
    throw new Error('tinsley_ffm requer fatFreeMassKg');
  }
  return 25.9 * fatFreeMassKg + 284;
}

/**
 * Cunningham (1991) — frequentemente citada como "Katch-McArdle".
 * Padrão para populações treinadas quando há %gordura confiável.
 */
export function cunningham({ fatFreeMassKg }: BmrArgs): number {
  if (fatFreeMassKg == null) {
    throw new Error('cunningham requer fatFreeMassKg');
  }
  return 370 + 21.6 * fatFreeMassKg;
}

const EQUATIONS: Record<EquationId, (args: BmrArgs) => number> = {
  harris_benedict_1919: harrisBenedict1919,
  harris_benedict_1984: harrisBenedict1984,
  mifflin_st_jeor: mifflinStJeor,
  tinsley_bm: tinsleyBodyMass,
  tinsley_ffm: tinsleyFatFreeMass,
  cunningham,
};

export function calculateBmr(equation: EquationId, args: BmrArgs): number {
  return EQUATIONS[equation](args);
}

// ============================================================================
// Seleção automática de equação
// ============================================================================

/**
 * Escolhe a equação pelo IMC calculado, não pela autopercepção do usuário.
 *
 * O nutriesdras pergunta "qual condicionamento mais se assemelha ao seu?" e
 * deixa o usuário escolher — mas autopercepção de peso é notoriamente
 * imprecisa, e ali essa escolha muda o resultado em até ~200 kcal. Pior:
 * dois dos quatro cards deles retornam exatamente o mesmo número.
 *
 * Mantenha um override manual disponível na UI, mas com este default.
 */
export function selectEquation(params: {
  bmi: number;
  hasBodyFat: boolean;
  isAthlete?: boolean;
}): EquationId {
  const { bmi, hasBodyFat, isAthlete } = params;

  // Com %gordura confiável em pessoa treinada, a equação sobre massa magra ganha.
  if (isAthlete && hasBodyFat) return 'cunningham';

  if (bmi < 18.5) return 'harris_benedict_1984';

  // Mifflin-St Jeor cobre bem tanto eutróficos quanto obesidade,
  // usando peso REAL (não ajustado) — é a recomendação corrente.
  return 'mifflin_st_jeor';
}

// ============================================================================
// Utilitários corporais
// ============================================================================

export function calculateBmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  return weightKg / (m * m);
}

export function classifyBmi(bmi: number): BmiCategory {
  if (bmi < 18.5) return 'underweight';
  if (bmi < 25) return 'normal';
  if (bmi < 30) return 'overweight';
  if (bmi < 35) return 'obese_1';
  if (bmi < 40) return 'obese_2';
  return 'obese_3';
}

export function healthyWeightRange(heightCm: number): { min: number; max: number } {
  const m = heightCm / 100;
  return {
    min: round1(18.5 * m * m),
    max: round1(24.9 * m * m),
  };
}

export function fatFreeMass(weightKg: number, bodyFatPercent: number): number {
  return weightKg * (1 - bodyFatPercent / 100);
}

/**
 * Peso ajustado para prescrição de proteína em obesidade.
 * peso ideal + 0,25 × (peso real − peso ideal), onde peso ideal = IMC 22.
 *
 * Sem isso, "2 g/kg" vira 360 g/dia para alguém de 180 kg — que é o que o
 * nutriesdras devolve, e é irreal.
 */
export function adjustedBodyWeight(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  const idealWeight = 22 * m * m;
  if (weightKg <= idealWeight) return weightKg;
  return idealWeight + 0.25 * (weightKg - idealWeight);
}

// ============================================================================
// Cálculo principal
// ============================================================================

export function calculateEnergy(input: EnergyInput): EnergyResult {
  const warnings: Warning[] = [];
  const { sex, age, heightCm, weightKg, activityLevel, goal } = input;

  validateInput(input);

  const bmi = calculateBmi(weightKg, heightCm);
  const bmiCategory = classifyBmi(bmi);
  const ffm =
    input.bodyFatPercent != null
      ? fatFreeMass(weightKg, input.bodyFatPercent)
      : undefined;

  // ---- Equação ----
  const equationUsed =
    input.equationOverride ??
    selectEquation({ bmi, hasBodyFat: ffm != null, isAthlete: input.isAthlete });

  const bmr = calculateBmr(equationUsed, {
    sex,
    age,
    heightCm,
    weightKg,
    fatFreeMassKg: ffm,
  });

  // ---- TDEE ----
  const activityFactor = ACTIVITY_FACTORS[activityLevel];
  const tdee = Math.round(bmr * activityFactor);

  // ---- Metas calóricas, com guardas ----
  const floor = Math.max(CALORIE_FLOOR[sex], Math.round(bmr));

  const rawLose = Math.round(tdee * (1 - DEFICIT_PERCENT));
  const lose = Math.max(rawLose, floor);
  if (lose > rawLose) {
    warnings.push({
      code: rawLose < CALORIE_FLOOR[sex] ? 'CALORIE_FLOOR_APPLIED' : 'BMR_FLOOR_APPLIED',
      severity: 'caution',
      message:
        `A meta para emagrecer foi elevada para ${lose} kcal. Um déficit de ` +
        `${DEFICIT_PERCENT * 100}% resultaria em ${rawLose} kcal/dia, abaixo do ` +
        `mínimo seguro para o seu perfil.`,
    });
  }

  const allGoals = {
    lose,
    maintain: tdee,
    gain: Math.round(tdee * (1 + SURPLUS_PERCENT)),
  };
  const targetCalories = allGoals[goal];

  // ---- Macros ----
  const macros = calculateMacros({
    goal,
    targetCalories,
    weightKg,
    heightCm,
    bmi,
    fatFreeMassKg: ffm,
    warnings,
  });

  // ---- Avisos gerais ----
  if (age < 18 || age > 80) {
    warnings.push({
      code: 'AGE_OUT_OF_VALIDATION_RANGE',
      severity: 'caution',
      message:
        'Estas equações foram validadas em adultos de 18 a 80 anos. Fora dessa ' +
        'faixa a estimativa perde confiabilidade.',
    });
  }
  if (bmiCategory === 'obese_3' || bmiCategory === 'underweight') {
    warnings.push({
      code: 'BMI_EXTREME',
      severity: 'caution',
      message:
        'Seu IMC está fora da faixa em que estimativas por fórmula são mais ' +
        'confiáveis. Considere avaliação com um profissional.',
    });
  }
  warnings.push({
    code: 'ESTIMATE_ONLY',
    severity: 'info',
    message:
      'Estes valores são estimativas por equação preditiva e não substituem ' +
      'avaliação nutricional ou calorimetria indireta.',
  });

  return {
    bmr,
    tdee,
    targetCalories,
    allGoals,
    macros,
    bmi: round1(bmi),
    bmiCategory,
    healthyWeightRangeKg: healthyWeightRange(heightCm),
    fatFreeMassKg: ffm != null ? round1(ffm) : undefined,
    equationUsed,
    activityFactor,
    warnings,
  };
}

function calculateMacros(params: {
  goal: Goal;
  targetCalories: number;
  weightKg: number;
  heightCm: number;
  bmi: number;
  fatFreeMassKg?: number;
  warnings: Warning[];
}): MacroTargets {
  const { goal, targetCalories, weightKg, heightCm, bmi, fatFreeMassKg, warnings } =
    params;

  // Base da proteína, em ordem de preferência.
  let basisWeight: number;
  let proteinBasis: MacroTargets['proteinBasis'];

  if (fatFreeMassKg != null) {
    basisWeight = fatFreeMassKg;
    proteinBasis = 'fat_free_mass';
  } else if (bmi >= 30) {
    basisWeight = adjustedBodyWeight(weightKg, heightCm);
    proteinBasis = 'adjusted_weight';
    warnings.push({
      code: 'PROTEIN_ON_ADJUSTED_WEIGHT',
      severity: 'info',
      message:
        'A meta de proteína foi calculada sobre peso ajustado, não sobre o peso ' +
        'total — é o procedimento adequado quando o IMC é 30 ou maior.',
    });
  } else {
    basisWeight = weightKg;
    proteinBasis = 'body_weight';
  }

  const coefficient = PROTEIN_COEFFICIENT[goal];
  let proteinG = coefficient * basisWeight;

  // Teto de segurança.
  const capBasis = fatFreeMassKg ?? adjustedBodyWeight(weightKg, heightCm);
  const cap = PROTEIN_CAP_PER_KG_FFM * capBasis;
  if (proteinG > cap) {
    proteinG = cap;
    warnings.push({
      code: 'PROTEIN_CAP_APPLIED',
      severity: 'info',
      message: `A meta de proteína foi limitada a ${Math.round(cap)} g/dia.`,
    });
  }

  // Gordura: percentual das calorias, com piso fisiológico.
  const fatFromPercent = (targetCalories * FAT_PERCENT_OF_CALORIES) / KCAL_PER_G_FAT;
  const fatG = Math.max(fatFromPercent, MIN_FAT_PER_KG * weightKg);

  // Carboidrato: o que sobra.
  const remaining =
    targetCalories - proteinG * KCAL_PER_G_PROTEIN - fatG * KCAL_PER_G_FAT;
  const carbsG = Math.max(0, remaining / KCAL_PER_G_CARB);

  return {
    proteinG: Math.round(proteinG),
    fatG: Math.round(fatG),
    carbsG: Math.round(carbsG),
    proteinBasis,
    proteinCoefficient: coefficient,
  };
}

// ============================================================================
// Validação
// ============================================================================

export class EnergyInputError extends Error {}

function validateInput(input: EnergyInput): void {
  const { age, heightCm, weightKg, bodyFatPercent } = input;

  if (!Number.isFinite(age) || age < 1 || age > 120) {
    throw new EnergyInputError('Idade deve estar entre 1 e 120 anos.');
  }
  if (!Number.isFinite(heightCm) || heightCm < 100 || heightCm > 250) {
    throw new EnergyInputError('Altura deve estar entre 100 e 250 cm.');
  }
  if (!Number.isFinite(weightKg) || weightKg < 25 || weightKg > 300) {
    throw new EnergyInputError('Peso deve estar entre 25 e 300 kg.');
  }
  if (
    bodyFatPercent != null &&
    (!Number.isFinite(bodyFatPercent) || bodyFatPercent < 3 || bodyFatPercent > 70)
  ) {
    throw new EnergyInputError('Percentual de gordura deve estar entre 3 e 70.');
  }
  if (
    (input.equationOverride === 'cunningham' ||
      input.equationOverride === 'tinsley_ffm') &&
    bodyFatPercent == null
  ) {
    throw new EnergyInputError(
      'Esta equação exige o percentual de gordura corporal.',
    );
  }
}

// ============================================================================
// Paridade com o nutriesdras (só para comparação / testes)
// ============================================================================

/**
 * Reproduz EXATAMENTE o cálculo do nutriesdras.com, incluindo as escolhas
 * que consideramos erradas (déficit fixo de 500 kcal, proteína a 2 g/kg de
 * peso total, sem pisos).
 *
 * Serve para: (a) provar que a engenharia reversa está correta,
 * (b) mostrar lado a lado o quanto os números mudam com as correções.
 * NÃO use isto em produção.
 */
export function nutriesdrasReference(params: {
  method: 'HB' | 'MJ' | 'T';
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activityFactor: number;
}): { bmr: number; tdee: number; protein: number; lose: number; gain: number } {
  const { method, sex, age, heightCm, weightKg, activityFactor } = params;
  const args: BmrArgs = { sex, age, heightCm, weightKg };

  let bmr: number;
  if (method === 'HB') bmr = harrisBenedict1919(args);
  else if (method === 'MJ') bmr = mifflinStJeor(args);
  else bmr = tinsleyBodyMass(args);

  const tdee = Math.round(bmr * activityFactor);
  return {
    bmr,
    tdee,
    protein: Math.round(weightKg * 2),
    lose: tdee - 500,
    gain: tdee + 500,
  };
}

// ============================================================================

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
