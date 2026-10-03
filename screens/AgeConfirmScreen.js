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
import { useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLanguage } from '../i18n/LanguageContext';
import { useTheme } from '../lib/theme';
import { CONTENT_MAX_WIDTH } from '../lib/responsive';
import { supabase } from '../lib/supabase';
import { friendlyError } from '../lib/friendlyError';
import { adultConfirmPatch, adultYears, storedYear } from '../lib/adultGate';
import { exportMyData, requestAccountDeletion, finishAccountDeletion, signOutIntended } from '../lib/accountActions';
import { isLocalDBEmpty, fullImportFromCloud } from '../lib/sync';
import FeatureIcon from '../components/FeatureIcon';
import { DTSheet, DTPickerSheet, DTWheel } from './components/ProtocolParts';
import FoldChevron from '../components/FoldChevron';

export default function AgeConfirmScreen({ session }) {
  const { t } = useLanguage();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [busy, setBusy] = useState(null); // 'confirm' | 'export' | 'delete' | 'signout'
  const [sheet, setSheet] = useState(null);
  const tornDown = useRef(false);
  // After the server deleted the account, the phone is cleared and signed out exactly once —
  // whether the note is closed with OK, the scrim or Android back (Gate B).
  const runTeardown = () => {
    if (tornDown.current) return;
    tornDown.current = true;
    finishAccountDeletion().catch(() => {});
  };
  const closeSheet = () => {
    const closing = sheet;
    setSheet(null);
    if (closing && closing.teardown) runTeardown();
  };
  const user = session && session.user;
  const storedY = storedYear(user && user.user_metadata);
  // The real birth year (decided 2026-10-03 by logic): picked on the app's year wheel, from
  // this year − 18 back to 1900. Nothing is preselected — the stored under-18 year is never
  // offered — and Confirm stays off until a year is picked.
  const years = useMemo(() => adultYears(new Date()), []);
  const [year, setYear] = useState(null);
  const [wheelOpen, setWheelOpen] = useState(false);
  const [wheelIndex, setWheelIndex] = useState(0);

  const ok = (title, body, icon = 'alert', onPress) => setSheet({ icon, title, body, buttons: [{ label: t('ok'), kind: 'primary', onPress }] });

  async function confirmAdult() {
    if (busy) return;
    const patch = adultConfirmPatch(new Date().toISOString(), year);
    if (!patch) return;
    setBusy('confirm');
    let error = null;
    try {
      // One merge-only write: adult_confirmed_at + birth_year, no other key.
      ({ error } = await supabase.auth.updateUser({ data: patch }));
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
      // A new phone may not have the account's records yet: bring them down first.
      if (isLocalDBEmpty(user.id)) await fullImportFromCloud().catch(() => {});
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
        setSheet({
          icon: 'check',
          title: t('settings_delete_apple_revoke_title'),
          body: t(Platform.OS === 'android' ? 'settings_delete_apple_revoke_note_android' : 'settings_delete_apple_revoke_note'),
          teardown: true,
          buttons: [{ label: t('ok'), kind: 'primary', onPress: runTeardown }],
        });
        return;
      }
      runTeardown();
    } catch (e) {
      setBusy(null);
      ok(t('error'), friendlyError(e, t, 'error_deletion_failed'));
    }
  }

  // Sign out asks first (as in Settings) and never wipes changes that are not backed up yet.
  function askSignOut() {
    if (busy) return;
    setSheet({
      icon: 'door',
      title: t('settings_signout'),
      body: t('settings_signout_confirm_local'),
      buttons: [{ label: t('cancel'), kind: 'secondary' }, { label: t('settings_signout'), kind: 'primary', onPress: doSignOut }],
    });
  }
  async function doSignOut() {
    setBusy('signout');
    const r = await signOutIntended().catch(() => ({ blocked: true }));
    setBusy(null);
    if (r && r.blocked) ok(t('settings_signout'), t('auth_signout_unsynced'));
  }

  const spin = (k) => (busy === k ? <ActivityIndicator color={k === 'confirm' ? colors.onAct : colors.ink} /> : null);

  return (
    <SafeAreaView style={s.root}>
      <ScrollView contentContainerStyle={s.center} bounces={false}>
        <View style={s.sheet} accessibilityViewIsModal>
          <View style={s.icon}><FeatureIcon name="shield" size={26} color={colors.ink} /></View>
          <Text style={s.title} accessibilityRole="header">{t('age_gate_title')}</Text>
          <Text style={s.body}>{t('age_gate_body').replace('{year}', storedY != null ? String(storedY) : '')}</Text>
          <View style={s.field}>
            <Text style={s.fieldLabel}>{t('profile_birth_year')}</Text>
            <TouchableOpacity style={s.select} onPress={() => { setWheelIndex(year != null ? Math.max(0, years.indexOf(year)) : 0); setWheelOpen(true); }} disabled={!!busy} accessibilityRole="button" accessibilityLabel={t('profile_birth_year')}>
              <Text style={[s.selectText, year == null && s.selectEmpty]}>{year != null ? String(year) : t('age_gate_year_ph')}</Text>
              <FoldChevron open={false} color={colors.ink3} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={[s.btn, s.btnPrimary, (year == null) && s.btnDim]} onPress={confirmAdult} disabled={!!busy || year == null} accessibilityRole="button" accessibilityState={{ disabled: !!busy || year == null }}>
            {spin('confirm') || <Text style={[s.btnText, s.btnTextPrimary]}>{t('age_gate_confirm')}</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={[s.btn, s.btnSecondary]} onPress={exportData} disabled={!!busy} accessibilityRole="button">
            {spin('export') || <Text style={s.btnText}>{t('settings_export_title')}</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={[s.btn, s.btnDanger]} onPress={askDelete} disabled={!!busy} accessibilityRole="button">
            {spin('delete') || <Text style={[s.btnText, s.btnTextDanger]}>{t('settings_delete')}</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={s.link} onPress={askSignOut} disabled={!!busy} accessibilityRole="button">
            {spin('signout') || <Text style={s.linkText}>{t('settings_signout')}</Text>}
          </TouchableOpacity>
          <Text style={s.note}>{t('age_gate_note')}</Text>
        </View>
      </ScrollView>
      <DTPickerSheet visible={wheelOpen} title={t('profile_birth_year')} doneLabel={t('done')} onDone={() => { setYear(years[wheelIndex]); setWheelOpen(false); }}>
        <DTWheel columns={[{ values: years.map(String), index: wheelIndex }]} onChange={(_c, i) => setWheelIndex(i)} />
      </DTPickerSheet>
      <DTSheet config={sheet} onClose={closeSheet} />
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
  btnDim: { opacity: 0.35 },
  field: { gap: 8 },
  fieldLabel: { fontSize: 13, lineHeight: 18, color: c.ink2, paddingHorizontal: 4 },
  select: { minHeight: 52, borderRadius: 16, backgroundColor: c.well, borderWidth: 1, borderColor: c.line, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  selectText: { flex: 1, fontSize: 17, color: c.ink },
  selectEmpty: { color: c.ink3 },
  btnSecondary: { backgroundColor: c.well },
  btnDanger: { backgroundColor: c.well },
  btnText: { fontSize: 17, fontWeight: '600', color: c.ink },
  btnTextPrimary: { color: c.onAct },
  btnTextDanger: { color: c.risk },
  link: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  linkText: { fontSize: 17, color: c.ink, textDecorationLine: 'underline', textDecorationColor: c.tick },
  note: { fontSize: 13, lineHeight: 18, color: c.ink2 },
});
