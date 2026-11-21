/* Wires a calculator form to DoseTraceCalc. Text only; no dose advice. */
(function () {
  'use strict';
  var calc = window.DoseTraceCalc;
  var form = document.querySelector('form[data-calc]');
  if (!calc || !form) return;
  var result = document.getElementById('calc-result');
  var exampleBtn = document.getElementById('fill-example');
  var exampleOn = false;

  function val(name) {
    var el = form.elements[name];
    if (!el) return '';
    if (el.length && el[0] && el[0].type === 'radio') return el.value || '';
    return el.value;
  }

  function setVal(name, value) {
    var el = form.elements[name];
    if (!el || value == null) return;
    el.value = value;
  }

  function clearInvalid() {
    Array.prototype.forEach.call(form.elements, function (el) {
      if (el.removeAttribute) el.removeAttribute('aria-invalid');
    });
  }

  function focusField(name) {
    var el = form.elements[name];
    if (!el || !el.focus) return;
    if (el.length && el[0] && !el.focus) el = el[0];
    try { el.focus(); } catch (e) {}
  }

  function markInvalid(name) {
    var el = form.elements[name];
    if (!el) return;
    if (el.length && el[0] && el[0].type === 'radio') {
      Array.prototype.forEach.call(el, function (r) { r.setAttribute('aria-invalid', 'true'); });
      return;
    }
    if (el.setAttribute) el.setAttribute('aria-invalid', 'true');
  }

  function addText(parent, tag, className, text) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    el.textContent = text;
    parent.appendChild(el);
    return el;
  }

  function renderError(res) {
    result.replaceChildren();
    var p = addText(result, 'p', 'calc-error', res.message || 'Check the numbers and try again.');
    p.setAttribute('role', 'alert');
    markInvalid(res.field);
    focusField(res.field);
  }

  function renderOk(res) {
    result.replaceChildren();
    if (exampleOn) addText(result, 'p', 'example-kicker', 'Example only');
    addText(result, 'h3', null, 'Result');
    var list = document.createElement('ol');
    (res.steps || []).forEach(function (step) {
      addText(list, 'li', null, step);
    });
    result.appendChild(list);
    if (res.notice) addText(result, 'p', 'notice', res.notice);
    if (res.tabletNotice) addText(result, 'p', 'notice', res.tabletNotice);
  }

  function payload() {
    var kind = form.getAttribute('data-calc');
    if (kind === 'syringe') {
      return calc.syringeVolume({
        amount: val('amount'),
        amountUnit: val('amountUnit'),
        parts: val('parts'),
        concentration: val('concentration'),
        concentrationUnit: val('concentrationUnit'),
        calibration: val('calibration')
      });
    }
    if (kind === 'reconstitution') {
      return calc.reconstitution({
        mass: val('mass'),
        massUnit: val('massUnit'),
        volume: val('volume')
      });
    }
    if (kind === 'mass') {
      return calc.convertMass({ value: val('value'), unit: val('unit') });
    }
    if (kind === 'tablet') {
      return calc.tabletFraction({
        mode: val('mode'),
        labeled: val('labeled'),
        unit: val('unit'),
        numerator: val('numerator'),
        denominator: val('denominator'),
        desired: val('desired'),
        desiredUnit: val('desiredUnit')
      });
    }
    return { ok: false, field: 'form', message: 'This calculator is not available.' };
  }

  function calculate() {
    clearInvalid();
    var res = payload();
    if (!res.ok) renderError(res);
    else renderOk(res);
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    calculate();
  });
  form.addEventListener('input', function () { exampleOn = false; });
  if (exampleBtn) {
    exampleBtn.addEventListener('click', function () {
      var raw = form.getAttribute('data-example');
      if (!raw) return;
      var data;
      try { data = JSON.parse(raw); } catch (e) { return; }
      Object.keys(data).forEach(function (key) { setVal(key, data[key]); });
      exampleOn = true;
      calculate();
    });
  }
})();
