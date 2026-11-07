'use strict';
// "Make sure your reminders arrive" as a guided conversation (docs/specs/reminder-setup-conversation.md,
// RS-1..RS-14, signed by the founder 2026-11-05; picture docs/design/reminder-setup-conversation.html).
// One phone setting at a time: why it matters, the exact Android screen, the phone read again on
// return, a green line or "nothing changed", then the next. Pure: lib/notifications reads the phone and
// opens the screens; components/ReminderConversation renders what this decides. Every sentence is a
// fixed app text (no AI, no network). What is read and what counts stay lib/reminderHealth's rules.
//
// A conversation: { mode, os, manufacturer, items, passed, current, phase, messages, seq }
//   phase: 'intro' | 'step' | 'away' (in Android) | 'retry' | 'pending' (saving) | 'summary'
//   messages: { id, kind, key, params, parts?, item?, titleKey?, titleParams?, icon?, mark? }
//     kind: 'app' | 'user' | 'done' (green) | 'warn' (attention) | 'note' (neutral, not readable)
//           | 'head' | 'summary' | 'schedule' (the summary: drawn from the phone as read NOW)

const { reminderChecks, setupSteps, kindChannelChecks, rowTitleKey, setupRowState, scheduleState } = require('./reminderHealth');
const { renderText } = require('./assistantText');

// The rows of the summary card — the list's table (A-112 picture B), unchanged: the state words of
// every item as the list showed them (A-106 alarms, A-110 hibernation and refresh, SP-10 deep sleep,
// DV-098 the other kinds' categories under Android's channel names). The list's buttons are gone: the
// conversation's steps open the screens (ITEM below).
const ROW = {
  notifications: { icon: 'bell', title: 'rc_notif', ok: 'rc_notif_ok', block: 'rc_notif_block' },
  channel: { icon: 'bell', title: 'rc_channel', ok: 'rc_channel_ok', block: 'rc_channel_block' },
  battery: { icon: 'calc_bolt', title: 'rc_battery', ok: 'rc_battery_ok', warn: 'rc_battery_warn' },
  alarms: { icon: 'clock', title: 'rc_alarms', ok: 'rc_alarms_ok', warn: 'rc_alarms_warn', open: 'rc_alarms_sub' },
  hibernation: { icon: 'pause', title: 'rc_hibernation', ok: 'rc_hibernation_ok', warn: 'rc_hibernation_warn', open: 'rc_hibernation_open' },
  refresh: { icon: 'refresh', title: 'rc_refresh', ok: 'rc_refresh_ok', warn: 'rc_refresh_warn' },
  deep_sleep: { icon: 'moon', title: 'rc_deep_sleep', open: 'rc_deep_sleep_sub' },
  channel_checkin: { icon: 'food', title: 'notif_channel_checkin', ok: 'rc_channel_on_android', block: 'rc_channel_block' },
  channel_vial: { icon: 'type_vial', title: 'notif_channel_vials', ok: 'rc_channel_on_android', block: 'rc_channel_block' },
};
function stateTextKey(c) {
  const r = ROW[c.id];
  if (!r) return null;
  if (c.state === 'open') return r.open || r.ok;
  return r[c.state] || r.ok;
}

