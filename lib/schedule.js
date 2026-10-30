const { endedAtMs } = require('./protocolEnd');

// Pure dose-schedule math — no React Native or Expo imports, so it runs under
// plain Node's test runner. CommonJS for the same reason (Metro imports it fine).
//
// A "protocol" here is a plain row: { start_date, interval_days, doses_per_day,
// reminder_time, created_at }. All functions are deterministic given their args.

// A protocol's dose times, sorted chronologically (users may enter them out of order).
// A-83: an ended protocol expects nothing after its end (lib/protocolEnd). On the end day only
// the slots up to the end moment count. Returns "after" | "endDay" | null.
function endState(p, day) {
  const endMs = endedAtMs(p);
  if (endMs == null) return null;
  const end = new Date(endMs);
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
  if (day.getTime() > endDay) return { kind: 'after' };
  if (day.getTime() === endDay) return { kind: 'endDay', endMs };
  return null;
}

// A-157: THE rule for "after the end" — a slot at slotMs is after the protocol's end when the
// protocol is ended (lib/protocolEnd endedAtMs) and the slot's moment is later than the end
// moment; a slot AT the end moment still counts. Every slot consumer uses it: Today's slots
// (lib/dosePageState daySlots), the reminders plan (lib/notificationPlan doseSlots), and the
// rings, Missed scan and curve through expectedSlotTimesOn — so nothing after the end is shown,
// reminded or counted. The planned end (ends_on) is not an end (A-121 SG-4 / SG-11).
function slotAfterEnd(p, slotMs) {
  const endMs = endedAtMs(p);
  return endMs != null && Number.isFinite(slotMs) && slotMs > endMs;
}

function sortedDoseTimes(p) {
  return (p.reminder_time || '').split(',').filter(Boolean).sort();
}

// How many doses of protocol p are expected on the given date.
// Honors start_date and interval_days, and — on the day the protocol was
// created — only counts dose slots from the creation time onward, so a
// protocol created at 4:30 PM never retroactively demands the 8 AM dose.
function expectedDosesOn(p, dayDate) {
  const dpd = p.doses_per_day || 1;
  const interval = p.interval_days || 1;
  const day = new Date(dayDate);
  day.setHours(0, 0, 0, 0);
  const ended = endState(p, day);
  if (ended && ended.kind === 'after') return 0;
  if (ended) return expectedSlotTimesOn(p, dayDate).length;

  if (p.start_date) {
    const start = new Date(p.start_date + 'T00:00:00');
    const diffDays = Math.round((day - start) / 86400000);
    if (diffDays < 0) return 0;
    if (diffDays % interval !== 0) return 0;
  }
  // SG-23 / AD-82: a legacy finite course expects nothing after its last dose day.
  if (afterCourseTotal(p, day)) return 0;

  // NOTE (2026-09-10, revised): a protocol set up TODAY must keep today's dose
  // loggable even if the reminder time already passed when it was created — the
  // user sets it up right after taking the dose and needs to mark it taken.
  // BUT this count is also the adherence/streak/curve oracle, so it must NOT
  // treat a slot that fell *before* the app was set up as "owed": that would ding
  // the creation-day streak for a dose the user never had a chance to log here.
  // So on the creation day we count only the slots from creation-time onward
  // (identical filter to expectedSlotTimesOn — the two oracles must agree), with
  // a floor of 1 so the just-taken dose is always loggable. Reminders skip passed
  // slots separately (notifications layer), so no late alarm fires.
  if (p.created_at) {
    const created = new Date(p.created_at);
    if (!isNaN(created) && created.toDateString() === day.toDateString()) {
      return Math.max(1, expectedSlotTimesOn(p, dayDate).length);
    }
  }
  return dpd;
}

// The actual dose-time strings ("HH:MM") p expects on the given date, in
// chronological order — the slot-level companion to expectedDosesOn (which just
// counts). Honors start_date/interval and the creation-day rule (a protocol
// created at 4:30 PM never expects that day's 8 AM slot). Used by the missed-dose
// scanner to know each slot's scheduled moment.
function expectedSlotTimesOn(p, dayDate) {
  const dpd = p.doses_per_day || 1;
  const interval = p.interval_days || 1;
  const day = new Date(dayDate);
  day.setHours(0, 0, 0, 0);

  if (p.start_date) {
    const start = new Date(p.start_date + 'T00:00:00');
    const diffDays = Math.round((day - start) / 86400000);
    if (diffDays < 0) return [];
    if (diffDays % interval !== 0) return [];
  }
  if (afterCourseTotal(p, day)) return [];

  let times = sortedDoseTimes(p).slice(0, dpd);
  const ended = endState(p, day);
  if (ended && ended.kind === 'after') return [];
  if (ended) {
    times = times.filter((t24) => {
      const [h, m] = t24.split(':').map(Number);
      const slot = new Date(day); slot.setHours(h, m, 0, 0);
      return !slotAfterEnd(p, slot.getTime());
    });
  }

  if (p.created_at) {
    const created = new Date(p.created_at);
    if (!isNaN(created) && created.toDateString() === day.toDateString()) {
      const graceMs = 60 * 60 * 1000; // a slot within the past hour still counts
      return times.filter((t24) => {
        const [h, m] = t24.split(':').map(Number);
        const slot = new Date(day);
        slot.setHours(h, m, 0, 0);
        return slot.getTime() >= created.getTime() - graceMs;
      });
    }
  }
  return times;
}

