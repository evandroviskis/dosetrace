// Renders an assistant message (lib/protocolAssistant) into the app's words: every sentence
// is an i18n key (AP-14); params are already-formatted numbers, the user's own words, or
// nested app-written pieces ({ $t: key, ...params }, { $list: [...] }, [a, b]). Pure.
function renderParam(t, v) {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return v.map((x) => renderParam(t, x)).filter(Boolean).join(' ');
  if (typeof v === 'object' && Array.isArray(v.$list)) return v.$list.map((x) => renderParam(t, x)).filter(Boolean).join(', ');
  if (typeof v === 'object' && v.$t) {
    const { $t, $lc, ...p } = v;
    const out = renderText(t, $t, p);
    // A label used mid-sentence ("2 ml of bacteriostatic water"); German keeps its capitals.
    return $lc ? out.charAt(0).toLowerCase() + out.slice(1) : out;
  }
  return '';
}

function renderText(t, key, params) {
  let out = String(t(key));
  const p = params || {};
  for (const k of Object.keys(p)) out = out.split(`{${k}}`).join(renderParam(t, p[k]));
  return out;
}

module.exports = { renderText, renderParam };
