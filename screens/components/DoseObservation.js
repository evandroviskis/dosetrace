// The dose sheet's mark, observation, emergency line and "Repetir nas próximas doses" (option B, founder
// 2026-11-24; picture docs/design/dose-jejum-refeicao-treino.html part 2; docs/specs/dose-observation.md
// DO-7..DO-11, DO-20). Drawn only for a completed dose (the sheet checks lib/doseObservation canObserveDose).
// - Marks: the protocol form's pills; "Em jejum" and "Com refeição" never together; a second tap removes;
//   saved on the tap (onContext).
// - Observation: the protocol note's field (noteWell / noteWellOn) and its Cancelar / Salvar; the typed text
//   lives in lib/draftStore (A-77) until Salvar, Cancelar or the sheet closes (LogScreen flushNote saves it).
// - The emergency line is fixed: from the phone's region only, never from the text; it names no symptom.
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Linking, StyleSheet } from 'react-native';
import * as Localization from 'expo-localization';
import { useTheme } from '../../lib/theme';
import { useLanguage } from '../../i18n/LanguageContext';
import FeatureIcon from '../../components/FeatureIcon';
import GradSwitch from '../../components/GradSwitch';
import { getDraft, setDraft, clearDraft, noteDraftText, noteDraftValue } from '../../lib/draftStore';
import { toggleContext, noteDraftKey, noteDirty, repeatOf, repeatShown, repeatBody, emergencyText, markLabel } from '../../lib/doseObservation';

// The phone's region ("BR", "US"…), or null when it cannot be read (then 112 + "the local number").
function deviceRegion() {
  try {
    const l = Localization.getLocales && Localization.getLocales()[0];
    return (l && (l.regionCode || l.countryCode)) || null;
  } catch { return null; }
}

