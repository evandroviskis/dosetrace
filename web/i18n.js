/* DoseTrace site — client-side i18n (EN/ES/PT-BR/FR/DE/IT) */
(function () {
  'use strict';

  var LANGS = [
    { code: 'en', label: 'English',    html: 'en'    },
    { code: 'es', label: 'Español',    html: 'es'    },
    { code: 'pt', label: 'Português',  html: 'pt-BR' },
    { code: 'fr', label: 'Français',   html: 'fr'    },
    { code: 'de', label: 'Deutsch',    html: 'de'    },
    { code: 'it', label: 'Italiano',   html: 'it'    }
  ];

  var DICT = {
    en: {
      nav_features: 'Features', nav_screens: 'Screens', nav_privacy: 'Privacy', nav_pricing: 'Pricing', nav_faq: 'FAQ', nav_cta: 'Get the app',
      hero_eyebrow: 'iPhone &amp; Android',
      hero_h1: 'Track every protocol with <span class="grad">clarity</span>. Keep your data private.',
      hero_lead: 'DoseTrace is a private journal and calculator for peptides, TRT, and supplements. Log doses, track vials, chart your bloodwork, and run the numbers — all on your device.',
      hero_note: 'Free to use · No ads · Your data is never sold',
      sb_get_small: 'Download on the', sb_play_small: 'Get it on',
      trust_private: 'Private by default', trust_offline: 'Offline-first', trust_noads: 'No ads, never sold', trust_langs: '6 languages', trust_notmed: 'Not a medical service',
      feat_eyebrow: 'What it does', feat_h2: "Everything your protocol needs — nothing it doesn't.",
      feat_sub: 'Built for people running peptide, hormone, and supplement protocols who want an honest record and the math done right.',
      f1_t: 'Dose &amp; protocol tracking', f1_d: 'Log every dose, set your schedule, and keep a clean history. Reminders make sure you never miss one.',
      f2_t: 'Vials &amp; syringe math', f2_d: 'Track vial supply and reconstitution, and get the exact units to draw. The arithmetic, done for you.',
      f3_t: 'Bloodwork journal + AI scan', f3_d: 'Snap or upload a lab report and DoseTrace pulls your numbers into charts — in any language. It organizes; it never interprets.', f3_tag: 'Free scan included',
      f4_t: 'Energy &amp; protein calculator', f4_d: 'Estimate your daily calories and protein from your own stats, then run a reality check against real results.',
      f5_t: 'Serum-curve projection', f5_d: 'See how your logged doses stack up over time from published half-lives. A math estimate — never a measurement.',
      f6_t: 'Private by default', f6_d: 'Offline-first on your device, with optional encrypted cloud sync. No ads, and your health data is never sold or shared.',
      screens_eyebrow: 'A closer look', screens_h2: 'Calm, clinical, and quick to read.', screens_sub: 'Swipe through the app.',
      cap1: 'Your day at a glance', cap2: 'Protocols &amp; vials', cap3: 'Records &amp; insights', cap4: 'Energy &amp; protein', cap5: 'A real reality check',
      priv_eyebrow: 'Privacy', priv_h2: 'Your data stays yours.',
      priv_lead: 'DoseTrace is offline-first: everything lives on your device in a local database. Turn on cloud sync only if you want a backup across devices — encrypted in transit.',
      priv_c1: '<b>Stored on your device first</b> — works fully offline.',
      priv_c2: '<b>Optional encrypted backup</b> &amp; multi-device sync.',
      priv_c3: '<b>No ads, ever</b> — and we never sell or share your health data.',
      priv_c4: '<b>Delete everything anytime</b>, right from the app.',
      priv_stat: '100%<span> on your device by default</span>',
      priv_ads: 'Ads', priv_sold: 'Data sold', priv_langs: 'Languages',
      priv_readfull: 'Read the full <a href="/privacy-policy" style="color:var(--accent);text-decoration:underline;text-underline-offset:2px;">Privacy Policy</a>.',
      honest_badge: 'Honest by design', honest_h2: 'A journal and a calculator — not a medical service.',
      honest_p: 'DoseTrace never gives advice, never diagnoses, and never tells you what to take. You record what you choose; it organizes it and does the math. For any medical question, talk to a qualified professional. Its calculators are built on published, peer-reviewed research.',
      pricing_eyebrow: 'Pricing', pricing_h2: 'Free to start. Premium when you want more.', pricing_sub: 'The essentials are free forever. Premium unlocks the power features — with a free trial.',
      free_name: 'Free', free_sub: 'Everything you need to track a protocol.',
      free_1: 'Reconstitution &amp; syringe calculator', free_2: 'Up to 3 protocols', free_3: 'Dose log &amp; vial tracker', free_4: 'Reminders', free_5: 'Lab &amp; vaccine journals', free_6: 'Energy &amp; protein calculator', free_7: '1 free AI lab scan', free_8: 'Cloud backup &amp; sync',
      prem_pill: 'Free trial', prem_name: 'Premium', prem_sub: 'For serious, long-running protocols.',
      prem_1: 'Everything in Free', prem_2: 'Unlimited protocols', prem_3: 'Unlimited AI lab &amp; vaccine scanning — photo or PDF, any language', prem_4: 'PDF export for your doctor', prem_5: 'Reality-check &amp; progress tracking', prem_6: 'Cycle planner', prem_7: 'Priority support',
      prem_note: 'Monthly, annual, or one-time lifetime. Cancel anytime.',
      faq_eyebrow: 'Questions', faq_h2: 'Frequently asked',
      q1_q: 'Is DoseTrace free?', q1_a: 'Yes. Dose tracking, reminders, up to 3 protocols, the calculators, lab &amp; vaccine journals, cloud sync, and one AI lab scan are all free. Premium unlocks unlimited protocols, unlimited scanning, PDF export, cycle planner, and progress tracking — with a free trial.',
      q2_q: 'Is my data private?', q2_a: 'Yes. DoseTrace is offline-first — your data lives on your device. Cloud sync is optional and encrypted in transit. There are no ads, and your health data is never sold or shared. You can delete everything from the app at any time.',
      q3_q: 'Does it give medical advice?', q3_a: 'No. DoseTrace is a journal and calculator. It organizes what you enter and does the arithmetic — it never interprets results, diagnoses, or recommends what to take. For any medical question, consult a qualified professional.',
      q4_q: 'What can I track?', q4_a: 'Peptides, TRT/hormones, and supplements: doses, schedules, vials and supply, bloodwork and labs over time, vaccines, plus energy/protein estimates and a serum-curve projection from your logged doses.',
      q5_q: 'How does the AI lab scan work?', q5_a: "Upload or photograph a lab report — in any language — and DoseTrace extracts the values into your journal and charts them over time. It reads the numbers off the page; it doesn't interpret them. One scan is free; Premium makes scanning unlimited.",
      q6_q: 'Which platforms and languages?', q6_a: 'iPhone and Android, in 6 languages: English, Spanish, Portuguese, French, German, and Italian.',
      cta_h2: 'Start tracking — privately.', cta_p: 'Free on iPhone and Android. Your protocols, labs, and body in one honest journal.',
      f_tagline: 'Track today, a healthier tomorrow', f_blurb: 'A private journal and calculator for your protocols, labs, and body. Built by Outcom.',
      f_product: 'Product', f_getapp: 'Get the app', f_company: 'Company', f_privacypolicy: 'Privacy Policy',
      f_bottom1: '© <span id="year">2026</span> DoseTrace — a product of Outcom. All rights reserved.',
      f_bottom2: 'Not a medical service. For any medical question, consult a qualified professional.'
    },

    es: {
      nav_features: 'Funciones', nav_screens: 'Pantallas', nav_privacy: 'Privacidad', nav_pricing: 'Precios', nav_faq: 'Preguntas', nav_cta: 'Descargar la app',
      hero_eyebrow: 'iPhone y Android',
      hero_h1: 'Controla cada protocolo con <span class="grad">claridad</span>. Mantén tus datos privados.',
      hero_lead: 'DoseTrace es un diario privado y una calculadora para péptidos, TRT y suplementos. Registra dosis, controla viales, grafica tus análisis y haz los cálculos — todo en tu dispositivo.',
      hero_note: 'Gratis · Sin anuncios · Tus datos nunca se venden',
      sb_get_small: 'Descárgala en el', sb_play_small: 'Disponible en',
      trust_private: 'Privado por defecto', trust_offline: 'Funciona sin conexión', trust_noads: 'Sin anuncios, nunca se vende', trust_langs: '6 idiomas', trust_notmed: 'No es un servicio médico',
      feat_eyebrow: 'Qué hace', feat_h2: 'Todo lo que tu protocolo necesita — nada de más.',
      feat_sub: 'Creada para quienes siguen protocolos de péptidos, hormonas y suplementos y quieren un registro honesto y los cálculos bien hechos.',
      f1_t: 'Registro de dosis y protocolos', f1_d: 'Registra cada dosis, define tu calendario y mantén un historial claro. Los recordatorios evitan que olvides una.',
      f2_t: 'Viales y cálculo de jeringa', f2_d: 'Controla el suministro y la reconstitución de viales y obtén las unidades exactas a cargar. La aritmética, hecha por ti.',
      f3_t: 'Diario de análisis + escaneo con IA', f3_d: 'Fotografía o sube un análisis y DoseTrace extrae tus valores a gráficos — en cualquier idioma. Los organiza; nunca los interpreta.', f3_tag: 'Incluye un escaneo gratis',
      f4_t: 'Calculadora de energía y proteína', f4_d: 'Estima tus calorías y proteína diarias a partir de tus datos y haz un chequeo real frente a tus resultados.',
      f5_t: 'Proyección de curva sérica', f5_d: 'Observa cómo se acumulan tus dosis con el tiempo según vidas medias publicadas. Una estimación matemática — nunca una medición.',
      f6_t: 'Privado por defecto', f6_d: 'Sin conexión en tu dispositivo, con sincronización cifrada opcional. Sin anuncios, y tus datos de salud nunca se venden ni se comparten.',
      screens_eyebrow: 'Una mirada de cerca', screens_h2: 'Tranquila, clínica y fácil de leer.', screens_sub: 'Desliza por la app.',
      cap1: 'Tu día de un vistazo', cap2: 'Protocolos y viales', cap3: 'Registros e información', cap4: 'Energía y proteína', cap5: 'Un chequeo real',
      priv_eyebrow: 'Privacidad', priv_h2: 'Tus datos siguen siendo tuyos.',
      priv_lead: 'DoseTrace funciona sin conexión: todo vive en tu dispositivo en una base de datos local. Activa la sincronización solo si quieres una copia entre dispositivos — cifrada en tránsito.',
      priv_c1: '<b>Se guarda primero en tu dispositivo</b> — funciona sin conexión.',
      priv_c2: '<b>Copia cifrada opcional</b> y sincronización multidispositivo.',
      priv_c3: '<b>Nunca hay anuncios</b> — y jamás vendemos ni compartimos tus datos de salud.',
      priv_c4: '<b>Borra todo cuando quieras</b>, desde la propia app.',
      priv_stat: '100%<span> en tu dispositivo por defecto</span>',
      priv_ads: 'Anuncios', priv_sold: 'Datos vendidos', priv_langs: 'Idiomas',
      priv_readfull: 'Lee la <a href="/privacy-policy" style="color:var(--accent);text-decoration:underline;text-underline-offset:2px;">Política de Privacidad</a> completa.',
      honest_badge: 'Honesta por diseño', honest_h2: 'Un diario y una calculadora — no un servicio médico.',
      honest_p: 'DoseTrace nunca da consejos, nunca diagnostica y nunca te dice qué tomar. Tú registras lo que eliges; ella lo organiza y hace los cálculos. Para cualquier duda médica, habla con un profesional cualificado. Sus calculadoras se basan en investigación publicada y revisada por pares.',
      pricing_eyebrow: 'Precios', pricing_h2: 'Gratis para empezar. Premium cuando quieras más.', pricing_sub: 'Lo esencial es gratis para siempre. Premium desbloquea las funciones avanzadas — con prueba gratuita.',
      free_name: 'Gratis', free_sub: 'Todo lo necesario para seguir un protocolo.',
      free_1: 'Calculadora de reconstitución y jeringa', free_2: 'Hasta 3 protocolos', free_3: 'Registro de dosis y viales', free_4: 'Recordatorios', free_5: 'Diarios de análisis y vacunas', free_6: 'Calculadora de energía y proteína', free_7: '1 escaneo de análisis con IA gratis', free_8: 'Copia y sincronización en la nube',
      prem_pill: 'Prueba gratis', prem_name: 'Premium', prem_sub: 'Para protocolos serios y prolongados.',
      prem_1: 'Todo lo de Gratis', prem_2: 'Protocolos ilimitados', prem_3: 'Escaneo ilimitado de análisis y vacunas con IA — foto o PDF, cualquier idioma', prem_4: 'Exportación en PDF para tu médico', prem_5: 'Chequeo real y seguimiento del progreso', prem_6: 'Planificador de ciclos', prem_7: 'Soporte prioritario',
      prem_note: 'Mensual, anual o pago único de por vida. Cancela cuando quieras.',
      faq_eyebrow: 'Preguntas', faq_h2: 'Preguntas frecuentes',
      q1_q: '¿DoseTrace es gratis?', q1_a: 'Sí. El registro de dosis, los recordatorios, hasta 3 protocolos, las calculadoras, los diarios de análisis y vacunas, la sincronización en la nube y un escaneo de análisis con IA son gratis. Premium desbloquea protocolos y escaneos ilimitados, exportación PDF, planificador de ciclos y seguimiento del progreso — con prueba gratuita.',
      q2_q: '¿Mis datos son privados?', q2_a: 'Sí. DoseTrace funciona sin conexión: tus datos viven en tu dispositivo. La sincronización es opcional y cifrada en tránsito. No hay anuncios y tus datos de salud nunca se venden ni se comparten. Puedes borrarlo todo desde la app cuando quieras.',
      q3_q: '¿Da consejos médicos?', q3_a: 'No. DoseTrace es un diario y una calculadora. Organiza lo que introduces y hace la aritmética — nunca interpreta resultados, diagnostica ni recomienda qué tomar. Para cualquier duda médica, consulta a un profesional cualificado.',
      q4_q: '¿Qué puedo registrar?', q4_a: 'Péptidos, TRT/hormonas y suplementos: dosis, calendarios, viales y suministro, análisis de sangre a lo largo del tiempo, vacunas, además de estimaciones de energía/proteína y una proyección de curva sérica a partir de tus dosis.',
      q5_q: '¿Cómo funciona el escaneo con IA?', q5_a: 'Sube o fotografía un análisis — en cualquier idioma — y DoseTrace extrae los valores a tu diario y los grafica en el tiempo. Lee los números de la página; no los interpreta. Un escaneo es gratis; Premium hace el escaneo ilimitado.',
      q6_q: '¿Qué plataformas e idiomas?', q6_a: 'iPhone y Android, en 6 idiomas: inglés, español, portugués, francés, alemán e italiano.',
      cta_h2: 'Empieza a registrar — en privado.', cta_p: 'Gratis en iPhone y Android. Tus protocolos, análisis y cuerpo en un diario honesto.',
      f_tagline: 'Registra hoy, un mañana más saludable', f_blurb: 'Un diario privado y una calculadora para tus protocolos, análisis y cuerpo. Creada por Outcom.',
      f_product: 'Producto', f_getapp: 'Descargar la app', f_company: 'Empresa', f_privacypolicy: 'Política de Privacidad',
      f_bottom1: '© <span id="year">2026</span> DoseTrace — un producto de Outcom. Todos los derechos reservados.',
      f_bottom2: 'No es un servicio médico. Para cualquier duda médica, consulta a un profesional cualificado.'
    },

    pt: {
      nav_features: 'Recursos', nav_screens: 'Telas', nav_privacy: 'Privacidade', nav_pricing: 'Preços', nav_faq: 'Perguntas', nav_cta: 'Baixar o app',
      hero_eyebrow: 'iPhone e Android',
      hero_h1: 'Acompanhe cada protocolo com <span class="grad">clareza</span>. Mantenha seus dados privados.',
      hero_lead: 'DoseTrace é um diário privado e uma calculadora para peptídeos, TRT e suplementos. Registre doses, controle frascos, acompanhe seus exames e faça as contas — tudo no seu aparelho.',
      hero_note: 'Grátis · Sem anúncios · Seus dados nunca são vendidos',
      sb_get_small: 'Baixar na', sb_play_small: 'Disponível no',
      trust_private: 'Privado por padrão', trust_offline: 'Funciona offline', trust_noads: 'Sem anúncios, nunca vendido', trust_langs: '6 idiomas', trust_notmed: 'Não é um serviço médico',
      feat_eyebrow: 'O que ele faz', feat_h2: 'Tudo o que seu protocolo precisa — nada além.',
      feat_sub: 'Feito para quem segue protocolos de peptídeos, hormônios e suplementos e quer um registro honesto e as contas certas.',
      f1_t: 'Registro de doses e protocolos', f1_d: 'Registre cada dose, defina seu cronograma e mantenha um histórico limpo. Os lembretes garantem que você nunca esqueça.',
      f2_t: 'Frascos e cálculo de seringa', f2_d: 'Controle o estoque e a reconstituição dos frascos e veja as unidades exatas a aspirar. A aritmética, feita para você.',
      f3_t: 'Diário de exames + leitura com IA', f3_d: 'Fotografe ou envie um exame e o DoseTrace extrai seus números para gráficos — em qualquer idioma. Ele organiza; nunca interpreta.', f3_tag: 'Inclui uma leitura grátis',
      f4_t: 'Calculadora de energia e proteína', f4_d: 'Estime suas calorias e proteína diárias a partir dos seus dados e faça um teste de realidade com os resultados reais.',
      f5_t: 'Projeção de curva sérica', f5_d: 'Veja como suas doses se acumulam ao longo do tempo com base em meias-vidas publicadas. Uma estimativa matemática — nunca uma medição.',
      f6_t: 'Privado por padrão', f6_d: 'Offline no seu aparelho, com sincronização criptografada opcional. Sem anúncios, e seus dados de saúde nunca são vendidos ou compartilhados.',
      screens_eyebrow: 'De perto', screens_h2: 'Calmo, clínico e rápido de ler.', screens_sub: 'Deslize pelo app.',
      cap1: 'Seu dia num relance', cap2: 'Protocolos e frascos', cap3: 'Registros e insights', cap4: 'Energia e proteína', cap5: 'Um teste de realidade',
      priv_eyebrow: 'Privacidade', priv_h2: 'Seus dados continuam seus.',
      priv_lead: 'O DoseTrace é offline: tudo fica no seu aparelho, em um banco de dados local. Ative a sincronização só se quiser um backup entre aparelhos — criptografado em trânsito.',
      priv_c1: '<b>Guardado primeiro no seu aparelho</b> — funciona totalmente offline.',
      priv_c2: '<b>Backup criptografado opcional</b> e sincronização entre aparelhos.',
      priv_c3: '<b>Nunca há anúncios</b> — e jamais vendemos ou compartilhamos seus dados de saúde.',
      priv_c4: '<b>Apague tudo quando quiser</b>, direto no app.',
      priv_stat: '100%<span> no seu aparelho por padrão</span>',
      priv_ads: 'Anúncios', priv_sold: 'Dados vendidos', priv_langs: 'Idiomas',
      priv_readfull: 'Leia a <a href="/privacy-policy" style="color:var(--accent);text-decoration:underline;text-underline-offset:2px;">Política de Privacidade</a> completa.',
      honest_badge: 'Honesto por princípio', honest_h2: 'Um diário e uma calculadora — não um serviço médico.',
      honest_p: 'O DoseTrace nunca dá conselhos, nunca diagnostica e nunca diz o que você deve tomar. Você registra o que escolhe; ele organiza e faz as contas. Para qualquer dúvida médica, fale com um profissional qualificado. Suas calculadoras são baseadas em pesquisa publicada e revisada por pares.',
      pricing_eyebrow: 'Preços', pricing_h2: 'Grátis para começar. Premium quando quiser mais.', pricing_sub: 'O essencial é grátis para sempre. O Premium libera os recursos avançados — com teste grátis.',
      free_name: 'Grátis', free_sub: 'Tudo o que você precisa para acompanhar um protocolo.',
      free_1: 'Calculadora de reconstituição e seringa', free_2: 'Até 3 protocolos', free_3: 'Registro de doses e frascos', free_4: 'Lembretes', free_5: 'Diários de exames e vacinas', free_6: 'Calculadora de energia e proteína', free_7: '1 leitura de exame com IA grátis', free_8: 'Backup e sincronização na nuvem',
      prem_pill: 'Teste grátis', prem_name: 'Premium', prem_sub: 'Para protocolos sérios e de longo prazo.',
      prem_1: 'Tudo do Grátis', prem_2: 'Protocolos ilimitados', prem_3: 'Leitura ilimitada de exames e vacinas com IA — foto ou PDF, qualquer idioma', prem_4: 'Exportação em PDF para seu médico', prem_5: 'Teste de realidade e acompanhamento', prem_6: 'Planejador de ciclos', prem_7: 'Suporte prioritário',
      prem_note: 'Mensal, anual ou vitalício em pagamento único. Cancele quando quiser.',
      faq_eyebrow: 'Perguntas', faq_h2: 'Perguntas frequentes',
      q1_q: 'O DoseTrace é grátis?', q1_a: 'Sim. Registro de doses, lembretes, até 3 protocolos, as calculadoras, diários de exames e vacinas, sincronização na nuvem e uma leitura de exame com IA são grátis. O Premium libera protocolos e leituras ilimitados, exportação PDF, planejador de ciclos e acompanhamento — com teste grátis.',
      q2_q: 'Meus dados são privados?', q2_a: 'Sim. O DoseTrace é offline — seus dados ficam no seu aparelho. A sincronização é opcional e criptografada em trânsito. Não há anúncios e seus dados de saúde nunca são vendidos ou compartilhados. Você pode apagar tudo pelo app quando quiser.',
      q3_q: 'Ele dá conselhos médicos?', q3_a: 'Não. O DoseTrace é um diário e uma calculadora. Ele organiza o que você insere e faz a aritmética — nunca interpreta resultados, diagnostica ou recomenda o que tomar. Para qualquer dúvida médica, consulte um profissional qualificado.',
      q4_q: 'O que posso acompanhar?', q4_a: 'Peptídeos, TRT/hormônios e suplementos: doses, cronogramas, frascos e estoque, exames ao longo do tempo, vacinas, além de estimativas de energia/proteína e uma projeção de curva sérica a partir das suas doses.',
      q5_q: 'Como funciona a leitura com IA?', q5_a: 'Envie ou fotografe um exame — em qualquer idioma — e o DoseTrace extrai os valores para o seu diário e os coloca em gráficos ao longo do tempo. Ele lê os números da página; não os interpreta. Uma leitura é grátis; o Premium torna a leitura ilimitada.',
      q6_q: 'Quais plataformas e idiomas?', q6_a: 'iPhone e Android, em 6 idiomas: inglês, espanhol, português, francês, alemão e italiano.',
      cta_h2: 'Comece a registrar — com privacidade.', cta_p: 'Grátis no iPhone e Android. Seus protocolos, exames e corpo em um diário honesto.',
      f_tagline: 'Registre hoje, um amanhã mais saudável', f_blurb: 'Um diário privado e uma calculadora para seus protocolos, exames e corpo. Feito pela Outcom.',
      f_product: 'Produto', f_getapp: 'Baixar o app', f_company: 'Empresa', f_privacypolicy: 'Política de Privacidade',
      f_bottom1: '© <span id="year">2026</span> DoseTrace — um produto da Outcom. Todos os direitos reservados.',
      f_bottom2: 'Não é um serviço médico. Para qualquer dúvida médica, consulte um profissional qualificado.'
    },

    fr: {
      nav_features: 'Fonctions', nav_screens: 'Écrans', nav_privacy: 'Confidentialité', nav_pricing: 'Tarifs', nav_faq: 'FAQ', nav_cta: "Obtenir l'app",
      hero_eyebrow: 'iPhone et Android',
      hero_h1: 'Suivez chaque protocole avec <span class="grad">clarté</span>. Gardez vos données privées.',
      hero_lead: "DoseTrace est un journal privé et un calculateur pour les peptides, la TRT et les compléments. Enregistrez les doses, suivez les flacons, tracez vos analyses et faites les calculs — le tout sur votre appareil.",
      hero_note: 'Gratuit · Sans publicité · Vos données ne sont jamais vendues',
      sb_get_small: 'Télécharger dans', sb_play_small: 'Disponible sur',
      trust_private: 'Privé par défaut', trust_offline: 'Fonctionne hors ligne', trust_noads: 'Sans pub, jamais vendu', trust_langs: '6 langues', trust_notmed: "Pas un service médical",
      feat_eyebrow: 'Ce qu’elle fait', feat_h2: "Tout ce dont votre protocole a besoin — rien de superflu.",
      feat_sub: 'Conçue pour celles et ceux qui suivent des protocoles de peptides, d’hormones et de compléments et veulent un suivi honnête et des calculs justes.',
      f1_t: 'Suivi des doses et protocoles', f1_d: "Enregistrez chaque dose, définissez votre calendrier et gardez un historique clair. Les rappels vous évitent d’en oublier une.",
      f2_t: 'Flacons et calcul de seringue', f2_d: "Suivez le stock et la reconstitution des flacons et obtenez les unités exactes à prélever. L’arithmétique, faite pour vous.",
      f3_t: 'Journal d’analyses + scan IA', f3_d: "Photographiez ou importez une analyse et DoseTrace extrait vos valeurs en graphiques — dans n’importe quelle langue. Il organise ; il n’interprète jamais.", f3_tag: 'Un scan offert',
      f4_t: 'Calculateur d’énergie et de protéines', f4_d: 'Estimez vos calories et protéines quotidiennes à partir de vos données, puis faites un bilan réel face à vos résultats.',
      f5_t: 'Projection de courbe sérique', f5_d: "Voyez comment vos doses s’accumulent dans le temps selon des demi-vies publiées. Une estimation mathématique — jamais une mesure.",
      f6_t: 'Privé par défaut', f6_d: "Hors ligne sur votre appareil, avec synchronisation chiffrée optionnelle. Sans pub, et vos données de santé ne sont jamais vendues ni partagées.",
      screens_eyebrow: 'De plus près', screens_h2: 'Calme, clinique et rapide à lire.', screens_sub: "Faites défiler l’app.",
      cap1: 'Votre journée en un coup d’œil', cap2: 'Protocoles et flacons', cap3: 'Registres et repères', cap4: 'Énergie et protéines', cap5: 'Un vrai bilan',
      priv_eyebrow: 'Confidentialité', priv_h2: 'Vos données restent les vôtres.',
      priv_lead: "DoseTrace fonctionne hors ligne : tout reste sur votre appareil dans une base locale. Activez la synchronisation seulement si vous voulez une sauvegarde entre appareils — chiffrée en transit.",
      priv_c1: '<b>Stocké d’abord sur votre appareil</b> — fonctionne hors ligne.',
      priv_c2: '<b>Sauvegarde chiffrée optionnelle</b> et synchro multi-appareils.',
      priv_c3: '<b>Jamais de publicité</b> — et nous ne vendons ni ne partageons jamais vos données de santé.',
      priv_c4: '<b>Supprimez tout quand vous voulez</b>, depuis l’app.',
      priv_stat: '100%<span> sur votre appareil par défaut</span>',
      priv_ads: 'Publicités', priv_sold: 'Données vendues', priv_langs: 'Langues',
      priv_readfull: 'Lisez la <a href="/privacy-policy" style="color:var(--accent);text-decoration:underline;text-underline-offset:2px;">Politique de confidentialité</a> complète.',
      honest_badge: 'Honnête par conception', honest_h2: 'Un journal et un calculateur — pas un service médical.',
      honest_p: "DoseTrace ne donne jamais de conseils, ne diagnostique jamais et ne vous dit jamais quoi prendre. Vous notez ce que vous choisissez ; il l’organise et fait les calculs. Pour toute question médicale, parlez à un professionnel qualifié. Ses calculateurs reposent sur des recherches publiées et évaluées par des pairs.",
      pricing_eyebrow: 'Tarifs', pricing_h2: 'Gratuit pour commencer. Premium quand vous en voulez plus.', pricing_sub: "L’essentiel est gratuit pour toujours. Premium débloque les fonctions avancées — avec un essai gratuit.",
      free_name: 'Gratuit', free_sub: 'Tout le nécessaire pour suivre un protocole.',
      free_1: 'Calculateur de reconstitution et seringue', free_2: "Jusqu’à 3 protocoles", free_3: 'Journal des doses et flacons', free_4: 'Rappels', free_5: 'Journaux d’analyses et de vaccins', free_6: 'Calculateur d’énergie et protéines', free_7: '1 scan d’analyse IA offert', free_8: 'Sauvegarde et synchro cloud',
      prem_pill: 'Essai gratuit', prem_name: 'Premium', prem_sub: 'Pour des protocoles sérieux et durables.',
      prem_1: 'Tout le Gratuit', prem_2: 'Protocoles illimités', prem_3: 'Scan illimité d’analyses et vaccins par IA — photo ou PDF, toute langue', prem_4: 'Export PDF pour votre médecin', prem_5: 'Bilan réel et suivi des progrès', prem_6: 'Planificateur de cycles', prem_7: 'Support prioritaire',
      prem_note: 'Mensuel, annuel ou à vie en un paiement. Annulable à tout moment.',
      faq_eyebrow: 'Questions', faq_h2: 'Questions fréquentes',
      q1_q: 'DoseTrace est-il gratuit ?', q1_a: "Oui. Le suivi des doses, les rappels, jusqu’à 3 protocoles, les calculateurs, les journaux d’analyses et vaccins, la synchro cloud et un scan d’analyse IA sont gratuits. Premium débloque protocoles et scans illimités, export PDF, planificateur de cycles et suivi des progrès — avec essai gratuit.",
      q2_q: 'Mes données sont-elles privées ?', q2_a: "Oui. DoseTrace fonctionne hors ligne — vos données restent sur votre appareil. La synchro est optionnelle et chiffrée en transit. Aucune pub, et vos données de santé ne sont jamais vendues ni partagées. Vous pouvez tout supprimer depuis l’app à tout moment.",
      q3_q: 'Donne-t-il des conseils médicaux ?', q3_a: "Non. DoseTrace est un journal et un calculateur. Il organise ce que vous saisissez et fait les calculs — il n’interprète jamais les résultats, ne diagnostique pas et ne recommande pas quoi prendre. Pour toute question médicale, consultez un professionnel qualifié.",
      q4_q: 'Que puis-je suivre ?', q4_a: "Peptides, TRT/hormones et compléments : doses, calendriers, flacons et stock, analyses dans le temps, vaccins, plus des estimations d’énergie/protéines et une projection de courbe sérique à partir de vos doses.",
      q5_q: 'Comment fonctionne le scan IA ?', q5_a: "Importez ou photographiez une analyse — dans n’importe quelle langue — et DoseTrace extrait les valeurs dans votre journal et les met en graphiques. Il lit les chiffres de la page ; il ne les interprète pas. Un scan est offert ; Premium rend le scan illimité.",
      q6_q: 'Quelles plateformes et langues ?', q6_a: 'iPhone et Android, en 6 langues : anglais, espagnol, portugais, français, allemand et italien.',
      cta_h2: 'Commencez à suivre — en privé.', cta_p: 'Gratuit sur iPhone et Android. Vos protocoles, analyses et corps dans un journal honnête.',
      f_tagline: "Suivez aujourd’hui, un demain plus sain", f_blurb: 'Un journal privé et un calculateur pour vos protocoles, analyses et votre corps. Créé par Outcom.',
      f_product: 'Produit', f_getapp: "Obtenir l'app", f_company: 'Entreprise', f_privacypolicy: 'Politique de confidentialité',
      f_bottom1: '© <span id="year">2026</span> DoseTrace — un produit d’Outcom. Tous droits réservés.',
      f_bottom2: 'Pas un service médical. Pour toute question médicale, consultez un professionnel qualifié.'
    },

    de: {
      nav_features: 'Funktionen', nav_screens: 'Ansichten', nav_privacy: 'Datenschutz', nav_pricing: 'Preise', nav_faq: 'FAQ', nav_cta: 'App holen',
      hero_eyebrow: 'iPhone &amp; Android',
      hero_h1: 'Verfolge jedes Protokoll mit <span class="grad">Klarheit</span>. Behalte deine Daten privat.',
      hero_lead: 'DoseTrace ist ein privates Journal und ein Rechner für Peptide, TRT und Nahrungsergänzung. Erfasse Dosen, verfolge Vials, visualisiere dein Blutbild und rechne alles durch — komplett auf deinem Gerät.',
      hero_note: 'Kostenlos · Keine Werbung · Deine Daten werden nie verkauft',
      sb_get_small: 'Laden im', sb_play_small: 'Jetzt bei',
      trust_private: 'Privat von Haus aus', trust_offline: 'Offline-first', trust_noads: 'Keine Werbung, nie verkauft', trust_langs: '6 Sprachen', trust_notmed: 'Kein medizinischer Dienst',
      feat_eyebrow: 'Was sie kann', feat_h2: 'Alles, was dein Protokoll braucht — nichts, was es nicht braucht.',
      feat_sub: 'Für alle, die Peptid-, Hormon- und Supplement-Protokolle führen und eine ehrliche Aufzeichnung sowie korrekte Berechnungen wollen.',
      f1_t: 'Dosen- &amp; Protokoll-Tracking', f1_d: 'Erfasse jede Dosis, lege deinen Zeitplan fest und behalte eine saubere Historie. Erinnerungen sorgen dafür, dass du keine verpasst.',
      f2_t: 'Vials &amp; Spritzen-Mathematik', f2_d: 'Verfolge Vial-Vorrat und Rekonstitution und erhalte die exakten Einheiten zum Aufziehen. Die Rechnung — für dich erledigt.',
      f3_t: 'Blutbild-Journal + KI-Scan', f3_d: 'Fotografiere oder lade einen Laborbericht hoch, und DoseTrace zieht deine Werte in Diagramme — in jeder Sprache. Es ordnet; es interpretiert nie.', f3_tag: 'Ein Scan gratis',
      f4_t: 'Energie- &amp; Protein-Rechner', f4_d: 'Schätze deine täglichen Kalorien und dein Protein aus deinen eigenen Werten und mach einen Realitäts-Check mit echten Ergebnissen.',
      f5_t: 'Serumkurven-Projektion', f5_d: 'Sieh anhand publizierter Halbwertszeiten, wie sich deine Dosen über die Zeit summieren. Eine rechnerische Schätzung — nie eine Messung.',
      f6_t: 'Privat von Haus aus', f6_d: 'Offline auf deinem Gerät, mit optionaler verschlüsselter Cloud-Synchronisierung. Keine Werbung, und deine Gesundheitsdaten werden nie verkauft oder geteilt.',
      screens_eyebrow: 'Aus der Nähe', screens_h2: 'Ruhig, klinisch und schnell erfassbar.', screens_sub: 'Wisch dich durch die App.',
      cap1: 'Dein Tag auf einen Blick', cap2: 'Protokolle &amp; Vials', cap3: 'Aufzeichnungen &amp; Einblicke', cap4: 'Energie &amp; Protein', cap5: 'Ein echter Realitäts-Check',
      priv_eyebrow: 'Datenschutz', priv_h2: 'Deine Daten bleiben deine.',
      priv_lead: 'DoseTrace ist Offline-first: Alles liegt auf deinem Gerät in einer lokalen Datenbank. Aktiviere die Sync nur, wenn du ein Backup über Geräte hinweg willst — verschlüsselt bei der Übertragung.',
      priv_c1: '<b>Zuerst auf deinem Gerät gespeichert</b> — funktioniert komplett offline.',
      priv_c2: '<b>Optionales verschlüsseltes Backup</b> &amp; Sync über mehrere Geräte.',
      priv_c3: '<b>Niemals Werbung</b> — und wir verkaufen oder teilen deine Gesundheitsdaten nie.',
      priv_c4: '<b>Lösche jederzeit alles</b>, direkt in der App.',
      priv_stat: '100%<span> standardmäßig auf deinem Gerät</span>',
      priv_ads: 'Werbung', priv_sold: 'Verkaufte Daten', priv_langs: 'Sprachen',
      priv_readfull: 'Lies die vollständige <a href="/privacy-policy" style="color:var(--accent);text-decoration:underline;text-underline-offset:2px;">Datenschutzerklärung</a>.',
      honest_badge: 'Ehrlich konzipiert', honest_h2: 'Ein Journal und ein Rechner — kein medizinischer Dienst.',
      honest_p: 'DoseTrace gibt nie Ratschläge, stellt nie Diagnosen und sagt dir nie, was du nehmen sollst. Du erfasst, was du wählst; es ordnet es und rechnet. Für jede medizinische Frage sprich mit einer qualifizierten Fachperson. Die Rechner basieren auf publizierter, peer-reviewter Forschung.',
      pricing_eyebrow: 'Preise', pricing_h2: 'Kostenlos starten. Premium, wenn du mehr willst.', pricing_sub: 'Das Wesentliche ist für immer kostenlos. Premium schaltet die Power-Funktionen frei — mit kostenloser Testphase.',
      free_name: 'Kostenlos', free_sub: 'Alles, um ein Protokoll zu führen.',
      free_1: 'Rekonstitutions- &amp; Spritzenrechner', free_2: 'Bis zu 3 Protokolle', free_3: 'Dosen-Log &amp; Vial-Tracker', free_4: 'Erinnerungen', free_5: 'Labor- &amp; Impf-Journale', free_6: 'Energie- &amp; Protein-Rechner', free_7: '1 kostenloser KI-Laborscan', free_8: 'Cloud-Backup &amp; Sync',
      prem_pill: 'Gratis testen', prem_name: 'Premium', prem_sub: 'Für ernsthafte, langfristige Protokolle.',
      prem_1: 'Alles aus Kostenlos', prem_2: 'Unbegrenzte Protokolle', prem_3: 'Unbegrenztes KI-Scannen von Labor &amp; Impfungen — Foto oder PDF, jede Sprache', prem_4: 'PDF-Export für deine Ärztin/deinen Arzt', prem_5: 'Realitäts-Check &amp; Fortschritt', prem_6: 'Zyklusplaner', prem_7: 'Priorisierter Support',
      prem_note: 'Monatlich, jährlich oder einmalig auf Lebenszeit. Jederzeit kündbar.',
      faq_eyebrow: 'Fragen', faq_h2: 'Häufige Fragen',
      q1_q: 'Ist DoseTrace kostenlos?', q1_a: 'Ja. Dosen-Tracking, Erinnerungen, bis zu 3 Protokolle, die Rechner, Labor- &amp; Impf-Journale, Cloud-Sync und ein KI-Laborscan sind kostenlos. Premium schaltet unbegrenzte Protokolle, unbegrenztes Scannen, PDF-Export, Zyklusplaner und Fortschritt frei — mit kostenloser Testphase.',
      q2_q: 'Sind meine Daten privat?', q2_a: 'Ja. DoseTrace ist Offline-first — deine Daten liegen auf deinem Gerät. Die Sync ist optional und bei der Übertragung verschlüsselt. Es gibt keine Werbung, und deine Gesundheitsdaten werden nie verkauft oder geteilt. Du kannst jederzeit alles in der App löschen.',
      q3_q: 'Gibt es medizinische Ratschläge?', q3_a: 'Nein. DoseTrace ist ein Journal und ein Rechner. Es ordnet, was du eingibst, und rechnet — es interpretiert nie Ergebnisse, diagnostiziert nicht und empfiehlt nicht, was du nehmen sollst. Für jede medizinische Frage wende dich an eine qualifizierte Fachperson.',
      q4_q: 'Was kann ich erfassen?', q4_a: 'Peptide, TRT/Hormone und Supplements: Dosen, Zeitpläne, Vials und Vorrat, Blutwerte über die Zeit, Impfungen, dazu Energie-/Protein-Schätzungen und eine Serumkurven-Projektion aus deinen Dosen.',
      q5_q: 'Wie funktioniert der KI-Scan?', q5_a: 'Lade einen Laborbericht hoch oder fotografiere ihn — in jeder Sprache — und DoseTrace zieht die Werte in dein Journal und stellt sie über die Zeit dar. Es liest die Zahlen von der Seite; es interpretiert sie nicht. Ein Scan ist gratis; Premium macht das Scannen unbegrenzt.',
      q6_q: 'Welche Plattformen und Sprachen?', q6_a: 'iPhone und Android, in 6 Sprachen: Englisch, Spanisch, Portugiesisch, Französisch, Deutsch und Italienisch.',
      cta_h2: 'Fang an zu tracken — privat.', cta_p: 'Kostenlos auf iPhone und Android. Deine Protokolle, Laborwerte und dein Körper in einem ehrlichen Journal.',
      f_tagline: 'Heute erfassen, ein gesünderes Morgen', f_blurb: 'Ein privates Journal und ein Rechner für deine Protokolle, Laborwerte und deinen Körper. Von Outcom.',
      f_product: 'Produkt', f_getapp: 'App holen', f_company: 'Unternehmen', f_privacypolicy: 'Datenschutzerklärung',
      f_bottom1: '© <span id="year">2026</span> DoseTrace — ein Produkt von Outcom. Alle Rechte vorbehalten.',
      f_bottom2: 'Kein medizinischer Dienst. Für jede medizinische Frage wende dich an eine qualifizierte Fachperson.'
    },

    it: {
      nav_features: 'Funzioni', nav_screens: 'Schermate', nav_privacy: 'Privacy', nav_pricing: 'Prezzi', nav_faq: 'FAQ', nav_cta: "Scarica l'app",
      hero_eyebrow: 'iPhone e Android',
      hero_h1: 'Monitora ogni protocollo con <span class="grad">chiarezza</span>. Mantieni i tuoi dati privati.',
      hero_lead: 'DoseTrace è un diario privato e un calcolatore per peptidi, TRT e integratori. Registra le dosi, monitora i flaconi, traccia le analisi e fai i conti — tutto sul tuo dispositivo.',
      hero_note: 'Gratis · Nessuna pubblicità · I tuoi dati non si vendono mai',
      sb_get_small: 'Scarica su', sb_play_small: 'Disponibile su',
      trust_private: 'Privato di default', trust_offline: 'Funziona offline', trust_noads: 'Niente pubblicità, mai venduti', trust_langs: '6 lingue', trust_notmed: 'Non è un servizio medico',
      feat_eyebrow: 'Cosa fa', feat_h2: 'Tutto ciò che serve al tuo protocollo — niente di superfluo.',
      feat_sub: 'Creata per chi segue protocolli di peptidi, ormoni e integratori e vuole un registro onesto e i conti fatti bene.',
      f1_t: 'Registro dosi e protocolli', f1_d: 'Registra ogni dose, imposta il calendario e mantieni uno storico pulito. I promemoria evitano di dimenticarne una.',
      f2_t: 'Flaconi e calcolo siringa', f2_d: 'Monitora scorta e ricostituzione dei flaconi e ottieni le unità esatte da aspirare. L’aritmetica, fatta per te.',
      f3_t: 'Diario analisi + scansione IA', f3_d: 'Fotografa o carica un referto e DoseTrace estrae i tuoi valori in grafici — in qualsiasi lingua. Li organizza; non li interpreta mai.', f3_tag: 'Una scansione inclusa',
      f4_t: 'Calcolatore energia e proteine', f4_d: 'Stima le calorie e le proteine giornaliere dai tuoi dati, poi fai un check di realtà con i risultati veri.',
      f5_t: 'Proiezione curva sierica', f5_d: 'Guarda come le tue dosi si accumulano nel tempo secondo emivite pubblicate. Una stima matematica — mai una misura.',
      f6_t: 'Privato di default', f6_d: 'Offline sul tuo dispositivo, con sincronizzazione cloud cifrata opzionale. Nessuna pubblicità, e i tuoi dati sanitari non si vendono né si condividono mai.',
      screens_eyebrow: 'Più da vicino', screens_h2: 'Calmo, clinico e veloce da leggere.', screens_sub: "Scorri l'app.",
      cap1: 'La tua giornata a colpo d’occhio', cap2: 'Protocolli e flaconi', cap3: 'Registri e dati', cap4: 'Energia e proteine', cap5: 'Un vero check di realtà',
      priv_eyebrow: 'Privacy', priv_h2: 'I tuoi dati restano tuoi.',
      priv_lead: 'DoseTrace è offline: tutto vive sul tuo dispositivo in un database locale. Attiva la sincronizzazione solo se vuoi un backup tra dispositivi — cifrato in transito.',
      priv_c1: '<b>Salvato prima sul tuo dispositivo</b> — funziona del tutto offline.',
      priv_c2: '<b>Backup cifrato opzionale</b> e sincronizzazione multi-dispositivo.',
      priv_c3: '<b>Mai pubblicità</b> — e non vendiamo né condividiamo mai i tuoi dati sanitari.',
      priv_c4: '<b>Cancella tutto quando vuoi</b>, direttamente dall’app.',
      priv_stat: '100%<span> sul tuo dispositivo di default</span>',
      priv_ads: 'Pubblicità', priv_sold: 'Dati venduti', priv_langs: 'Lingue',
      priv_readfull: 'Leggi l’<a href="/privacy-policy" style="color:var(--accent);text-decoration:underline;text-underline-offset:2px;">Informativa sulla privacy</a> completa.',
      honest_badge: 'Onesta per scelta', honest_h2: 'Un diario e un calcolatore — non un servizio medico.',
      honest_p: 'DoseTrace non dà mai consigli, non diagnostica mai e non ti dice mai cosa assumere. Tu registri ciò che scegli; l’app lo organizza e fa i conti. Per qualsiasi domanda medica, parla con un professionista qualificato. I suoi calcolatori si basano su ricerche pubblicate e sottoposte a revisione paritaria.',
      pricing_eyebrow: 'Prezzi', pricing_h2: 'Gratis per iniziare. Premium quando vuoi di più.', pricing_sub: 'L’essenziale è gratis per sempre. Premium sblocca le funzioni avanzate — con prova gratuita.',
      free_name: 'Gratis', free_sub: 'Tutto il necessario per seguire un protocollo.',
      free_1: 'Calcolatore ricostituzione e siringa', free_2: 'Fino a 3 protocolli', free_3: 'Registro dosi e flaconi', free_4: 'Promemoria', free_5: 'Diari di analisi e vaccini', free_6: 'Calcolatore energia e proteine', free_7: '1 scansione analisi con IA gratis', free_8: 'Backup e sincronizzazione cloud',
      prem_pill: 'Prova gratis', prem_name: 'Premium', prem_sub: 'Per protocolli seri e a lungo termine.',
      prem_1: 'Tutto di Gratis', prem_2: 'Protocolli illimitati', prem_3: 'Scansione illimitata di analisi e vaccini con IA — foto o PDF, qualsiasi lingua', prem_4: 'Esportazione PDF per il tuo medico', prem_5: 'Check di realtà e monitoraggio dei progressi', prem_6: 'Pianificatore di cicli', prem_7: 'Supporto prioritario',
      prem_note: 'Mensile, annuale o una tantum a vita. Disdici quando vuoi.',
      faq_eyebrow: 'Domande', faq_h2: 'Domande frequenti',
      q1_q: 'DoseTrace è gratis?', q1_a: 'Sì. Registro dosi, promemoria, fino a 3 protocolli, i calcolatori, i diari di analisi e vaccini, la sincronizzazione cloud e una scansione con IA sono gratis. Premium sblocca protocolli e scansioni illimitati, esportazione PDF, pianificatore di cicli e monitoraggio — con prova gratuita.',
      q2_q: 'I miei dati sono privati?', q2_a: 'Sì. DoseTrace è offline — i tuoi dati vivono sul tuo dispositivo. La sincronizzazione è opzionale e cifrata in transito. Nessuna pubblicità e i tuoi dati sanitari non si vendono né si condividono mai. Puoi cancellare tutto dall’app quando vuoi.',
      q3_q: 'Dà consigli medici?', q3_a: 'No. DoseTrace è un diario e un calcolatore. Organizza ciò che inserisci e fa i conti — non interpreta mai i risultati, non diagnostica e non raccomanda cosa assumere. Per qualsiasi domanda medica, consulta un professionista qualificato.',
      q4_q: 'Cosa posso monitorare?', q4_a: 'Peptidi, TRT/ormoni e integratori: dosi, calendari, flaconi e scorta, analisi nel tempo, vaccini, oltre a stime di energia/proteine e una proiezione della curva sierica dalle tue dosi.',
      q5_q: 'Come funziona la scansione con IA?', q5_a: 'Carica o fotografa un referto — in qualsiasi lingua — e DoseTrace estrae i valori nel tuo diario e li mette in grafico nel tempo. Legge i numeri dalla pagina; non li interpreta. Una scansione è gratis; Premium rende la scansione illimitata.',
      q6_q: 'Quali piattaforme e lingue?', q6_a: 'iPhone e Android, in 6 lingue: inglese, spagnolo, portoghese, francese, tedesco e italiano.',
      cta_h2: 'Inizia a monitorare — in privato.', cta_p: 'Gratis su iPhone e Android. I tuoi protocolli, le analisi e il corpo in un diario onesto.',
      f_tagline: 'Registra oggi, un domani più sano', f_blurb: 'Un diario privato e un calcolatore per i tuoi protocolli, le analisi e il corpo. Creato da Outcom.',
      f_product: 'Prodotto', f_getapp: "Scarica l'app", f_company: 'Azienda', f_privacypolicy: 'Informativa sulla privacy',
      f_bottom1: '© <span id="year">2026</span> DoseTrace — un prodotto di Outcom. Tutti i diritti riservati.',
      f_bottom2: 'Non è un servizio medico. Per qualsiasi domanda medica, consulta un professionista qualificato.'
    }
  };

  function pick(code) {
    for (var i = 0; i < LANGS.length; i++) if (LANGS[i].code === code) return LANGS[i];
    return LANGS[0];
  }
  function detect() {
    try { var q = new URLSearchParams(location.search).get('lang'); if (q && DICT[q]) return q; } catch (e) {}
    try { var s = localStorage.getItem('dt-lang'); if (s && DICT[s]) return s; } catch (e) {}
    var n = (navigator.language || 'en').slice(0, 2).toLowerCase();
    return DICT[n] ? n : 'en';
  }

  function apply(code) {
    var d = DICT[code] || DICT.en, meta = pick(code);
    document.documentElement.lang = meta.html;
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var k = el.getAttribute('data-i18n');
      if (d[k] != null) el.innerHTML = d[k];
    });
    // Year (its span is re-created by the innerHTML swap above)
    var y = document.getElementById('year'); if (y) y.textContent = new Date().getFullYear();
    // Switcher label + active state
    var codeEl = document.querySelector('.lang-code'); if (codeEl) codeEl.textContent = code.toUpperCase();
    document.querySelectorAll('.lang-menu [data-lang]').forEach(function (b) {
      b.setAttribute('aria-current', b.getAttribute('data-lang') === code ? 'true' : 'false');
    });
    try { localStorage.setItem('dt-lang', code); } catch (e) {}
  }

  function initSwitcher() {
    var wrap = document.getElementById('lang'); if (!wrap) return;
    var btn = wrap.querySelector('.lang-btn'), menu = wrap.querySelector('.lang-menu');
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = !menu.hasAttribute('hidden');
      if (open) { menu.setAttribute('hidden', ''); btn.setAttribute('aria-expanded', 'false'); }
      else { menu.removeAttribute('hidden'); btn.setAttribute('aria-expanded', 'true'); }
    });
    menu.querySelectorAll('[data-lang]').forEach(function (b) {
      b.addEventListener('click', function () {
        apply(b.getAttribute('data-lang'));
        menu.setAttribute('hidden', ''); btn.setAttribute('aria-expanded', 'false');
      });
    });
    document.addEventListener('click', function (e) {
      if (!wrap.contains(e.target)) { menu.setAttribute('hidden', ''); btn.setAttribute('aria-expanded', 'false'); }
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { menu.setAttribute('hidden', ''); btn.setAttribute('aria-expanded', 'false'); } });
  }

  function boot() { initSwitcher(); apply(detect()); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
