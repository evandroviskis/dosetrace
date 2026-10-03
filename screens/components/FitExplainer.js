// "Why it does not fit" — the animated 4-step explainer (AP-12, approved 2026-10-02:
// https://claude.ai/artifact/WHoE7BRXggmpgCjCMkhw85, "Pode sim colocar a animação"). Opened by
// the "?" on the dose field, the short red warning and the red syringe. Steps: your vial, your
// syringe, why it does not fit, was it a weekly total? (split buttons that divide the user's
// own number; "No, it is one injection" states the facts and offers the AI help). The key
// "mg = how much medicine · ml = how much liquid" is always shown. Numbers: lib/fitExplainer.
// Reduce Motion shows the last frame. Graduated tokens only.
import { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Pressable, StyleSheet, ScrollView } from 'react-native';
import Svg, { Rect, Path, Text as SvgText } from 'react-native-svg';
import { useReducedMotion } from 'react-native-reanimated';
import { useTheme } from '../../lib/theme';
import { MONO } from '../../lib/fonts';
import SyringeScale from './SyringeScale';
import { renderText } from '../../lib/assistantText';

// A number that climbs to its target (one strong moment, ~0.9 s); Reduce Motion: the target.
function useClimb(target, run, reduced) {
  const [v, setV] = useState(reduced ? target : 0);
  useEffect(() => {
    if (reduced || !run) { setV(target); return undefined; }
    let raf = null; const t0 = Date.now(); const D = 900;
    const tick = () => {
      const p = Math.min(1, (Date.now() - t0) / D);
      const e = 1 - Math.pow(1 - p, 3);
      setV(target * e);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    setV(0); raf = requestAnimationFrame(tick);
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [target, run, reduced]);
  return v;
}

function Vial({ pct, c, amountLabel, waterLabel }) {
  const h = 64 * Math.max(0, Math.min(1, pct));
  return (
    <Svg width={waterLabel ? 200 : 124} height={122} viewBox={waterLabel ? "0 0 200 122" : "0 0 124 122"}>
      <Rect x={40} y={30} width={44} height={76} rx={10} fill="none" stroke={c.ink} strokeWidth={2.5} />
      <Rect x={48} y={18} width={28} height={12} rx={3} fill={c.ink} />
      {h > 0 && <Rect x={43} y={103 - h} width={38} height={h} rx={7} fill={c.data} />}
      {waterLabel ? <Path d="M150 22c-8 12-12 18-12 26a12 12 0 0 0 24 0c0-8-4-14-12-26z" fill={c.data} /> : null}
      <SvgText x={62} y={119} textAnchor="middle" fill={c.ink} fontFamily={MONO['500']} fontSize={10}>{amountLabel}</SvgText>
      {waterLabel ? <SvgText x={150} y={82} textAnchor="middle" fill={c.ink} fontFamily={MONO['500']} fontSize={10}>{waterLabel}</SvgText> : null}
    </Svg>
  );
}

export default function FitExplainer({ visible, model, t, onClose, onSplit, onAskAI }) {
  const { colors: c } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);
  const [oneShot, setOneShot] = useState(false);
  useEffect(() => { if (visible) { setStep(0); setOneShot(false); } }, [visible]);
  const p = model ? model.params : {};
  const cap = model && model.capacity ? model.capacity : 100;
  const full = useClimb(cap, visible && step === 1, reduced);
  const needUnits = model ? (model.needUnits || 0) : 0;
  const over = useClimb(needUnits, visible && step === 2, reduced);
  const vialPct = useClimb(1, visible && step === 0, reduced);
  if (!model) return null;
  const tr = (key, extra) => renderText(t, key, { ...p, ...(extra || {}) });

  let stage = null;
  if (step === 0) {
    stage = (
      <>
        <Vial pct={vialPct * 0.8} c={c} amountLabel={model.type === 'recon' ? `${p.amount} ${p.unit}` : ''} waterLabel={model.type === 'recon' ? `${p.water} ml` : ''} />
        <Text style={s.big}>{t('fx_s1_title')}</Text>
        <Text style={s.sub}>{tr(model.type === 'recon' ? 'fx_s1_powder' : 'fx_s1_ready')}</Text>
      </>
    );
  } else if (step === 1) {
    stage = (
      <>
        <SyringeScale units={full} size={cap} width={280} />
        <Text style={s.big}>{t('fx_s2_title')}</Text>
        <Text style={s.sub}>{tr('fx_s2_body')}</Text>
      </>
    );
  } else if (step === 2) {
    stage = (
      <>
        <SyringeScale units={over} size={cap} width={280} />
        <Text style={s.big}>{tr('fx_s3_title')}</Text>
        <Text style={s.sub}>{tr('fx_s3_body')}</Text>
      </>
    );
  } else if (!oneShot) {
    stage = (
      <>
        <Text style={[s.big, s.bigLeft]}>{tr('fx_s4_title')}</Text>
        <View style={s.splits}>
          {model.splits.map((sp) => (
            <TouchableOpacity key={sp.n} style={s.split} onPress={() => onSplit(sp.each, sp.n)} accessibilityRole="button">
              <Text style={s.splitText}>{tr('fx_split', { n: String(sp.n), each: sp.eachText })}</Text>
              {sp.drawValue ? (
                <Text style={s.splitDraw}>{(sp.drawMl ? t('ap_draw_ml').replace('{ml}', sp.drawValue) : t('ap_draw_units').replace('{units}', sp.drawValue)) + (sp.fits ? '' : ` · ${t('fx_no_fit')}`)}</Text>
              ) : null}
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={[s.split, s.splitNo]} onPress={() => setOneShot(true)} accessibilityRole="button">
            <Text style={s.splitNoText}>{tr('fx_one')}</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  } else {
    // "It really is one injection": the facts only, never a judgement of the dose (AP-11, AP-22).
    stage = (
      <View style={s.facts}>
        <Text style={s.sub}>{tr('ap_fit_fact_ml', { unit: p.dunit, holds: p.holds })}</Text>
        <Text style={s.sub}>{t(model.type === 'recon' ? 'ap_fit_fact_powder' : 'ap_fit_fact_ready')}</Text>
        <Text style={s.sub}>{t('ap_fit_fact_who')}</Text>
        {onAskAI ? (
          <TouchableOpacity style={[s.btn, s.b2]} onPress={onAskAI} accessibilityRole="button">
            <Text style={s.b2Text}>{t('ap_door_fit')}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.scrim} onPress={onClose}>
        <Pressable style={s.sheet} onPress={() => {}} accessibilityViewIsModal>
          <View style={s.head}>
            <Text style={s.title} accessibilityRole="header">{t('fx_title')}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button">
              <Text style={s.close}>{t('ap_close')}</Text>
            </TouchableOpacity>
          </View>
          <View style={s.dots}>
            {[0, 1, 2, 3].map((i) => <View key={i} style={[s.dot, i === step && s.dotOn]} />)}
          </View>
          <ScrollView contentContainerStyle={s.stage} showsVerticalScrollIndicator={false}>{stage}</ScrollView>
          <View style={s.key}>
            <Text style={s.keyChip}>{t('fx_key_medicine').replace('{unit}', model.keyUnit)}</Text>
            <Text style={s.keyChip}>{t('fx_key_liquid')}</Text>
          </View>
          {step < 3 && (
            <View style={s.btns}>
              <TouchableOpacity style={[s.btn, s.b1]} onPress={onClose} accessibilityRole="button"><Text style={s.b1Text}>{t('ap_close')}</Text></TouchableOpacity>
              <TouchableOpacity style={[s.btn, s.b2]} onPress={() => setStep(step + 1)} accessibilityRole="button"><Text style={s.b2Text}>{t('fx_next')}</Text></TouchableOpacity>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (c) => StyleSheet.create({
  scrim: { flex: 1, backgroundColor: c.scrim, justifyContent: 'flex-end', paddingHorizontal: 8, paddingTop: 8, paddingBottom: 30 },
  sheet: { backgroundColor: c.raised, borderRadius: 26, padding: 20, gap: 12, width: '100%', maxWidth: 520, alignSelf: 'center', maxHeight: '92%' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, gap: 12 },
  title: { flex: 1, fontSize: 20, fontWeight: '700', color: c.ink },
  close: { fontSize: 17, fontWeight: '600', color: c.ink },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.line },
  dotOn: { width: 18, backgroundColor: c.ink },
  stage: { alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 240, paddingVertical: 8 },
  big: { fontSize: 22, lineHeight: 28, fontWeight: '700', color: c.ink, textAlign: 'center' },
  bigLeft: { alignSelf: 'stretch', fontSize: 20, textAlign: 'left' },
  sub: { fontSize: 16, lineHeight: 22, color: c.ink2, textAlign: 'center' },
  facts: { alignSelf: 'stretch', gap: 10 },
  key: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  keyChip: { fontSize: 13, fontWeight: '600', color: c.ink2, backgroundColor: c.well, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, overflow: 'hidden' },
  splits: { alignSelf: 'stretch', gap: 8 },
  split: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: c.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, backgroundColor: c.raised, gap: 10 },
  splitText: { fontSize: 16, fontWeight: '600', color: c.ink, flexShrink: 1 },
  splitDraw: { fontSize: 14, fontWeight: '500', color: c.ink2, fontFamily: MONO['500'] },
  splitNo: { borderStyle: 'dashed', justifyContent: 'center' },
  splitNoText: { fontSize: 16, fontWeight: '600', color: c.ink2, textAlign: 'center' },
  btns: { flexDirection: 'row', gap: 10 },
  btn: { flex: 1, minHeight: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  b1: { backgroundColor: c.well },
  b2: { backgroundColor: c.act },
  b1Text: { fontSize: 16, fontWeight: '600', color: c.ink },
  b2Text: { fontSize: 16, fontWeight: '600', color: c.onAct },
});
