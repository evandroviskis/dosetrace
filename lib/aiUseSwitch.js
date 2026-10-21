'use strict';
// DV-007 = A (founder 2026-10-20, docs/design/dv007-ai-consent-withdraw.html): the "AI use" switch
// in Settings › Data & privacy, right after "Usage analytics". Behaviour-tested in
// __tests__/dv007AiConsentPerAccount.
//   ON  = this account's AI consent is granted (lib/aiConsent, read per account).
//   OFF → the consent is withdrawn at once (revokeAIConsent): no sheet, nothing deleted; the next
//         AI feature asks again (GDPR Art. 7(3): as easy to withdraw as to give).
//   ON  → the same AI consent sheet every AI feature shows before sending; the switch turns ON
//         only after "Agree" (Cancel, the policy link or closing the sheet leave it OFF).
// The consent stays on this phone (lib/aiConsent): nothing here writes to the account or the network.
// Pure: every effect is injected (SettingsScreen wires the real ones).

// The sheet the AI features show (BodyScreen, ProtocolsScreen, VaccinesSection, FoodChatScreen).
function aiConsentSheet(t, { onAgree, onPrivacy }) {
  return {
    icon: 'ai_spark',
    title: t('ai_consent_title'),
    body: t('ai_consent_body'),
    link: { label: t('ai_consent_privacy'), onPress: onPrivacy },
    buttons: [
      { label: t('cancel'), kind: 'secondary' },
      { label: t('ai_consent_agree'), kind: 'primary', onPress: onAgree },
    ],
  };
}

// d = { t, has, grant, revoke, setOn, showSheet, openPrivacy }
function createAIUseSwitch() {
  let seq = 0; // a read that started before the person's tap never overwrites it

  async function shown(d, my) {
    let v = false;
    try { v = !!(await d.has()); } catch { v = false; }
    if (my === seq) d.setOn(v);
    return v;
  }

  // Settings shown (focus): what this account holds now. Signed out / another account → OFF.
  function load(d) {
    seq += 1;
    return shown(d, seq);
  }

  async function toggle(on, d) {
    seq += 1;
    const my = seq;
    if (!on) {
      d.setOn(false);
      let ok = false;
      try { ok = await d.revoke(); } catch { ok = false; }
      // Not recorded (storage refused): show what the phone still holds, never a false OFF.
      if (!ok) await shown(d, my);
      return;
    }
    d.showSheet(aiConsentSheet(d.t, {
      onPrivacy: () => { try { d.openPrivacy(); } catch { /* the switch stays OFF */ } },
      onAgree: async () => {
        seq += 1;
        const mine = seq;
        let ok = false;
        try { ok = await d.grant(); } catch { ok = false; }
        if (ok && mine === seq) d.setOn(true);
        else if (!ok) await shown(d, mine);
      },
    }));
  }

  return { load, toggle };
}

module.exports = { createAIUseSwitch, aiConsentSheet };
