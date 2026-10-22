'use strict';
// A-163 — messages from the DoseTrace team (docs/specs/team-messages.md, signed 2026-10-22).
// The founder writes an account or support message to ONE account from the admin panel; the app
// shows it once in a sheet over Today ("Entendi" marks it read) and keeps it to reread in
// Settings › Support › Team messages. The server is the source of truth (dosetrace-admin
// supabase/migrations/20261022180000_team_messages.sql, "THE APP CONTRACT"):
//   - LIST: select own rows (RLS: own and not withdrawn); each answer REPLACES the local copy —
//     a message missing from it was withdrawn by the team and disappears from the app.
//   - MARK READ: rpc team_message_mark_read(p_id, p_at) with the tap time (an offline tap is
//     queued with its real time and sent on the next refresh); null back = drop it locally.
//   - The app never writes the table itself.
// The local copy is kept per account (key + owner id) so the sheet can show offline, is never read
// by another account, and is removed by the intended sign-out wipe and the cross-account discard
// (lib/signedOut runWipeSteps, lib/accountGuard discardPreviousAccount → clearTeamMessages).
//
// createTeamMessages is pure (runs under node --test with fake deps); the default instance loads
// AsyncStorage and Supabase lazily.

const { formatDate } = require('./localeFormat');
const { formatTime } = require('./timeFormat');

const KEY_PREFIX = 'dosetrace_team_messages:';
const TEAM_CHANNEL_ID = 'team-messages';
const storageKey = (uid) => KEY_PREFIX + uid;

function emptyState() { return { list: [], pending: {} }; }

function parseState(raw) {
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!v || typeof v !== 'object') return emptyState();
    const list = Array.isArray(v.list) ? v.list.map(normalizeRow).filter(Boolean) : [];
    const pending = v.pending && typeof v.pending === 'object' ? { ...v.pending } : {};
    return { list, pending };
  } catch { return emptyState(); }
}

function normalizeRow(r) {
  if (!r || typeof r !== 'object' || !r.id || typeof r.body !== 'string' || !r.created_at) return null;
  return { id: String(r.id), body: r.body, created_at: String(r.created_at), read_at: r.read_at ? String(r.read_at) : null };
}

const byNewest = (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at);

// The server's answer for account `uid` replaces the local list. Rows of any other account (an
// answer read across a switch) are dropped. A read tapped here but not yet confirmed keeps its
// tap time; a tap the server already has, or one for a message that is gone, leaves the queue.
function mergeFetched(state, rows, uid) {
  const pending = { ...(state && state.pending) };
  const list = (Array.isArray(rows) ? rows : [])
    .filter((r) => r && uid && r.user_id === uid)
    .map(normalizeRow).filter(Boolean)
    .sort(byNewest);
  const ids = new Set(list.map((m) => m.id));
  for (const id of Object.keys(pending)) if (!ids.has(id)) delete pending[id];
  for (const m of list) {
    if (m.read_at) delete pending[m.id];
    else if (pending[m.id]) m.read_at = pending[m.id];
  }
  return { list, pending };
}

// "Entendi" (or "Next") on the sheet: read at once here, the tap queued for the server.
function applyLocalRead(state, id, atIso) {
  const list = state.list.map((m) => (m.id === id && !m.read_at ? { ...m, read_at: atIso } : m));
  const was = state.list.find((m) => m.id === id);
  if (!was || was.read_at) return { list, pending: { ...state.pending } };
  return { list, pending: { ...state.pending, [id]: atIso } };
}

// The RPC's answer: the stored read_at, or null (not yours / withdrawn / unknown id) → dropped.
function applyReadResult(state, id, readAt) {
  const pending = { ...state.pending };
  delete pending[id];
  if (!readAt) return { list: state.list.filter((m) => m.id !== id), pending };
  return { list: state.list.map((m) => (m.id === id ? { ...m, read_at: String(readAt) } : m)), pending };
}

