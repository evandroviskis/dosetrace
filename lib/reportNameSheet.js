'use strict';
// docs/specs/adherence-report.md AR-19/AR-20 (picture docs/design/relatorio-adesao.html, founder 2026-11-24):
// before a report for someone else (the adherence report, the labs / vaccines PDF) when the profile has no full
// name. The nickname never goes into a report, so the sheet says so and offers to add the full name (saved to
// the profile, then the report is made with it) or to make the report with no name line. Pure: the screen
// passes show (its DTSheet setter), onGenerate(name | null) and onSave(name) (lib/profileName saveReportName).
// A refused save (offline) still makes the report with the typed name: what she typed is used, never dropped.
function reportNameSheet({ t, show, onGenerate, onSave }) {
  const ask = {
    icon: 'clipboard',
    title: t('report_name_sheet_title'),
    body: t('report_name_sheet_body'),
    // Two long labels stack, the last one on top (DTSheet): the primary "Adicionar meu nome" first.
    buttons: [
      { label: t('report_name_skip'), kind: 'secondary', onPress: () => onGenerate(null) },
      { label: t('report_name_add'), kind: 'primary', onPress: () => show(add) },
    ],
  };
  const add = {
    title: t('report_name_field_title'),
    input: { placeholder: t('profile_report_name_placeholder'), autoCapitalize: 'words', textContentType: 'name', autoComplete: 'name' },
    hint: t('report_name_field_hint'),
    buttons: [
      { label: t('back'), kind: 'secondary', onPress: () => show(ask) },
      {
        label: t('report_name_generate'),
        kind: 'primary',
        needsInput: true,
        onPress: async (value) => {
          const name = String(value == null ? '' : value).trim();
          if (!name) { show(ask); return; }
          try { await onSave(name); } catch { /* the report still carries the typed name */ }
          onGenerate(name);
        },
      },
    ],
  };
  return ask;
}

module.exports = { reportNameSheet };
