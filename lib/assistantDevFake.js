// DEVELOPMENT ONLY — a stand-in for the protocol-assistant edge function so the assistant's
// screens can be exercised on the simulator before the function is deployed. It is used only
// when BOTH __DEV__ is true and EXPO_PUBLIC_ASSISTANT_FAKE=1 at bundle time (lib/assistantClient),
// so a production build (__DEV__ false) can never reach it. It reads a few plain phrasings with
// regular expressions and returns the same raw shape as the server; the app validates it with
// the same strict schema as a real answer (lib/assistantSchema).
const NUM = '(\\d{1,7}(?:[.,]\\d{1,6})?)';
const UNIT = '(mg|mcg|iu|ui|g)';

function fakeUnderstand(step, text) {
  const t = String(text || '').trim();
  const low = t.toLowerCase();
  if (/how much should|quanto devo|what dose|recommend/.test(low)) return { intent: 'advice' };
  if (/myself|por conta|eu mesmo/.test(low)) return { intent: 'manual' };
  const qty = new RegExp(`${NUM}\\s*${UNIT}`, 'i').exec(t);
  const ml = new RegExp(`${NUM}\\s*ml`, 'i').exec(t);
  const out = { intent: 'answer' };
  if (step === 'compound') out.compound = t.replace(/\b(powder|ready|pill)\b/gi, '').trim() || null;
  if (/powder|pó|polvo/.test(low)) out.form = 'powder';
  if (/ready|pronto|listo/.test(low)) out.form = 'ready';
  if (/pill|capsule|comprimido|tablet/.test(low)) out.form = 'pill';
  if (step === 'amount' && qty) out.amount = { text: qty[1], unit: qty[2] };
  if (step === 'conc' && qty) out.conc = { text: qty[1], unit: qty[2] };
  if (step === 'strength' && qty) out.strength = { text: qty[1], unit: qty[2] };
  if ((step === 'mix' || step === 'water' || step === 'amount') && ml) out.water = { text: ml[1] };
  if (/bac/.test(low)) out.diluent = 'bacteriostatic_water';
  if (step === 'vial_ml' && ml) out.vial_ml = { text: ml[1] };
  if (step === 'dose' && qty) {
    out.dose = { text: qty[1], unit: qty[2] };
    const per = /(a|per|por) (day|week|month|dia|semana|mês|mes)/.exec(low);
    const period = per ? ({ dia: 'day', semana: 'week', 'mês': 'month', mes: 'month' })[per[2]] || per[2] : null;
    const split = /\bin (\d{1,2})\b|\bem (\d{1,2})\b/.exec(low);
    if (/once a week|uma vez por semana/.test(low)) { out.basis = 'each'; out.period = 'week'; out.count = 1; }
    else if (/every day|daily|todo dia/.test(low)) { out.basis = 'each'; out.period = 'day'; out.count = 1; }
    else if (period) { out.basis = 'total'; out.period = period; if (split) out.count = Number(split[1] || split[2]); }
    const every = /every (\d{1,3}) days|a cada (\d{1,3}) dias/.exec(low);
    if (every) { out.basis = 'each'; out.interval_days = Number(every[1] || every[2]); }
  }
  if ((step === 'often' || step === 'spacing') && /(\d{1,3})/.test(low)) {
    const n = Number(/(\d{1,3})/.exec(low)[1]);
    out.interval_days = n;
  }
  if (step === 'count' && /(\d{1,2})/.test(low)) out.count = Number(/(\d{1,2})/.exec(low)[1]);
  if ((step === 'start' || step === 'mixed') && /(\d{1,3}) (days|dias) ago|há (\d{1,3}) dias/.test(low)) {
    const m = /(\d{1,3}) (days|dias) ago|há (\d{1,3}) dias/.exec(low);
    out.day_offset = -Number(m[1] || m[3]);
  }
  if (step === 'period' || step === 'fit_period') {
    if (/inject|aplica|each|cada vez/.test(low)) out.basis = 'each';
    else if (/week|semana/.test(low)) { out.basis = 'total'; out.period = 'week'; }
    else if (/day|dia/.test(low)) { out.basis = 'total'; out.period = 'day'; }
    else if (/month|mês|mes/.test(low)) { out.basis = 'total'; out.period = 'month'; }
  }
  return out;
}

module.exports = { fakeUnderstand };