// What the sheet shows, in order: unread oldest first ("1 de 2"); a tapped notification's own
// message first (even when it was already read on the other phone — the tap asked for it).
function unreadQueue(state, firstId = null) {
  const unread = state.list.filter((m) => !m.read_at).sort((a, b) => -byNewest(a, b));
  const first = firstId ? state.list.find((m) => m.id === firstId) : null;
  if (!first) return unread;
  return [first, ...unread.filter((m) => m.id !== first.id)];
}

// Settings › Support: the row only after the first message.
function settingsRow(state) {
  if (!state || !state.list.length) return null;
  return { count: state.list.length, latestAt: state.list[0].created_at };
}

// Local calendar days between two instants (DST safe).
function dayGap(iso, nowMs) {
  const d = new Date(iso), n = new Date(nowMs);
  const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const b = Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
  return Math.round((b - a) / 86400000);
}
const hhmm = (iso) => { const d = new Date(iso); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };

// The sheet and the list: "Hoje, 10:14" · "Ontem, 09:05" · "3 de outubro de 2026".
function messageWhen(iso, nowMs, t, language, timeFormat) {
  const gap = dayGap(iso, nowMs);
  const time = formatTime(hhmm(iso), language, timeFormat);
  if (gap === 0) return String(t('team_msg_today_at')).replace('{time}', time);
  if (gap === 1) return String(t('team_msg_yesterday_at')).replace('{time}', time);
  return formatDate(iso, language, 'long', new Date(nowMs));
}

// The Settings row's "when": "hoje" · "ontem" · "em 3 de out.".
function rowWhen(iso, nowMs, t, language) {
  const gap = dayGap(iso, nowMs);
  if (gap === 0) return t('team_msgs_when_today');
  if (gap === 1) return t('team_msgs_when_yesterday');
  return String(t('team_msgs_when_date')).replace('{date}', formatDate(iso, language, 'dayMonthAuto', new Date(nowMs)));
}

// "2 mensagens · a última hoje" / "1 mensagem · recebida hoje" (French singular also for 0/1).
function settingsRowLine(info, nowMs, t, language) {
  if (!info) return '';
  const one = language === 'fr' ? info.count < 2 : info.count === 1;
  return String(t(one ? 'team_msgs_sub_one' : 'team_msgs_sub'))
    .replace('{n}', String(info.count))
    .replace('{when}', rowWhen(info.latestAt, nowMs, t, language));
}

// TM-13 / TM-15: the sheet opens only on Today in front, with nothing of Today's own up, no site
// question waiting (a Mark taken tap: the dose comes first), no dose a reminder tap is focusing,
// and no other app-level screen (the required update notice, A-127, when it ships) up.
function teamSheetMayOpen(s) {
  return !!(s && s.focused && !s.todayPopup && !(s.siteQuestions > 0) && !(s.keptQuestions > 0)
    && !s.logPopup && !s.vialPending && !s.doseFocusOpen && !s.otherScreen);
}

// Android: the channel the team's pushes will use once the server switches to it (until then the
// server sends on 'checkin-reminders', which every installed version already has).
function teamChannelRequest(t, importance) {
  return { id: TEAM_CHANNEL_ID, options: { name: t('settings_team_messages'), importance: (importance && importance.HIGH) || 4 } };
}

