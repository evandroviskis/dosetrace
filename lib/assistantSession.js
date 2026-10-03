// One assistant conversation's link to the server (AP-18, decided 2026-10-03 by logic): the
// weekly use is counted when the FIRST answer goes to the AI or the label-photo path starts —
// never when the window opens. Opening and closing the window, or the "AI isn't available"
// notice, spends nothing; later answers in the same conversation spend nothing either (the
// server counts a conversation once). A failed start spends nothing and is retried on the
// next answer. Pure CJS: `start` and `understand` are injected (lib/assistantClient).
function createSession({ conversationId, door, start, understand }) {
  let started = false;
  async function ensureStarted() {
    if (started) return { ok: true };
    const r = await start(conversationId, door);
    if (r && r.error) return { error: r.error };
    started = true;
    return { ok: true };
  }
  return {
    ensureStarted,
    get started() { return started; },
    async understand(step, text, language, now) {
      const s = await ensureStarted();
      if (s.error) return { error: s.error };
      return understand(conversationId, step, text, language, now);
    },
  };
}

module.exports = { createSession };
