'use strict';
// DV-233 (founder 2026-11-01, picture docs/design/rodada2-conta-exames.html #dv233; decisions
// "Error sheets use the warning triangle" and "titles say what happened, never a generic Error"
// (Q4 = A)): every error sheet is the DoseTrace sheet with the warning triangle and a title that
// says what happened; the body says what to do. One place for the glyph and the titles, so a
// screen never writes icon: 'alert' or t('error') on an error again (__tests__/dv233ErrorSheets).
// The sheet only shows a message: whatever the person typed stays in the screen's state.

const ERROR_ICON = 'warning';

// kind → translation key of the title. The first eight are the approved pt titles
// ("Não foi possível salvar" …); the rest say what happened in the same style.
const ERROR_TITLE_KEYS = {
  save: 'err_title_save',               // Não foi possível salvar
  restore: 'err_title_restore',         // Não foi possível restaurar as compras
  purchase: 'err_title_purchase',       // Não foi possível concluir a compra
  plan: 'err_title_plan',               // Plano indisponível no momento
  file: 'err_title_file',               // Não foi possível gerar o arquivo
  signin: 'err_title_signin',           // Não foi possível entrar
  session: 'err_title_session',         // Sua sessão terminou
  age: 'err_title_age',                 // Não foi possível salvar sua idade
  create: 'err_title_create',           // Não foi possível criar sua conta
  sendLink: 'err_title_send_link',      // Não foi possível enviar o link
  report: 'err_title_report',           // Não foi possível gerar o relatório
  camera: 'err_title_camera',           // Sem acesso à câmera
  photoBig: 'err_title_photo_big',      // Foto grande demais
  fileBig: 'err_title_file_big',        // Arquivo grande demais
  open: 'err_title_open',               // Não foi possível abrir o arquivo
  version: 'err_title_version',         // Indisponível nesta versão
  // Existing titles that already say what happened (kept as they are).
  signout: 'settings_signout_failed_title', // Não foi possível sair
  deleteAccount: 'settings_delete_device_wait_title', // Não foi possível excluir a conta
  link: 'auth_link_failed_title',       // Este link não funcionou
  noPurchases: 'paywall_no_purchases',  // Nenhuma compra encontrada
  emailExists: 'signup_email_exists_title', // E-mail já cadastrado
  invalidDate: 'today_invalid_date',    // Data inválida
};

function errorTitle(t, kind) {
  const key = ERROR_TITLE_KEYS[kind];
  if (!key) throw new Error(`errorSheet: unknown kind "${kind}"`);
  return t(key);
}

// The DTSheet config: warning triangle, the title for `kind`, the body, OK.
// extra: any other DTSheet field (buttons, done, onDismiss …) — it wins over the defaults.
function errorSheet(t, kind, body, extra) {
  return {
    icon: ERROR_ICON,
    title: errorTitle(t, kind),
    body,
    buttons: [{ label: t('ok'), kind: 'primary' }],
    ...(extra || {}),
  };
}

module.exports = { ERROR_ICON, ERROR_TITLE_KEYS, errorTitle, errorSheet };
