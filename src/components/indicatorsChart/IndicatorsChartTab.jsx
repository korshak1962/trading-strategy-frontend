// src/components/indicatorsChart/IndicatorsChartTab.jsx
//
// The "Indicators Chart" tab (TASK stage B, architect §6.2): the former Channel Explorer turned
// into a workspace. Candles of one ticker / timeframe / period on the shared PriceWorkspaceChart,
// any number of registry indicators from "Add indicator" (GET /api/indicators/*), plus the
// Channels and Levels overlays. Bars outside the strategy run session are shaded (Q1 = A), the
// open bar and provisional values are drawn hollow / dashed (Q8), a stale SMA tail is offered for
// calculation in an inline panel (Q3). The route key stays `channels` (D7): the Screener's deep
// links and old URLs keep working, and a deep link adds the channels overlay by itself.
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchPrices } from '../../api/channelApi';
import { getAvailableTickers } from '../../api/strategyApi';
import {
  fetchIndicatorMeta, fetchIndicatorSeries, fetchLevelZones, specKey, topUpSmaTail,
} from '../../api/indicatorApi';
import { describeApiError } from '../../api/httpClient';
import PriceWorkspaceChart from '../charts/workspace/PriceWorkspaceChart';
import { createChannelLayer } from '../charts/workspace/layers/channelLayer';
import { createIndicatorLayer } from '../charts/workspace/layers/indicatorLayer';
import { createSessionShadeLayer } from '../charts/workspace/layers/sessionShadeLayer';
import { createLevelLayer } from '../charts/workspace/layers/levelLayer';
import { paneKeyOf, paneRangeOf, PRICE_PANE_KEY } from '../charts/workspace/panes';
import { toBarTime } from '../charts/workspace/bars';
import { channelsRequestKey } from '../../navigation/route';
import { exchangeToday, exchangeZoneForTicker, addYearsIso } from '../../utils/dates';
import { formatPct, formatStatus, formatAge, formatExitSide, formatBarDate } from '../channelExplorer/format';
import AddIndicatorMenu from './AddIndicatorMenu';
import IndicatorParamsDialog from './IndicatorParamsDialog';
import IndicatorChips from './IndicatorChips';
import StaleTailPrompt from './StaleTailPrompt';
import ChannelsPanel from './ChannelsPanel';
import { useIndicatorSet } from './useIndicatorSet';
import { useChannelsOverlay } from './useChannelsOverlay';
import {
  CHANNELS, LEVELS, PRACTICAL_LINE_LIMIT, TF_RANK, TIMEFRAMES, channelTimeframes, detectorApiParams,
  isBuiltIn, itemLabel, nextColor, specOf,
} from './indicatorSet';
import '../channelExplorer/ChannelExplorer.css';
import './IndicatorsChartTab.css';

const TF_LABEL = { MIN5: '5 Min', HOUR: 'Hour', DAY: 'Day', WEEK: 'Week', MONTH: 'Month' };
const SMA_KINDS = new Set(['SMA', 'SMA_TILT']);
const BASE_HEIGHT = 440;
const PANE_HEIGHT = 150;

// Decision 0.18: default range in the EXCHANGE's calendar (the default ticker SPY trades in New
// York), never toISOString() (UTC) or the browser's date.
const defaultTo = () => exchangeToday(exchangeZoneForTicker('SPY'));
const defaultFrom = () => addYearsIso(defaultTo(), -2);

const finestTf = (tfs) => (!tfs || !tfs.length) ? 'DAY' : tfs.reduce((a, b) => (TF_RANK[b] < TF_RANK[a] ? b : a));

const activeKeyOf = (a) => (a ? `${a.ticker}|${a.tf}|${a.from}|${a.to}` : null);

/** '(09:30, 16:00]' out of the meta rule 'bar key time in (09:30, 16:00]'. */
const ruleInterval = (rule) => {
  const m = /\((\d{2}:\d{2}),\s*(\d{2}:\d{2})\]/.exec(rule || '');
  return m ? { text: `(${m[1]}, ${m[2]}]`, start: m[1], end: m[2] } : null;
};

/**
 * Off-session bar times: from the series response (inRunSession, the backend's RunSession) when
 * one is loaded, else from the run-session rule of /meta (no registry indicator on the chart).
 */
