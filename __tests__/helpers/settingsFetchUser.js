'use strict';
// Runs SettingsScreen's REAL fetchUser (and, when present, setEditProfileOpen / openEditProfile)
// under plain node with React's setters faked and the real lib/firstLoad helpers, so a test sees
// what the profile card and Edit profile hold after each read (A-169 review, 2026-10-26).
const { sliceBlock, read } = require('./extractFn');

const SRC = read('screens/SettingsScreen.js');
const FIRST_LOAD = read('lib/firstLoad.js');
// eslint-disable-next-line no-new-func
const { whenAllSettled, deferred } = new Function(`${sliceBlock(FIRST_LOAD, 'export function whenAllSettled(').replace(/^export\s+/, '')}
${sliceBlock(FIRST_LOAD, 'export function deferred(').replace(/^export\s+/, '')}
return { whenAllSettled, deferred };`)();

const META = {
  display_name: 'Sam Carter', gender: 'male', birth_month: 3, birth_year: 1990, country: 'US',
  primary_goal: 'longevity', activity_level: 'moderate', has_provider: 'yes',
};
const USER = { id: 'u1', email: 'sam@example.com', user_metadata: META };
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

// cap: the A-120 cap the screen's whenAllSettled calls get (4 s in the app).
function settings({ getCachedUser, cap = 60 } = {}) {
  const state = { cardReady: false, showEditProfile: false, displayName: 'Sam Carter', primaryGoals: ['longevity'], gender: '', country: '' };
  const set = (k) => (v) => { state[k] = typeof v === 'function' ? v(state[k]) : v; };
  const noop = () => {};
  const deps = {
    getBillingStore: () => Promise.resolve(null), billingLoad: { current: null }, setBillingStore: noop,
    getCachedUser, setUser: set('user'), aiUse: { load: noop }, aiUseDeps: () => ({}),
    hasPremium: async () => true, setPremium: set('premium'),
    whenAllSettled: (tasks) => whenAllSettled(tasks, { capMs: cap }),
    setCardReady: set('cardReady'),
    noteAnalyticsChoice: noop, setAnalyticsEnabled: noop, analyticsSaved: { current: null },
    setDoseReminders: noop, setCheckinReminders: noop, setFoodReminders: noop, setNotifNames: noop,
    setVialAlerts: noop, setSilentMode: noop, versionNewsShown: async () => false, setVersionNews: noop,
    setPersistentReminders: noop,
    setDisplayName: set('displayName'), setGender: set('gender'), setBirthMonth: set('birthMonth'),
    setBirthYear: set('birthYear'), setBirthYearText: set('birthYearText'), setCountry: set('country'),
    setPrimaryGoals: set('primaryGoals'), activitySourceKey: (m) => (m && m.activity_level) || '',
    getCalcInputs: async () => null, setActivityLevel: set('activityLevel'), setHasProvider: set('hasProvider'),
    setShowEditProfile: set('showEditProfile'), editProfileOpen: { current: false }, profileLoaded: deferred(),
  };
  const names = Object.keys(deps);
  const headers = ['async function fetchUser() {', 'function setEditProfileOpen(', 'function openEditProfile(']
    .filter((h, i) => i === 0 || SRC.includes(h));
  const body = headers.map((h) => sliceBlock(SRC, h)).join('\n');
  // eslint-disable-next-line no-new-func
  const api = new Function(...names, `${body}
return {
  fetchUser,
  setEditProfileOpen: typeof setEditProfileOpen === 'function' ? setEditProfileOpen : null,
  openEditProfile: typeof openEditProfile === 'function' ? openEditProfile : null,
};`)(...names.map((n) => deps[n]));
  return { state, deps, ...api };
}

module.exports = { settings, USER, META, tick, SRC };