// onNoteFocus(ref): the sheet lifts the focused field above the Android keyboard (useKeyboardLift).
export default function DoseObservation({ log, protocol, name, onContext, onSaveNote, onRepeat, onNoteFocus }) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const key = noteDraftKey(log.id);
  const [text, setText] = useState(() => noteDraftText(getDraft(key), log.dose_note));
  const [focus, setFocus] = useState(false);
  const fieldRef = useRef(null);
  // Another dose in the sheet, or the saved observation changed (Salvar): the field follows its draft.
  useEffect(() => { setText(noteDraftText(getDraft(key), log.dose_note)); }, [log.id, log.dose_note]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = noteDirty(text, log.dose_note);
  function typeNote(text) { // eslint-disable-line no-shadow
    setText(text);
    setDraft(noteDraftKey(log.id), noteDraftValue(getDraft(noteDraftKey(log.id)), text, log.dose_note));
  }
  function saveNote() { onSaveNote(text); }
  function cancelNote() { clearDraft(key); setText(log.dose_note || ''); }

  // The emergency line names no symptom and is the same for every dose (founder 2026-11-24).
  const region = useMemo(() => deviceRegion(), []);
  const sos = emergencyText({ region, t });
  const repeatOn = !!repeatOf(protocol);

  return (
    <View style={s.wrap}>
      <View style={s.block}>
        <View style={s.head}>
          <Text style={s.headText}>{t('dose_obs_marks_title')}</Text>
          <Text style={s.headOpt}>{t('dose_obs_optional')}</Text>
        </View>
        <View style={s.pills}>
          {['fasted', 'meal'].map((k) => {
            const on = log.dose_context === k;
            return (
              <TouchableOpacity key={k} style={[s.pill, on && s.pillOn]} onPress={() => onContext(toggleContext(log.dose_context, k))} accessibilityRole="button" accessibilityState={{ selected: on }}>
                {on ? <FeatureIcon name="check" size={14} color={colors.ink} /> : null}
                <Text style={[s.pillText, on && s.pillTextOn]}>{markLabel(k, t)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={s.block}>
        <View style={s.head}>
          <Text style={s.headText}>{t('dose_obs_note_title')}</Text>
          <Text style={s.headOpt}>{t('dose_obs_optional')}</Text>
        </View>
        <TextInput
          style={[s.field, focus && s.fieldOn]}
          value={text}
          onChangeText={typeNote}
          ref={fieldRef}
          onFocus={() => { setFocus(true); if (onNoteFocus) onNoteFocus(fieldRef); }}
          onBlur={() => setFocus(false)}
          placeholder={t('dose_obs_note_placeholder')}
          placeholderTextColor={colors.ink3}
          multiline
          accessibilityLabel={t('dose_obs_note_title')}
        />
        {dirty && (
          <View style={s.acts2}>
            <TouchableOpacity style={[s.btnSm, s.btnSec]} onPress={cancelNote} accessibilityRole="button">
              <Text style={s.btnSecText}>{t('cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btnSm, s.btnPri]} onPress={saveNote} accessibilityRole="button">
              <Text style={s.btnPriText}>{t('save')}</Text>
            </TouchableOpacity>
          </View>
        )}
        <TouchableOpacity style={s.sos} onPress={() => { Linking.openURL(sos.tel).catch(() => {}); }} accessibilityRole="link" accessibilityLabel={`${sos.question} ${sos.call}`}>
          <View style={s.sosIcon}><FeatureIcon name="warning" size={14} color={colors.risk} /></View>
          <Text style={s.sosText}>{sos.question} <Text style={s.sosCall}>{sos.call}</Text></Text>
        </TouchableOpacity>
      </View>

      {repeatShown(log, protocol) && (
        <View style={s.rep}>
          <View style={s.repText}>
            <Text style={s.repTitle}>{t('dose_obs_repeat_title')}</Text>
            <Text style={s.repBody}>{repeatBody(repeatOn ? protocol : { repeat_dose_context: log.dose_context, repeat_dose_note: text || log.dose_note }, name, t)}</Text>
          </View>
          <GradSwitch value={repeatOn} onValueChange={onRepeat} accessibilityLabel={t('dose_obs_repeat_title')} />
        </View>
      )}
    </View>
  );
}

// Picture part 2 (.mk / .pill / .field / .acts2 / .sosline / .rep), at the sheet's own scale.
const makeStyles = (c) => StyleSheet.create({
  wrap: { gap: 12 },
  block: { gap: 8 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  headText: { fontSize: 15, fontWeight: '500', color: c.ink2, flexShrink: 1 },
  headOpt: { fontSize: 13, color: c.ink3 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // The protocol form's pill: 1 px line outline; chosen = 1.5 px ink outline on raised.
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 36, borderRadius: 18, paddingHorizontal: 14, borderWidth: 1, borderColor: c.line },
  pillOn: { borderWidth: 1.5, borderColor: c.ink, backgroundColor: c.raised, paddingHorizontal: 13.5 },
  pillText: { fontSize: 14, color: c.ink2 },
  pillTextOn: { color: c.ink, fontWeight: '600' },
  // The protocol note's field (noteWell / noteWellOn): one line that grows with the text.
  field: { minHeight: 48, borderRadius: 14, backgroundColor: c.well, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12, fontSize: 16, lineHeight: 21, color: c.ink, textAlignVertical: 'top', borderWidth: 1.5, borderColor: c.well },
  fieldOn: { borderColor: c.ink },
  acts2: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  btnSm: { minHeight: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  btnPri: { backgroundColor: c.act },
  btnPriText: { fontSize: 14, fontWeight: '700', color: c.onAct },
  btnSec: { backgroundColor: c.well },
  btnSecText: { fontSize: 14, fontWeight: '700', color: c.ink },
  sos: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 14, backgroundColor: c.well, paddingVertical: 10, paddingHorizontal: 12 },
  sosIcon: { paddingTop: 2 },
  sosText: { flex: 1, fontSize: 13, lineHeight: 18, color: c.ink },
  sosCall: { fontWeight: '700', textDecorationLine: 'underline' },
  rep: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, backgroundColor: c.well, paddingVertical: 12, paddingHorizontal: 14 },
  repText: { flex: 1, minWidth: 0, gap: 3 },
  repTitle: { fontSize: 16, fontWeight: '500', color: c.ink },
  repBody: { fontSize: 13, lineHeight: 18, color: c.ink2 },
});
