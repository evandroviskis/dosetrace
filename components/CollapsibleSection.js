// Founder 2026-10-27 (picture docs/design/recently-deleted-collapsed.html approved; "Tudo que não precisar
// ficar visível o tempo todo… a gente fecha"): a secondary section arrives CLOSED on every visit — one line
// with its title, a short summary and the fold arrow; a tap opens it, another closes it. Never remembered.
// children: the section's content; headerExtra: a control on the header line while open (e.g. "Selecionar"),
// a sibling of the toggle so screen readers reach it (council 2026-10-27); onToggle(open): told after each
// tap (closing ends a selection made inside); forceOpen: open while work is in progress inside (a
// selection, an unsaved note) — a fold or a new page never hides it. muted: a row inside a sunk block (the
// Protocols archive, founder 2026-10-27 "B aprovado") — no card of its own, the title in ink2. Theme tokens only.
import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../lib/theme';
import FoldChevron from './FoldChevron';

export default function CollapsibleSection({ title, summary, headerExtra, children, style, onToggle, forceOpen, muted }) {
  const { colors } = useTheme();
  const s = styles(colors);
  const [open, setOpen] = useState(false);
  const shown = open || !!forceOpen;
  const toggle = () => { const next = !shown; setOpen(next); if (onToggle) onToggle(next); };
  return (
    <View style={[s.wrap, muted && s.wrapMuted, style]}>
      <View style={s.head}>
        <TouchableOpacity style={s.text} activeOpacity={0.7} onPress={toggle}
          accessibilityRole="button" accessibilityState={{ expanded: shown }} accessibilityLabel={summary ? `${title}, ${summary}` : title}>
          <Text style={[s.title, muted && s.titleMuted]}>{title}</Text>
          {summary ? <Text style={[s.summary, muted && s.summaryMuted]}>{summary}</Text> : null}
        </TouchableOpacity>
        {shown && headerExtra ? <View style={s.extra}>{headerExtra}</View> : null}
        <TouchableOpacity onPress={toggle} style={s.chev} activeOpacity={0.7} accessible={false} importantForAccessibility="no">
          <FoldChevron open={shown} color={colors.ink3} />
        </TouchableOpacity>
      </View>
      {shown ? <View style={s.body}>{children}</View> : null}
    </View>
  );
}

const styles = (c) => StyleSheet.create({
  wrap: { backgroundColor: c.raised, borderRadius: 22, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingLeft: 16 },
  text: { flex: 1, gap: 2, paddingVertical: 12 },
  title: { fontSize: 17, fontWeight: '600', color: c.ink },
  wrapMuted: { backgroundColor: 'transparent', borderRadius: 0 },
  titleMuted: { color: c.ink2 },
  summaryMuted: { color: c.ink3 },
  summary: { fontSize: 14, color: c.ink2 },
  extra: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  chev: { alignSelf: 'stretch', justifyContent: 'center', paddingLeft: 4, paddingRight: 16 },
  body: { borderTopWidth: 1, borderTopColor: c.line },
});
