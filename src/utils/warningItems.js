// src/utils/warningItems.js
//
// Constructor editor UX Stage B, F-B3b (screener logs/agents/architect.md §6.4, backend B3.4):
// a result's `warnings` (code-prefixed strings, kept for machines and pins) come with a parallel
// `warningItems [{code, message}]` (index for index; `code` null for a warning without an item).
// The UI shows `warningItems[i].message ?? warnings[i]` and puts the code in an ⓘ. An older backend
// sends no `warningItems`: every entry then shows its string, without an ⓘ.

const nonEmpty = (v) => (typeof v === 'string' && v.length > 0 ? v : null);

/**
 * `{warnings, warningItems}` of a DTO → the shown entries `[{text, message, code}]`: `text` = the
 * `warnings` string, `message` = the item's plain text or `text`, `code` = the item's code or null.
 * Non-string warnings are dropped with their item (the lists stay parallel).
 */
export const warningEntries = (warnings, warningItems) => {
  const ws = Array.isArray(warnings) ? warnings : [];
  // an item list of another length is not parallel: ignore it rather than mis-pair texts
  const items = Array.isArray(warningItems) && warningItems.length === ws.length ? warningItems : [];
  const out = [];
  ws.forEach((w, i) => {
    const text = nonEmpty(w);
    if (!text) return;
    const it = items[i] && typeof items[i] === 'object' ? items[i] : null;
    out.push({ text, message: nonEmpty(it?.message) ?? text, code: nonEmpty(it?.code) });
  });
  return out;
};

/** A bare string (a client-side warning) as an entry. */
export const warningEntryOf = (w) => (typeof w === 'string'
  ? { text: w, message: w, code: null }
  : w);

/** The ⓘ text of an entry, or null when there is nothing beyond the message. */
export const warningInfoText = (entry) => {
  if (!entry) return null;
  const parts = [];
  if (entry.code) parts.push(`code: ${entry.code}`);
  if (entry.text && entry.text !== entry.message) parts.push(entry.text);
  return parts.length ? parts.join(' — ') : null;
};

/** Entries of `a` followed by those of `b` whose `text` is not already listed. */
export const mergeWarningEntries = (a, b) => {
  const out = [...(a || [])];
  (b || []).forEach((e) => { if (!out.some((x) => x.text === e.text)) out.push(e); });
  return out;
};
