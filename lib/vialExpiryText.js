'use strict';
// Founder 2026-10-27: the vial expiry alert of a reconstituted vial names the validity the person gave
// ("pela validade que você informou (30 dias após reconstituir), vence em 7 dias") — the vial itself rarely
// carries a date. A ready-to-use box date and the expiry day keep Today's own short lines. Pure.
// e: { daysLeft, validDays }; t: the translator (t.language for the plural).
const { pluralKey } = require('./plural');

function expiryAlertBody(e, name, t) {
  if (!e || !(e.daysLeft > 0)) return t('today_alert_vial_expired_one').replace('{name}', name);
  const lang = t.language;
  if (Number(e.validDays) > 0) {
    return t(pluralKey('notif_vial_exp_valid', e.daysLeft, lang)).replace('{name}', name).replace('{days}', String(e.validDays)).replace('{n}', String(e.daysLeft));
  }
  return t(pluralKey('today_alert_vial_expiry_days', e.daysLeft, lang)).replace('{name}', name).replace('{n}', String(e.daysLeft));
}

module.exports = { expiryAlertBody };
