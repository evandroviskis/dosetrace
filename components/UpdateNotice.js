// A-127 in-app update notice — the three pieces of the approved picture
// (docs/design/a127-update-notice.html, founder "aprovo os três" 2026-10-15). Theme tokens only.
//   UpdateInviteSheet    — screens 1 / 2: the DoseTrace sheet (DTSheet look): download icon in a well
//                          circle, "Nova versão do DoseTrace", "O que há de novo" + the founder's lines,
//                          the one-time question with its switch (off), "Agora não" | "Atualizar".
//                          A tap outside is "Agora não".
//   UpdateRequiredScreen — screen 3: full screen that cannot be closed (no back, no close): title,
//                          "Esta versão não pode mais ser usada.", the founder's reason line in a raised
//                          box, the reassurance line, "Atualizar" at the bottom; UN-8 (founder 2026-10-20):
//                          "Exportar meus dados" under it (the DTSheet stacked secondary), signed in only —
//                          the Settings export (App.js passes onExport); the screen still cannot be closed.
//   UpdateReadyBar       — screen 2c (Android): the Today Undo-bar look (toast tokens) "A nova versão
//                          foi baixada." · "Reiniciar", above the tab bar.
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Pressable, StyleSheet, ScrollView, BackHandler, Platform } from 'react-native';
import Modal from './PresenceModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../lib/theme';
import { useLanguage } from '../i18n/LanguageContext';
import { useSheetGap } from './useSheetInset';
import { tabBarStyle } from '../lib/tabBarStyle';
import FeatureIcon from './FeatureIcon';
import GradSwitch from './GradSwitch';

