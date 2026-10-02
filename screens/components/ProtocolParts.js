// Graduated building blocks for My Protocols (DESIGN.md §5, prototype.html part 3):
// the DoseTrace sheet that replaces the system alerts, the bottom action sheet (photo
// choice), the bottom picker sheet that holds the iPhone wheel, the vial cells (one cell
// per dose, remaining in data) and the enlarged syringe ruler. Theme tokens only.
import { useEffect, useMemo, useRef } from 'react';
import { View, Text, TouchableOpacity, Pressable, Modal, StyleSheet, Platform } from 'react-native';
import Svg, { Rect, Line, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../../lib/theme';
import { MONO } from '../../lib/fonts';
import FeatureIcon from '../../components/FeatureIcon';
import { vialCells } from '../../lib/todayFormat';

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
// buttons per the Graduated rules. config = { icon, title, body, note, buttons:
// [{ label, kind: 'primary' | 'secondary' | 'danger', onPress }] }.
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
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose} onDismiss={after.onDismiss}>
      <Pressable style={s.scrim} onPress={onClose} accessibilityRole="button" >
        <Pressable style={s.sheet} onPress={() => {}} accessibilityViewIsModal>
          {shown.icon ? (
            <View style={s.icon}><FeatureIcon name={shown.icon} size={26} color={c.ink} /></View>
          ) : null}
          <Text style={s.title} accessibilityRole="header">{shown.title}</Text>
          {shown.body ? <Text style={s.body}>{shown.body}</Text> : null}
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
// config = { title, options: [{ label, onPress }], cancelLabel }.
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
            {shown.title ? <Text style={s.actTitle}>{shown.title}</Text> : null}
            {shown.options.map((o, i) => (
              <TouchableOpacity key={i} style={[s.actOpt, (i > 0 || shown.title) && s.actSep]} onPress={() => press(o.onPress)} accessibilityRole="button">
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
// every 10 units, scrolled horizontally inside a well.
export function SyringeRuler({ units, size = 100, width }) {
  const { colors: c } = useTheme();
  const max = size || 100;
  const u = Math.max(0, Math.min(max, Number(units) || 0));
  const W = width, x0 = 24, per = (W - 48) / max;
  const X = (v) => x0 + v * per;
  const ticks = [];
  for (let k = 1; k < max; k++) {
    const lg = k % 10 === 0, md = k % 2 === 0;
    if (!md && !lg) continue;
    ticks.push(<Line key={'t' + k} x1={X(k)} y1={21} x2={X(k)} y2={lg ? 42 : 32} stroke={k < u ? c.onData : c.tick} strokeWidth={lg ? 2 : 1.2} />);
  }
  const labels = [];
  for (let L = 0; L <= max; L += 10) {
    labels.push(<SvgText key={'n' + L} x={X(L)} y={84} textAnchor="middle" fill={c.ink2} fontFamily={MONO['400']} fontSize={15}>{String(L)}</SvgText>);
  }
  return (
    <Svg width={W} height={96}>
      <Rect x={x0} y={20} width={W - 48} height={40} rx={8} fill={c.raised} stroke={c.tick} strokeWidth={1} />
      {u > 0 && <Rect x={x0 + 1} y={21} width={Math.max(0, X(u) - x0 - 1)} height={38} rx={7} fill={c.data} />}
      {ticks}
      {labels}
      <Rect x={X(u) - 3} y={14} width={8} height={52} rx={3} fill={c.ink} />
    </Svg>
  );
}

const sheetStyles = (c) => StyleSheet.create({
  scrim: { flex: 1, backgroundColor: c.overlay, justifyContent: 'center', padding: 16 },
  scrimBottom: { justifyContent: 'flex-end', paddingHorizontal: 8, paddingTop: 8, paddingBottom: 30 },
  sheet: { backgroundColor: c.raised, borderRadius: 26, padding: 20, gap: 14, width: '100%', maxWidth: 520, alignSelf: 'center' },
  icon: { width: 48, height: 48, borderRadius: 24, backgroundColor: c.well, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: c.ink, lineHeight: 28 },
  body: { fontSize: 17, lineHeight: 22, color: c.ink2 },
  note: { fontSize: 13, lineHeight: 18, color: c.ink3 },
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
  actTitle: { fontSize: 13, lineHeight: 18, color: c.ink2, textAlign: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  actOpt: { minHeight: 56, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  actSep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
  actOptText: { fontSize: 19, color: c.ink },
  actCancelText: { fontWeight: '700' },
  pickSheet: { backgroundColor: c.raised, borderRadius: 26, padding: 20, gap: 8, width: '100%', maxWidth: 520, alignSelf: 'center' },
  pickHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44 },
  pickTitle: { flex: 1, fontSize: 17, fontWeight: '600', color: c.ink },
  pickDone: { fontSize: 17, fontWeight: '600', color: c.ink },
});