// Next date after fromDate on which p expects at least one dose.
function nextDueDate(p, fromDate) {
  const d = new Date(fromDate);
  d.setHours(0, 0, 0, 0);
  // Look ahead far enough to find the next dose even for long-interval
  // protocols (e.g. testosterone undecanoate ~every 12 weeks). The next hit is
  // at most `interval_days` away, so scan a full interval plus a margin.
  const horizon = Math.max(60, (p.interval_days || 1) + 2);
  for (let i = 1; i <= horizon; i++) {
    d.setDate(d.getDate() + 1);
    if (expectedDosesOn(p, d) > 0) return new Date(d);
  }
  return null;
}

// Did the protocol exist on this date? Days before creation must never
// count against streaks or adherence.
function existedOn(p, dayDate) {
  if (!p.created_at) return true;
  const created = new Date(p.created_at);
  if (isNaN(created)) return true;
  const endOfDay = new Date(dayDate);
  endOfDay.setHours(23, 59, 59, 999);
  return created <= endOfDay;
}

// Epoch-ms of the next dose the user should act on — used to order the Today
// list purely by "what's next to take". `takenToday` and `now` are injected so
// this is deterministic and testable.
//   - a dose expected today with slots still un-taken → the next un-taken slot today
//     (an overdue morning slot sorts earliest; a later slot sorts later)
//   - otherwise → the next scheduled dose date, at its earliest reminder time
// A protocol whose today doses are all taken therefore sorts by TOMORROW's dose,
// not to the bottom — so "tomorrow" always precedes "in 2 days".
function nextDoseAt(p, takenToday, now) {
  const need = expectedDosesOn(p, now);
  const taken = takenToday || 0;
  if (need > 0 && taken < need) {
    const dpd = p.doses_per_day || 1;
    const times = sortedDoseTimes(p).slice(0, dpd);
    const slot = times[(dpd - need) + taken] || times[0] || '00:00';
    const [h, m] = slot.split(':').map(Number);
    const d = new Date(now);
    d.setHours(h, m, 0, 0);
    return d.getTime();
  }
  const nd = nextDueDate(p, now);
  if (!nd) return Infinity;
  const times = sortedDoseTimes(p);
  if (times.length) {
    const [h, m] = times[0].split(':').map(Number);
    nd.setHours(h, m, 0, 0);
  }
  return nd.getTime();
}

// Today's "Tomorrow" / "Next 5 days" folds (A-134, prototype foldRow 'tom' / 'n5'; DL-11 and
// DV-037: the folds count DOSES). One row { p, at } per dose slot:
//   - tomorrow: every slot due tomorrow, whatever is open or taken today (a daily dose still
//     open tonight is also due tomorrow);
//   - next5: for each protocol NOT in tomorrow, the slots of its first dose day within days 2
//     to 6 (a daily protocol is not repeated five times);
//   - laterCount: protocols with nothing in days 1 to 6 but a dose after (e.g. a weekly dose
//     taken today), for "N more scheduled later".
// `protocols` are the active ones; ended protocols expect nothing after their end.
function upcomingAgenda(protocols, now) {
  const base = new Date(now);
  base.setHours(0, 0, 0, 0);
  const dayAt = (k) => { const d = new Date(base); d.setDate(d.getDate() + k); return d; };
  const rowsOn = (p, day) => {
    let times = expectedSlotTimesOn(p, day);
    // no stored time (older rows): one row per expected dose at the first time / midnight
    if (!times.length) {
      const n = expectedDosesOn(p, day);
      if (n > 0) times = Array(n).fill(sortedDoseTimes(p)[0] || '00:00');
    }
    return times.map((t24) => {
      const [h, m] = String(t24).split(':').map(Number);
      const at = new Date(day);
      at.setHours(h || 0, m || 0, 0, 0);
      return { p, at: at.getTime() };
    });
  };
  const byTime = (a, b) => a.at - b.at;
  const tomorrow = [];
  const next5 = [];
  let laterCount = 0;
  for (const p of protocols || []) {
    if (!p) continue;
    const tom = rowsOn(p, dayAt(1));
    if (tom.length) { tomorrow.push(...tom); continue; }
    let found = false;
    for (let k = 2; k <= 6 && !found; k++) {
      const rows = rowsOn(p, dayAt(k));
      if (rows.length) { next5.push(...rows); found = true; }
    }
    if (!found && nextDueDate(p, dayAt(6))) laterCount++;
  }
  return { tomorrow: tomorrow.sort(byTime), next5: next5.sort(byTime), laterCount };
}

