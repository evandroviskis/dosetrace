'use strict';
// The legal links shown on the paywall (App Store guideline 3.1.2: an app selling a
// subscription must link its Terms of Use (EULA) and Privacy Policy in the purchase flow).
// DoseTrace uses Apple's Standard EULA (as declared in App Store Connect).
const EULA_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
const PRIVACY_URL = 'https://dosetrace.io/privacy-policy';

// Where the paywall's Terms link goes (founder 2026-09-30): Apple's Standard EULA is
// the iOS agreement; on Android the link shows DoseTrace's own Terms of service,
// which live in the app (dosetrace.io has no terms page).
function termsTarget(platformOS) {
  if (platformOS === 'android') return { kind: 'inApp', labelKey: 'settings_terms', titleKey: 'settings_terms', bodyKey: 'settings_terms_body' };
  return { kind: 'url', url: EULA_URL, labelKey: 'paywall_terms_eula' };
}

module.exports = { EULA_URL, PRIVACY_URL, termsTarget };
