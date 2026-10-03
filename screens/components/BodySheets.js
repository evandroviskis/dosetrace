// My Body sheets (docs/specs/my-body.md MB-11, MB-17, MB-19, MB-21; prototype .scrim.bot +
// .sheet.bsheet): a bottom sheet that hugs its content over the dimmed screen, the two sheet
// heads the prototype uses (Cancel · title · Save, and title · round ×), and the toast line
// a sheet shows over itself ("Enter the vaccine name first."). Theme tokens only.
import { useMemo } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { useTheme } from '../../lib/theme';
import { CONTENT_MAX_WIDTH } from '../../lib/responsive';
import { CrossMark } from '../../components/CheckMark';

// A form closes only through its own Cancel / Save / × (never a stray tap on the scrim), so
// nothing typed is lost. `footer` stays under the scrolling content (the export buttons).
// `overlay` renders above the sheet inside the same window (a toast).
export function BottomSheet({ visible, onClose, children, footer = null, overlay = null }) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Modal visible={!!visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* KeyboardAvoidingView owns its bottom padding (the keyboard), so the sheet's own
          inset from the screen edge sits on the inner View. */}
      <KeyboardAvoidingView style={s.kav} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.scrim}>
        <View style={s.sheet} accessibilityViewIsModal>
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled" contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
          {footer ? <View style={s.footer}>{footer}</View> : null}
        </View>
        </View>
        {overlay}
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Cancel on the left, the title in the centre, the action (Save) on the right.
export function SheetBar({ title, cancelLabel, onCancel, actionLabel, onAction }) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={s.bar}>
      <TouchableOpacity onPress={onCancel} style={s.side} accessibilityRole="button" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text style={s.cancel}>{cancelLabel}</Text>
      </TouchableOpacity>
      <Text style={s.title} numberOfLines={2} accessibilityRole="header">{title}</Text>
      {actionLabel ? (
        <TouchableOpacity onPress={onAction} style={[s.side, s.sideEnd]} accessibilityRole="button" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={s.action}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : <View style={s.side} />}
    </View>
  );
}

// The title on the left and a round × on the right (Upload bloodwork).
export function CloseBar({ title, onClose, closeLabel }) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={s.bar}>
      <Text style={[s.head, s.grow]} accessibilityRole="header">{title}</Text>
      <TouchableOpacity onPress={onClose} style={s.round} accessibilityRole="button" accessibilityLabel={closeLabel}>
        <CrossMark size={18} color={colors.ink} strokeWidth={1.8} />
      </TouchableOpacity>
    </View>
  );
}

// The toast (prototype .toast): an ink block near the bottom, 17 pt text, no action.
export function SheetToast({ text }) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  if (!text) return null;
  return (
    <View style={s.toast} pointerEvents="none" accessibilityLiveRegion="polite">
      <Text style={s.toastText}>{text}</Text>
    </View>
  );
}

const makeStyles = (c) => StyleSheet.create({
  kav: { flex: 1, backgroundColor: c.scrim },
  scrim: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 8, paddingTop: 48, paddingBottom: 30 },
  // prototype .bsheet: at most 88% of the screen, hugging shorter content
  sheet: { backgroundColor: c.raised, borderRadius: 26, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', maxHeight: '88%', overflow: 'hidden' },
  body: { padding: 20, gap: 14 },
  footer: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20, backgroundColor: c.raised },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  side: { minWidth: 64, minHeight: 44, justifyContent: 'center' },
  sideEnd: { alignItems: 'flex-end' },
  cancel: { fontSize: 17, lineHeight: 22, color: c.ink },
  action: { fontSize: 17, lineHeight: 22, fontWeight: '600', color: c.ink },
  title: { flex: 1, textAlign: 'center', fontSize: 17, lineHeight: 22, fontWeight: '600', color: c.ink },
  head: { fontSize: 17, lineHeight: 22, fontWeight: '600', color: c.ink },
  grow: { flex: 1, minWidth: 0 },
  round: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.well, alignItems: 'center', justifyContent: 'center' },
  toast: { position: 'absolute', left: 20, right: 20, bottom: 46, backgroundColor: c.toast, borderRadius: 18, paddingHorizontal: 18, paddingVertical: 14 },
  toastText: { fontSize: 17, lineHeight: 22, color: c.toastText },
});
