// Founder 2026-10-27 (picture docs/design/recently-deleted-collapsed.html approved; "Tudo que não precisar
// ficar visível o tempo todo… a gente fecha"): a secondary section arrives CLOSED on every visit — one line
// with its title, a short summary and the fold arrow; a tap opens it, another closes it. Never remembered.
// children: the section's content; headerExtra: a control on the header line while open (e.g. "Selecionar");
// onToggle(open): told after each tap (closing ends a selection made inside).
// Theme tokens only.
import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../lib/theme';
import FoldChevron from './FoldChevron';

export default function CollapsibleSection({ title, summary, headerExtra, children, style, onToggle }) {
  const { colors } = useTheme();
  const s = styles(colors);
  const [open, setOpen] = useState(false);
  return (
    <View style={[s.wrap, style]}>
      <TouchableOpacity style={s.head} activeOpacity={0.7} onPress={() => { const next = !open; setOpen(next); if (onToggle) onToggle(next); }}
        accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={summary ? `${title}, ${summary}` : title}>
        <View style={s.text}>
          <Text style={s.title}>{title}</Text>
          {summary ? <Text style={s.summary}>{summary}</Text> : null}
        </View>
        {open && headerExtra ? <View style={s.extra}>{headerExtra}</View> : null}
        <FoldChevron open={open} color={colors.ink2} />
      </TouchableOpacity>
      {open ? <View style={s.body}>{children}</View> : null}
    </View>
  );
}

const styles = (c) => StyleSheet.create({
  wrap: { backgroundColor: c.raised, borderRadius: 22, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 12, paddingHorizontal: 16 },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 17, fontWeight: '600', color: c.ink },
  summary: { fontSize: 14, color: c.ink2 },
  extra: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  body: { borderTopWidth: 1, borderTopColor: c.line },
});
