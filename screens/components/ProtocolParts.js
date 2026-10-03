// Graduated building blocks for My Protocols (DESIGN.md §5, prototype.html part 3):
// the DoseTrace sheet that replaces the system alerts, the bottom action sheet (photo
// choice), the bottom picker sheet that holds the iPhone wheel, the vial cells (one cell
// per dose, remaining in data) and the enlarged syringe ruler. Theme tokens only.
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Pressable, Modal, StyleSheet, Platform, ScrollView } from 'react-native';
import Svg, { Rect, Line, Path, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../../lib/theme';
import { MONO } from '../../lib/fonts';
import FeatureIcon from '../../components/FeatureIcon';
import { vialCells } from '../../lib/todayFormat';
import { wheelSettle } from '../../lib/wheelPick';

// A button's action runs only after the sheet is gone: presenting the camera, the
// photo library or another sheet while this one is still animating out fails on iOS.
// iOS reports the end through Modal.onDismiss; elsewhere (and as a fallback) a short timer.
function useAfterDismiss(open) {
  const pending = useRef(null);
  const timer = useRef(null);
  const run = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const fn = pending.current;
    pending.current = null;
    if (fn) fn();
  };
  useEffect(() => {
    if (!open && pending.current) {
      timer.current = setTimeout(run, Platform.OS === 'ios' ? 700 : 0);
    }
  }, [open]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return { queue: (fn) => { pending.current = fn || null; }, onDismiss: run };
}

// Keep the last config on screen while the sheet fades out (config goes null first).
function useLast(config) {
  const last = useRef(config);
  if (config) last.current = config;
  return config || last.current;
}

// Centered DoseTrace sheet: optional icon in a well circle, title 22/700, body 17 ink2,
// buttons per the Graduated rules. config = { icon, title, body, link: { label, onPress },
// note, buttons:
// [{ label, kind: 'primary' | 'secondary' | 'danger', onPress }], onDismiss }.
// onDismiss (optional) runs when the sheet is closed WITHOUT a button (a tap outside, Android
// back) — the native alert's cancelable onDismiss — after the sheet has gone.
export function DTSheet({ config, onClose }) {
  const { colors: c } = useTheme();
  const s = useMemo(() => sheetStyles(c), [c]);
  const open = !!config;
  const shown = useLast(config);
  const after = useAfterDismiss(open);
  if (!shown) return null;
  const btns = shown.buttons || [];
  const stack = btns.length !== 2 || btns.some(b => String(b.label).length > 14);
  const ordered = stack && btns.length === 2 ? [btns[1], btns[0]] : btns;
  const press = (b) => { after.queue(b.onPress); onClose(); };
  const dismiss = () => { after.queue(shown.onDismiss); onClose(); };
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={dismiss} onDismiss={after.onDismiss}>
      <Pressable style={s.scrim} onPress={dismiss} accessibilityRole="button" >
        <Pressable style={s.sheet} onPress={() => {}} accessibilityViewIsModal>
          {shown.icon ? (
            <View style={s.icon}><FeatureIcon name={shown.icon} size={26} color={c.ink} /></View>
          ) : null}
          <Text style={s.title} accessibilityRole="header">{shown.title}</Text>
          {shown.body ? <Text style={s.body}>{shown.body}</Text> : null}
          {shown.link ? (
            <TouchableOpacity style={s.link} onPress={() => { const fn = shown.link.onPress; onClose(); if (fn) fn(); }} accessibilityRole="link">
              <Text style={s.linkText}>{shown.link.label}</Text>
            </TouchableOpacity>
          ) : null}
          <View style={stack ? s.btnStack : s.btnRow}>
            {ordered.map((b, i) => (
              <TouchableOpacity
                key={i}
                style={[s.btn, !stack && s.btnFlex, s[`btn_${b.kind || 'secondary'}`]]}
                onPress={() => press(b)}
                accessibilityRole="button"
              >
                <Text style={[s.btnText, s[`btnText_${b.kind || 'secondary'}`]]}>{b.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {shown.note ? <Text style={s.note}>{shown.note}</Text> : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Bottom action sheet (photo choice): a raised group of options, Cancel apart below.
// config = { heading?, title, options: [{ label, onPress }], cancelLabel }. heading: an optional bold
// first line over the title (My Body's "Add a lab report" / "Scan a vaccine record", prototype srcSheet).
export function DTActionSheet({ config, onClose }) {
  const { colors: c } = useTheme();
  const s = useMemo(() => sheetStyles(c), [c]);
  const open = !!config;
  const shown = useLast(config);
  const after = useAfterDismiss(open);
  if (!shown) return null;
  const press = (fn) => { after.queue(fn); onClose(); };
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose} onDismiss={after.onDismiss}>
      <Pressable style={[s.scrim, s.scrimBottom]} onPress={onClose}>
        <Pressable style={s.actWrap} onPress={() => {}} accessibilityViewIsModal>
          <View style={s.actGroup}>
            {shown.heading ? (
              <View style={s.actHeadWrap}>
                <Text style={s.actHeading}>{shown.heading}</Text>
                {shown.title ? <Text style={[s.actTitle, s.actTitleUnder]}>{shown.title}</Text> : null}
              </View>
            ) : shown.title ? <Text style={s.actTitle}>{shown.title}</Text> : null}
            {shown.options.map((o, i) => (
              <TouchableOpacity key={i} style={[s.actOpt, (i > 0 || shown.title || shown.heading) && s.actSep]} onPress={() => press(o.onPress)} accessibilityRole="button">
                <Text style={s.actOptText}>{o.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={[s.actGroup, s.actOpt]} onPress={onClose} accessibilityRole="button">
            <Text style={[s.actOptText, s.actCancelText]}>{shown.cancelLabel}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Bottom sheet that holds the iPhone wheel: the question on the left, Done on the right.
export function DTPickerSheet({ visible, title, doneLabel, onDone, children }) {
  const { colors: c } = useTheme();
  const s = useMemo(() => sheetStyles(c), [c]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDone}>
      <Pressable style={[s.scrim, s.scrimBottom]} onPress={onDone}>
        <Pressable style={s.pickSheet} onPress={() => {}} accessibilityViewIsModal>
          <View style={s.pickHead}>
            <Text style={s.pickTitle}>{title}</Text>
            <TouchableOpacity onPress={onDone} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button">
              <Text style={s.pickDone}>{doneLabel}</Text>
            </TouchableOpacity>
          </View>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// The prototype wheel (My Protocols part 18, .wheel / .wcol / .wv): up to three columns, five
// 40-pt rows each, the chosen row in the middle on a well band (radius 10), 19 pt ink3 rows
// and the chosen one 21 / 600 ink. Each column scrolls and snaps row by row, a tap on a row
// picks it, and VoiceOver adjusts it (swipe up / down). columns: [{ values: [label], index }];
// onChange(columnIndex, rowIndex). Values come from lib/wheelPick.js.
const ROW = 40;
const SHOWN = 5;
function WheelColumn({ values, index, onPick, s }) {
  const ref = useRef(null);
  const [live, setLive] = useState(index);
  const lastSent = useRef(index);
  // A tap scrolls the column itself; the end of THAT scroll is never a new choice (lib/wheelPick wheelSettle).
  const tapped = useRef(false);
  // A value changed from outside (the day clamped to a shorter month): follow it.
  useEffect(() => {
    lastSent.current = index;
    setLive(index);
    if (ref.current) ref.current.scrollTo({ y: index * ROW, animated: false });
  }, [index, values.length]);
  const settle = (y, fromTap = false) => {
    const { pick, snapTo } = wheelSettle({ y, row: ROW, count: values.length, lastSent: lastSent.current, fromTap });
    if (snapTo != null) { setLive(snapTo); if (ref.current) ref.current.scrollTo({ y: snapTo * ROW, animated: false }); return; }
    if (pick != null) { setLive(pick); lastSent.current = pick; onPick(pick); } else setLive(lastSent.current);
  };
  return (
    <View
      style={s.wheelCol}
      accessible
      accessibilityRole="adjustable"
      accessibilityValue={{ text: values[live] }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        const i = live + (e.nativeEvent.actionName === 'increment' ? 1 : -1);
        if (i >= 0 && i < values.length) { setLive(i); lastSent.current = i; onPick(i); }
      }}
    >
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ROW}
        decelerationRate="fast"
        contentOffset={{ x: 0, y: index * ROW }}
        contentContainerStyle={s.wheelPad}
        scrollEventThrottle={16}
        onScroll={(e) => { const i = Math.round(e.nativeEvent.contentOffset.y / ROW); if (i !== live && i >= 0 && i < values.length) setLive(i); }}
        onScrollBeginDrag={() => { tapped.current = false; }}
        onMomentumScrollEnd={(e) => { const fromTap = tapped.current; tapped.current = false; settle(e.nativeEvent.contentOffset.y, fromTap); }}
        onScrollEndDrag={(e) => { if (!e.nativeEvent.velocity || Math.abs(e.nativeEvent.velocity.y) < 0.05) settle(e.nativeEvent.contentOffset.y); }}
      >
        {values.map((v, i) => (
          <Pressable key={i} style={s.wheelRow} onPress={() => { tapped.current = true; if (ref.current) ref.current.scrollTo({ y: i * ROW, animated: true }); setLive(i); if (i !== lastSent.current) { lastSent.current = i; onPick(i); } }}>
            <Text style={[s.wheelText, i === live && s.wheelTextOn]} numberOfLines={1}>{v}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
export function DTWheel({ columns, onChange }) {
  const { colors: c } = useTheme();
  const s = useMemo(() => sheetStyles(c), [c]);
  return (
    <View style={s.wheel}>
      <View style={s.wheelBand} pointerEvents="none" />
      {columns.map((col, ci) => (
        <WheelColumn key={ci} values={col.values} index={col.index} onPick={(i) => onChange(ci, i)} s={s} />
      ))}
    </View>
  );
}

// The diluent stepper's − / + (My Protocols part 16): the prototype's drawn icons, 20 pt,
// stroke 1.8 on the 24 grid, round caps — never a text glyph. Colour is a theme token.
export function StepGlyph({ plus, color }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d={plus ? 'M12 6v12M6 12h12' : 'M6 12h12'} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// Doses left as cells: one cell per dose, the remaining ones filled in data (prototype
// cells(); geometry in lib/todayFormat.js vialCells, shared by Protocols and Today).
export function VialCells({ total, left }) {
  const { colors: c } = useTheme();
  const v = vialCells(total, left);
  if (!v) return null; // too many doses to draw one cell each: the text carries it
  return (
    <Svg width={v.width} height={10} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {v.cells.map((cell, k) => (
        <Rect
          key={k} x={cell.x} y={0.5} width={cell.w} height={9} rx={2}
          fill={cell.filled ? c.data : 'none'} stroke={cell.filled ? c.data : c.tick} strokeWidth={1}
        />
      ))}
    </Svg>
  );
}

// The enlarged syringe (Tap to enlarge): the same drawing at reading size, a number
// every 10 units, scrolled horizontally inside a well. Geometry of the prototype overlay
// (My Protocols part 7): 1640 wide, the barrel from x 40 to W - 40, the fill up to the dose.
export const RULER = { W: 1640, x0: 40 };
export function rulerX(units, size) {
  const max = size || 100;
  const u = Math.max(0, Math.min(max, Number(units) || 0));
  return RULER.x0 + u * ((RULER.W - 2 * RULER.x0) / max);
}
export function SyringeRuler({ units, size = 100 }) {
  const { colors: c } = useTheme();
  const max = size || 100;
  const u = Math.max(0, Math.min(max, Number(units) || 0));
  const W = RULER.W, x0 = RULER.x0, per = (W - 2 * x0) / max;
  const X = (v) => x0 + v * per;
  // Insulin syringes in units (a tick every 2, numbered every 10); the larger 2 / 3 / 5 ml
  // syringes in ml (AP-21: a tick every 0.1 ml, numbered at each whole ml).
  const ml = max > 100;
  const minor = ml ? 10 : 2, major = ml ? 100 : 10;
  const ticks = [];
  for (let k = minor; k < max; k += minor) {
    const lg = k % major === 0;
    ticks.push(<Line key={'t' + k} x1={X(k)} y1={21} x2={X(k)} y2={lg ? 42 : 32} stroke={k < u ? c.onData : c.tick} strokeWidth={lg ? 2 : 1.2} />);
  }
  const labels = [];
  for (let L = 0; L <= max; L += major) {
    labels.push(<SvgText key={'n' + L} x={X(L)} y={84} textAnchor="middle" fill={c.ink2} fontFamily={MONO['400']} fontSize={15}>{String(ml ? L / 100 : L)}</SvgText>);
  }
  return (
    <Svg width={W} height={96}>
      <Rect x={x0} y={20} width={W - 2 * x0} height={40} rx={8} fill={c.raised} stroke={c.tick} strokeWidth={1} />
      {u > 0 && <Rect x={x0 + 1} y={21} width={Math.max(0, X(u) - x0)} height={38} rx={7} fill={c.data} />}
      {ticks}
      {labels}
      <Rect x={X(u) - 3} y={14} width={8} height={52} rx={3} fill={c.ink} />
    </Svg>
  );
}

const sheetStyles = (c) => StyleSheet.create({
  scrim: { flex: 1, backgroundColor: c.scrim, justifyContent: 'center', padding: 16 },
  scrimBottom: { justifyContent: 'flex-end', paddingHorizontal: 8, paddingTop: 8, paddingBottom: 30 },
  sheet: { backgroundColor: c.raised, borderRadius: 26, padding: 20, gap: 14, width: '100%', maxWidth: 520, alignSelf: 'center' },
  icon: { width: 48, height: 48, borderRadius: 24, backgroundColor: c.well, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: c.ink, lineHeight: 28 },
  body: { fontSize: 17, lineHeight: 22, color: c.ink2 },
  note: { fontSize: 13, lineHeight: 18, color: c.ink3 },
  // prototype .btnlink r-body (min-height 36 in the sheet): 17 ink, underlined in tick
  link: { minHeight: 36, justifyContent: 'center', alignSelf: 'flex-start' },
  linkText: { fontSize: 17, color: c.ink, textDecorationLine: 'underline', textDecorationColor: c.tick },
  btnRow: { flexDirection: 'row', gap: 10 },
  btnStack: { gap: 8 },
  btn: { minHeight: 44, borderRadius: 26, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  btnFlex: { flex: 1 },
  btn_primary: { backgroundColor: c.act },
  btn_secondary: { backgroundColor: c.well },
  btn_danger: { backgroundColor: c.risk },
  btnText: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
  btnText_primary: { color: c.onAct },
  btnText_secondary: { color: c.ink },
  btnText_danger: { color: c.onInk },
  actWrap: { width: '100%', maxWidth: 520, alignSelf: 'center', gap: 8 },
  actGroup: { backgroundColor: c.raised, borderRadius: 18, overflow: 'hidden' },
  actTitle: { fontSize: 13, lineHeight: 18, color: c.ink2, textAlign: 'center', paddingHorizontal: 18, paddingVertical: 14 },
  actHeadWrap: { paddingHorizontal: 18, paddingVertical: 14, gap: 2 },
  actHeading: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: c.ink, textAlign: 'center' },
  actTitleUnder: { paddingHorizontal: 0, paddingVertical: 0 },
  actOpt: { minHeight: 56, alignItems: 'center', justifyContent: 'center' },
  actSep: { borderTopWidth: 1, borderTopColor: c.line },
  actOptText: { fontSize: 19, color: c.ink },
  actCancelText: { fontWeight: '700' },
  pickSheet: { backgroundColor: c.raised, borderRadius: 26, padding: 20, gap: 14, width: '100%', maxWidth: 520, alignSelf: 'center' },
  pickHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44 },
  pickTitle: { flex: 1, fontSize: 17, fontWeight: '600', color: c.ink },
  pickDone: { fontSize: 17, fontWeight: '600', color: c.ink },
  // the wheel (prototype .wheel: 3 columns, gap 4, padding 4 0; the band 40 high, radius 10)
  wheel: { flexDirection: 'row', gap: 4, paddingVertical: 4, height: 40 * 5 + 8 },
  wheelBand: { position: 'absolute', left: 0, right: 0, top: 4 + 80, height: 40, borderRadius: 10, backgroundColor: c.well },
  wheelCol: { flex: 1, minWidth: 0 },
  wheelPad: { paddingVertical: 80 },
  wheelRow: { height: 40, alignItems: 'center', justifyContent: 'center' },
  wheelText: { fontSize: 19, color: c.ink3, fontVariant: ['tabular-nums'] },
  wheelTextOn: { fontSize: 21, fontWeight: '600', color: c.ink },
});
