// Full-screen reader for the app's own legal texts (privacy policy, terms of service).
// Shared by Settings and the paywall (S-21: on Android the paywall's Terms link shows
// DoseTrace's own terms here).
//
// Graduated (Settings part 2, prototype legalHTML): one raised sheet, Done in ink, and
// the text set as a document — a short all-caps line of the body is a heading (17 pt
// semibold ink), every other line a paragraph (15 pt ink2). The words are untouched,
// in every language: the headings keep their own case here (turning them to sentence
// case by code would break German nouns and acronyms; that is a copy change).
import { useEffect, useMemo, useRef, useState } from 'react';
import { markRanges, markedPieces } from '../lib/appSearchText';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import Modal from './PresenceModal';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../lib/theme';
import { CONTENT_MAX_WIDTH } from '../lib/responsive';
import { legalBlocks } from '../lib/legalBlocks';

// App search (AS-27): focusBlock = the index (lib/legalBlocks) of the paragraph a search hit opens at
// — the reader opens scrolled so that paragraph's heading is at the top — and mark = the typed words,
// marked in that paragraph only (lib/appSearchText markRanges; the text itself never changes). The
// marks clear when the person scrolls or closes.
export default function LegalModal({ visible, onClose, title, content, doneLabel, focusBlock = null, mark = null }) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const blocks = useMemo(() => legalBlocks(content), [content]);
  const scrollRef = useRef(null);
  const blockY = useRef({});
  const landed = useRef(false);
  const [marksOn, setMarksOn] = useState(true);
  // The heading above the hit paragraph (or the paragraph itself when it has none).
  const anchor = useMemo(() => {
    if (focusBlock == null || !blocks[focusBlock]) return null;
    for (let i = focusBlock; i >= 0; i--) if (blocks[i].heading) return i;
    return focusBlock;
  }, [blocks, focusBlock]);
  useEffect(() => { if (visible) { landed.current = false; setMarksOn(true); } }, [visible, focusBlock]);
  const onBlockLayout = (i) => (e) => {
    blockY.current[i] = e.nativeEvent.layout.y;
    if (i === anchor && !landed.current && scrollRef.current) {
      landed.current = true;
      const y = Math.max(0, e.nativeEvent.layout.y - (i === 0 ? 0 : 20));
      requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollTo({ y, animated: false }); });
    }
  };
  const paragraph = (b, i) => {
    if (i !== focusBlock || !mark || !marksOn) return b.text;
    return markedPieces(b.text, markRanges(b.text, mark)).map((p, k) => (p.mark ? <Text key={k} style={s.mark}>{p.text}</Text> : p.text));
  };
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={s.modal}>
        <View style={s.modalNav}>
          {/* A-134: two equal sides share the room the title leaves, so the title stays centred
              and Done is never cut (it shrinks a little before that). */}
          <View style={s.navSide} />
          <Text style={s.modalTitle} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>{title}</Text>
          <TouchableOpacity onPress={onClose} style={[s.navSide, s.navRight]} accessibilityRole="button">
            <Text style={s.modalClose} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{doneLabel}</Text>
          </TouchableOpacity>
        </View>
        <ScrollView ref={scrollRef} style={s.modalBody} showsVerticalScrollIndicator={false} onScrollBeginDrag={() => { if (marksOn) setMarksOn(false); }}>
          {blocks.map((b, i) => (
            b.heading
              ? <Text key={i} onLayout={anchor != null ? onBlockLayout(i) : undefined} style={[s.legalHeading, i === 0 && s.legalHeadingFirst]} accessibilityRole="header">{b.text}</Text>
              : <Text key={i} onLayout={anchor != null ? onBlockLayout(i) : undefined} style={s.legalText}>{paragraph(b, i)}</Text>
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
  navSide: { flex: 1, minWidth: 70, minHeight: 44, justifyContent: 'center' },
  navRight: { alignItems: 'flex-end' },
  modalTitle: { flexShrink: 1, textAlign: 'center', fontSize: 17, fontWeight: '600', color: c.ink },
  modalClose: { fontSize: 17, fontWeight: '600', color: c.ink },
  modalBody: { flex: 1, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 8 },
  legalHeading: { fontSize: 17, lineHeight: 22, fontWeight: '600', color: c.ink, marginTop: 20, marginBottom: 6 },
  legalHeadingFirst: { marginTop: 0 },
  legalText: { fontSize: 15, lineHeight: 21, color: c.ink2, marginBottom: 12 },
  mark: { backgroundColor: c.mark, color: c.ink }, // app search: the typed words (AS-27)
});