// All scheduled dose MOMENTS (ms timestamps) from a protocol's start_date up to
// `nowMs`, for BACKFILLING a protocol the user started before installing the app
// (e.g. "started tirzepatide 2 weeks ago"). Honors interval_days + doses_per_day +
// reminder times; includes today's slots that already passed; excludes future
// slots. Ignores the creation-day filter (that guards live adherence, not an
// explicit historical backfill). Bounded to `maxDays` of lookback so a very old
// start date can't generate thousands of rows (keeps the most recent window).
function elapsedDoseSlots(p, nowMs, maxDays = 180) {
  const out = [];
  if (!p || !p.start_date) return out;
  const interval = p.interval_days || 1;
  const dpd = p.doses_per_day || 1;
  const times = sortedDoseTimes(p).slice(0, dpd);
  if (!times.length) return out;

  const start = new Date(p.start_date + 'T00:00:00');
  if (isNaN(start)) return out;
  const now = new Date(nowMs);
  // Don't backfill further back than maxDays. Begin iterating at the later of the
  // start date and the floor, so an ancient start date doesn't exhaust the loop
  // guard on old days before reaching the recent window (interval alignment is
  // still measured from start).
  const floor = new Date(now.getTime() - maxDays * 86400000);
  floor.setHours(0, 0, 0, 0);
  const day = new Date(Math.max(start.getTime(), floor.getTime()));
  day.setHours(0, 0, 0, 0);
  let guard = 0;
  while (day.getTime() <= now.getTime() && guard++ < maxDays + 5) {
    const diffDays = Math.round((day - start) / 86400000);
    if (diffDays % interval === 0) {
      for (const t24 of times) {
        const [h, m] = t24.split(':').map(Number);
        const slot = new Date(day);
        slot.setHours(h, m, 0, 0);
        const ms = slot.getTime();
        if (ms <= now.getTime() && ms >= start.getTime() && ms >= floor.getTime()) out.push(ms);
      }
    }
    day.setDate(day.getDate() + 1);
  }
  return out;
}

// ── S-15 the course state (A-121, docs/specs/still-going-end-date.md) ──────────────────────────
// The planned end (protocols.ends_on, a local day 'YYYY-MM-DD' the person chose: "Continua até uma
// data…" / the protocol page's "Termina em") and the legacy course total (schedule_total, AD-82) are
// read HERE ONLY (SG-11 guard test). A planned end changes nothing the schedule owes (SG-4): no
// dose, slot, reminder, Missed row, ring or curve point reads it. It only silences "Still going?"
// before its day and asks "Ciclo concluído — encerrar {name}?" on and after it. Days are the phone's
// LOCAL calendar days (DL-116: never a UTC parse of 'YYYY-MM-DD').