// The conversation's steps. why: the one sentence on why it matters; act: the action chip; ok / still:
// the line after Android (readable items); where: what to do there, said again after "nothing changed";
// unread: the neutral line for an item the app cannot read (RS-5).
const ITEM = {
  notifications: { icon: 'bell', why: 'rcv_why_notifications', act: 'rcv_open_setting', ok: 'rcv_ok_notifications', still: 'rcv_still_notifications', where: 'rcv_where_notifications', unread: 'rcv_check_on' },
  channel: { icon: 'bell', why: 'rcv_why_channel', act: 'rcv_open_setting', ok: 'rcv_ok_channel', still: 'rcv_still_channel', where: 'rcv_where_channel', unread: 'rcv_check_on' },
  alarms: { icon: 'clock', why: 'rcv_why_alarms', act: 'rcv_open_setting', ok: 'rcv_ok_alarms', still: 'rcv_still_alarms', where: 'rcv_where_alarms', unread: 'rcv_check_on' },
  battery: { icon: 'calc_bolt', why: 'rcv_why_battery', act: 'rc_fix_open', ok: 'rcv_ok_battery', still: 'rcv_still_battery', where: 'rcv_where_battery', unread: 'rcv_check_on' },
  hibernation: { icon: 'pause', why: 'rcv_why_hibernation', act: 'rcv_open_setting', ok: 'rcv_ok_hibernation', still: 'rcv_still_hibernation', where: 'rcv_where_hibernation', unread: 'rcv_check_off' },
  deep_sleep: { icon: 'moon', why: 'rcv_why_deep_sleep', act: 'rc_fix_open', unread: 'rcv_check_deep_sleep' },
  channel_checkin: { icon: 'food', why: 'rcv_why_channel_checkin', act: 'rcv_open_setting', ok: 'rcv_ok_channel_kind', still: 'rcv_still_channel_kind', where: 'rcv_where_channel', unread: 'rcv_check_on' },
  channel_vial: { icon: 'type_vial', why: 'rcv_why_channel_vial', act: 'rcv_open_setting', ok: 'rcv_ok_channel_kind', still: 'rcv_still_channel_kind', where: 'rcv_where_channel', unread: 'rcv_check_on' },
};
const ORDER = ['notifications', 'channel', 'alarms', 'battery', 'hibernation', 'deep_sleep', 'channel_checkin', 'channel_vial'];
const FIX = { deep_sleep: 'deepSleep' };

// The title of a step: today's row name (RS-12), the phone's own for the hibernation switch (RG-7).
function stepTitle(id, h) {
  return rowTitleKey(id, h && h.manufacturer) || (ROW[id] && ROW[id].title);
}

// The state of one item as read now: 'ok' | 'warn' | 'block' | 'open' (cannot be read).
function itemState(h, id) {
  const all = reminderChecks(h).concat(kindChannelChecks(h));
  const c = all.find((x) => x.id === id);
  if (c) return c.state;
  // The Dose reminders category is only listed while it is off; a category the phone does not report
  // cannot be read.
  if (id === 'channel' && h && h.doseChannelImportance != null) return 'ok';
  return 'open';
}
// Something the person must do: a readable item not OK, or Samsung deep sleep not confirmed (it
// counts, SP-10). An item the app cannot read alone never makes the conversation walk (RS-2).
function needsPerson(id, state) {
  return state !== 'ok' && (state !== 'open' || id === 'deep_sleep');
}

// The items of this phone, in the approved order (setupSteps; RS-3). iPhone: notifications only.
function convItemIds(h) {
  if (!h) return [];
  if (h.os !== 'android') return ['notifications'];
  return setupSteps(h).rows.map((r) => r.id).filter((id) => ITEM[id]);
}

// The summary card's rows: the screen lists the automatic refresh too; onboarding the phone items only.
function summaryRows(h, { mode = 'screen' } = {}) {
  if (!h) return [];
  if (h.os !== 'android') return reminderChecks(h).filter((c) => c.id === 'notifications');
  return setupSteps(h, { withRefresh: mode === 'screen' }).rows;
}

// The same blocked rule as before: a red ROW stops the test (an empty schedule does not).
function testBlocked(h) {
  return !!h && reminderChecks(h).some((c) => c.state === 'block');
}

// For n >= 1 the singular is the same in every language (lib/plural isOne).
const countKey = (key, n) => (n === 1 ? `${key}_one` : key);

// The items as they are NOW (review 1): the phone's live list, plus anything the conversation walked.
function liveIds(h, conv) {
  const live = convItemIds(h);
  return ORDER.filter((id) => live.includes(id) || (conv && conv.items && conv.items.includes(id)));
}