function createTeamMessages(deps) {
  let uid = null;
  let state = emptyState();
  let loaded = false;
  let gen = 0; // bumped on every account change / forget: answers started before it are dropped
  let inflight = null;
  let again = false;
  const subs = new Set();
  const now = () => (deps.now ? deps.now() : Date.now());

  function snapshot() { return { uid, list: state.list, pending: state.pending, loaded }; }
  function emit() {
    const s = snapshot();
    for (const fn of Array.from(subs)) { try { fn(s); } catch { /* one screen never breaks another */ } }
  }
  async function persist(forUid, forGen) {
    if (!forUid || forGen !== gen) return;
    try { await deps.storage.setItem(storageKey(forUid), JSON.stringify(state)); } catch { /* the server keeps the truth */ }
  }
  async function switchTo(next) {
    gen++;
    uid = next;
    state = emptyState();
    loaded = false;
    const myGen = gen;
    if (next) {
      let raw = null;
      try { raw = await deps.storage.getItem(storageKey(next)); } catch { raw = null; }
      if (myGen !== gen) return;
      state = parseState(raw);
    }
    loaded = true;
    emit();
  }

  async function sendPending(forUid, myGen) {
    for (const [id, at] of Object.entries(state.pending)) {
      let r;
      try { r = await deps.markReadRemote(id, at); } catch { r = { error: true }; }
      if (myGen !== gen || uid !== forUid) return;
      if (!r || r.error) continue; // offline: stays queued with its real time
      state = applyReadResult(state, id, r.data || null);
    }
  }

  async function refreshOnce() {
    let next = null;
    try { next = await deps.getUserId(); } catch { next = null; }
    if (next !== uid || !loaded) await switchTo(next);
    if (!uid) return { ok: false, signedOut: true };
    const forUid = uid, myGen = gen;
    await sendPending(forUid, myGen);
    if (myGen !== gen) return { ok: false };
    let r;
    try { r = await deps.fetchRows(); } catch (e) { r = { data: null, error: e || true }; }
    if (myGen !== gen || uid !== forUid) return { ok: false };
    if (!r || r.error || !Array.isArray(r.data)) { await persist(forUid, myGen); emit(); return { ok: false }; }
    state = mergeFetched(state, r.data, forUid);
    await persist(forUid, myGen);
    emit();
    return { ok: true };
  }

  // One refresh at a time; a call during one runs once more after it (a push that just arrived).
  function refresh() {
    if (inflight) { again = true; return inflight; }
    inflight = (async () => {
      let r;
      try {
        do { again = false; r = await refreshOnce(); } while (again);
      } finally { inflight = null; }
      return r;
    })();
    return inflight;
  }

  async function markRead(id) {
    if (!uid) return;
    const forUid = uid, myGen = gen;
    const at = new Date(now()).toISOString();
    state = applyLocalRead(state, id, at);
    emit();
    await persist(forUid, myGen);
    if (!state.pending[id]) return;
    let r;
    try { r = await deps.markReadRemote(id, at); } catch { r = { error: true }; }
    if (myGen !== gen || uid !== forUid || !r || r.error) return;
    state = applyReadResult(state, id, r.data || null);
    await persist(forUid, myGen);
    emit();
  }

  // In memory only: the account changed or signed out; nothing of the old one is shown or stored.
  function forget() { gen++; uid = null; state = emptyState(); loaded = false; emit(); }

  // The intended sign-out wipe / the cross-account discard: every account's kept copy.
  async function clearAll() {
    forget();
    try {
      const keys = (await deps.storage.getAllKeys()) || [];
      const mine = keys.filter((k) => String(k).startsWith(KEY_PREFIX));
      if (mine.length) await deps.storage.multiRemove(mine);
    } catch { /* best effort: per-account keys are never read by another account anyway */ }
  }

  return {
    refresh, markRead, forget, clearAll, snapshot,
    unread: (firstId) => unreadQueue(state, firstId),
    subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); },
  };
}

// ── the app's instance ──
let shared = null;
function teamMessages() {
  if (shared) return shared;
  const AsyncStorage = require('@react-native-async-storage/async-storage').default;
  const { supabase } = require('./supabase');
  shared = createTeamMessages({
    storage: AsyncStorage,
    getUserId: async () => {
      const { data } = await supabase.auth.getSession();
      return (data && data.session && data.session.user && data.session.user.id) || null;
    },
    fetchRows: () => supabase.from('team_messages').select('id, user_id, body, created_at, read_at')
      .order('created_at', { ascending: false }).limit(200),
    markReadRemote: (id, at) => supabase.rpc('team_message_mark_read', { p_id: id, p_at: at }),
  });
  return shared;
}
// For the wipe steps (never throws).
function clearTeamMessages() {
  try { return teamMessages().clearAll(); } catch { return Promise.resolve(); }
}

module.exports = {
  KEY_PREFIX, TEAM_CHANNEL_ID, storageKey, emptyState, parseState, mergeFetched, applyLocalRead, applyReadResult,
  unreadQueue, settingsRow, messageWhen, rowWhen, settingsRowLine, teamSheetMayOpen, teamChannelRequest,
  createTeamMessages, teamMessages, clearTeamMessages,
};
