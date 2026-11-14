// FAQ deep links by id (docs/specs/curve-explained.md CE-6): every FAQ group and question in
// i18n/translations.js faq_categories carries a stable `id`, the same in all six languages, so a link
// never lands on the wrong question when a group or a question is added or moved. A link names a
// question ({ id }) or a group (openGroup id). Old callers that still send a position ({ ci, qi })
// keep working; an id always wins over a position. Pure CommonJS (node --test).
'use strict';

// { ci, qi, id } of the question a link names, or null when it names nothing that exists.
function faqTarget(cats, link) {
  const list = Array.isArray(cats) ? cats : [];
  if (!link || typeof link !== 'object') return null;
  if (link.id) {
    for (let ci = 0; ci < list.length; ci++) {
      const qs = (list[ci] && list[ci].questions) || [];
      const qi = qs.findIndex((q) => q && q.id === link.id);
      if (qi >= 0) return { ci, qi, id: link.id };
    }
    return null;
  }
  const { ci, qi } = link;
  if (!Number.isInteger(ci) || !Number.isInteger(qi)) return null;
  const q = list[ci] && list[ci].questions && list[ci].questions[qi];
  return q ? { ci, qi, id: q.id || null } : null;
}

// The position of a group by its id, or -1.
function faqGroupIndex(cats, groupId) {
  const list = Array.isArray(cats) ? cats : [];
  if (!groupId) return -1;
  return list.findIndex((c) => c && c.id === groupId);
}

module.exports = { faqTarget, faqGroupIndex };