// The head of the summary (review 1, coordinator 2026-11-05): the same rule as the Settings row
// (setupRowState: the readable blocks, scheduleState, backgroundStaleDays) on the live items — never "All
// set" while something blocks or warns, and never a claim about rows nobody could read.
function summaryHead(h, conv) {
  const head = (key, params) => ({ kind: 'head', key, params, mark: true });
  if (!h) return head('rcv_all_set');
  const left = liveIds(h, conv).filter((id) => needsPerson(id, itemState(h, id))).length;
  if (left) return head(countKey('rcv_some_left', left), { n: left });
  const row = setupRowState(h);
  if (row.kind !== 'ok') return head('rcv_head_attention');
  // Second review 2: the schedule still being checked is no "All set" either.
  if (scheduleState(h) === 'pending') return head('rcv_head_check');
  if (summaryRows(h, { mode: conv && conv.mode }).some((c) => c.state === 'open')) return head('rcv_head_check');
  return head('rcv_all_set');
}
// Second review 2: the latest summary's head after a new read — the new head when its words changed
// (to announce it to screen readers), else null.
function headChange(conv, before, after) {
  if (!conv || conv.phase !== 'summary' || !after) return null;
  const a = before ? summaryHead(before, conv) : null;
  const b = summaryHead(after, conv);
  if (a && a.key === b.key && JSON.stringify(a.params || null) === JSON.stringify(b.params || null)) return null;
  return b;
}

// ── the conversation ─────────────────────────────────────────────────────────────────────────────
function push(conv, msg) {
  const seq = conv.seq + 1;
  return { ...conv, seq, messages: conv.messages.concat({ id: `m${seq}`, ...msg }) };
}
function stepMessages(id, h, again) {
  const it = ITEM[id];
  const title = { titleKey: stepTitle(id, h), icon: it.icon, mark: true, item: id };
  const nameParam = { name: { $t: stepTitle(id, h) } };
  if (id === 'battery') {
    return [
      { kind: 'app', key: it.why, ...title },
      { kind: 'app', item: id, parts: [{ key: 'rcv_battery_open' }, wherePart(id, h)] },
    ];
  }
  if (id === 'deep_sleep') return [{ kind: 'app', key: it.why, params: { path: { $t: 'rcv_deep_sleep_path' } }, bold: ['path'], ...title }];
  if (id === 'hibernation') return [{ kind: 'app', key: it.why, params: nameParam, ...title }];
  return [{ kind: 'app', key: it.why, ...title }];
}
function wherePart(id, h) {
  const it = ITEM[id];
  if (id === 'battery') return { key: it.where, params: { battery: { $t: 'rc_battery' }, unrestricted: { $t: 'rc_battery_ok' } }, bold: ['battery', 'unrestricted'] };
  if (id === 'hibernation') return { key: it.where, params: { name: { $t: stepTitle(id, h) } } };
  return { key: it.where };
}
function okLine(id, h) {
  const it = ITEM[id];
  const params = id === 'hibernation' || id.startsWith('channel_') ? { name: { $t: stepTitle(id, h) } } : undefined;
  return { kind: 'done', key: it.ok, params, item: id };
}
function stillLine(id, h) {
  const it = ITEM[id];
  const params = id === 'hibernation' || id.startsWith('channel_') ? { name: { $t: stepTitle(id, h) } } : undefined;
  return { kind: 'warn', key: it.still, params, item: id };
}

// Walk on from the current item: items now OK get their green line, the next one that is not OK
// becomes the step; at the end, the summary.
function advance(conv, h) {
  // A fix from the summary walks that one item only, then the summary again (coordinator, RS-9).
  if (conv.fixing) return toSummary({ ...conv, fixing: false }, h);
  let c = conv;
  for (const id of c.items) {
    if (c.passed.includes(id)) continue;
    const st = itemState(h, id);
    if (st === 'ok') {
      c = push({ ...c, passed: c.passed.concat(id) }, okLine(id, h));
      continue;
    }
    c = { ...c, current: id, phase: 'step' };
    for (const m of stepMessages(id, h)) c = push(c, m);
    return c;
  }
  return toSummary(c, h);
}
function toSummary(conv, h) {
  let c = { ...conv, current: null, phase: 'summary' };
  // The head, the card and the schedule of one summary share a group and keep the phone as it was
  // when they were shown (snap). Only the latest group reads the phone live (coordinator 2026-11-05:
  // a card in the history never contradicts the step below it).
  const group = c.seq + 1;
  c = push(c, { ...summaryHead(h, c), group, snap: h });
  c = push(c, { kind: 'summary', group, snap: h });
  if (c.mode === 'screen') c = push(c, { kind: 'schedule', group, snap: h });
  return c;
}
function isLatestSummary(conv, m) {
  if (!conv || !m || m.group == null) return false;
  const last = [...conv.messages].reverse().find((x) => x.group != null);
  return !!last && last.group === m.group;
}
// The phone a summary part is drawn from: live for the latest summary, its snapshot otherwise.
function summaryHealth(conv, m, live) {
  return isLatestSummary(conv, m) ? live : (m && m.snap) || live;
}

