// src/components/tradesReason.js
//
// Constructor editor UX Stage B, sub-step B2 (screener designer.md §6.3, m7a): the Trades table's
// reason cells. A signal's reason is its plain-English twin `displayComment` (B1) or, on an older
// backend / an old or non-constructed signal, its code `comment`. The cell shows the rule head
// semibold + the first sentence (clamped to 2 lines) and a muted `· also R3 Sell` line; an expand row
// shows both reasons in full. The seeded check keeps reading `comment` (TradesTable).

/** `{text, code}` of a signal: the shown text (`displayComment ?? comment`) and the code comment. */
export const reasonOf = (signal) => {
  const code = typeof signal?.comment === 'string' ? signal.comment : '';
  const display = typeof signal?.displayComment === 'string' && signal.displayComment ? signal.displayComment : '';
  return { text: display || code, code };
};

const DISPLAY_ALSO = ' · also ';
const CODE_ALSO = '; also: ';
const HEAD_RE = /^(R\d+ [^:]+): ([\s\S]*)$/;

/**
 * A reason split for the two-level cell: `{head, body, also}`.
 * `R2 Sell: close is below the entry's stop · also R3 Sell` → head `R2 Sell`, body `close is below
 * the entry's stop`, also `also R3 Sell`; the code form `…; also: R3 LongClose` likewise; a text
 * without a rule head (a class strategy's prose) → `{head: null, body: text, also: null}`.
 */
export const splitReason = (text) => {
  const t = typeof text === 'string' ? text : '';
  let main = t;
  let also = null;
  const iD = t.indexOf(DISPLAY_ALSO);
  const iC = iD < 0 ? t.indexOf(CODE_ALSO) : -1;
  if (iD >= 0) {
    main = t.slice(0, iD);
    also = `also ${t.slice(iD + DISPLAY_ALSO.length)}`;
  } else if (iC >= 0) {
    main = t.slice(0, iC);
    also = `also ${t.slice(iC + CODE_ALSO.length)}`;
  }
  const m = HEAD_RE.exec(main);
  return m ? { head: m[1], body: m[2], also } : { head: null, body: main, also };
};

/** The cell's title: the shown text, plus the code after a blank line when they differ. */
export const reasonTitle = (text, code) => (code && code !== text ? `${text}\n\ncode: ${code}` : (text || ''));

/** The expanded-row set with `id` toggled (a new Set; each row toggles independently). */
export const toggleExpanded = (expanded, id) => {
  const next = new Set(expanded);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
};

/** The Excel "Open Reason" of a trade: the plain text (S5), `SEEDED (your entry)` first on the seeded trade. */
export const excelOpenReason = (trade) => (trade.seeded
  ? `SEEDED (your entry)${trade.openReason ? ` ${trade.openReason}` : ''}`
  : trade.openReason);
