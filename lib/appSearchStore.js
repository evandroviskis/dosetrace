// App search, what lives only in memory while the app is open (never stored, never sent; logic 6):
//  - which Today blocks exist right now (Pendente de ontem, Alertas), published by Today (logic 5);
//  - the text typed in the search, so folding or unfolding with the search open keeps it (BK-10,
//    BK-14); it is cleared when the search closes ("Cancelar", a result, a tab tap);
//  - the tab whose magnifier gets the screen-reader focus back after "Cancelar" (AS-19).
// Pure CommonJS (node --test).
'use strict';

const state = { flags: { pending: false, alerts: false }, query: '', focusBack: null };

function setTodayFlags({ pending, alerts } = {}) {
  state.flags = { pending: !!pending, alerts: !!alerts };
}
function todayFlags() { return { ...state.flags }; }

function setQuery(q) { state.query = String(q == null ? '' : q); }
function getQuery() { return state.query; }
function clearQuery() { state.query = ''; }

function askFocusBack(tab) { state.focusBack = tab || null; }
// true once, for the tab whose magnifier should take the focus back.
function takeFocusBack(tab) {
  if (state.focusBack && state.focusBack === tab) { state.focusBack = null; return true; }
  return false;
}

// An "Entenda os números" hit (AS-27): the item to open in LearnBlock, the typed words to mark, and
// a nonce so a second tap opens it again. LearnBlock reads it when it shows and when it changes.
let learnReq = null;
const learnListeners = new Set();
function requestLearn(req) {
  learnReq = req && req.key ? { key: req.key, mark: req.mark || null, n: req.n || null, at: Date.now() } : null;
  learnListeners.forEach((fn) => { try { fn(learnReq); } catch { /* a listener never breaks another */ } });
}
// Only a request made a moment ago (a LearnBlock mounting later in the session never reopens an old hit).
function learnRequest(now = Date.now()) { return learnReq && now - learnReq.at < 5000 ? learnReq : null; }
function onLearnRequest(fn) { learnListeners.add(fn); return () => learnListeners.delete(fn); }

// A vaccine record found by name (AS-28): the phone's Vaccine journal opens its sheet once.
let vaccineReq = null;
function requestVaccine(id) { vaccineReq = id == null ? null : String(id); }
function takeVaccineRequest() { const v = vaccineReq; vaccineReq = null; return v; }

module.exports = { requestVaccine, takeVaccineRequest, setTodayFlags, todayFlags, setQuery, getQuery, clearQuery, askFocusBack, takeFocusBack, requestLearn, learnRequest, onLearnRequest };
