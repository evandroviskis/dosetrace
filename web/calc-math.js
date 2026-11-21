/* Public-site arithmetic. No network, no dose recommendation.
   Exact rational math: a displayed decimal is either exact or marked rounded.
   Browser: window.DoseTraceCalc. Node: module.exports. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DoseTraceCalc = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var PRESCRIBER = 'Your dose comes from your prescriber. This page only calculates with the numbers you type. It does not recommend a dose, diagnose, or interpret a lab result.';
  var SELF_USE = 'DoseTrace is for your own records. It is not for a healthcare professional dosing a patient.';
  var TABLET_NOTICE = 'This is arithmetic only. It does not mean this tablet, or any particular tablet, is suitable for splitting. Check with your prescriber or pharmacist. Do not split extended-release, enteric-coated, or other tablets that are not suitable for splitting.';
  var SYRINGE_CALIBRATION = 'Insulin-syringe units depend on the calibration printed on that syringe. U-100 means 100 units = 1 mL. U-40 means 40 units = 1 mL. Those counts are not interchangeable.';
  var LIMITATIONS = [
    'These pages do arithmetic only. They do not check whether any concentration, volume, or fraction is appropriate.',
    'Blank, zero, and negative numbers are rejected. Division by zero is not performed.',
    'A result that does not come out evenly is labeled rounded, and the exact fraction is shown beside it. Results are not rounded silently.',
    'Milligrams and micrograms convert by a factor of 1000. IU is not a mass unit and is not converted here.',
    'A comma followed by exactly three digits, such as 5,000, is read as five thousand. A dot, as in 5.000, is a decimal point, so that example is read as 5.',
    'A real syringe or tablet may not have a mark at the exact result. This page does not move the result to the nearest mark.'
  ];
  var R1000 = { n: 1000n, d: 1n };

  function gcd(a, b) {
    var t;
    while (b !== 0n) {
      t = a % b;
      a = b;
      b = t;
    }
    return a < 0n ? -a : a;
  }

  function rat(n, d) {
    if (d === 0n) throw new Error('zero denominator');
    if (d < 0n) { n = -n; d = -d; }
    var g = gcd(n < 0n ? -n : n, d);
    return { n: n / g, d: d / g };
  }

  function mul(a, b) { return rat(a.n * b.n, a.d * b.d); }
  function div(a, b) {
    if (b.n === 0n) throw new Error('division by zero');
    return rat(a.n * b.d, a.d * b.n);
  }

  function placeDecimal(digits, scale) {
    var s = digits.toString();
    if (scale === 0) return s;
    if (s.length <= scale) s = '0'.repeat(scale - s.length + 1) + s;
    var intPart = s.slice(0, s.length - scale) || '0';
    var frac = s.slice(s.length - scale).replace(/0+$/, '');
    return frac ? intPart + '.' + frac : intPart;
  }

  function formatExact(r) {
    var neg = r.n < 0n;
    var n = neg ? -r.n : r.n;
    var d = r.d;
    var sign = neg ? '-' : '';
    if (d === 1n) return { rounded: false, display: sign + n.toString(), fraction: null };
    var den = d;
    var twos = 0;
    var fives = 0;
    while (den % 2n === 0n) { den /= 2n; twos += 1; }
    while (den % 5n === 0n) { den /= 5n; fives += 1; }
    if (den === 1n) {
      var scale = Math.max(twos, fives);
      var digits = (n * (10n ** BigInt(scale))) / d;
      return { rounded: false, display: sign + placeDecimal(digits, scale), fraction: null };
    }
    var places = 6;
    var scaleN = 10n ** BigInt(places);
    var quo = (n * scaleN) / d;
    var rem = (n * scaleN) % d;
    if (rem * 2n >= d) quo += 1n;
    return {
      rounded: true,
      display: sign + placeDecimal(quo, places),
      fraction: sign + n.toString() + '/' + d.toString()
    };
  }

  function fail(code) { return { ok: false, code: code }; }

  function stripGroups(intRaw, groupChar) {
    if (intRaw === '') return null;
    var parts = intRaw.split(groupChar);
    var i;
    if (parts.length === 1) {
      return /^\d+$/.test(parts[0]) ? parts[0] : null;
    }
    if (!/^\d{1,3}$/.test(parts[0])) return null;
    for (i = 1; i < parts.length; i += 1) {
      if (!/^\d{3}$/.test(parts[i])) return null;
    }
    return parts.join('');
  }

  function digitsToRat(intDigits, fracDigits) {
    var whole = String(intDigits).replace(/^0+(?=\d)/, '');
    var frac = String(fracDigits).replace(/0+$/, '');
    if (!/^\d+$/.test(whole)) return null;
    if (frac && !/^\d+$/.test(frac)) return null;
    var numStr = frac ? whole + frac : whole;
    if (numStr.length > 18) return null;
    var n = BigInt(numStr);
    var d = frac ? 10n ** BigInt(frac.length) : 1n;
    return rat(n, d);
  }

  function interpretSeparators(s) {
    var commas = (s.match(/,/g) || []).length;
    var dots = (s.match(/\./g) || []).length;
    var lastComma;
    var lastDot;
    var dec;
    var group;
    var cut;
    var intDigits;
    var a;
    var b;
    if (commas && dots) {
      lastComma = s.lastIndexOf(',');
      lastDot = s.lastIndexOf('.');
      dec = lastComma > lastDot ? ',' : '.';
      group = dec === ',' ? '.' : ',';
      cut = s.lastIndexOf(dec);
      intDigits = stripGroups(s.slice(0, cut), group);
      if (intDigits == null) return null;
      return digitsToRat(intDigits, s.slice(cut + 1));
    }
    if (commas === 1 && dots === 0) {
      a = s.split(',');
      b = a[1];
      a = a[0];
      if (/^[1-9]\d{0,2}$/.test(a) && /^\d{3}$/.test(b)) return digitsToRat(a + b, '');
      if (/^\d+$/.test(a) && /^\d{1,2}$/.test(b)) return digitsToRat(a, b);
      if (/^0\d*$/.test(a) && /^\d+$/.test(b)) return digitsToRat(a, b);
      return null;
    }
    if (dots === 1 && commas === 0) {
      a = s.split('.');
      if (!/^\d+$/.test(a[0]) || !/^\d+$/.test(a[1])) return null;
      return digitsToRat(a[0], a[1]);
    }
    if (commas > 1 && dots === 0) {
      if (!/^\d{1,3}(,\d{3})+$/.test(s)) return null;
      return digitsToRat(s.replace(/,/g, ''), '');
    }
    if (dots > 1 && commas === 0) {
      if (!/^\d{1,3}(\.\d{3})+$/.test(s)) return null;
      return digitsToRat(s.replace(/\./g, ''), '');
    }
    if (!commas && !dots) {
      if (!/^\d+$/.test(s)) return null;
      return digitsToRat(s, '');
    }
    return null;
  }

  function parsePositive(raw) {
    if (raw == null) return fail('empty');
    var original = String(raw).trim();
    var s = original.replace(/[\s\u00a0]/g, '');
    if (!s) return fail('empty');
    if (s.length > 32) return fail('invalid');
    if (s[0] === '+' || s[0] === '-') {
      if (s[0] === '-') return fail('negative');
      s = s.slice(1);
    }
    if (!/^[0-9.,]+$/.test(s)) return fail('invalid');
    var parsed;
    try { parsed = interpretSeparators(s); } catch (e) { return fail('invalid'); }
    if (!parsed) return fail('invalid');
    if (parsed.n === 0n) return fail('zero');
    var fmt = formatExact(parsed);
    return { ok: true, code: 'ok', rat: parsed, display: fmt.display, raw: original, rounded: fmt.rounded, fraction: fmt.fraction };
  }

  function parsePositiveInteger(raw) {
    var parsed = parsePositive(raw);
    if (!parsed.ok) return parsed;
    if (parsed.rat.d !== 1n) return fail('not-whole');
    if (parsed.rat.n > 1000000n) return fail('invalid');
    return parsed;
  }

  function messageFor(field, code) {
    if (field === 'calibration' && code !== 'ok') return 'Choose a syringe calibration, or choose mL only.';
    if (code === 'not-whole') return 'Enter a whole number greater than zero.';
    if (code === 'zero' && (field === 'concentration' || field === 'volume' || field === 'denominator')) {
      return 'Enter a number greater than zero. Division by zero is not performed.';
    }
    if (code === 'empty' || code === 'zero' || code === 'negative') return 'Enter a number greater than zero.';
    return 'That entry is not a number this calculator can use. Use digits, with a dot or a comma as the decimal point.';
  }

  function bad(field, code) {
    return { ok: false, field: field, code: code, message: messageFor(field, code), notice: PRESCRIBER };
  }

  function readNote(parsed) {
    var compact = parsed.raw.replace(/[\s\u00a0]/g, '');
    if (compact === parsed.display) return '';
    return ' The entry ' + compact + ' is read as ' + parsed.display + '.';
  }

  function massUnit(unit) {
    return unit === 'mg' || unit === 'mcg';
  }

  function toMcg(parsedRat, unit) {
    return unit === 'mg' ? mul(parsedRat, R1000) : parsedRat;
  }

  function roundedClause(fmt) {
    if (!fmt.rounded) return '';
    return ' (' + fmt.fraction + ' exactly, shown as ' + fmt.display + ', rounded to 6 decimal places)';
  }

  function unitLine(volumeRat, volumeFmt, factor, name) {
    var units = mul(volumeRat, rat(BigInt(factor), 1n));
    var fmt = formatExact(units);
    var sentence;
    if (!volumeFmt.rounded && !fmt.rounded) {
      sentence = volumeFmt.display + ' mL × ' + factor + ' = ' + fmt.display + ' units on a ' + name + ' insulin syringe only (' + factor + ' units = 1 mL).';
    } else {
      sentence = fmt.fraction + ' units on a ' + name + ' insulin syringe only (' + factor + ' units = 1 mL), shown as ' + fmt.display + ' (rounded to 6 decimal places).';
    }
    return { calibration: name, display: fmt.display, rounded: fmt.rounded, fraction: fmt.fraction, sentence: sentence };
  }

  function syringeVolume(input) {
    input = input || {};
    var amount = parsePositive(input.amount);
    if (!amount.ok) return bad('amount', amount.code);
    if (!massUnit(input.amountUnit)) return bad('amountUnit', 'invalid');
    var partsRaw = input.parts == null ? '1' : String(input.parts).trim();
    if (partsRaw === '') partsRaw = '1';
    var parts = parsePositiveInteger(partsRaw);
    if (!parts.ok) return bad('parts', parts.code);
    var conc = parsePositive(input.concentration);
    if (!conc.ok) return bad('concentration', conc.code);
    if (!massUnit(input.concentrationUnit)) return bad('concentrationUnit', 'invalid');
    var cal = input.calibration;
    if (cal !== 'U-100' && cal !== 'U-40' && cal !== 'ml-only') return bad('calibration', 'invalid');

    var per = div(amount.rat, parts.rat);
    var perFmt = formatExact(per);
    var perMcg = toMcg(per, input.amountUnit);
    var concMcg = toMcg(conc.rat, input.concentrationUnit);
    var volume = div(perMcg, concMcg);
    var volumeFmt = formatExact(volume);
    var steps = [];
    var notes = readNote(amount) + readNote(conc);
    function qty(fmt, unit) {
      if (!fmt.rounded) return fmt.display + ' ' + unit;
      return fmt.fraction + ' ' + unit + ' exactly, shown as ' + fmt.display + ' ' + unit + ' (rounded to 6 decimal places)';
    }
    if (parts.rat.n !== 1n) {
      steps.push(amount.display + ' ' + input.amountUnit + ' split into ' + parts.display + ' equal parts is ' + qty(perFmt, input.amountUnit) + ' for one part.' + (notes ? notes : ''));
      notes = '';
    } else if (notes) {
      steps.push('Numbers as read.' + notes);
    }
    var concShown = conc.rounded
      ? conc.fraction + ' ' + input.concentrationUnit + '/mL exactly, shown as ' + conc.display + ' (rounded to 6 decimal places)'
      : conc.display + ' ' + input.concentrationUnit + '/mL';
    if (input.amountUnit !== input.concentrationUnit) {
      var perInConc = input.concentrationUnit === 'mg' ? div(perMcg, R1000) : perMcg;
      var perInConcFmt = formatExact(perInConc);
      steps.push(qty(perFmt, input.amountUnit) + ' = ' + qty(perInConcFmt, input.concentrationUnit) + '. The factor between mg and mcg is 1000.');
      if (!volumeFmt.rounded) {
        steps.push(qty(perInConcFmt, input.concentrationUnit) + ' ÷ ' + concShown + ' = ' + volumeFmt.display + ' mL.');
      } else {
        steps.push(qty(perInConcFmt, input.concentrationUnit) + ' ÷ ' + concShown + ' = ' + volumeFmt.fraction + ' mL exactly, shown as ' + volumeFmt.display + ' mL (rounded to 6 decimal places).');
      }
    } else if (!volumeFmt.rounded) {
      steps.push(qty(perFmt, input.amountUnit) + ' ÷ ' + concShown + ' = ' + volumeFmt.display + ' mL.');
    } else {
      steps.push(qty(perFmt, input.amountUnit) + ' ÷ ' + concShown + ' = ' + volumeFmt.fraction + ' mL exactly, shown as ' + volumeFmt.display + ' mL (rounded to 6 decimal places).');
    }

    var u100 = unitLine(volume, volumeFmt, 100, 'U-100');
    var u40 = unitLine(volume, volumeFmt, 40, 'U-40');
    var primary = null;
    if (cal === 'U-100') {
      steps.push('Calibration you selected: ' + u100.sentence);
      steps.push('Shown for comparison: ' + u40.sentence + ' Do not use the U-40 count on a U-100 syringe.');
      primary = u100;
    } else if (cal === 'U-40') {
      steps.push('Calibration you selected: ' + u40.sentence);
      steps.push('Shown for comparison: ' + u100.sentence + ' Do not use the U-100 count on a U-40 syringe.');
      primary = u40;
    } else {
      steps.push('No syringe calibration selected, so the result stays in mL.');
      steps.push('If the syringe is U-100: ' + u100.sentence);
      steps.push('If the syringe is U-40: ' + u40.sentence);
    }
    steps.push(SYRINGE_CALIBRATION);

    return {
      ok: true,
      notice: PRESCRIBER,
      perDisplay: perFmt.display,
      perUnit: input.amountUnit,
      volume: volumeFmt,
      byCalibration: { 'U-100': u100, 'U-40': u40 },
      primary: primary,
      calibration: cal,
      steps: steps
    };
  }

  function reconstitution(input) {
    input = input || {};
    var mass = parsePositive(input.mass);
    if (!mass.ok) return bad('mass', mass.code);
    if (!massUnit(input.massUnit)) return bad('massUnit', 'invalid');
    var volume = parsePositive(input.volume);
    if (!volume.ok) return bad('volume', volume.code);
    var concIn = div(mass.rat, volume.rat);
    var concMcg = input.massUnit === 'mg' ? mul(concIn, R1000) : concIn;
    var concMg = input.massUnit === 'mcg' ? div(concIn, R1000) : concIn;
    var mgFmt = formatExact(concMg);
    var mcgFmt = formatExact(concMcg);
    var inFmt = formatExact(concIn);
    var steps = [];
    var note = readNote(mass) + readNote(volume);
    if (!inFmt.rounded) {
      steps.push(mass.display + ' ' + input.massUnit + ' ÷ ' + volume.display + ' mL = ' + inFmt.display + ' ' + input.massUnit + '/mL.' + note);
    } else {
      steps.push(mass.display + ' ' + input.massUnit + ' ÷ ' + volume.display + ' mL = ' + inFmt.fraction + ' ' + input.massUnit + '/mL exactly, shown as ' + inFmt.display + ' (rounded to 6 decimal places).' + note);
    }
    steps.push('The same concentration is ' + mgFmt.display + ' mg/mL' + roundedClause(mgFmt) + ' and ' + mcgFmt.display + ' mcg/mL' + roundedClause(mcgFmt) + '. The factor is 1000.');
    steps.push('This is mass divided by volume. It is not an instruction to prepare a vial.');
    return {
      ok: true,
      notice: PRESCRIBER,
      mgPerMl: mgFmt,
      mcgPerMl: mcgFmt,
      steps: steps
    };
  }

  function convertMass(input) {
    input = input || {};
    var value = parsePositive(input.value);
    if (!value.ok) return bad('value', value.code);
    if (!massUnit(input.unit)) return bad('unit', 'invalid');
    var mcg = input.unit === 'mg' ? mul(value.rat, R1000) : value.rat;
    var mg = input.unit === 'mcg' ? div(value.rat, R1000) : value.rat;
    var mgFmt = formatExact(mg);
    var mcgFmt = formatExact(mcg);
    var steps = [];
    var note = readNote(value);
    if (input.unit === 'mg') {
      steps.push(value.display + ' mg × 1000 = ' + mcgFmt.display + ' mcg' + (mcgFmt.rounded ? ' (rounded to 6 decimal places; exact fraction ' + mcgFmt.fraction + ')' : '') + '.' + note);
    } else {
      steps.push(value.display + ' mcg ÷ 1000 = ' + mgFmt.display + ' mg' + (mgFmt.rounded ? ' (rounded to 6 decimal places; exact fraction ' + mgFmt.fraction + ')' : '') + '.' + note);
    }
    steps.push('The factor is 1000. 1 mg = 1000 mcg, and 1000 mcg = 1 mg.');
    return { ok: true, notice: PRESCRIBER, mg: mgFmt, mcg: mcgFmt, steps: steps };
  }

  function fractionText(r) {
    if (r.d === 1n) return r.n.toString() + '/1';
    return r.n.toString() + '/' + r.d.toString();
  }

  function amountSentence(fmt, unit) {
    if (!fmt.rounded) return fmt.display + ' ' + unit;
    return fmt.fraction + ' ' + unit + ' exactly, shown as ' + fmt.display + ' ' + unit + ' (rounded to 6 decimal places)';
  }

  function tabletFraction(input) {
    input = input || {};
    var labeled = parsePositive(input.labeled);
    if (!labeled.ok) return bad('labeled', labeled.code);
    if (!massUnit(input.unit)) return bad('unit', 'invalid');
    var mode = input.mode === 'amount' ? 'amount' : (input.mode === 'fraction' ? 'fraction' : '');
    if (!mode) return bad('mode', 'invalid');
    var steps = [];
    var fraction;
    var amount;
    var amountFmt;
    if (mode === 'fraction') {
      var num = parsePositiveInteger(input.numerator);
      if (!num.ok) return bad('numerator', num.code);
      var den = parsePositiveInteger(input.denominator);
      if (!den.ok) return bad('denominator', den.code);
      fraction = div(num.rat, den.rat);
      amount = mul(labeled.rat, fraction);
      amountFmt = formatExact(amount);
      var entered = num.display + '/' + den.display;
      var reduced = fractionText(fraction);
      if (entered !== reduced && !(fraction.d === 1n && entered === num.display + '/1')) {
        steps.push(entered + ' reduces to ' + reduced + '.');
      }
      steps.push(reduced + ' × ' + labeled.display + ' ' + input.unit + ' = ' + amountSentence(amountFmt, input.unit) + '.' + readNote(labeled));
    } else {
      var desired = parsePositive(input.desired);
      if (!desired.ok) return bad('desired', desired.code);
      if (!massUnit(input.desiredUnit)) return bad('desiredUnit', 'invalid');
      var desiredMcg = toMcg(desired.rat, input.desiredUnit);
      var labeledMcg = toMcg(labeled.rat, input.unit);
      fraction = div(desiredMcg, labeledMcg);
      amount = input.unit === 'mg' ? div(desiredMcg, R1000) : desiredMcg;
      amountFmt = formatExact(amount);
      if (input.desiredUnit !== input.unit) {
        var desiredInLabeled = input.unit === 'mg' ? div(desiredMcg, R1000) : desiredMcg;
        steps.push(desired.display + ' ' + input.desiredUnit + ' = ' + formatExact(desiredInLabeled).display + ' ' + input.unit + '. The factor is 1000.');
      }
      steps.push(desired.display + ' ' + input.desiredUnit + ' ÷ ' + labeled.display + ' ' + input.unit + ' = ' + fractionText(fraction) + ' of one tablet labeled ' + labeled.display + ' ' + input.unit + '.' + readNote(desired) + readNote(labeled));
      steps.push(fractionText(fraction) + ' × ' + labeled.display + ' ' + input.unit + ' = ' + amountSentence(amountFmt, input.unit) + '.');
    }
    return {
      ok: true,
      notice: PRESCRIBER,
      tabletNotice: TABLET_NOTICE,
      fraction: fractionText(fraction),
      amount: amountFmt,
      amountUnit: input.unit,
      steps: steps
    };
  }

  return {
    PRESCRIBER: PRESCRIBER,
    SELF_USE: SELF_USE,
    TABLET_NOTICE: TABLET_NOTICE,
    SYRINGE_CALIBRATION: SYRINGE_CALIBRATION,
    LIMITATIONS: LIMITATIONS,
    parsePositive: parsePositive,
    parsePositiveInteger: parsePositiveInteger,
    formatExact: formatExact,
    messageFor: messageFor,
    syringeVolume: syringeVolume,
    reconstitution: reconstitution,
    convertMass: convertMass,
    tabletFraction: tabletFraction
  };
});