const offSessionTimes = (prices, columns, tf, runSession) => {
  const out = new Set();
  if (columns && Array.isArray(columns.dates) && Array.isArray(columns.inRunSession)) {
    columns.dates.forEach((d, i) => { if (columns.inRunSession[i] === false) out.add(toBarTime(d)); });
    return out;
  }
  const interval = ruleInterval(runSession?.rule);
  if (!interval || !(runSession?.appliesTo || []).includes(tf)) return out;
  for (const p of prices) {
    const hm = String(p.date || '').substring(11, 16);
    if (hm.length === 5 && !(hm > interval.start && hm <= interval.end)) out.add(toBarTime(p.date));
  }
  return out;
};

const emptyStore = (key) => ({ key, columns: null, bySpec: new Map(), errors: new Map(), inflight: new Set(), abort: null });

/**
 * @param {Object} props
 * @param {Object|null} [props.request] the request of the current history entry (navigation/route.js,
 *   normalised): one that differs from the one on screen fills the form, sets the channels overlay
 *   and loads; null changes nothing
 * @param {(request: Object) => void} [props.onRequestChange] a load started here: the current
 *   history entry is rewritten with its request
 */
function IndicatorsChartTab({ request = null, onRequestChange = null }) {
  // ---- form ----
  const [ticker, setTicker] = useState('SPY');
  const [tickers, setTickers] = useState([]);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [tf, setTf] = useState('DAY');
  const [active, setActive] = useState(null);
  const activeKey = activeKeyOf(active);

  // ---- registry (meta without a ticker) and the ticker meta ----
  const [registry, setRegistry] = useState(null);
  const [registryError, setRegistryError] = useState(null);
  const [meta, setMeta] = useState(null);
  const descriptors = registry?.indicators || null;
  const descriptorByName = useMemo(() => new Map((descriptors || []).map(d => [d.name, d])), [descriptors]);

  const set = useIndicatorSet(descriptors);
  const { items } = set;
  const channelsItem = items.find(it => it.kind === CHANNELS) || null;
  const levelsItem = items.find(it => it.kind === LEVELS) || null;

  // ---- prices ----
  const [prices, setPrices] = useState([]);
  const [pricesKey, setPricesKey] = useState(null);
  const [pricesLoading, setPricesLoading] = useState(false);
  const [pricesError, setPricesError] = useState(null);

  // ---- series cache of the loaded request ----
  const storeRef = useRef(emptyStore(null));
  const [seriesVersion, setSeriesVersion] = useState(0);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const bump = useCallback(() => setSeriesVersion(v => v + 1), []);

  // ---- levels ----
  const [levels, setLevels] = useState({ key: null, zones: [], loading: false, error: null });

  // ---- dialog / stale tail ----
  const [dialog, setDialog] = useState(null); // {kind, itemId|null}
  const [dismissedStale, setDismissedStale] = useState(() => new Set());
  const [topUp, setTopUp] = useState({ busy: false, error: null, done: null });
  const [hierarchyMode, setHierarchyMode] = useState('up');
  const [selectedChannel, setSelectedChannel] = useState(null);
  const scrollCardRef = useRef(false);

  useEffect(() => {
    getAvailableTickers().then(ts => setTickers([...ts].sort())).catch(() => {});
    fetchIndicatorMeta()
      .then(m => setRegistry(m))
      .catch(err => setRegistryError(`Indicator registry unavailable: ${describeApiError(err)}`));
  }, []);

  // ---- route (deep link, Back / Forward, reload) ----
  const startedKey = useRef(null);
  const requestKey = channelsRequestKey(request);
  useEffect(() => {
    if (!request || !requestKey || requestKey === startedKey.current) return;
    startedKey.current = requestKey;
    const chartTf = finestTf(request.timeframes);
    const toDay = String(request.to || '').substring(0, 10);
    setTicker(request.ticker);
    setFrom(request.from);
    setTo(toDay);
    setTf(chartTf);
    if (request.withChannels) {
      set.setChannels({
        coarserTfs: request.timeframes.filter(t => t !== chartTf),
        view: request.view,
        lastActualChannelsOnly: request.lastActualChannelsOnly,
        detector: { ...request.params },
      });
    } else {
      set.setChannels(null);
    }
    setActive({ ticker: request.ticker, from: request.from, to: request.to, tf: chartTf });
    // keyed on the request's identity only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  // The request of what is on screen, written back to the history entry (replace) whenever the
  // load or the channels overlay changes.
  const channelsParamsKey = channelsItem ? JSON.stringify(channelsItem.params) : '';
  useEffect(() => {
    if (!active) return;
    const next = {
      ticker: active.ticker, from: active.from, to: active.to,
      timeframes: channelsItem ? channelTimeframes(channelsItem, active.tf) : [active.tf],
      params: channelsItem ? detectorApiParams(channelsItem.params.detector) : undefined,
      lastActualChannelsOnly: channelsItem ? channelsItem.params.lastActualChannelsOnly : true,
      view: channelsItem ? channelsItem.params.view : 'FULL',
      withChannels: Boolean(channelsItem),
    };
    const key = channelsRequestKey(next);
    if (!key || key === startedKey.current) return;
    startedKey.current = key;
    onRequestChange?.(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, channelsParamsKey, Boolean(channelsItem)]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const t = ticker.trim().toUpperCase();
    if (!t) return;
    setActive({ ticker: t, from, to, tf });
  };

  // ---- load prices + ticker meta on a new request ----
  useEffect(() => {
    if (!active) return undefined;
    const key = activeKey;
    const ctrl = new AbortController();
    // A new request: a new series cache (the old one's requests are aborted).
    storeRef.current.abort?.abort();
    storeRef.current = emptyStore(key);
    setTopUp({ busy: false, error: null, done: null });
    setSelectedChannel(null);
    setPricesLoading(true);
    setPricesError(null);
    setPrices([]);
    setPricesKey(null);
    setMeta(null);
    bump();
    fetchPrices(active.ticker, active.tf, active.from, active.to)
      .then((data) => {
        if (ctrl.signal.aborted) return;
        setPrices(Array.isArray(data) ? data : []);
        setPricesKey(key);
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        setPricesError(err.message || String(err));
      })
      .finally(() => { if (!ctrl.signal.aborted) setPricesLoading(false); });
    fetchIndicatorMeta(active.ticker, active.tf, { signal: ctrl.signal })
      .then((m) => { if (!ctrl.signal.aborted) setMeta(m); })
      .catch(() => { /* the chips show the series' own errors; the dialog falls back to number inputs */ });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);

  // ---- registry series: fetch the specs the cache does not have ----
  const activeTf = active?.tf || null;
  const registryItems = useMemo(() => items.filter(it => !isBuiltIn(it.kind)), [items]);
  const runnable = useCallback((item) => {
    const d = descriptorByName.get(item.kind);
    return Boolean(d && activeTf && (d.runTimeframes || []).includes(activeTf));
  }, [descriptorByName, activeTf]);
  const wantedSpecs = useMemo(() => registryItems.filter(runnable).map(specOf), [registryItems, runnable]);
  const wantedKey = wantedSpecs.map(specKey).sort().join(',');

  useEffect(() => {
    if (!active || pricesKey !== activeKey || prices.length === 0) return;
    const st = storeRef.current;
    if (st.key !== activeKey) return;
    const missing = [];
    const seen = new Set();
    for (const s of wantedSpecs) {
      const k = specKey(s);
      if (seen.has(k) || st.bySpec.has(k) || st.errors.has(k) || st.inflight.has(k)) continue;
      seen.add(k);
      missing.push(s);
    }
    if (missing.length === 0) return;
    if (!st.abort) st.abort = new AbortController();
    const signal = st.abort.signal;
    missing.forEach(s => st.inflight.add(specKey(s)));
    bump();
    fetchIndicatorSeries(active.ticker, active.tf, active.from, active.to, missing,
      { barCount: prices.length, caps: registry?.caps, signal })
      .then((resp) => {
        if (storeRef.current !== st || !resp) return;
        if (!st.columns) {
          st.columns = { dates: resp.dates, inRunSession: resp.inRunSession, openFrom: resp.openFrom, lastBar: resp.lastBar, zone: resp.zone };
        }
        resp.bySpec.forEach((v, k) => st.bySpec.set(k, v));
      })
      .catch((err) => {
        if (storeRef.current !== st || signal.aborted) return;
        const text = describeApiError(err);
        missing.forEach(s => st.errors.set(specKey(s), text));
      })
      .finally(() => {
        if (storeRef.current !== st) return;
        missing.forEach(s => st.inflight.delete(specKey(s)));
        bump();
      });
    // wantedKey stands for wantedSpecs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, pricesKey, wantedKey, refreshNonce]);

  // ---- levels ----
  const levelsMin = levelsItem ? levelsItem.params.minStrength : null;
  useEffect(() => {
    if (!active || levelsMin === null) { setLevels({ key: null, zones: [], loading: false, error: null }); return undefined; }
    const ctrl = new AbortController();
    const key = `${activeKey}|${levelsMin}`;
    setLevels(l => ({ ...l, key, loading: true, error: null }));
    fetchLevelZones(active.ticker, active.tf, levelsMin, { signal: ctrl.signal })
      .then(zones => { if (!ctrl.signal.aborted) setLevels({ key, zones, loading: false, error: null }); })
      .catch(err => { if (!ctrl.signal.aborted) setLevels({ key, zones: [], loading: false, error: describeApiError(err) }); });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, levelsMin]);

  // ---- channels ----
  const overlay = useChannelsOverlay(pricesKey === activeKey ? active : null, channelsItem);
  const handleChartSelect = useCallback((key) => {
    scrollCardRef.current = key !== null;
    overlay.setSelectedKey(key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlay.setSelectedKey]);
  const toggleCardSelection = useCallback((key) => {
    scrollCardRef.current = false;
    overlay.setSelectedKey(prev => (prev === key ? null : key));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlay.setSelectedKey]);
  const onSelectedChannel = useCallback((ch) => setSelectedChannel(ch), []);

  // ---- derived: series per item, chips, layers ----
  const st = storeRef.current;
  const columns = st.key === activeKey ? st.columns : null;
  const columnTimes = useMemo(() => (columns ? columns.dates.map(toBarTime) : null), [columns]);

  const barMarks = useMemo(() => {
    if (!active || pricesKey !== activeKey) return null;
    const off = offSessionTimes(prices, columns, active.tf, registry?.runSession);
    const openFromTime = columns && Number.isInteger(columns.openFrom) && columns.dates[columns.openFrom]
      ? toBarTime(columns.dates[columns.openFrom]) : null;
    return { offSession: off, openFromTime };
    // seriesVersion: columns arrive in the store (a ref)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prices, pricesKey, activeKey, columns, registry, seriesVersion]);

  // Per registry item: its response indicator (or why not), memoised per identity so a layer is
  // updated only when its own data changed.
  const layerDataCache = useRef(new Map());
  const itemViews = useMemo(() => {
    const out = [];
    for (const item of registryItems) {
      const d = descriptorByName.get(item.kind) || null;
      const label = itemLabel(item, d);
      const spec = specOf(item);
      const k = specKey(spec);
      let state = 'ok';
      let message = null;
      let ind = null;
      let topUpLength = null;
      if (!descriptors) {
        state = 'loading';
      } else if (!d) {
        state = 'error';
        message = `${item.kind} is not in the indicator registry`;
      } else if (activeTf && !runnable(item)) {
        state = 'inactive';
        message = `not supported on ${activeTf} yet`;
      } else if (active && st.key === activeKey) {
        if (st.errors.has(k)) { state = 'error'; message = st.errors.get(k); }
        else if (st.bySpec.has(k)) {
          ind = st.bySpec.get(k);
          if (ind.status === 'NOT_STORED' || ind.status === 'ERROR') {
            state = 'error';
            message = ind.issue?.message || ind.status;
          } else if (ind.status === 'STALE') {
            state = 'stale';
            const s = ind.stale;
            message = s ? `stale: stored to ${formatBarDate(s.storedTo)}, prices to ${formatBarDate(s.pricesTo)}` : (ind.issue?.message || 'stale');
            if (s && !s.topUp?.available && s.topUp?.reason) message += ` — ${s.topUp.reason}`;
            if (s?.topUp?.available && SMA_KINDS.has(spec.kind)) topUpLength = spec.n;
          }
        } else if (pricesKey === activeKey && prices.length > 0) {
          state = 'loading';
        }
      }
      out.push({ item, d, label, spec, state, message, ind, topUpLength });
    }
    return out;
    // seriesVersion: the store (a ref) changed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registryItems, descriptorByName, descriptors, activeTf, runnable, active, activeKey, pricesKey, prices, seriesVersion]);

  const layers = useMemo(() => {
    const list = [];
    if (barMarks && barMarks.offSession.size > 0) {
      list.push({
        id: '__session__',
        factory: createSessionShadeLayer,
        data: { offSession: barMarks.offSession, rule: ruleInterval(registry?.runSession?.rule)?.text || null },
      });
    }
    if (levelsItem && !levelsItem.hidden && levels.zones.length > 0) {
      list.push({ id: levelsItem.id, factory: createLevelLayer, data: { zones: levels.zones, nearestN: levelsItem.params.nearestN } });
    }
    const cache = layerDataCache.current;
    const seen = new Set();
    for (const v of itemViews) {
      if (!v.ind || !columnTimes) continue;
      const series = {
        times: columnTimes, values: v.ind.values, reasons: v.ind.reasons || {}, provisional: v.ind.provisional || [],
        status: v.ind.status, stale: v.ind.stale,
      };
      const data = {
        label: v.label, color: v.item.color, hidden: v.item.hidden, paneKey: paneKeyOf(v.d), range: paneRangeOf(v.d),
        unit: v.d.unit, warmup: v.d.warmup, series,
      };
      const prev = cache.get(v.item.id);
      const same = prev && prev.ind === v.ind && prev.times === columnTimes && prev.color === data.color
        && prev.hidden === data.hidden && prev.label === data.label;
      const entry = same ? prev : { ind: v.ind, times: columnTimes, color: data.color, hidden: data.hidden, label: data.label, data };
      cache.set(v.item.id, entry);
      seen.add(v.item.id);
      list.push({ id: v.item.id, factory: createIndicatorLayer, data: entry.data });
    }
    for (const id of [...cache.keys()]) if (!seen.has(id)) cache.delete(id);
    if (channelsItem && !channelsItem.hidden && overlay.result) {
      list.push({
        id: channelsItem.id,
        factory: createChannelLayer,
        data: {
          channels: overlay.channels, zoomChannels: overlay.zoomChannels, runId: overlay.runId, exits: overlay.exits,
          selectedKey: overlay.selectedKey, hierarchyMode, onSelect: handleChartSelect, onSelectedChannel,
        },
      });
    }
    return list;
  }, [barMarks, registry, levelsItem, levels.zones, itemViews, columnTimes, channelsItem, overlay.result,
    overlay.channels, overlay.zoomChannels, overlay.runId, overlay.exits, overlay.selectedKey, hierarchyMode,
    handleChartSelect, onSelectedChannel]);

  // The channel layer keeps its instance only while its data object is stable: memoise it apart.
  const stableLayers = useStableChannelData(layers, channelsItem?.id);

  // Panes below the price pane: one per distinct non-price group with a drawn line.
  const extraPanes = useMemo(() => {
    const keys = new Set();
    itemViews.forEach(v => {
      if (v.item.hidden || !v.ind || !v.d) return;
      if (!(v.ind.values || []).some(x => typeof x === 'number')) return;
      const k = paneKeyOf(v.d);
      if (k !== PRICE_PANE_KEY) keys.add(k);
    });
    return keys.size;
  }, [itemViews]);
  const visibleLines = itemViews.filter(v => !v.item.hidden && v.ind).length;

  // ---- chips ----
  const chips = useMemo(() => {
    const out = [];
    for (const item of items) {
      if (item.kind === CHANNELS) {
        out.push({
          item, label: 'Channels', color: null,
          state: overlay.loading ? 'loading' : overlay.error ? 'error' : 'ok',
          message: overlay.error,
        });
      } else if (item.kind === LEVELS) {
        out.push({
          item, label: `Levels (N ${item.params.nearestN}, strength ≥ ${item.params.minStrength})`, color: 'var(--ws-level-zone-border)',
          state: levels.loading ? 'loading' : levels.error ? 'error' : 'ok',
          message: levels.error || (active && !levels.loading && levels.key && levels.zones.length === 0 ? 'no stored zones' : null),
        });
      } else {
        const v = itemViews.find(x => x.item.id === item.id);
        if (v) out.push({ item, label: v.label, color: item.color, state: v.state, message: v.message, topUpLength: v.topUpLength });
      }
    }
    return out;
  }, [items, itemViews, overlay.loading, overlay.error, levels, active]);

  // ---- stale SMA tail (Q3) ----
  const staleKey = (n) => `${active?.ticker}|${active?.tf}|${n}`;
  const staleOffers = useMemo(() => {
    const byLen = new Map();
    for (const v of itemViews) {
      if (v.state !== 'stale' || v.topUpLength === null || !v.ind?.stale) continue;
      if (dismissedStale.has(staleKey(v.topUpLength))) continue;
      if (!byLen.has(v.topUpLength)) byLen.set(v.topUpLength, { length: v.topUpLength, ...v.ind.stale });
    }
    return [...byLen.values()].sort((a, b) => a.length - b.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemViews, dismissedStale, active]);

  const runTopUp = useCallback(async (lengths) => {
    if (!active || lengths.length === 0) return;
    const forKey = activeKey;
    setTopUp({ busy: true, error: null, done: null });
    try {
      const res = await topUpSmaTail(active.ticker, active.tf, lengths);
      if (storeRef.current.key !== forKey) return;
      const lines = (res?.results || []).map(r => {
        if (r.status === 'WRITTEN') return `SMA(${r.length}): ${r.rowsWritten} row${r.rowsWritten === 1 ? '' : 's'} written, stored to ${formatBarDate(r.storedToAfter)}`;
        if (r.status === 'ALREADY_FRESH') return `SMA(${r.length}): already up to date`;
        if (r.status === 'OPEN_BAR_SKIPPED') return `SMA(${r.length}): written to ${formatBarDate(r.storedToAfter)}; the open bar is not kept${r.message ? ` (${r.message})` : ''}`;
        return `SMA(${r.length}): ${r.status}${r.message ? ` — ${r.message}` : ''}`;
      });
      // Re-request only the affected specs (SMA and SMA tilt of those lengths) and the stored-length meta.
      const st0 = storeRef.current;
      for (const k of [...st0.bySpec.keys()]) {
        const [kind, n] = k.split(':');
        if (SMA_KINDS.has(kind) && lengths.includes(Number(n))) st0.bySpec.delete(k);
      }
      for (const k of [...st0.errors.keys()]) st0.errors.delete(k);
      setRefreshNonce(x => x + 1);
      bump();
      fetchIndicatorMeta(active.ticker, active.tf).then(m => { if (storeRef.current.key === forKey) setMeta(m); }).catch(() => {});
      setTopUp({ busy: false, error: null, done: `${lines.join('; ')}.` });
    } catch (err) {
      const busyText = 'A download is running; try again when it finishes.';
      setTopUp({
        busy: false,
        error: err.status === 409 ? { text: busyText, retry: true } : { text: `Calculation failed: ${describeApiError(err)}`, retry: true },
        done: null,
      });
    }
  }, [active, activeKey, bump]);

  const dismissStale = () => {
    if (staleOffers.length === 0) { setTopUp({ busy: false, error: null, done: null }); return; }
    setDismissedStale(prev => {
      const next = new Set(prev);
      staleOffers.forEach(s => next.add(staleKey(s.length)));
      return next;
    });
    setTopUp({ busy: false, error: null, done: null });
  };

  // ---- picker / dialog ----
  const openAdd = (kind) => setDialog({ kind, itemId: null });
  const openEdit = (id) => {
    const it = items.find(x => x.id === id);
    if (it) setDialog({ kind: it.kind, itemId: id });
  };
  const closeDialog = useCallback(() => setDialog(null), []);
  const submitDialog = (patch) => {
    if (!dialog) return;
    if (dialog.itemId) set.update(dialog.itemId, patch);
    else if (dialog.kind === CHANNELS || dialog.kind === LEVELS) set.add({ kind: dialog.kind, params: patch.params, hidden: false });
    else set.add({ kind: dialog.kind, params: patch.params, color: patch.color, hidden: false });
    setDialog(null);
  };
  const dialogItem = dialog?.itemId ? items.find(x => x.id === dialog.itemId) : null;

  // ---- chart chrome ----
  const showChannels = Boolean(channelsItem && !channelsItem.hidden && overlay.result);
  const hierarchyAvailable = showChannels && overlay.channels.some(c => c && c.id);
  const toolbar = hierarchyAvailable && (
    <div className="ch-hierarchy-toggle" role="group" aria-label="Hierarchy highlight">
      <span className="ch-hierarchy-label">Hierarchy</span>
      {[['off', 'Off'], ['up', 'Up'], ['down', 'Down']].map(([value, label]) => (
        <button
          key={value}
          type="button"
          className={`ch-hierarchy-btn${hierarchyMode === value ? ' ch-hierarchy-btn--active' : ''}`}
          aria-pressed={hierarchyMode === value}
          onClick={() => setHierarchyMode(value)}
          title={value === 'off' ? 'No hierarchy highlighting'
            : value === 'up' ? "Tint the selected channel's parent channels" : "Tint the selected channel's child channels"}
        >
          {label}
        </button>
      ))}
    </div>
  );

  const offCount = barMarks?.offSession?.size || 0;
  const hint = (
    <>
      {showChannels && selectedChannel && (
        <>
          <strong>Selected channel</strong>
          {typeof selectedChannel.widthPct === 'number' && <> — Width: {formatPct(selectedChannel.widthPct)}</>}
          {typeof selectedChannel.widthAtr === 'number' && <> ({selectedChannel.widthAtr.toFixed(2)} ATR)</>}
          {typeof selectedChannel.depth === 'number' && selectedChannel.depth >= 0 && <> · depth {selectedChannel.depth}</>}
          {formatStatus(selectedChannel) && <> · {formatStatus(selectedChannel)}</>}
          {selectedChannel.current && <> · current channel</>}
          {formatAge(selectedChannel.ageBars) && <> · age {formatAge(selectedChannel.ageBars)}</>}
          {selectedChannel.builtDate && <> · built {formatBarDate(selectedChannel.builtDate)}</>}
          <br />
        </>
      )}
      Log = logarithmic price scale · drag the chart to pan, scroll over the price axis to zoom vertically, double-click it or Fit to reset
      · drag the slider below to pick the period · Esc to reset zoom · ⛶ for full screen
      {offCount > 0 && ` · shaded bars (${offCount} of ${prices.length}, ${((offCount / Math.max(1, prices.length)) * 100).toFixed(0)} %) are outside the strategy run session ${ruleInterval(registry?.runSession?.rule)?.text || ''}: no strategy decision on them`}
      {barMarks?.openFromTime != null && ' · a hollow candle is a bar not closed yet; a dashed end of a line is provisional'}
      {showChannels && <>
        {' · '}Click a channel line (or its card below) to select it · drag the yellow handle to extend/shrink · Delete/Backspace to remove
        · ▲/▼ arrows mark where a close price crossed a channel boundary
        {hierarchyAvailable && " · Hierarchy Up/Down tints the selection's parents/children violet"}
        · dashed faded lines = draft (provisional) channels, a thicker line = the current channel
        {overlay.exits.length > 0 && ` · orange dots = the last exit per depth (${overlay.exits.map(e => `d${e.depth ?? '?'} ${formatExitSide(e.side)}`).join(', ')}), dotted orange = the broken channel`}
      </>}
    </>
  );

  const lastPrice = prices.length ? prices[prices.length - 1].date : null;
  const loaded = active && pricesKey === activeKey;

  return (
    <div className="channel-explorer indicators-chart" data-testid="indicators-chart">
      <form className="form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="ic-ticker">Ticker</label>
          <input
            id="ic-ticker"
            list="ic-ticker-list"
            value={ticker}
            onChange={e => setTicker(e.target.value.toUpperCase())}
            placeholder="e.g. SPY"
            autoComplete="off"
            required
          />
          <datalist id="ic-ticker-list">
            {tickers.map(t => <option key={t} value={t} />)}
          </datalist>
        </div>
        <div className="form-group">
          <label htmlFor="ic-from">From</label>
          <input id="ic-from" type="date" value={from} onChange={e => setFrom(e.target.value)} required />
        </div>
        <div className="form-group">
          <label htmlFor="ic-to">To</label>
          <input id="ic-to" type="date" value={to} onChange={e => setTo(e.target.value)} required />
        </div>
        <div className="form-group ta-tf-group">
          <label>Timeframe</label>
          <div className="ta-tf-toggles" role="radiogroup" aria-label="Timeframe">
            {TIMEFRAMES.map(v => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={tf === v}
                className={`ta-tf-btn${tf === v ? ' ta-tf-btn--active' : ''}`}
                onClick={() => setTf(v)}
                data-testid={`ic-tf-${v}`}
              >
                {TF_LABEL[v]}
              </button>
            ))}
          </div>
        </div>
        <div className="ta-form-actions">
          <button type="submit" className="find-btn" disabled={pricesLoading} data-testid="ic-load">
            {pricesLoading ? 'Loading…' : 'Load'}
          </button>
        </div>
      </form>

      <div className="ic-toolbar">
        <AddIndicatorMenu
          descriptors={descriptors}
          timeframe={loaded ? active.tf : tf}
          hasChannels={Boolean(channelsItem)}
          hasLevels={Boolean(levelsItem)}
          onPick={openAdd}
        />
        <IndicatorChips
          chips={chips}
          onEdit={openEdit}
          onToggleHidden={set.toggleHidden}
          onRemove={set.remove}
          onTopUp={(n) => runTopUp([n])}
          topUpBusy={topUp.busy}
          onChannelView={(view) => channelsItem && set.update(channelsItem.id, { params: { ...channelsItem.params, view } })}
        />
      </div>

      {registryError && <div className="error-banner" data-testid="ic-registry-error">{registryError}</div>}
      {set.notice && (
        <div className="ic-notice" data-testid="ic-set-notice" role="status">
          {set.notice}
          <button type="button" className="ic-chip__btn" onClick={set.dismissNotice} aria-label="Dismiss">×</button>
        </div>
      )}
      {visibleLines > PRACTICAL_LINE_LIMIT && (
        <div className="ic-notice" role="status">
          {visibleLines} lines are drawn: the hover tooltip gets heavy above about {PRACTICAL_LINE_LIMIT}. Hide the ones you do not need.
        </div>
      )}
      {pricesError && <div className="error-banner"><strong>Error:</strong> {pricesError}</div>}

      {loaded && (
        <StaleTailPrompt
          ticker={active.ticker}
          timeframe={active.tf}
          stale={staleOffers}
          busy={topUp.busy}
          error={topUp.error}
          done={topUp.done}
          onCalculate={() => runTopUp(staleOffers.map(s => s.length))}
          onDismiss={dismissStale}
        />
      )}

      {loaded && (
        <div className="ic-summary" data-testid="ic-summary">
          <strong>{active.ticker}</strong> · {TF_LABEL[active.tf]} · {prices.length} bars
          {lastPrice && <> · {formatBarDate(prices[0].date)} → <span data-testid="ic-last-bar">last bar {formatBarDate(lastPrice)}</span></>}
          {meta?.lastBar && lastPrice && meta.lastBar.substring(0, 16) !== lastPrice.substring(0, 16)
            && <> · last stored bar {formatBarDate(meta.lastBar)}</>}
          {meta?.zone && <> · times in {meta.zone === 'Europe/Moscow' ? 'MSK' : 'New York'} exchange time</>}
        </div>
      )}

      {pricesLoading && <div className="status-msg">Loading prices…</div>}
      {loaded && (
        <PriceWorkspaceChart
          bars={prices}
          ticker={active.ticker}
          timeframe={active.tf}
          layers={stableLayers}
          barMarks={barMarks}
          toolbar={toolbar}
          hint={hint}
          height={BASE_HEIGHT + PANE_HEIGHT * extraPanes}
          className="ch-chart-wrapper"
          containerClassName="ch-chart-container"
        />
      )}

      {loaded && channelsItem && !channelsItem.hidden && (
        <>
          {overlay.loading && <div className="status-msg" data-testid="ce-loading">
            {channelsItem.params.view === 'INCREMENTAL' ? 'Replaying channels bar by bar…' : 'Detecting channels…'}
          </div>}
          <ChannelsPanel overlay={overlay} scrollToSelection={scrollCardRef} onToggleCard={toggleCardSelection} />
        </>
      )}

      {!active && (
        <div className="empty-state">
          Enter a ticker, a date range and a timeframe, then click <strong>Load</strong>. Add indicators, channels or
          levels with <strong>+ Add indicator</strong>.
        </div>
      )}

      {dialog && (
        <IndicatorParamsDialog
          kind={dialog.kind}
          descriptor={descriptorByName.get(dialog.kind) || null}
          item={dialogItem}
          defaultColor={nextColor(items)}
          meta={meta && loaded ? meta : null}
          chartTf={loaded ? active.tf : tf}
          channelConstants={overlay.constants}
          onSubmit={submitDialog}
          onCancel={closeDialog}
        />
      )}
    </div>
  );
}

/**
 * The channels layer's data must keep its identity while nothing of it changed (a new object
 * re-runs layer.update, which rebuilds the channel lines). Returns `layers` with the channels
 * entry's data replaced by the previous object when its fields are all identical.
 */
function useStableChannelData(layers, channelsId) {
  const prevRef = useRef(null);
  return useMemo(() => {
    if (!channelsId) { prevRef.current = null; return layers; }
    return layers.map((l) => {
      if (l.id !== channelsId) return l;
      const prev = prevRef.current;
      const same = prev && Object.keys(l.data).every(k => prev[k] === l.data[k]);
      if (same) return { ...l, data: prev };
      prevRef.current = l.data;
      return l;
    });
  }, [layers, channelsId]);
}

export default memo(IndicatorsChartTab);