function pad2(n) { return (n < 10 ? '0' : '') + n; }
// The local calendar day of a moment, 'YYYY-MM-DD' (the lib/localDate localISO rule; this file is
// CommonJS and cannot import it).
function localDayKey(d = new Date()) {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`;
}
function isDayKey(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const x = new Date(y, m - 1, d);
  return x.getFullYear() === y && x.getMonth() === m - 1 && x.getDate() === d;
}
function keyDate(key) { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); }
function addDaysKey(key, n) { const d = keyDate(key); d.setDate(d.getDate() + n); return localDayKey(d); }
// One calendar month later, clamped to that month's last day (Jan 31 → Feb 28).
function addMonthKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  const last = new Date(y, m + 1, 0).getDate();
  return localDayKey(new Date(y, m, Math.min(d, last)));
}

// The planned end as stored, or null (a bad value is no end date).
function plannedEndOf(p) { return p && isDayKey(p.ends_on) ? p.ends_on : null; }
// The last day of a legacy finite course: schedule_total dose DAYS from the start, every
// interval_days (the same count as lib/notificationPlan dueDateKeys). null without a start or total.
function totalEndOf(p) {
  const total = p && Number(p.schedule_total);
  if (!total || total < 1 || !isDayKey(p.start_date)) return null;
  return addDaysKey(p.start_date, (total - 1) * Math.max(1, p.interval_days || 1));
}

// SG-23 / DV-012 (AD-82): past the last day of a legacy course total, no dose is expected — the
// same days as the reminders' dueDateKeys. A planned end (ends_on) is not read here (SG-4).
function afterCourseTotal(p, day) {
  const end = totalEndOf(p);
  return !!end && localDayKey(day) > end;
}

// → { kind: 'planned' | 'total' | null, endKey, plannedEnd, before, onEnd, after }.
// A row with both asks at the earlier one (DL-112). plannedEnd: the stored planned end (the
// protocol page's "Termina em" row), whatever the kind.
function courseState(p, now = new Date()) {
  const plannedEnd = plannedEndOf(p);
  const totalEnd = totalEndOf(p);
  let kind = null;
  let endKey = null;
  if (plannedEnd && (!totalEnd || plannedEnd <= totalEnd)) { kind = 'planned'; endKey = plannedEnd; }
  else if (totalEnd) { kind = 'total'; endKey = totalEnd; }
  if (!kind) return { kind, endKey, plannedEnd, before: false, onEnd: false, after: false };
  const today = localDayKey(now);
  return { kind, endKey, plannedEnd, before: today < endKey, onEnd: today === endKey, after: today > endKey };
}

// SG-17 / DL-109: may Today ask "Ciclo concluído" now? Never before the end date. On it, only once
// every dose of that day is answered (Taken / Skipped) — a slot whose time has gone can still be
// logged that day, so it passes only when the day is over; a day with nothing due asks at once.
// After it: always (SG-27, also many days later). logs: dose_log rows of the period.
function courseEndAsk(p, now, logs) {
  const cs = courseState(p, now);
  if (!cs.kind || cs.before) return false;
  if (cs.after) return true;
  const due = expectedDosesOn(p, keyDate(cs.endKey));
  if (!due) return true;
  const answered = (logs || []).filter((l) => l && l.protocol_id === p.id
    && (l.outcome === 'Taken' || l.outcome === 'Skipped') && localDayKey(new Date(l.logged_at)) === cs.endKey).length;
  return answered >= due;
}

// When "Encerrar" ends the course (ISO). On the end date: the tap (DL-99). Later (the question came
// late, DL-110): the end of the end date's local day, or the last logged Taken dose when that is
// later (never after now). No course: the tap.
function courseEndMoment(p, now = new Date(), lastTakenIso = null) {
  const nowDate = new Date(now);
  const cs = courseState(p, nowDate);
  if (!cs.kind || !cs.after) return nowDate.toISOString();
  const d = keyDate(cs.endKey);
  d.setHours(23, 59, 59, 0);
  let ms = d.getTime();
  const last = lastTakenIso ? Date.parse(lastTakenIso) : NaN;
  if (Number.isFinite(last) && last > ms) ms = Math.min(last, nowDate.getTime());
  return new Date(ms).toISOString();
}

// SG-8 / SG-13: the end-date wheel. minKey = the first day that can be saved: the later of tomorrow
// and the start date (opts.startKey: a start being edited, the start-after-end notice). openKey = the
// saved end date, else one month after the later of today and the start, never before minKey.
function endDateRange(p, now = new Date(), opts = {}) {
  const today = localDayKey(now);
  const start = isDayKey(opts.startKey) ? opts.startKey : (p && isDayKey(p.start_date) ? p.start_date : null);
  const tomorrow = addDaysKey(today, 1);
  const minKey = start && start > tomorrow ? start : tomorrow;
  const saved = plannedEndOf(p);
  let openKey = saved && saved >= minKey ? saved : addMonthKey(start && start > today ? start : today);
  if (openKey < minKey) openKey = minKey;
  return { minKey, openKey };
}

// Human label for a dosing interval, in the current app language. Derive this
// from interval_days at render time — the stored `frequency` string is baked in
// at creation time and would show the creation-language label forever.
function frequencyLabelFor(intervalDays, t) {
  const i = intervalDays || 1;
  if (i === 1) return t('protocols_daily');
  return t('protocols_every_x_days').replace('{x}', i);
}

module.exports = {
  sortedDoseTimes, expectedDosesOn, expectedSlotTimesOn, slotAfterEnd, elapsedDoseSlots, nextDueDate, existedOn, nextDoseAt, frequencyLabelFor, upcomingAgenda,
  localDayKey, isDayKey, addDaysKey, courseState, courseEndAsk, courseEndMoment, endDateRange,
};
