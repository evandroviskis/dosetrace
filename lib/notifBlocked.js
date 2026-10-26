'use strict';
// Notifications blocked on the phone (docs/specs/notifications-blocked.md; founder 2026-10-20
// "1.3.2 recommendations accepted": "a short sheet when notifications are blocked on the phone").
// Today reads the permission with the reminder health (lib/notifications readReminderHealth); when
// the phone says DoseTrace's notifications are blocked ('denied') while dose reminders matter, one
// short DoseTrace sheet says reminders cannot arrive and offers the phone's settings — once per
// state change (remembered on this phone), never nagging. Today's "Your reminders are blocked" card
// is unchanged. Pure (no React Native).
//   'undetermined' (never asked) and null (unreadable) are not "blocked on the phone": no sheet,
//   nothing remembered (DV-214: unknown is never a block). Silent mode, dose reminders off or no
//   protocol with a reminder time: no sheet (RC-6 / BR-4), nothing remembered, so it can come once
//   when the reminders matter again.

const NOTIF_BLOCKED_KEY = 'dosetrace_notif_blocked_seen';

// h: the reminder health ({ permission, remindersOn, silent, activeWithTime }); last: the state
// remembered on this phone ('denied' | 'granted' | null). → { show, save } (save: what to remember,
// or null to leave it).
function blockedSheetStep(h, last) {
  const p = h && h.permission;
  if (p === 'granted') return { show: false, save: last === 'granted' ? null : 'granted' };
  if (p !== 'denied') return { show: false, save: null };
  const matter = !!h.remindersOn && !h.silent && (h.activeWithTime || 0) > 0;
  if (!matter || last === 'denied') return { show: false, save: null };
  return { show: true, save: 'denied' };
}

// The DoseTrace sheet (DTSheet config). "Agora não" (and a tap outside) only closes.
function blockedSheet({ t, onOpen }) {
  return {
    icon: 'bell',
    title: t('nb_title'),
    body: t('nb_body'),
    buttons: [
      { label: t('nb_later'), kind: 'secondary' },
      { label: t('nb_open'), kind: 'primary', onPress: onOpen },
    ],
  };
}

module.exports = { blockedSheetStep, blockedSheet, NOTIF_BLOCKED_KEY };
