// A-206 GB-7: the iPhone's native tab bar takes images. DoseTrace's five glyphs (App.js) rendered as
// template PNGs (scripts/render-tab-icons.cjs; Metro picks @2x/@3x): outline = not selected, filled =
// selected. iOS tints them with the bar's colours (active = ink).
export const TAB_ICONS = {
  Today: { outline: require('../assets/tab-icons/today.png'), filled: require('../assets/tab-icons/today-filled.png') },
  Protocols: { outline: require('../assets/tab-icons/protocols.png'), filled: require('../assets/tab-icons/protocols-filled.png') },
  Journey: { outline: require('../assets/tab-icons/journey.png'), filled: require('../assets/tab-icons/journey-filled.png') },
  Body: { outline: require('../assets/tab-icons/body.png'), filled: require('../assets/tab-icons/body-filled.png') },
  Settings: { outline: require('../assets/tab-icons/settings.png'), filled: require('../assets/tab-icons/settings-filled.png') },
};
