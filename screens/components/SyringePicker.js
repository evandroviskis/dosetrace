// Syringe size, option B (AP-21, approved 2026-10-02: https://claude.ai/artifact/5RDJLsyaTJdrAuFEQ4fdvn):
// one row showing the chosen syringe that opens a grouped list — insulin syringes (marked in
// units) and, for Ready to use only, the larger 2 / 3 / 5 ml syringes (marked in ml). The list
// is a DoseTrace bottom sheet with Done; the chosen row carries the check. Graduated tokens only.
import { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../../lib/theme';
import { DTPickerSheet } from './ProtocolParts';
import { syringeGroups, syringeMl, isMlSyringe } from '../../lib/syringes';
import { decimalText } from '../../lib/localeFormat';

const mlText = (size, language) => decimalText(String(syringeMl(size)), language);

export function SyringePickerRow({ size, language, t, onPress }) {
  const { colors: c } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const label = isMlSyringe(size)
    ? t('ap_syr_row_ml').replace('{ml}', mlText(size, language))
    : t('ap_syr_row_units').replace('{ml}', mlText(size, language)).replace('{u}', String(size));
  return (
    <TouchableOpacity style={s.row} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${t('ap_syr_title')}: ${label}`}>
      <Text style={s.rowText} numberOfLines={1}>{label}</Text>
      <Svg width={9} height={15} viewBox="0 0 10 16"><Path d="M2 2l6 6-6 6" fill="none" stroke={c.ink3} strokeWidth={2} strokeLinecap="round" /></Svg>
    </TouchableOpacity>
  );
}

export function SyringePickerSheet({ visible, type, size, language, t, onPick, onDone }) {
  const { colors: c } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <DTPickerSheet visible={visible} title={t('ap_syr_title')} doneLabel={t('done')} onDone={onDone}>
      <View style={s.list}>
        {syringeGroups(type).map((g) => (
          <View key={g.titleKey} style={s.group}>
            <Text style={s.groupTitle}>{t(g.titleKey).toUpperCase()}</Text>
            {g.sizes.map((sz, i) => {
              const on = Number(size) === sz;
              const label = isMlSyringe(sz)
                ? t('ap_syr_item_ml').replace('{ml}', mlText(sz, language))
                : t('ap_syr_item_units').replace('{ml}', mlText(sz, language)).replace('{u}', String(sz));
              return (
                <TouchableOpacity
                  key={sz}
                  style={[s.item, i < g.sizes.length - 1 && s.itemLine]}
                  onPress={() => onPick(sz)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[s.itemText, on && s.itemTextOn]}>{label}</Text>
                  {on ? (
                    <Svg width={20} height={20} viewBox="0 0 24 24"><Path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke={c.ink} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></Svg>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    </DTPickerSheet>
  );
}

const makeStyles = (c) => StyleSheet.create({
  row: { minHeight: 52, borderRadius: 14, backgroundColor: c.well, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, gap: 10 },
  rowText: { flex: 1, fontSize: 16, fontWeight: '500', color: c.ink },
  list: { gap: 14 },
  group: { gap: 2 },
  groupTitle: { fontSize: 12, color: c.ink3, fontWeight: '500', marginBottom: 2 },
  item: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  itemLine: { borderBottomWidth: 1, borderBottomColor: c.line },
  itemText: { fontSize: 17, color: c.ink },
  itemTextOn: { fontWeight: '600' },
});
