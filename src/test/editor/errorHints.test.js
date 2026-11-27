// Constructor editor UX Stage B, F-B3a.1 (screener logs/agents/architect.md §6.1): the extra hint
// under a server error. A new backend sends a stable `reason` (ProblemReason) beside a plain
// message; an old one sends only the message, so the regexes stay as the fallback. The first block
// pins every regex branch on old (master) backend messages: it must stay green unchanged.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { constructedErrorHint, REASON_ADVICE } from '../../components/strategyConstructor/constructedFormat';
import { unitMismatchHint } from '../../components/universeScreener/conditionFormat';
import { apiRequest, problemOf } from '../../api/httpClient';
import { problemReducer, withProblem } from '../../components/common/problemError';

// [old backend message, a fragment of the expected hint]
const OLD_MESSAGES = [
  ['$TiltSell=0.02 <= $TiltBuy=0: violated (axis constraint $TiltSell <= $TiltBuy) [CONSTRUCTED_INVALID]', 'break the constraint $TiltSell <= $TiltBuy'],
  ['constraint 1 ($A <= $B): unknown axis $B', 'An axis constraint compares two different axes'],
  ['At most 5 axis constraints', 'An axis constraint compares two different axes'],
  ['R2.C1: TOUCHES_UPPER is not in semantics B yet', 'Touch counts'],
  ['channel conditions run on DAY / WEEK in stage 4', 'channel conditions runs on DAY or WEEK only'],
  ['R1.C2.min = $BuyLow=0.3 > R1.C2.max = $BuyHigh=0.2', 'min is above its max'],
  ['R1.C1.channel.minBars must be in [2, 1000]', 'Channel detector params'],
  ['R3: position operands in a ShortClose rule with them', 'use LongClose'],
  ['position operands run on DAY / WEEK in stage 4c', 'AT_ENTRY / MAX_SINCE_ENTRY'],
  ['R1.C1.left.a: no position operands inside a brick', 'stands only on a side'],
  ['R1.C1.left: AT_ENTRY reads a market series (a bar field, an indicator, LEVEL or a brick)', 'is a market operand'],
  ['R1.C1.left: position operands have no offset', 'has no offset'],
  ['level conditions and sequence bricks run on DAY / WEEK in stage 4', 'Levels conditions or sequence bricks runs on DAY or WEEK only'],
  ['R1.C1.left.x: WEEK operands inside a brick count bars of the run timeframe', 'must read the run timeframe'],
  ['R1.C1.left.a: the anchor event must be one market condition', 'is one market condition'],
  ['R1.C1.left: a brick has no offset - use lag', 'shift their window with lag'],
  ['R2.C1.right.a.levels.maxDwellBars must be in [1, 500]', 'Levels params'],
  ['R1.C1: a strength must be in (0, 50]', 'need a zone strength'],
  ['Levels conditions in screener filters come in stage 4d', 'stage 4d'],
  ["R1.C1: UNIT_MISMATCH: 'LEVEL(DIST_SUPPORT_ATR)' (ATR_MULTIPLE) vs 'close' (PRICE)", 'distances in ATR'],
  ["conditions[0]: UNIT_MISMATCH: 'DAY ATR(14)[0]' (PRICE_RANGE) vs 'DAY close[0]' (PRICE)", 'ATR is a distance in price'],
  ["conditions[0]: UNIT_MISMATCH: 'DAY RSI(14)[0]' (PERCENT) vs 'DAY close[0]' (PRICE)", 'Both sides of a comparison'],
  ["R1 LongOpen: offsets and fixed timeframes on HOUR are not supported yet ('…'; use RUN operands at [0])", 'On HOUR / MIN5 / MONTH'],
  ['R1 LongOpen: ATR(14) on MIN5 is not supported yet', 'do not run on MIN5 yet'],
  ['RUN is for constructed strategies', 'exists only inside constructed strategies'],
  ['R1.C1.n ($MaLength = 205): must be an integer SMA length in [5, 200], got 205', 'A linked threshold is invalid'],
  ['$Gap must be >= 0, got -1', 'An axis value is outside its allowed range'],
  ['R1.C1.left.n must be an integer ATR length in [2, 250]', 'A length must be a whole number'],
  ['SMA_NOT_AVAILABLE: SMA 205 (not stored)', 'is not stored'],
  ['R1.C1.tolerancePct is a tolerance, $Len is a length', 'A link must use an axis of the same kind'],
];

describe('old backend: message regexes (no reason)', () => {
  it.each(OLD_MESSAGES)('%s', (message, fragment) => {
    expect(constructedErrorHint(message)).toContain(fragment);
    expect(constructedErrorHint(message, null)).toBe(constructedErrorHint(message));
  });

  it('no hint for an unknown message', () => {
    expect(constructedErrorHint('Ticker is required')).toBeNull();
    expect(constructedErrorHint('')).toBeNull();
    expect(constructedErrorHint(null)).toBeNull();
    expect(unitMismatchHint('something else')).toBeNull();
  });
});