function startConversation(h, { mode = 'screen', resume = null } = {}) {
  let items = convItemIds(h);
  if (resume && ITEM[resume] && !items.includes(resume)) items = ORDER.filter((id) => id === resume || items.includes(id));
  const base = { mode, os: h && h.os, items, passed: [], current: null, phase: 'intro', messages: [], seq: 0 };
  if (!h) return base;
  // Cold return (RS-4): Android closed the app while the person was on an Android screen — no opening
  // again; the items before it are behind us and the item is read at once.
  if (resume && items.includes(resume)) {
    let c = { ...base, passed: items.slice(0, items.indexOf(resume)), current: resume, phase: 'away' };
    for (const m of stepMessages(resume, h)) c = push(c, m);
    return returned(c, h);
  }
  const pending = items.filter((id) => needsPerson(id, itemState(h, id))).length;
  if (!pending) return toSummary(base, h);
  // iPhone has one setting: no opening, straight to it (RS-10, the picture's note).
  if (h.os !== 'android') return advance(base, h);
  let c = push(base, { kind: 'app', key: 'rcv_intro_1', mark: true });
  // Review 6: the count is of what still needs the person ("Falta 1 ajuste." / "Faltam 3 ajustes…").
  c = push(c, { kind: 'app', key: countKey('rcv_intro_2', pending), params: { n: pending } });
  return c;
}

// The chips under the conversation (answers only by chips, RS-1).
function chips(conv, h) {
  if (!conv) return [];
  const p = (id, key) => ({ id, key, primary: true });
  const s = (id, key) => ({ id, key });
  switch (conv.phase) {
    case 'intro':
      return [p('start', 'rcv_start'), s('not_now', 'ob_not_now')];
    case 'step': {
      const id = conv.current;
      if (id === 'deep_sleep') return [p('act', 'rc_fix_open'), s('checked', 'rc_deep_sleep_checked_btn'), s('not_now', 'ob_not_now')];
      // Notifications: "Permitir" only when the system dialog can really show (review 6: the A-119
      // device verdict or an answer Android/iOS already stored sends the person to Settings instead).
      const canAsk = h && (h.permissionCanAsk === true || (h.permissionCanAsk == null && h.permission === 'undetermined'));
      const key = id === 'notifications' && canAsk ? 'rcv_allow' : ITEM[id].act;
      return [p('act', key), s('not_now', 'ob_not_now')];
    }
    case 'retry':
      if (conv.current === 'deep_sleep') return [p('checked', 'rc_deep_sleep_checked_btn'), s('act', 'rcv_again'), s('skip', 'rcv_skip')];
      return [p('act', 'rcv_again'), s('skip', 'rcv_skip')];
    case 'summary':
      if (conv.mode === 'onboarding') {
        const done = !liveIds(h, conv).some((id) => needsPerson(id, itemState(h, id)));
        return done ? [p('continue', 'ob_continue')] : [p('later', 'ob_setup_later')];
      }
      return [p('finish', 'rcv_finish'), s('test', 'rc_test_btn')];
    default:
      return [];
  }
}

