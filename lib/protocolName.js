// One display name per protocol everywhere (DL-13, A-134): the translated compound when the
// protocol has a catalogue compound, else the name the person typed. The same rule Today uses
// on its cards and rows; the Reminder check and the reminders themselves use it too, so a
// Portuguese user never reads "Magnesium Bisglycinate" there while Today says
// "Bisglicinato de Magnésio". Pure CommonJS (tested under node --test).
function protocolDisplayName(p, t) {
  if (!p) return '';
  return p.compound_id ? t(p.compound_id) : (p.name || '');
}

module.exports = { protocolDisplayName };