describe('new backend: reason first', () => {
  it('a reason with advice wins over a message the regexes would read differently', () => {
    // a plain message no regex knows
    expect(constructedErrorHint('Rule R3, condition 1: a value from your open long cannot stand in a Cover short rule.',
      'POSITION_SHORT_CLOSE')).toBe(REASON_ADVICE.POSITION_SHORT_CLOSE);
    expect(constructedErrorHint('Rule R1: needs DAY or WEEK', 'CHANNEL_RUN_TF')).toBe(REASON_ADVICE.CHANNEL_RUN_TF);
  });

  it('a violated constraint names the constraint when the message carries it', () => {
    expect(constructedErrorHint('$TiltSell=0.02 <= $TiltBuy=0: violated (axis constraint $TiltSell <= $TiltBuy)',
      'AXIS_CONSTRAINT_VIOLATED')).toContain('break the constraint $TiltSell <= $TiltBuy');
    expect(constructedErrorHint('These axis values break a constraint.', 'AXIS_CONSTRAINT_VIOLATED'))
      .toContain('These axis values break an axis constraint');
  });

  it('a reason whose message says it all gets no extra hint, even when a regex would match', () => {
    expect(constructedErrorHint('RUN is for constructed strategies', 'TF_NOT_ALLOWED')).toBeNull();
    expect(constructedErrorHint('Rule R1, condition 1: tolerance must be in (−50, 50) %', 'TOLERANCE_RANGE')).toBeNull();
  });

  it('an unmapped reason (OTHER, a future one) falls back to the regexes', () => {
    expect(constructedErrorHint('SMA_NOT_AVAILABLE: SMA 205 (not stored)', 'OTHER')).toContain('is not stored');
    expect(constructedErrorHint('SMA_NOT_AVAILABLE: SMA 205 (not stored)', 'SOME_FUTURE_REASON')).toContain('is not stored');
    expect(constructedErrorHint('nothing known', 'OTHER')).toBeNull();
  });

  it('UNIT_MISMATCH by reason: ATR distance, Levels distance, generic', () => {
    const atr = unitMismatchHint('Condition 1: “ATR 14 (day)” is a price range, “close (day)” is a price.', 'UNIT_MISMATCH');
    expect(atr).toContain('ATR is a distance in price');
    const generic = unitMismatchHint('Condition 1: “RSI 14 (day)” is a %, “close (day)” is a price.', 'UNIT_MISMATCH');
    expect(generic).toContain('Both sides of a comparison');
    expect(unitMismatchHint('Condition 1: different units', 'LENGTH_RANGE')).toBeNull();
    expect(constructedErrorHint('Rule R1, condition 1: “the distance to support (ATR)” is in ATR multiples, “close” is a price.',
      'UNIT_MISMATCH')).toContain('distances in ATR');
    expect(constructedErrorHint('Rule R1, condition 1: “ATR 14” is a price range, “close” is a price.', 'UNIT_MISMATCH'))
      .toContain('ATR is a distance in price');
  });

  it('every advice is a non-empty sentence or an explicit null', () => {
    Object.entries(REASON_ADVICE).forEach(([k, v]) => {
      expect(k).toMatch(/^[A-Z][A-Z0-9_]*$/);
      if (v !== null) expect(typeof v === 'string' && v.length > 20).toBe(true);
    });
  });
});

describe('errors carry path / reason', () => {
  afterEach(() => vi.unstubAllGlobals());

  const respond = (status, body) => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  })));

  it('a new backend 400 body', async () => {
    respond(400, { error: 'CONSTRUCTED_INVALID', code: 'CONSTRUCTED_INVALID', message: 'Rule R1, condition 1: …',
      path: 'R1.C1.left.tf', reason: 'TF_NOT_ALLOWED' });
    const err = await apiRequest('/x', undefined, 'Save').catch((e) => e);
    expect(err).toMatchObject({ status: 400, code: 'CONSTRUCTED_INVALID', path: 'R1.C1.left.tf', reason: 'TF_NOT_ALLOWED' });
    expect(err.message).toBe('Rule R1, condition 1: …');
  });

  it('an old backend 400 body: path / reason null', async () => {
    respond(400, { error: 'Bad Request', message: 'R1.C1.left.tf: …' });
    const err = await apiRequest('/x', undefined, 'Save').catch((e) => e);
    expect(err.path).toBeNull();
    expect(err.reason).toBeNull();
  });

  it('a network failure: path / reason null', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
    const err = await apiRequest('/x', undefined, 'Save').catch((e) => e);
    expect(err.status).toBeUndefined();
    expect(err.path).toBeNull();
    expect(err.reason).toBeNull();
  });

  it('problemOf keeps strings only', () => {
    expect(problemOf({ path: 'R1', reason: 'OTHER' })).toEqual({ path: 'R1', reason: 'OTHER' });
    expect(problemOf({ path: '', reason: 3 })).toEqual({ path: null, reason: null });
    expect(problemOf(null)).toEqual({ path: null, reason: null });
  });
});

describe('problemError state (App / editor / filter errors)', () => {
  it('null clears, a string has no problem, withProblem keeps path / reason', () => {
    expect(problemReducer({ text: 'x' }, null)).toBeNull();
    expect(problemReducer(null, 'Ticker is required')).toEqual({ text: 'Ticker is required', path: null, reason: null });
    const err = Object.assign(new Error('m'), { path: 'R1.C1.left.tf', reason: 'TF_NOT_ALLOWED' });
    expect(problemReducer(null, withProblem('Preview failed: m', err)))
      .toEqual({ text: 'Preview failed: m', path: 'R1.C1.left.tf', reason: 'TF_NOT_ALLOWED' });
    // a failed job: errorReason only; an older backend: none
    expect(withProblem('Optimization failed: x', { reason: 'AXIS_CONSTRAINT_VIOLATED' }).reason).toBe('AXIS_CONSTRAINT_VIOLATED');
    expect(withProblem('Optimization failed: x', { reason: undefined })).toEqual({ text: 'Optimization failed: x', path: null, reason: null });
  });
});
