// Full-screen reader for the app's own legal texts (privacy policy, terms of service).
// Shared by Settings and the paywall (S-21: on Android the paywall's Terms link shows
// DoseTrace's own terms here).
//
// Graduated (Settings part 2, prototype legalHTML): one raised sheet, Done in ink, and
// the text set as a document — a short all-caps line of the body is a heading (17 pt
// semibold ink), every other line a paragraph (15 pt ink2). The words are untouched,
// in every language: the headings keep their own case here (turning them to sentence
// case by code would break German nouns and acronyms; that is a copy change).
import { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../lib/theme';
import { CONTENT_MAX_WIDTH } from '../lib/responsive';
import { legalBlocks } from '../lib/legalBlocks';

export default function LegalModal({ visible, onClose, title, content, doneLabel }) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const blocks = useMemo(() => legalBlocks(content), [content]);
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={s.modal}>
        <View style={s.modalNav}>
          <View style={{ width: 60 }} />
          <Text style={s.modalTitle} numberOfLines={1}>{title}</Text>
          <TouchableOpacity onPress={onClose} style={{ minWidth: 60, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' }}>
            <Text style={s.modalClose}>{doneLabel}</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={s.modalBody} showsVerticalScrollIndicator={false}>
          {blocks.map((b, i) => (
            b.heading
              ? <Text key={i} style={[s.legalHeading, i === 0 && s.legalHeadingFirst]} accessibilityRole="header">{b.text}</Text>
              : <Text key={i} style={s.legalText}>{b.text}</Text>
          ))}
          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const makeStyles = (c) => StyleSheet.create({
  modal: { flex: 1, backgroundColor: c.raised },
  modalNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingHorizontal: 20, minHeight: 56, paddingVertical: 6 },
  modalTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600', color: c.ink },
  modalClose: { fontSize: 17, fontWeight: '600', color: c.ink },
  modalBody: { flex: 1, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 8 },
  legalHeading: { fontSize: 17, lineHeight: 22, fontWeight: '600', color: c.ink, marginTop: 20, marginBottom: 6 },
  legalHeadingFirst: { marginTop: 0 },
  legalText: { fontSize: 15, lineHeight: 21, color: c.ink2, marginBottom: 12 },
});
