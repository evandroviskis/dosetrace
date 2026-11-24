/* Admin panel — "Decisões" tab (founder approved 2026-11-24; docs/decisoes.md). The founder reads each decision a
   Claude session left for him (question, full context, his own words, the recommendation, the pictures and links),
   answers Aprovo / Não aprovo / Precisa ajustar with an option and a note, and saves — even with no Claude open.
   Loaded by web/adm.html after its main script; uses only window.DTADM (session, 15-minute step-up, toast, language,
   external links). Colours come from the page tokens only. No emoji. Mobile first: big text, big touch targets. */
(function () {
  'use strict';
  var T = {
    en: {
      title_h: 'Decisions', intro: 'What you need to decide. Tap a decision to open it.',
      g_pendentes: 'Pending', g_alterando: 'Being changed', g_decididas: 'Decided',
      area_all: 'All areas', a_app: 'App', a_painel: 'Panel', a_site: 'Website', a_divulgacao: 'Marketing', a_outro: 'Other',
      k_visual: 'Visual', k_texto: 'Text', k_regra: 'Rule', k_outro: 'Other',
      loading: 'Loading the decisions…', e_conf: 'The Decisions tab is not active on the server yet (the migration has not been applied).', e_load: 'Could not load the decisions ({n}).', retry: 'Try again',
      empty_pendentes: 'No decision pending.', empty_alterando: 'No decision being changed.', empty_decididas: 'No decision taken yet.', sub_waiting: 'Waiting to be carried out', sub_executadas: 'Carried out',
      back: 'Decisions', h_question: 'What to decide', h_context: 'Context', h_said: 'What you said', h_rec: 'Claude’s recommendation', h_pics: 'Pictures', h_links: 'Links', h_options: 'Options', h_decision: 'Decision', h_note: 'Note',
      note_ph: 'Write here what needs to change, or any note.', approve: 'I approve', refuse: 'I do not approve', adjust: 'Needs changes',
      save: 'Save', saving: 'Saving…', need_status: 'Choose “I approve”, “I do not approve” or “Needs changes” to save.', unsaved: 'Not saved yet. The text stays on this device until you save.',
      saved: 'Saved', saved_at: 'Saved on {d}', decided_on: 'Decided on {d}', waiting: 'Waiting for Claude to carry it out.', executed_at: 'Carried out on {d}',
      tap_pic: 'Tap a picture to see it full size.', open_html: 'Open the design', open_browser: 'Open in the browser', close: 'Close', real_size: 'Actual size', fit: 'Fit to screen',
      pic_missing: 'Picture unavailable (the link expires after 10 minutes; open the decision again).',
      st_pendente: 'Pending', st_aprovado: 'Approved', st_recusado: 'Not approved', st_ajustar: 'Needs changes',
      created: 'Created on {d}', from: 'Source: {s}', chosen: 'Option chosen: {c}', no_choice: 'No option chosen', locked: 'This decision has been carried out and can no longer be changed.', reworking_since: 'Being changed by Claude since {d}', reworking_hint: 'You cannot decide while it is being changed. The new version will appear under Pending.', last_note: 'Your last answer', st_alterando: 'Being changed', e_reworking: 'This decision is being changed by Claude. The new version will appear under Pending.',
      e_executed: 'This decision has already been carried out and can no longer be changed.', e_rate: 'Too many saves in a short time. Try again in {m} min.', e_choice: 'This option no longer exists in this decision. Open the decision again.', e_generic: 'Could not save ({m}). Your text is still here.', e_code: 'Code not confirmed.',
    },
    pt: {
      title_h: 'Decisões', intro: 'O que o senhor precisa decidir. Toque em uma decisão para abrir.',
      g_pendentes: 'Pendentes', g_alterando: 'Alteração em andamento', g_decididas: 'Decididas',
      area_all: 'Todas as áreas', a_app: 'App', a_painel: 'Painel', a_site: 'Site', a_divulgacao: 'Divulgação', a_outro: 'Outro',
      k_visual: 'Visual', k_texto: 'Texto', k_regra: 'Regra', k_outro: 'Outro',
      loading: 'Carregando as decisões…', e_conf: 'A aba Decisões ainda não está ativa no servidor (falta aplicar a migração).', e_load: 'Não foi possível carregar as decisões ({n}).', retry: 'Tentar de novo',
      empty_pendentes: 'Nenhuma decisão pendente.', empty_alterando: 'Nenhuma decisão em alteração.', empty_decididas: 'Nenhuma decisão tomada ainda.', sub_waiting: 'Aguardando execução', sub_executadas: 'Executadas',
      back: 'Decisões', h_question: 'O que decidir', h_context: 'Contexto', h_said: 'O que o senhor disse', h_rec: 'Recomendação do Claude', h_pics: 'Imagens', h_links: 'Links', h_options: 'Opções', h_decision: 'Decisão', h_note: 'Observação',
      note_ph: 'Escreva aqui o que precisa mudar, ou qualquer observação.', approve: 'Aprovo', refuse: 'Não aprovo', adjust: 'Precisa ajustar',
      save: 'Salvar', saving: 'Salvando…', need_status: 'Escolha Aprovo, Não aprovo ou Precisa ajustar para salvar.', unsaved: 'Ainda não salvo. O texto fica guardado neste aparelho até o senhor salvar.',
      saved: 'Salvo', saved_at: 'Salvo em {d}', decided_on: 'Decidido em {d}', waiting: 'Aguardando o Claude executar.', executed_at: 'Executado em {d}',
      tap_pic: 'Toque em uma imagem para ver em tamanho grande.', open_html: 'Abrir o desenho', open_browser: 'Abrir no navegador', close: 'Fechar', real_size: 'Tamanho real', fit: 'Ajustar à tela',
      pic_missing: 'Imagem indisponível (o link expira em 10 minutos; abra a decisão de novo).',
      st_pendente: 'Pendente', st_aprovado: 'Aprovado', st_recusado: 'Não aprovado', st_ajustar: 'Precisa ajustar',
      created: 'Criada em {d}', from: 'Origem: {s}', chosen: 'Opção escolhida: {c}', no_choice: 'Nenhuma opção escolhida', locked: 'Esta decisão já foi executada e não pode mais ser alterada.', reworking_since: 'Em alteração pelo Claude desde {d}', reworking_hint: 'Enquanto está em alteração, não é possível decidir. A nova versão aparecerá em Pendentes.', last_note: 'Última resposta do senhor', st_alterando: 'Em alteração', e_reworking: 'Esta decisão está sendo alterada pelo Claude. A nova versão aparecerá em Pendentes.',
      e_executed: 'Esta decisão já foi executada e não pode mais ser alterada.', e_rate: 'Muitas gravações em pouco tempo. Tente de novo em {m} min.', e_choice: 'Esta opção não existe mais nesta decisão. Abra a decisão de novo.', e_generic: 'Não foi possível salvar ({m}). O texto continua aqui.', e_code: 'Código não confirmado.',
    },
  };
  function tr(base, over) { var o = {}; Object.keys(base).forEach(function (k) { o[k] = over[k] != null ? over[k] : base[k]; }); return o; }
  T.es = tr(T.en, {
    title_h: 'Decisiones', intro: 'Lo que tienes que decidir. Toca una decisión para abrirla.', g_pendentes: 'Pendientes', g_alterando: 'Cambio en curso', g_decididas: 'Decididas',
    area_all: 'Todas las áreas', a_app: 'App', a_painel: 'Panel', a_site: 'Sitio web', a_divulgacao: 'Difusión', a_outro: 'Otro', k_visual: 'Visual', k_texto: 'Texto', k_regra: 'Regla', k_outro: 'Otro',
    loading: 'Cargando las decisiones…', e_conf: 'La pestaña Decisiones aún no está activa en el servidor (falta aplicar la migración).', e_load: 'No se pudieron cargar las decisiones ({n}).', retry: 'Reintentar',
    empty_pendentes: 'Ninguna decisión pendiente.', empty_alterando: 'Ninguna decisión en cambio.', empty_decididas: 'Aún no hay decisiones tomadas.', sub_waiting: 'Esperando ejecución', sub_executadas: 'Ejecutadas',
    back: 'Decisiones', h_question: 'Qué decidir', h_context: 'Contexto', h_said: 'Lo que dijiste', h_rec: 'Recomendación de Claude', h_pics: 'Imágenes', h_links: 'Enlaces', h_options: 'Opciones', h_decision: 'Decisión', h_note: 'Observación',
    note_ph: 'Escribe aquí lo que hay que cambiar, o cualquier observación.', approve: 'Apruebo', refuse: 'No apruebo', adjust: 'Hay que ajustar',
    save: 'Guardar', saving: 'Guardando…', need_status: 'Elige Apruebo, No apruebo o Hay que ajustar para guardar.', unsaved: 'Aún sin guardar. El texto queda en este dispositivo hasta que guardes.',
    saved: 'Guardado', saved_at: 'Guardado el {d}', decided_on: 'Decidido el {d}', waiting: 'Esperando a que Claude lo ejecute.', executed_at: 'Ejecutado el {d}',
    tap_pic: 'Toca una imagen para verla en grande.', open_html: 'Abrir el diseño', open_browser: 'Abrir en el navegador', close: 'Cerrar', real_size: 'Tamaño real', fit: 'Ajustar a la pantalla',
    pic_missing: 'Imagen no disponible (el enlace caduca a los 10 minutos; abre la decisión de nuevo).',
    st_pendente: 'Pendiente', st_aprovado: 'Aprobado', st_recusado: 'No aprobado', st_ajustar: 'Hay que ajustar',
    created: 'Creada el {d}', from: 'Origen: {s}', chosen: 'Opción elegida: {c}', no_choice: 'Ninguna opción elegida', locked: 'Esta decisión ya se ejecutó y ya no se puede cambiar.', reworking_since: 'Claude la está cambiando desde el {d}', reworking_hint: 'Mientras se cambia, no se puede decidir. La nueva versión aparecerá en Pendientes.', last_note: 'Tu última respuesta', st_alterando: 'En cambio', e_reworking: 'Claude está cambiando esta decisión. La nueva versión aparecerá en Pendientes.',
    e_executed: 'Esta decisión ya se ejecutó y ya no se puede cambiar.', e_rate: 'Demasiados guardados en poco tiempo. Inténtalo de nuevo en {m} min.', e_choice: 'Esta opción ya no existe en esta decisión. Abre la decisión de nuevo.', e_generic: 'No se pudo guardar ({m}). Tu texto sigue aquí.', e_code: 'Código no confirmado.',
  });
  T.fr = tr(T.en, {
    title_h: 'Décisions', intro: 'Ce que vous devez décider. Touchez une décision pour l’ouvrir.', g_pendentes: 'En attente', g_alterando: 'Modification en cours', g_decididas: 'Décidées',
    area_all: 'Tous les domaines', a_app: 'Appli', a_painel: 'Panneau', a_site: 'Site web', a_divulgacao: 'Communication', a_outro: 'Autre', k_visual: 'Visuel', k_texto: 'Texte', k_regra: 'Règle', k_outro: 'Autre',
    loading: 'Chargement des décisions…', e_conf: 'L’onglet Décisions n’est pas encore actif sur le serveur (la migration n’a pas été appliquée).', e_load: 'Impossible de charger les décisions ({n}).', retry: 'Réessayer',
    empty_pendentes: 'Aucune décision en attente.', empty_alterando: 'Aucune décision en cours de modification.', empty_decididas: 'Aucune décision prise pour l’instant.', sub_waiting: 'En attente de réalisation', sub_executadas: 'Réalisées',
    back: 'Décisions', h_question: 'Ce qu’il faut décider', h_context: 'Contexte', h_said: 'Ce que vous avez dit', h_rec: 'Recommandation de Claude', h_pics: 'Images', h_links: 'Liens', h_options: 'Options', h_decision: 'Décision', h_note: 'Remarque',
    note_ph: 'Écrivez ici ce qui doit changer, ou toute remarque.', approve: 'J’approuve', refuse: 'Je n’approuve pas', adjust: 'À ajuster',
    save: 'Enregistrer', saving: 'Enregistrement…', need_status: 'Choisissez J’approuve, Je n’approuve pas ou À ajuster pour enregistrer.', unsaved: 'Pas encore enregistré. Le texte reste sur cet appareil jusqu’à l’enregistrement.',
    saved: 'Enregistré', saved_at: 'Enregistré le {d}', decided_on: 'Décidé le {d}', waiting: 'En attente de réalisation par Claude.', executed_at: 'Réalisé le {d}',
    tap_pic: 'Touchez une image pour l’agrandir.', open_html: 'Ouvrir la maquette', open_browser: 'Ouvrir dans le navigateur', close: 'Fermer', real_size: 'Taille réelle', fit: 'Ajuster à l’écran',
    pic_missing: 'Image indisponible (le lien expire après 10 minutes ; rouvrez la décision).',
    st_pendente: 'En attente', st_aprovado: 'Approuvé', st_recusado: 'Non approuvé', st_ajustar: 'À ajuster',
    created: 'Créée le {d}', from: 'Origine : {s}', chosen: 'Option choisie : {c}', no_choice: 'Aucune option choisie', locked: 'Cette décision a été réalisée et ne peut plus être modifiée.', reworking_since: 'En cours de modification par Claude depuis le {d}', reworking_hint: 'Pendant la modification, vous ne pouvez pas décider. La nouvelle version apparaîtra dans En attente.', last_note: 'Votre dernière réponse', st_alterando: 'En modification', e_reworking: 'Claude modifie cette décision. La nouvelle version apparaîtra dans En attente.',
    e_executed: 'Cette décision a déjà été réalisée et ne peut plus être modifiée.', e_rate: 'Trop d’enregistrements en peu de temps. Réessayez dans {m} min.', e_choice: 'Cette option n’existe plus dans cette décision. Rouvrez la décision.', e_generic: 'Impossible d’enregistrer ({m}). Votre texte est toujours là.', e_code: 'Code non confirmé.',
  });
  T.de = tr(T.en, {
    title_h: 'Entscheidungen', intro: 'Was du entscheiden musst. Tippe auf eine Entscheidung, um sie zu öffnen.', g_pendentes: 'Offen', g_alterando: 'Wird geändert', g_decididas: 'Entschieden',
    area_all: 'Alle Bereiche', a_app: 'App', a_painel: 'Panel', a_site: 'Website', a_divulgacao: 'Marketing', a_outro: 'Sonstiges', k_visual: 'Visuell', k_texto: 'Text', k_regra: 'Regel', k_outro: 'Sonstiges',
    loading: 'Entscheidungen werden geladen…', e_conf: 'Der Tab Entscheidungen ist auf dem Server noch nicht aktiv (die Migration fehlt).', e_load: 'Entscheidungen konnten nicht geladen werden ({n}).', retry: 'Erneut versuchen',
    empty_pendentes: 'Keine offene Entscheidung.', empty_alterando: 'Keine Entscheidung wird gerade geändert.', empty_decididas: 'Noch keine Entscheidung getroffen.', sub_waiting: 'Wartet auf Umsetzung', sub_executadas: 'Umgesetzt',
    back: 'Entscheidungen', h_question: 'Was zu entscheiden ist', h_context: 'Kontext', h_said: 'Was du gesagt hast', h_rec: 'Empfehlung von Claude', h_pics: 'Bilder', h_links: 'Links', h_options: 'Optionen', h_decision: 'Entscheidung', h_note: 'Anmerkung',
    note_ph: 'Schreib hier, was sich ändern soll, oder eine Anmerkung.', approve: 'Freigegeben', refuse: 'Nicht freigegeben', adjust: 'Muss angepasst werden',
    save: 'Speichern', saving: 'Wird gespeichert…', need_status: 'Wähle Freigegeben, Nicht freigegeben oder Muss angepasst werden, um zu speichern.', unsaved: 'Noch nicht gespeichert. Der Text bleibt bis zum Speichern auf diesem Gerät.',
    saved: 'Gespeichert', saved_at: 'Gespeichert am {d}', decided_on: 'Entschieden am {d}', waiting: 'Wartet auf die Umsetzung durch Claude.', executed_at: 'Umgesetzt am {d}',
    tap_pic: 'Tippe auf ein Bild, um es groß zu sehen.', open_html: 'Entwurf öffnen', open_browser: 'Im Browser öffnen', close: 'Schließen', real_size: 'Originalgröße', fit: 'An Bildschirm anpassen',
    pic_missing: 'Bild nicht verfügbar (der Link läuft nach 10 Minuten ab; öffne die Entscheidung erneut).',
    st_pendente: 'Offen', st_aprovado: 'Freigegeben', st_recusado: 'Nicht freigegeben', st_ajustar: 'Muss angepasst werden',
    created: 'Erstellt am {d}', from: 'Quelle: {s}', chosen: 'Gewählte Option: {c}', no_choice: 'Keine Option gewählt', locked: 'Diese Entscheidung wurde umgesetzt und kann nicht mehr geändert werden.', reworking_since: 'Wird seit {d} von Claude geändert', reworking_hint: 'Während der Änderung kannst du nicht entscheiden. Die neue Version erscheint unter Offen.', last_note: 'Deine letzte Antwort', st_alterando: 'Wird geändert', e_reworking: 'Claude ändert diese Entscheidung gerade. Die neue Version erscheint unter Offen.',
    e_executed: 'Diese Entscheidung wurde bereits umgesetzt und kann nicht mehr geändert werden.', e_rate: 'Zu viele Speichervorgänge in kurzer Zeit. Versuche es in {m} Min. erneut.', e_choice: 'Diese Option gibt es in dieser Entscheidung nicht mehr. Öffne die Entscheidung erneut.', e_generic: 'Speichern fehlgeschlagen ({m}). Dein Text ist noch da.', e_code: 'Code nicht bestätigt.',
  });
  T.it = tr(T.en, {
    title_h: 'Decisioni', intro: 'Ciò che devi decidere. Tocca una decisione per aprirla.', g_pendentes: 'In sospeso', g_alterando: 'Modifica in corso', g_decididas: 'Decise',
    area_all: 'Tutte le aree', a_app: 'App', a_painel: 'Pannello', a_site: 'Sito web', a_divulgacao: 'Promozione', a_outro: 'Altro', k_visual: 'Visivo', k_texto: 'Testo', k_regra: 'Regola', k_outro: 'Altro',
    loading: 'Caricamento delle decisioni…', e_conf: 'La scheda Decisioni non è ancora attiva sul server (manca la migrazione).', e_load: 'Impossibile caricare le decisioni ({n}).', retry: 'Riprova',
    empty_pendentes: 'Nessuna decisione in sospeso.', empty_alterando: 'Nessuna decisione in modifica.', empty_decididas: 'Ancora nessuna decisione presa.', sub_waiting: 'In attesa di esecuzione', sub_executadas: 'Eseguite',
    back: 'Decisioni', h_question: 'Cosa decidere', h_context: 'Contesto', h_said: 'Cosa hai detto', h_rec: 'Raccomandazione di Claude', h_pics: 'Immagini', h_links: 'Link', h_options: 'Opzioni', h_decision: 'Decisione', h_note: 'Nota',
    note_ph: 'Scrivi qui cosa va cambiato, o qualsiasi nota.', approve: 'Approvo', refuse: 'Non approvo', adjust: 'Da modificare',
    save: 'Salva', saving: 'Salvataggio…', need_status: 'Scegli Approvo, Non approvo o Da modificare per salvare.', unsaved: 'Non ancora salvato. Il testo resta su questo dispositivo finché non salvi.',
    saved: 'Salvato', saved_at: 'Salvato il {d}', decided_on: 'Deciso il {d}', waiting: 'In attesa che Claude la esegua.', executed_at: 'Eseguito il {d}',
    tap_pic: 'Tocca un’immagine per vederla in grande.', open_html: 'Apri il progetto', open_browser: 'Apri nel browser', close: 'Chiudi', real_size: 'Dimensione reale', fit: 'Adatta allo schermo',
    pic_missing: 'Immagine non disponibile (il link scade dopo 10 minuti; riapri la decisione).',
    st_pendente: 'In sospeso', st_aprovado: 'Approvato', st_recusado: 'Non approvato', st_ajustar: 'Da modificare',
    created: 'Creata il {d}', from: 'Origine: {s}', chosen: 'Opzione scelta: {c}', no_choice: 'Nessuna opzione scelta', locked: 'Questa decisione è stata eseguita e non può più essere modificata.', reworking_since: 'In modifica da parte di Claude dal {d}', reworking_hint: 'Durante la modifica non puoi decidere. La nuova versione apparirà in In sospeso.', last_note: 'La tua ultima risposta', st_alterando: 'In modifica', e_reworking: 'Claude sta modificando questa decisione. La nuova versione apparirà in In sospeso.',
    e_executed: 'Questa decisione è già stata eseguita e non può più essere modificata.', e_rate: 'Troppi salvataggi in poco tempo. Riprova tra {m} min.', e_choice: 'Questa opzione non esiste più in questa decisione. Riapri la decisione.', e_generic: 'Impossibile salvare ({m}). Il tuo testo è ancora qui.', e_code: 'Codice non confermato.',
  });
  window.DC_T = T;

  var GROUPS = ['pendentes', 'alterando', 'decididas'];
  var AREAS = ['app', 'painel', 'site', 'divulgacao', 'outro'];
  var MAX_NOTE = 4000;
  var DRAFT_KEY = 'dt_adm_dc_draft_';
  function L() { try { return (window.DTADM && window.DTADM.lang()) || 'en'; } catch (e) { return 'en'; } }
  function t(k, v) { var l = T[L()] ? L() : 'en'; var s = T[l][k] != null ? T[l][k] : (T.en[k] != null ? T.en[k] : k); if (v) Object.keys(v).forEach(function (p) { s = String(s).split('{' + p + '}').join(v[p]); }); return s; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function when(iso) { if (!iso) return '—'; try { return new Date(iso).toLocaleString(L(), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (e) { return String(iso); } }
  // Founder 2026-11-24: Pendentes / Alteração em andamento / Decididas (the executed ones inside Decididas, after the waiting ones).
  function groupOf(r) { return r && r.status === 'pendente' ? 'pendentes' : r && r.status === 'alterando' ? 'alterando' : 'decididas'; }
  // Read only: carried out, or being changed by Claude (never decided while it changes).
  function readOnly() { var it = DC.det; return !!(it && (it.executed_at || it.status === 'alterando')); }
  function safeUrl(u) { var s = String(u || '').trim(); return /^https:\/\/[^\s"'<>]+$/i.test(s) ? s : null; }
  function chars(s) { return Array.from(String(s || '')).length; }
  function mob() { try { return window.DTADM.isMobile(); } catch (e) { return false; } }
  function ext(u) { var s = safeUrl(u); if (!s) return; try { if (window.DTADM.openExternal) { window.DTADM.openExternal(s); return; } } catch (e) {} window.open(s, '_blank', 'noopener,noreferrer'); }

  // ------------------------------------------------------------------ drafts (kept on this device until saved)
  function store() { try { return window.localStorage; } catch (e) { return null; } }
  function readDraft(id) { try { var s = store(); var x = s && JSON.parse(s.getItem(DRAFT_KEY + id) || 'null'); return x && typeof x === 'object' ? x : null; } catch (e) { return null; } }
  function writeDraft(id, d) { try { var s = store(); if (s) s.setItem(DRAFT_KEY + id, JSON.stringify(d)); } catch (e) {} }
  function dropDraft(id) { try { var s = store(); if (s) s.removeItem(DRAFT_KEY + id); } catch (e) {} }

  // ------------------------------------------------------------------ state, API
  var DC = { root: null, data: null, err: null, loading: false, group: 'pendentes', area: '', sel: null, det: null, detErr: null, draft: null, busy: false, saveErr: null, savedAt: null, box: null };
  function api(m, b, q) { return window.DTADM.api(m, b, '/api/adm-decisions' + (q || '')); }
  function pending() { return DC.data && DC.data.counts ? DC.data.counts.pendentes : null; }
  function paintBadge() {
    var n = pending();
    var els = []; try { els = document.querySelectorAll('.dc-badge'); } catch (e) {}
    for (var i = 0; i < els.length; i++) { els[i].textContent = n ? String(n) : ''; els[i].hidden = !n; }
  }
  function load(silent) {
    if (!silent) { DC.loading = true; draw(); }
    return api('GET').then(function (x) {
      DC.loading = false;
      if (x.expired) { if (!silent) window.DTADM.expired(); return; }
      if (x.noauth) { if (!silent) window.DTADM.noauth(); return; }
      if (x.status === 200 && x.j) { DC.data = x.j; DC.err = null; }
      else if (!silent || !DC.data) DC.err = x.status === 503 ? t('e_conf') : t('e_load', { n: x.status || '—' });
      paintBadge(); draw();
    });
  }
  function open(id) {
    DC.sel = id; DC.det = null; DC.detErr = null; DC.saveErr = null; DC.savedAt = null; DC.box = null; draw();
    try { window.scrollTo(0, 0); } catch (e) {}
    api('GET', null, '?id=' + encodeURIComponent(id)).then(function (x) {
      if (x.expired) { window.DTADM.expired(); return; }
      if (DC.sel !== id) return;
      if (x.status === 200 && x.j && x.j.item) {
        var it = x.j.item; DC.det = it;
        var saved = { status: it.status === 'pendente' ? null : it.status, choice: it.choice || null, note: it.note || '' };
        DC.draft = readDraft(id) || saved;
      } else DC.detErr = x.status === 503 ? t('e_conf') : t('e_load', { n: x.status || '—' });
      draw();
    });
  }
  function dirty() { var it = DC.det, d = DC.draft; if (!it || !d) return false; return (d.status || null) !== (it.status === 'pendente' ? null : it.status) || (d.choice || null) !== (it.choice || null) || String(d.note || '').trim() !== String(it.note || ''); }
  function errText(x) {
    var j = x && x.j;
    if (x && x.status === 409) return j && j.error === 'reworking' ? t('e_reworking') : t('e_executed');
    if (x && x.status === 429) return t('e_rate', { m: Math.max(1, Math.ceil(((j && j.retry_after) || 60) / 60)) });
    if (x && x.status === 400 && j && j.field === 'choice') return t('e_choice');
    if (x && x.status === 503 && j && j.error === 'not_configured') return t('e_conf');
    return t('e_generic', { m: (j && j.error) || (x && x.status) || '—' });
  }
  function save() {
    var it = DC.det, d = DC.draft; if (!it || !d || !d.status || DC.busy) return;
    var body = { id: it.id, status: d.status, choice: d.choice || null, note: String(d.note || '').trim() || null };
    function send(retried) {
      DC.busy = true; DC.saveErr = null; draw();
      api('PATCH', body).then(function (x) {
        DC.busy = false;
        if (x.expired) { window.DTADM.expired(); return; }
        if (x.noauth) { window.DTADM.noauth(); return; }
        if (x.stepUp) { if (retried) { DC.saveErr = t('e_code'); draw(); return; } window.DTADM.openStepUp(function () { send(true); }); return; }
        if (x.status === 200 && x.j && x.j.ok) {
          it.status = x.j.status; it.choice = x.j.choice; it.note = x.j.note; it.decided_at = x.j.decided_at; it.group = groupOf(it);
          DC.draft = { status: it.status, choice: it.choice || null, note: it.note || '' };
          dropDraft(it.id); DC.savedAt = x.j.decided_at;
          window.DTADM.toast(t('saved_at', { d: when(x.j.decided_at) }), 'ok');
          draw(); load(true);
          return;
        }
        DC.saveErr = errText(x); draw();
      });
    }
    if (window.DTADM.needsStepUp()) window.DTADM.openStepUp(function () { send(true); }); else send(false);
  }

  // ------------------------------------------------------------------ list
  function stChip(r) {
    if (r.status === 'alterando' && !r.executed_at) return '<span class="dc-st acc">' + esc(t('st_alterando')) + '</span>';
    if (r.executed_at) return '<span class="dc-st good">' + esc(t('executed_at', { d: when(r.executed_at) })) + '</span>';
    var cls = r.status === 'aprovado' ? 'good' : r.status === 'recusado' ? 'bad' : r.status === 'ajustar' ? 'warn' : 'acc';
    return '<span class="dc-st ' + cls + '">' + esc(t('st_' + r.status)) + '</span>';
  }
  function tags(r) { return '<span class="dc-tag">' + esc(t('a_' + r.area)) + '</span><span class="dc-tag">' + esc(t('k_' + r.kind)) + '</span>'; }
  function list() {
    var d = DC.data, c = (d && d.counts) || { pendentes: 0, alterando: 0, decididas: 0, executadas: 0 };
    var h = '<div class="dc-head"><h2 class="dc-h1">' + esc(t('title_h')) + '</h2><p class="dc-intro">' + esc(t('intro')) + '</p></div>';
    h += '<div class="dc-seg" role="tablist">' + GROUPS.map(function (g) { return '<button type="button" role="tab" data-a="group" data-v="' + g + '" class="' + (DC.group === g ? 'on' : '') + '" aria-selected="' + (DC.group === g) + '">' + esc(t('g_' + g)) + ' <b>' + (c[g] || 0) + '</b></button>'; }).join('') + '</div>';
    h += '<div class="dc-areas">' + [''].concat(AREAS).map(function (a) { return '<button type="button" data-a="area" data-v="' + a + '" class="' + (DC.area === a ? 'on' : '') + '" aria-pressed="' + (DC.area === a) + '">' + esc(a ? t('a_' + a) : t('area_all')) + '</button>'; }).join('') + '</div>';
    var items = ((d && d.items) || []).filter(function (r) { return r.group === DC.group && (!DC.area || r.area === DC.area); });
    if (!items.length) return h + '<div class="dc-empty">' + esc(t('empty_' + DC.group)) + '</div>';
    function card(r) {
      var sub = r.executed_at ? (r.executed_note || '') : r.status === 'alterando' ? t('reworking_since', { d: when(r.rework_at) }) : r.status !== 'pendente' ? (t('decided_on', { d: when(r.decided_at) }) + (r.choice ? ' · ' + r.choice : '')) : r.question;
      return '<button type="button" class="dc-item" data-a="open" data-v="' + esc(r.id) + '"><span class="dc-item-top">' + tags(r) + stChip(r) + '</span><span class="dc-item-t">' + esc(r.title) + '</span><span class="dc-item-q">' + esc(sub) + '</span></button>';
    }
    if (DC.group !== 'decididas') return h + '<div class="dc-list">' + items.map(card).join('') + '</div>';
    var wait = items.filter(function (r) { return !r.executed_at; }), done = items.filter(function (r) { return !!r.executed_at; });
    if (wait.length) h += '<h3 class="dc-sub">' + esc(t('sub_waiting')) + ' · ' + wait.length + '</h3><div class="dc-list">' + wait.map(card).join('') + '</div>';
    if (done.length) h += '<h3 class="dc-sub">' + esc(t('sub_executadas')) + ' · ' + done.length + '</h3><div class="dc-list">' + done.map(card).join('') + '</div>';
    return h;
  }

  // ------------------------------------------------------------------ one decision
  function block(title, text, cls) { if (!text) return ''; return '<section class="dc-sec"><h3>' + esc(title) + '</h3><div class="dc-body' + (cls ? ' ' + cls : '') + '">' + esc(text) + '</div></section>'; }
  function detail() {
    var it = DC.det;
    var h = '<button type="button" class="dc-back" data-a="back">‹ ' + esc(t('back')) + '</button>';
    if (DC.detErr) return h + '<div class="dc-empty">' + esc(DC.detErr) + '</div>';
    if (!it) return h + '<div class="dc-empty">' + esc(t('loading')) + '</div>';
    var locked = readOnly(), rework = it.status === 'alterando' && !it.executed_at;
    h += '<div class="dc-meta">' + tags(it) + stChip(it) + '</div><h2 class="dc-title">' + esc(it.title) + '</h2>';
    h += '<div class="dc-small">' + esc(t('created', { d: when(it.created_at) })) + (it.source ? ' · ' + esc(t('from', { s: it.source })) : '') + '</div>';
    if (it.executed_at) h += '<div class="dc-banner good"><b>' + esc(t('executed_at', { d: when(it.executed_at) })) + '</b>' + (it.executed_note ? ' — ' + esc(it.executed_note) : '') + '</div>';
    else if (rework) h += '<div class="dc-banner acc"><b>' + esc(t('reworking_since', { d: when(it.rework_at) })) + '</b><br>' + esc(t('reworking_hint')) + '</div>';
    else if (it.status !== 'pendente') h += '<div class="dc-banner"><b>' + esc(t('decided_on', { d: when(it.decided_at) })) + '</b> · ' + esc(t('waiting')) + '</div>';
    h += block(t('h_question'), it.question, 'dc-q');
    h += block(t('h_context'), it.context);
    h += block(t('h_said'), it.founder_said, 'dc-said');
    h += block(t('h_rec'), it.recommendation, 'dc-rec');
    if (it.images && it.images.length) {
      h += '<section class="dc-sec"><h3>' + esc(t('h_pics')) + '</h3><div class="dc-small">' + esc(t('tap_pic')) + '</div>';
      it.images.forEach(function (p, i) {
        if (p.kind === 'html') { h += '<figure class="dc-fig"><figcaption>' + esc(p.label) + '</figcaption>' + (p.url ? '<button type="button" class="dc-big" data-a="ext" data-v="' + esc(p.url) + '">' + esc(t('open_html')) + '</button>' : '<div class="dc-small">' + esc(t('pic_missing')) + '</div>') + '</figure>'; return; }
        h += '<figure class="dc-fig"><figcaption>' + esc(p.label) + '</figcaption>' + (p.url ? '<button type="button" class="dc-pic" data-a="pic" data-v="' + i + '"><img class="dc-img" src="' + esc(p.url) + '" alt="' + esc(p.label) + '"></button>' : '<div class="dc-small">' + esc(t('pic_missing')) + '</div>') + '</figure>';
      });
      h += '</section>';
    }
    var links = (it.links || []).filter(function (l) { return safeUrl(l.url); });
    if (links.length) h += '<section class="dc-sec"><h3>' + esc(t('h_links')) + '</h3><div class="dc-links">' + links.map(function (l) { return '<button type="button" class="dc-big" data-a="ext" data-v="' + esc(l.url) + '">' + esc(l.label || l.url) + '</button>'; }).join('') + '</div></section>';
    var d = DC.draft || {};
    if (locked) {
      // Being changed: his last answer (what Claude is working from); the status itself is 'alterando', so the last answer is shown as written.
      if (rework) h += '<section class="dc-sec"><h3>' + esc(t('last_note')) + '</h3><div class="dc-body dc-said">' + esc(it.choice ? t('chosen', { c: it.choice }) : t('no_choice')) + (it.note ? '\n\n' + esc(it.note) : '') + '</div><div class="dc-small">' + esc(t('decided_on', { d: when(it.decided_at) })) + '</div></section>';
      else h += '<section class="dc-sec"><h3>' + esc(t('h_decision')) + '</h3><div class="dc-body">' + esc(t('st_' + it.status)) + '\n' + esc(it.choice ? t('chosen', { c: it.choice }) : t('no_choice')) + (it.note ? '\n\n' + esc(it.note) : '') + '</div><div class="dc-small">' + esc(t('locked')) + '</div></section>';
      return h;
    }
    if (it.options && it.options.length) h += '<section class="dc-sec"><h3>' + esc(t('h_options')) + '</h3><div class="dc-opts" role="radiogroup">' + it.options.map(function (o, i) { var on = d.choice === o; return '<button type="button" role="radio" aria-checked="' + on + '" data-a="choice" data-v="' + i + '" class="' + (on ? 'on' : '') + '">' + esc(o) + '</button>'; }).join('') + '</div></section>';
    h += '<section class="dc-sec"><h3>' + esc(t('h_decision')) + '</h3><div class="dc-act">' + [['aprovado', 'approve', 'good'], ['recusado', 'refuse', 'bad'], ['ajustar', 'adjust', 'warn']].map(function (b) { var on = d.status === b[0]; return '<button type="button" data-a="status" data-v="' + b[0] + '" class="' + b[2] + (on ? ' on' : '') + '" aria-pressed="' + on + '">' + esc(t(b[1])) + '</button>'; }).join('') + '</div></section>';
    h += '<section class="dc-sec"><h3><label for="dc-note">' + esc(t('h_note')) + '</label></h3><textarea id="dc-note" class="dc-note" maxlength="' + MAX_NOTE + '" placeholder="' + esc(t('note_ph')) + '">' + esc(d.note || '') + '</textarea><div class="dc-small dc-count" id="dc-count">' + chars(d.note) + ' / ' + MAX_NOTE + '</div></section>';
    h += '<div class="dc-savebar"><button type="button" class="dc-save" data-a="save"' + (!d.status || DC.busy ? ' disabled' : '') + '>' + esc(DC.busy ? t('saving') : t('save')) + '</button>';
    h += '<div class="dc-small" id="dc-hint">' + esc(!d.status ? t('need_status') : dirty() ? t('unsaved') : DC.savedAt ? t('saved_at', { d: when(DC.savedAt) }) : it.decided_at ? t('saved_at', { d: when(it.decided_at) }) : '') + '</div>';
    if (DC.saveErr) h += '<div class="dc-err" role="alert">' + esc(DC.saveErr) + '</div>';
    h += '</div>';
    return h;
  }
  function lightbox() {
    var b = DC.box; if (!b || !DC.det) return '';
    var p = DC.det.images[b.i]; if (!p || !p.url) return '';
    return '<div class="dc-box" role="dialog" aria-modal="true" aria-label="' + esc(p.label) + '"><div class="dc-box-bar"><button type="button" class="dc-big" data-a="boxclose">' + esc(t('close')) + '</button><button type="button" class="dc-big" data-a="boxsize">' + esc(b.real ? t('fit') : t('real_size')) + '</button><button type="button" class="dc-big" data-a="ext" data-v="' + esc(p.url) + '">' + esc(t('open_browser')) + '</button></div><div class="dc-box-cap">' + esc(p.label) + '</div><div class="dc-box-img' + (b.real ? ' real' : '') + '"><img src="' + esc(p.url) + '" alt="' + esc(p.label) + '" data-a="boxsize"></div></div>';
  }
  function draw() {
    if (!DC.root || !document.body.contains(DC.root)) return;
    var h = '<div class="dc' + (mob() ? ' dcm' : '') + '">';
    if (DC.sel) h += detail();
    else if (DC.err) h += '<div class="dc-empty">' + esc(DC.err) + '<br><button type="button" class="dc-big" data-a="retry">' + esc(t('retry')) + '</button></div>';
    else if (!DC.data) h += '<div class="dc-empty">' + esc(t('loading')) + '</div>';
    else h += list();
    h += lightbox() + '</div>';
    DC.root.innerHTML = h;
    var imgs = DC.root.querySelectorAll('img.dc-img');
    for (var i = 0; i < imgs.length; i++) imgs[i].addEventListener('error', function (ev) { var f = ev.target.closest('figure'); if (f) { var m = document.createElement('div'); m.className = 'dc-small'; m.textContent = t('pic_missing'); ev.target.parentNode.replaceWith(m); } });
  }

  function onClick(ev) {
    var el = ev.target.closest('[data-a]'); if (!el || !DC.root.contains(el)) return;
    var a = el.getAttribute('data-a'), v = el.getAttribute('data-v');
    if (a === 'group') { DC.group = GROUPS.indexOf(v) >= 0 ? v : 'pendentes'; draw(); return; }
    if (a === 'area') { DC.area = AREAS.indexOf(v) >= 0 ? v : ''; draw(); return; }
    if (a === 'open') { open(v); return; }
    if (a === 'back') { DC.sel = null; DC.det = null; DC.box = null; draw(); return; }
    if (a === 'retry') { load(false); return; }
    if (a === 'ext') { ext(v); return; }
    if (a === 'pic') { DC.box = { i: Number(v), real: false }; draw(); return; }
    if (a === 'boxclose') { DC.box = null; draw(); return; }
    if (a === 'boxsize') { if (DC.box) { DC.box.real = !DC.box.real; draw(); } return; }
    if (!DC.det || readOnly() || !DC.draft) return;
    if (a === 'choice') { var o = DC.det.options[Number(v)]; DC.draft.choice = DC.draft.choice === o ? null : o; writeDraft(DC.det.id, DC.draft); draw(); return; }
    if (a === 'status') { DC.draft.status = DC.draft.status === v ? null : v; writeDraft(DC.det.id, DC.draft); draw(); return; }
    if (a === 'save') { save(); return; }
  }
  function onInput(ev) {
    if (ev.target.id !== 'dc-note' || !DC.draft || !DC.det) return;
    DC.draft.note = ev.target.value; writeDraft(DC.det.id, DC.draft);
    var c = document.getElementById('dc-count'); if (c) c.textContent = chars(DC.draft.note) + ' / ' + MAX_NOTE;
    var hi = document.getElementById('dc-hint'); if (hi && DC.draft.status) hi.textContent = dirty() ? t('unsaved') : '';
  }

  var STYLE = '.dc{max-width:860px;margin:0 auto}.dc-head{margin:6px 0 12px}.dc-h1{font-size:22px;text-transform:none;letter-spacing:0;color:var(--ink);margin:0 0 4px}.dc-intro{color:var(--muted);font-size:15px;margin:0}'
    + '.dc-seg{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:0 0 10px}.dc-seg button{min-height:52px;font-size:15.5px;font-weight:700;border-radius:12px;background:var(--surface);color:var(--ink)}.dc-seg button b{display:inline-block;min-width:24px;padding:0 6px;border-radius:999px;background:var(--surface2);color:var(--ink);font-size:13px}.dc-seg button.on{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}.dc-seg button.on b{background:var(--bg);color:var(--ink)}'
    + '.dc-areas{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 14px}.dc-areas button{min-height:44px;border-radius:999px;font-size:14.5px;padding:6px 14px}'
    + '.dc-list{display:grid;gap:10px}.dc-item{display:block;width:100%;text-align:left;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:14px 16px;min-height:72px}.dc-item:hover{border-color:var(--accent)}.dc-item-top{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:6px}.dc-item-t{display:block;font-size:18px;font-weight:700;line-height:1.3;color:var(--ink)}.dc-item-q{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;color:var(--muted);font-size:15px;margin-top:4px;white-space:pre-wrap}'
    + '.dc-tag{display:inline-block;border:1px solid var(--line);color:var(--muted);font-size:12.5px;border-radius:7px;padding:1px 8px;font-weight:600}.dc-st{display:inline-block;font-size:12.5px;border-radius:999px;padding:1px 9px;border:1px solid var(--line);color:var(--muted);font-weight:700}.dc-st.good{color:var(--good);border-color:var(--good)}.dc-st.bad{color:var(--bad);border-color:var(--bad)}.dc-st.warn{color:var(--warn);border-color:var(--warn)}.dc-st.acc{color:var(--accent);border-color:var(--accent)}'
    + '.dc-empty{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:22px 16px;color:var(--muted);font-size:16px;text-align:center}'
    + '.dc-back{min-height:48px;font-size:16px;font-weight:700;padding:8px 16px;margin:4px 0 12px;border-radius:12px}.dc-meta{display:flex;flex-wrap:wrap;gap:6px;align-items:center}.dc-title{font-size:23px;line-height:1.25;text-transform:none;letter-spacing:0;color:var(--ink);margin:8px 0 4px}.dc-small{color:var(--muted);font-size:14px;margin-top:4px}'
    + '.dc-banner{border:1px solid var(--warn);border-radius:12px;padding:12px 14px;font-size:16px;margin:12px 0 0}.dc-banner.good{border-color:var(--good)}.dc-banner.acc{border-color:var(--accent)}.dc-sub{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:16px 0 8px;font-weight:800}.dc-sub:first-of-type{margin-top:4px}.dc-banner b{color:var(--ink)}'
    + '.dc-sec{margin:18px 0 0;padding:0}.dc-sec h3{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:0 0 8px;font-weight:800}.dc-sec h3 label{cursor:pointer}'
    + '.dc-body{font-size:17px;line-height:1.6;color:var(--ink);white-space:pre-wrap;overflow-wrap:anywhere;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:14px 16px}.dc-body.dc-q{font-weight:700;border-color:var(--accent)}.dc-body.dc-said{border-left:4px solid var(--accent2);font-style:italic}.dc-body.dc-rec{border-left:4px solid var(--good)}'
    + '.dc-fig{margin:10px 0 0}.dc-fig figcaption{font-size:15px;font-weight:700;margin:0 0 6px}.dc-pic{display:block;width:100%;padding:0;border-radius:14px;overflow:hidden;background:var(--surface2)}.dc-pic img{display:block;width:100%;height:auto}'
    + '.dc-links{display:grid;gap:8px}.dc-big{min-height:52px;font-size:16px;font-weight:700;padding:10px 16px;border-radius:12px;text-align:left}'
    + '.dc-opts{display:flex;flex-direction:column;gap:8px}.dc-opts button{min-height:56px;font-size:16.5px;text-align:left;padding:12px 16px;border-radius:12px;background:var(--surface)}.dc-opts button.on{background:var(--accent);border-color:var(--accent);color:var(--accent-ink);font-weight:800}'
    + '.dc-act{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.dcm .dc-act{grid-template-columns:minmax(0,1fr)}.dc-act button{min-height:56px;font-size:17px;font-weight:700;border-radius:12px;background:var(--surface);color:var(--ink);border-width:2px;display:flex;align-items:center;justify-content:center;gap:10px}.dc-act button::before{content:"";width:18px;height:18px;border-radius:50%;border:2px solid var(--dc-c);box-sizing:border-box;flex:none}.dc-act button.good{--dc-c:var(--good);border-color:var(--good)}.dc-act button.bad{--dc-c:var(--bad);border-color:var(--bad)}.dc-act button.warn{--dc-c:var(--warn);border-color:var(--warn)}.dc-act button.on{font-weight:800;border-width:3px;background:var(--surface2);background:color-mix(in srgb,var(--dc-c) 22%,var(--surface))}.dc-act button.on::before{background:var(--dc-c);box-shadow:inset 0 0 0 3px var(--surface)}'
    + '.dc-note{width:100%;min-height:150px;font:inherit;font-size:17px;line-height:1.5;color:var(--ink);background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:12px 14px;resize:vertical}.dc-note:focus{outline:2px solid var(--accent);border-color:var(--accent)}.dc-count{text-align:right}'
    + '.dc-savebar{margin:16px 0 28px}.dc-save{width:100%;min-height:60px;font-size:18px;font-weight:800;border-radius:14px;background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}.dc-save[disabled]{opacity:.45;cursor:default}.dc-err{color:var(--bad);font-size:15px;margin-top:8px;font-weight:700}'
    + '.dc-box{position:fixed;inset:0;z-index:80;background:var(--bg);display:flex;flex-direction:column;padding:calc(10px + var(--sat,0px)) 10px calc(10px + var(--sab,0px))}.dc-box-bar{display:flex;gap:8px;flex-wrap:wrap}.dc-box-cap{font-weight:700;font-size:15px;margin:8px 2px}.dc-box-img{flex:1;overflow:auto;-webkit-overflow-scrolling:touch;border:1px solid var(--line);border-radius:12px;background:var(--surface2)}.dc-box-img img{display:block;width:100%;height:auto}.dc-box-img.real img{width:auto;max-width:none}';
  function ensureStyle() { if (document.getElementById('dc-style')) return; var s = document.createElement('style'); s.id = 'dc-style'; s.textContent = STYLE; document.head.appendChild(s); }

  window.DCTab = {
    mount: function (root) {
      if (!root || !window.DTADM) return;
      ensureStyle();
      DC.root = root;
      if (!root._dcBound) { root.addEventListener('click', onClick); root.addEventListener('input', onInput); root._dcBound = true; }
      draw();
      if (!DC.data && !DC.loading) load(false);
      if (DC.sel && !DC.det && !DC.detErr) open(DC.sel);
    },
    // Called by the page after each successful load: the badge on the tab (pending count), with no UI change.
    prefetch: function () { if (!window.DTADM || DC.loading) return; load(true); },
    pending: pending,
    // Android Back (DTAdminBack): picture → decision → list.
    back: function () { if (!DC.root || !document.body.contains(DC.root)) return false; if (DC.box) { DC.box = null; draw(); return true; } if (DC.sel) { DC.sel = null; DC.det = null; draw(); return true; } return false; },
    _state: DC, _t: t, _group: groupOf, _safeUrl: safeUrl, _readOnly: readOnly, _detail: detail,
  };
  var early = document.getElementById('dc-root'); if (early && !early.innerHTML) window.DCTab.mount(early);
})();