// RS-9 (coordinator 2026-11-05): the list let the person fix any row from that screen, so the summary
// keeps that — one "Ajustar <item>" chip under the card for every item that is not OK now (readable and
// off, Samsung deep sleep not confirmed, a kind's category off), in the approved order.
function fixChips(conv, h) {
  if (!conv || conv.phase !== 'summary' || !h) return [];
  const chip = (id, titleKey) => ({ id: `fix:${id}`, key: 'rcv_fix', params: { name: { $t: titleKey } } });
  // A late automatic refresh walks no step of its own (second review 3): when battery is not OK its
  // own chip is the battery walk; on Samsung with deep sleep not confirmed, the deep-sleep chip; with
  // both fine the refresh row keeps a plain "Abrir" (rowOpenFix) — no walk on a false premise.
  return liveIds(h, conv).filter((id) => needsPerson(id, itemState(h, id))).map((id) => chip(id, stepTitle(id, h)));
}
// The card rows that keep a plain "Abrir" (no step): Samsung deep sleep once confirmed, any row the
// app cannot read (review 2), and a late automatic refresh → the app's own Android page, as the list's
// "Adjust" did (second review 3). → the openReminderFix name, or null.
function rowOpenFix(c) {
  if (!c) return null;
  if (c.id === 'refresh') return c.state === 'warn' ? 'battery' : null;
  if (c.id === 'deep_sleep') return c.state === 'ok' ? 'deepSleep' : null;
  if (c.state !== 'open' || !ITEM[c.id]) return null;
  return FIX[c.id] || c.id;
}
// Review 5: inside onboarding the conversation shows no header of its own (onboarding keeps its bar).
const showHeader = (mode) => mode !== 'onboarding';
// Review 6 / second review 4: a new message or new chips are always brought into view; a pure
// re-render of what is already there never pulls someone reading the history back to the bottom.
const shouldAutoScroll = ({ nearBottom, newMessage, newChips }) => !!(newMessage || newChips || nearBottom);
// Review 6: a phone read while a step (or its retry) is on screen: if that setting became OK by
// itself, say so and go on; otherwise nothing changes.
function refreshed(conv, h) {
  if (!conv || !h || !conv.current || (conv.phase !== 'step' && conv.phase !== 'retry')) return conv;
  const id = conv.current;
  if (itemState(h, id) !== 'ok') return conv;
  const c = push({ ...conv, passed: conv.passed.includes(id) ? conv.passed : conv.passed.concat(id) }, okLine(id, h));
  return advance(c, h);
}

// The person tapped a chip → { conv, effect }. effect: null | { type: 'open', fix, item, ask } |
// { type: 'close' } | { type: 'continue' } (onboarding) | { type: 'checked' } | { type: 'test' }.
function choose(conv, id, h) {
  if (typeof id === 'string' && id.startsWith('fix:')) {
    const chip = fixChips(conv, h).find((x) => x.id === id);
    const item = id.slice(4);
    if (!chip || !ITEM[item]) return { conv, effect: null };
    let c = push(conv, { kind: 'user', key: chip.key, params: chip.params });
    c = { ...c, items: c.items.includes(item) ? c.items : ORDER.filter((x) => x === item || c.items.includes(x)), fixing: true, current: item, phase: 'step' };
    for (const m of stepMessages(item, h)) c = push(c, m);
    return { conv: c, effect: null };
  }
  const chip = chips(conv, h).find((x) => x.id === id);
  const said = (c) => push(c, { kind: 'user', key: chip ? chip.key : (id === 'skip' ? 'rcv_skip' : 'rcv_start') });
  const leave = conv.mode === 'onboarding' ? { type: 'continue' } : { type: 'close' };
  switch (id) {
    case 'start':
      return { conv: advance(said(conv), h), effect: null };
    case 'not_now':
      // Review 4: inside a fix started from the summary, "Agora não" goes back to the summary.
      if (conv.fixing) return { conv: toSummary({ ...said(conv), fixing: false }, h), effect: null };
      return { conv, effect: leave };
    case 'later':
    case 'continue':
    case 'finish':
      return { conv, effect: id === 'finish' ? { type: 'close' } : leave };
    case 'act': {
      const item = conv.current;
      const c = { ...said(conv), phase: 'away' };
      return { conv: c, effect: { type: 'open', item, fix: FIX[item] || item, ask: item === 'notifications' } };
    }
    case 'skip': {
      const c = { ...said(conv), passed: conv.passed.concat(conv.current) };
      return { conv: advance(c, h), effect: null };
    }
    case 'checked':
      return { conv: { ...said(conv), phase: 'pending' }, effect: { type: 'checked' } };
    case 'test':
      return { conv: said(conv), effect: { type: 'test' } };
    default:
      return { conv, effect: null };
  }
}

