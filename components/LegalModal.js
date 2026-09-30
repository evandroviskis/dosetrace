// Full-screen reader for the app's own legal texts (privacy policy, terms of service).
// Shared by Settings and the paywall (S-21: on Android the paywall's Terms link shows
// DoseTrace's own terms here).
import { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../lib/theme';
import { CONTENT_MAX_WIDTH } from '../lib/responsive';

export default function LegalModal({ visible, onClose, title, content, doneLabel }) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={s.modal}>
        <View style={s.modalNav}>
          <View style={{ width: 60 }} />
          <Text style={s.modalTitle}>{title}</Text>
          <TouchableOpacity onPress={onClose} style={{ width: 60, alignItems: 'flex-end' }}>
            <Text style={s.modalClose}>{doneLabel}</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={s.modalBody} showsVerticalScrollIndicator={false}>
          <Text style={s.legalText}>{content}</Text>
          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const makeStyles = (c) => StyleSheet.create({
  modal: { flex: 1, backgroundColor: c.card },
  modalNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: c.border },
  modalTitle: { fontSize: 15, fontWeight: '600', color: c.text },
  modalClose: { fontSize: 14, color: c.accent, fontWeight: '600' },
  modalBody: { flex: 1, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 20 },
  legalText: { fontSize: 13, color: c.textMuted, lineHeight: 22 },
});