// config = { lines: [string], askOptIn: boolean } | null
// onUpdate(optIn) / onLater(optIn): optIn is the switch as the sheet closed (null when not asked).
export function UpdateInviteSheet({ config, onUpdate, onLater }) {
  const { colors: c } = useTheme();
  const { t } = useLanguage();
  const s = useMemo(() => inviteStyles(c), [c]);
  const gap = useSheetGap(16);
  const open = !!config;
  const last = useRef(config);
  if (config) last.current = config;
  const shown = config || last.current;
  const [optIn, setOptIn] = useState(false);
  useEffect(() => { if (open) setOptIn(false); }, [open]);
  if (!shown) return null;
  const answer = shown.askOptIn ? optIn : null;
  const later = () => onLater && onLater(answer);
  const lines = shown.lines || [];
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={later}>
      <Pressable style={[s.scrim, { paddingBottom: gap }]} onPress={later} accessibilityRole="button" accessibilityLabel={t('upd_not_now')}>
        <Pressable style={s.sheet} onPress={() => {}} accessibilityViewIsModal>
          <ScrollView bounces={false} contentContainerStyle={s.content} style={s.scroll}>
            <View style={s.icon}><FeatureIcon name="download" size={26} color={c.ink} /></View>
            <Text style={s.title} accessibilityRole="header">{t('upd_title')}</Text>
            {lines.length ? (
              <View style={s.news}>
                <Text style={s.newsHead}>{t('upd_whats_new')}</Text>
                {lines.map((line, i) => (
                  <View key={i} style={s.tipRow}>
                    <View style={s.tipDot} />
                    <Text style={s.tipText}>{line}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {shown.askOptIn ? (
              <View style={s.optRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.optLabel}>{t('upd_ask')}</Text>
                  <Text style={s.optSub}>{t('upd_ask_sub')}</Text>
                </View>
                <GradSwitch value={optIn} onValueChange={setOptIn} accessibilityLabel={t('upd_ask')} />
              </View>
            ) : null}
          </ScrollView>
          <View style={s.btnRow}>
            <TouchableOpacity style={[s.btn, s.btnSecondary]} onPress={later} accessibilityRole="button">
              <Text style={[s.btnText, { color: c.ink }]}>{t('upd_not_now')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btn, s.btnPrimary]} onPress={() => onUpdate && onUpdate(answer)} accessibilityRole="button">
              <Text style={[s.btnText, { color: c.onAct }]}>{t('upd_update')}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// reason: the founder's line (or null). onExport: "Exportar meus dados" (null = not offered, e.g.
// signed out); exporting: the export is being prepared (a second tap does nothing).
export function UpdateRequiredScreen({ reason, onUpdate, onExport, exporting }) {
  const { colors: c } = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => requiredStyles(c), [c]);
  // It cannot be closed: Android back stays on it (the person leaves with Home / the app switcher).
  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);
  return (
    <View style={[s.root, { paddingTop: insets.top + 42, paddingBottom: Math.max(insets.bottom, 16) + 32 }]}>
      <ScrollView contentContainerStyle={s.top} bounces={false}>
        <View style={s.icon}><FeatureIcon name="download" size={34} color={c.ink} /></View>
        <Text style={s.title} accessibilityRole="header">{t('upd_req_title')}</Text>
        <Text style={s.body}>{t('upd_req_body')}</Text>
        {reason ? <Text style={s.reason}>{reason}</Text> : null}
        <Text style={s.body}>{t('upd_req_safe')}</Text>
      </ScrollView>
      <View style={s.btnStack}>
        <TouchableOpacity style={s.btn} onPress={onUpdate} accessibilityRole="button">
          <Text style={s.btnText}>{t('upd_update')}</Text>
        </TouchableOpacity>
        {onExport ? (
          <TouchableOpacity style={[s.btn, s.btnSecondary]} onPress={onExport} disabled={!!exporting} accessibilityRole="button" accessibilityState={{ busy: !!exporting }}>
            <Text style={[s.btnText, s.btnSecondaryText]}>{t('upd_req_export')}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

export function UpdateReadyBar({ visible, onRestart }) {
  const { colors: c } = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => barStyles(c), [c]);
  if (!visible) return null;
  const above = tabBarStyle(c, insets.bottom).height + 18;
  return (
    <View style={[s.bar, { bottom: above }]} accessibilityLiveRegion="polite">
      <Text style={s.text} numberOfLines={2}>{t('upd_downloaded')}</Text>
      <TouchableOpacity onPress={onRestart} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button">
        <Text style={s.action}>{t('upd_restart')}</Text>
      </TouchableOpacity>
    </View>
  );
}

// DTSheet (screens/components/ProtocolParts sheetStyles) + the picture's .news / .tipRow / .optRow.
const inviteStyles = (c) => StyleSheet.create({
  scrim: { flex: 1, backgroundColor: c.scrim, justifyContent: 'center', padding: 16 },
  sheet: { backgroundColor: c.raised, borderRadius: 26, padding: 20, gap: 14, width: '100%', maxWidth: 520, alignSelf: 'center', maxHeight: '100%' },
  scroll: { flexGrow: 0 },
  content: { gap: 14 },
  icon: { width: 48, height: 48, borderRadius: 24, backgroundColor: c.well, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: c.ink, lineHeight: 28 },
  news: { gap: 8 },
  newsHead: { fontSize: 17, lineHeight: 22, fontWeight: '600', color: c.ink },
  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  tipDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.ink3, marginTop: 7 },
  tipText: { flex: 1, fontSize: 15, lineHeight: 20, color: c.ink2 },
  optRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.line },
  optLabel: { fontSize: 17, lineHeight: 22, color: c.ink },
  optSub: { fontSize: 13, lineHeight: 18, color: c.ink2, marginTop: 2 },
  btnRow: { flexDirection: 'row', gap: 10 },
  btn: { flex: 1, minHeight: 44, borderRadius: 26, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  btnSecondary: { backgroundColor: c.well },
  btnPrimary: { backgroundColor: c.act },
  btnText: { fontSize: 15, lineHeight: 20, fontWeight: '700', textAlign: 'center' },
});

// The picture's .req: ground, 24 side padding, the block at the top, the button at the bottom.
const requiredStyles = (c) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.ground, paddingHorizontal: 24, justifyContent: 'space-between' },
  top: { gap: 14 },
  icon: { width: 64, height: 64, borderRadius: 32, backgroundColor: c.raised, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  title: { fontSize: 30, lineHeight: 36, fontWeight: '700', letterSpacing: -0.6, color: c.ink },
  body: { fontSize: 17, lineHeight: 22, color: c.ink2 },
  reason: { fontSize: 17, lineHeight: 22, color: c.ink, backgroundColor: c.raised, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16, overflow: 'hidden' },
  btnStack: { gap: 8, marginTop: 16 }, // DTSheet btnStack: the primary first, the secondary under it
  btn: { minHeight: 52, borderRadius: 26, backgroundColor: c.act, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 17, fontWeight: '700', color: c.onAct },
  btnSecondary: { backgroundColor: c.well }, // DTSheet btn_secondary
  btnSecondaryText: { color: c.ink },
});

// Today's Undo bar (TodayScreen undoBar / undoBarText / undoBarAction): toast tokens.
const barStyles = (c) => StyleSheet.create({
  bar: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 18, backgroundColor: c.toast, borderRadius: 18, paddingHorizontal: 18, paddingVertical: 14 },
  text: { flex: 1, fontSize: 17, lineHeight: 22, color: c.toastText },
  action: { fontSize: 17, color: c.toastText, fontWeight: '700', textDecorationLine: 'underline' },
});
