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

const { reminderChecks, setupSteps, kindChannelChecks, rowTitleKey } = require('./reminderHealth');
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

function summaryHead(h, conv) {
  const ids = conv && conv.items ? conv.items : convItemIds(h);
  const left = ids.filter((id) => needsPerson(id, itemState(h, id))).length;
  return left ? { kind: 'head', key: countKey('rcv_some_left', left), params: { n: left }, mark: true } : { kind: 'head', key: 'rcv_all_set', mark: true };
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
  // The head, the card and the schedule are drawn from the phone as read NOW by the screen; the head
  // keeps the words of this moment too.
  c = push(c, summaryHead(h, c));
  c = push(c, { kind: 'summary' });
  if (c.mode === 'screen') c = push(c, { kind: 'schedule' });
  return c;
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
  const walk = items.some((id) => needsPerson(id, itemState(h, id)));
  if (!walk) return toSummary(base, h);
  // iPhone has one setting: no opening, straight to it (RS-10, the picture's note).
  if (h.os !== 'android') return advance(base, h);
  let c = push(base, { kind: 'app', key: 'rcv_intro_1', mark: true });
  c = push(c, { kind: 'app', key: countKey('rcv_intro_2', items.length), params: { n: items.length } });
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
      // Notifications: "Permitir" while Android/iOS can still show its own dialog.
      const key = id === 'notifications' && h && h.permission === 'undetermined' ? 'rcv_allow' : ITEM[id].act;
      return [p('act', key), s('not_now', 'ob_not_now')];
    }
    case 'retry':
      if (conv.current === 'deep_sleep') return [p('checked', 'rc_deep_sleep_checked_btn'), s('act', 'rcv_again'), s('skip', 'rcv_skip')];
      return [p('act', 'rcv_again'), s('skip', 'rcv_skip')];
    case 'summary':
      if (conv.mode === 'onboarding') {
        const done = !conv.items.some((id) => needsPerson(id, itemState(h, id)));
        return done ? [p('continue', 'ob_continue')] : [p('later', 'ob_setup_later')];
      }
      return [p('finish', 'rcv_finish'), s('test', 'rc_test_btn')];
    default:
      return [];
  }
}

// The person tapped a chip → { conv, effect }. effect: null | { type: 'open', fix, item, ask } |
// { type: 'close' } | { type: 'continue' } (onboarding) | { type: 'checked' } | { type: 'test' }.
function choose(conv, id, h) {
  const chip = chips(conv, h).find((x) => x.id === id);
  const said = (c) => push(c, { kind: 'user', key: chip ? chip.key : (id === 'skip' ? 'rcv_skip' : 'rcv_start') });
  const leave = conv.mode === 'onboarding' ? { type: 'continue' } : { type: 'close' };
  switch (id) {
    case 'start':
      return { conv: advance(said(conv), h), effect: null };
    case 'not_now':
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
  if (st === 'ok') return advance(conv, h);
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

// "N de M": the items behind us (OK, skipped, or seen in Android) of all the phone's items.
function progress(conv) {
  if (!conv) return { n: 0, total: 0 };
  const total = conv.items.length;
  return { n: conv.phase === 'summary' ? total : Math.min(conv.passed.length, total), total };
}

// The lines a screen reader announces after a change: the app's new lines, in order (RS-11).
function newSpoken(before, after) {
  const seen = new Set((before ? before.messages : []).map((m) => m.id));
  return (after ? after.messages : []).filter((m) => !seen.has(m.id) && m.kind !== 'user' && m.kind !== 'summary' && m.kind !== 'schedule');
}

// Is the person really back from Android? (The read must follow their answer, not race it.)
//   away: the app left the front (Android screen, iPhone Settings, iOS dialog); settled: the open/ask
//   call returned; opened: it managed to open something; waitedMs: since it returned.
function returnReady({ away, settled, appState, opened = true, waitedMs = 0 }) {
  if (!settled || appState !== 'active') return false;
  if (away) return true;
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
  startConversation, chips, choose, returned, afterChecked, testResult, progress, newSpoken, returnReady, segments,
};
