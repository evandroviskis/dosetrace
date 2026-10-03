/**
 * The one-time "I'm 18 or older" confirmation (founder 2026-10-03 "2 sim";
 * docs/specs/premium-and-auth.md PA-100…PA-105). Shown by App.js instead of the app when the
 * account's stored birth year makes it under 18 and it was never confirmed (lib/adultGate).
 *
 * The DoseTrace sheet look, on the ground: confirm → adult_confirmed_at on the account (one key,
 * merge-only; USER_UPDATED then opens the app) and never asked again. Not confirmed → the account
 * stays here with three ways out: download my data (the one export), delete my account (the one
 * two-step delete) and sign out. Nothing is ever deleted automatically. A failed save (offline)
 * says why and stays here — it can be tried again.
 */
import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLanguage } from '../i18n/LanguageContext';
import { useTheme } from '../lib/theme';
import { CONTENT_MAX_WIDTH } from '../lib/responsive';
import { supabase } from '../lib/supabase';
import { friendlyError } from '../lib/friendlyError';
import { adultConfirmPatch, storedYear } from '../lib/adultGate';
import { exportMyData, requestAccountDeletion, finishAccountDeletion, signOutIntended } from '../lib/accountActions';
import FeatureIcon from '../components/FeatureIcon';
import { DTSheet } from './components/ProtocolParts';

export default function AgeConfirmScreen({ session }) {
  const { t } = useLanguage();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [busy, setBusy] = useState(null); // 'confirm' | 'export' | 'delete' | 'signout'
  const [sheet, setSheet] = useState(null);
  const user = session && session.user;
  const year = storedYear(user && user.user_metadata);

  const ok = (title, body, icon = 'alert', onPress) => setSheet({ icon, title, body, buttons: [{ label: t('ok'), kind: 'primary', onPress }] });

  async function confirmAdult() {
    if (busy) return;
    setBusy('confirm');
    let error = null;
    try {
      ({ error } = await supabase.auth.updateUser({ data: adultConfirmPatch(new Date().toISOString()) }));
    } catch (e) { error = e; }
    setBusy(null);
    if (error) {
      // Offline or refused: stay here and say why; nothing else happens.
      ok(t('error'), friendlyError(error, t, 'error_save_failed'));
    }
    // Success: USER_UPDATED refreshes the session and App.js opens the app.
  }

  async function exportData() {
    if (busy || !user) return;
    setBusy('export');
    try {
      const r = await exportMyData(user, t('settings_export_title'));
      if (r.saved) ok(t('settings_export_title'), t('settings_export_done'), 'check');
    } catch {
      ok(t('error'), t('settings_export_error'));
    }
    setBusy(null);
  }

  // The existing two-step delete, as DoseTrace sheets: warn, then the last chance.
  function askDelete() {
    setSheet({
      icon: 'warning',
      title: t('settings_delete'),
      body: t('settings_delete_permanent_msg'),
      buttons: [{ label: t('cancel'), kind: 'secondary' }, { label: t('settings_delete_confirm'), kind: 'danger', onPress: askDeleteFinal }],
    });
  }
  function askDeleteFinal() {
    setSheet({
      icon: 'warning',
      title: t('settings_delete_final_title'),
      body: t('settings_delete_final_msg'),
      buttons: [{ label: t('cancel'), kind: 'secondary' }, { label: t('settings_delete_final_confirm'), kind: 'danger', onPress: doDelete }],
    });
  }
  async function doDelete() {
    setBusy('delete');
    try {
      const result = await requestAccountDeletion();
      if (result.noSession) { setBusy(null); ok(t('error'), t('error_no_session')); return; }
      if (result.offline) { setBusy(null); ok(t('error'), t('settings_delete_offline')); return; }
      if (result.appleManualRevokeNeeded) {
        setBusy(null);
        ok(t('settings_delete_apple_revoke_title'), t('settings_delete_apple_revoke_note'), 'check', () => finishAccountDeletion());
        return;
      }
      await finishAccountDeletion();
    } catch (e) {
      setBusy(null);
      ok(t('error'), friendlyError(e, t, 'error_deletion_failed'));
    }
  }

  async function signOut() {
    if (busy) return;
    setBusy('signout');
    await signOutIntended();
    setBusy(null);
  }

  const spin = (k) => (busy === k ? <ActivityIndicator color={k === 'confirm' ? colors.onAct : colors.ink} /> : null);

  return (
    <SafeAreaView style={s.root}>
      <ScrollView contentContainerStyle={s.center} bounces={false}>
        <View style={s.sheet} accessibilityViewIsModal>
          <View style={s.icon}><FeatureIcon name="shield" size={26} color={colors.ink} /></View>
          <Text style={s.title} accessibilityRole="header">{t('age_gate_title')}</Text>
          <Text style={s.body}>{t('age_gate_body').replace('{year}', year != null ? String(year) : '')}</Text>
          <TouchableOpacity style={[s.btn, s.btnPrimary]} onPress={confirmAdult} disabled={!!busy} accessibilityRole="button">
            {spin('confirm') || <Text style={[s.btnText, s.btnTextPrimary]}>{t('age_gate_confirm')}</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={[s.btn, s.btnSecondary]} onPress={exportData} disabled={!!busy} accessibilityRole="button">
            {spin('export') || <Text style={s.btnText}>{t('settings_export_title')}</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={[s.btn, s.btnDanger]} onPress={askDelete} disabled={!!busy} accessibilityRole="button">
            {spin('delete') || <Text style={[s.btnText, s.btnTextDanger]}>{t('settings_delete')}</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={s.link} onPress={signOut} disabled={!!busy} accessibilityRole="button">
            {spin('signout') || <Text style={s.linkText}>{t('settings_signout')}</Text>}
          </TouchableOpacity>
          <Text style={s.note}>{t('age_gate_note')}</Text>
        </View>
      </ScrollView>
      <DTSheet config={sheet} onClose={() => setSheet(null)} />
    </SafeAreaView>
  );
}

// The DoseTrace sheet (ProtocolParts DTSheet): raised card, radius 26, padding 20, a 48-pt well
// circle for the icon, title 22/700, body 17 ink2, capsule buttons. Theme tokens only.
const makeStyles = (c) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.ground },
  center: { flexGrow: 1, justifyContent: 'center', padding: 16 },
  sheet: { backgroundColor: c.raised, borderRadius: 26, padding: 20, gap: 14, width: '100%', maxWidth: Math.min(520, CONTENT_MAX_WIDTH), alignSelf: 'center' },
  icon: { width: 48, height: 48, borderRadius: 24, backgroundColor: c.well, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700', color: c.ink },
  body: { fontSize: 17, lineHeight: 22, color: c.ink2 },
  btn: { minHeight: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  btnPrimary: { backgroundColor: c.act },
  btnSecondary: { backgroundColor: c.well },
  btnDanger: { backgroundColor: c.well },
  btnText: { fontSize: 17, fontWeight: '600', color: c.ink },
  btnTextPrimary: { color: c.onAct },
  btnTextDanger: { color: c.risk },
  link: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  linkText: { fontSize: 17, color: c.ink, textDecorationLine: 'underline', textDecorationColor: c.tick },
  note: { fontSize: 13, lineHeight: 18, color: c.ink2 },
});