// Back from Android (RS-4 / RS-5): the phone as read now decides the line.
function returned(conv, h) {
  if (!conv || conv.phase !== 'away' || !conv.current) return conv;
  const id = conv.current;
  const st = itemState(h, id);
  if (id === 'deep_sleep') {
    return { ...push(conv, { kind: 'note', key: ITEM[id].unread, item: id }), phase: 'retry' };
  }
  // A fix from the summary goes straight back to it, so its green line is said here.
  if (st === 'ok') return advance(conv.fixing ? push(conv, okLine(id, h)) : conv, h);
  if (st === 'open') {
    const c = push({ ...conv, passed: conv.passed.concat(id) }, { kind: 'note', key: ITEM[id].unread, item: id });
    return advance(c, h);
  }
  let c = push(conv, stillLine(id, h));
  c = push(c, { kind: 'app', item: id, parts: [{ key: 'rcv_retry' }, wherePart(id, h)] });
  return { ...c, phase: 'retry' };
}

// Samsung deep sleep confirmed ("Já conferi", saved on this phone by lib/notifications).
function afterChecked(conv, h) {
  if (!conv || conv.phase !== 'pending') return conv;
  return advance({ ...conv, passed: conv.passed.concat(conv.current) }, h);
}

// The test reminder was scheduled: the same words as before (sent / blocked).
function testResult(conv, { ok, blocked }) {
  const key = blocked ? 'rc_test_blocked' : ok ? 'rc_test_sent' : 'rc_test_hint';
  return push(conv, { kind: 'app', key });
}

// "N de M": how many of the phone's items are ready now (the old list's "N of M ready", RG-2) — always
// total minus "Faltam N" and the summary head (S25 2026-11-07: "0 of 7" beside "4 left", and "7 of 7"
// beside "3 settings still need you"). Without a read: the items behind us.
function progress(conv, h) {
  if (!conv) return { n: 0, total: 0 };
  const total = conv.items.length;
  if (!h) return { n: conv.phase === 'summary' ? total : Math.min(conv.passed.length, total), total };
  return { n: conv.items.filter((id) => !needsPerson(id, itemState(h, id))).length, total };
}

// The lines a screen reader announces after a change: the app's new lines, in order (RS-11).
function newSpoken(before, after) {
  const seen = new Set((before ? before.messages : []).map((m) => m.id));
  return (after ? after.messages : []).filter((m) => !seen.has(m.id) && m.kind !== 'user' && m.kind !== 'summary' && m.kind !== 'schedule');
}

// Is the person really back from Android? (The read must follow their answer, not race it.)
//   away: the app left the front (Android screen, iPhone Settings, iOS dialog); settled: the open/ask
//   call returned; opened: it managed to open something; waitedMs: since it returned.
//   activeMs: since the app came back to the front (review 3: Android's startActivityAsync may never
//   settle — after 1.5 s in front again the phone is read anyway).
function returnReady({ away, settled, appState, opened = true, waitedMs = 0, activeMs = 0 }) {
  if (appState !== 'active') return false;
  if (away) return !!settled || activeMs >= 1500;
  if (!settled) return false;
  if (!opened) return true; // nothing could open: read now
  return waitedMs >= 1500; // a dialog that never took the app from the front
}

// A message as text segments, the named params in bold (the words to tap, as drawn).
function segments(t, key, params, bold) {
  const b = new Set(bold || []);
  const tpl = String(t(key));
  if (!b.size) return [{ text: renderText(t, key, params), bold: false }];
  const out = [];
  const re = /\{([a-z]+)\}/g;
  let last = 0;
  let m;
  const SELF = '\u0000piece';
  const fill = (s) => renderText((k) => (k === SELF ? s : t(k)), SELF, params);
  const plain = (s) => { if (s) out.push({ text: fill(s), bold: false }); };
  while ((m = re.exec(tpl))) {
    if (!b.has(m[1])) continue;
    plain(tpl.slice(last, m.index));
    out.push({ text: fill(`{${m[1]}}`), bold: true });
    last = m.index + m[0].length;
  }
  plain(tpl.slice(last));
  return out;
}

module.exports = {
  ROW, ITEM, ORDER, stateTextKey, stepTitle, itemState, needsPerson, convItemIds, summaryRows, summaryHead, testBlocked,
  startConversation, chips, fixChips, choose, isLatestSummary, summaryHealth, returned, afterChecked, testResult, progress, newSpoken, returnReady, segments,
  rowOpenFix, showHeader, shouldAutoScroll, refreshed, headChange,
};
