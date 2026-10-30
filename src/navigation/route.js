// src/navigation/route.js
//
// Hash routes of the app (screener logs/agents/architect.md "Browser navigation" §1): which tab is
// open, the Screener sub-view (view, filter, run) and the Channel Explorer request. Pure functions;
// useHashRoute applies them to window.location / history.
//
//   #/backtest
//   #/channels?ticker=AAPL&tf=DAY&from=2020-01-01&to=2026-10-28&view=FULL
//   #/screener                          (= view filters)
//   #/screener/results?filter=12&run=345
//   #/screener/universe
//   #/downloader
//   #/watchlist
//
// The URL of a Channels entry holds only the readable part of the request; the full request
// (detector params, lastActualChannelsOnly) travels in history.state.channelsRequest. Without it
// (a pasted link) the detector defaults apply.

import { RECURSIVE_DEFAULT_PARAMS } from '../components/channelExplorer/RecursiveParamsPanel';

export const TABS = ['backtest', 'channels', 'screener', 'downloader', 'watchlist'];
export const DEFAULT_TAB = 'backtest';

const SCREENER_VIEWS = ['filters', 'results', 'universe'];
const CHANNEL_TFS = ['MIN5', 'HOUR', 'DAY', 'WEEK', 'MONTH'];
const CHANNEL_VIEWS = ['FULL', 'INCREMENTAL'];
const DETECTOR_PARAM_KEYS = ['coveragePct', 'minBars', 'minWidthPct', 'minAnnualYieldPct', 'maxAnnualYieldPct'];
const TICKER_RE = /^[A-Z0-9.^=_-]{1,20}$/;
// A bare day, or a day with a time (the Screener sends the end of the basis day: ...T23:59:59).
const DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/;

/** A positive integer id from a URL parameter, else null. */
export const parseId = (v) => (typeof v === 'string' && /^\d+$/.test(v) && Number(v) > 0 ? Number(v) : null);

const validDate = (v) => (typeof v === 'string' && DATE_RE.test(v) ? v : null);

/**
 * A Channels detection request in the Explorer's own shape {ticker, from, to, timeframes, params,
 * lastActualChannelsOnly, view}, every field validated and defaulted; null if it has no ticker or
 * no valid dates.
 */
export const normalizeChannelsRequest = (req) => {
  if (!req || typeof req !== 'object') return null;
  const ticker = String(req.ticker || '').trim().toUpperCase();
  const from = validDate(req.from);
  const to = validDate(req.to);
  if (!TICKER_RE.test(ticker) || !from || !to) return null;
  const tfs = (Array.isArray(req.timeframes) ? req.timeframes : []).filter((tf) => CHANNEL_TFS.includes(tf));
  const timeframes = tfs.length ? [...new Set(tfs)] : ['DAY'];
  const params = { ...RECURSIVE_DEFAULT_PARAMS };
  DETECTOR_PARAM_KEYS.forEach((k) => {
    const v = req.params?.[k];
    const n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
    if (Number.isFinite(n)) params[k] = n;
  });
  params.logPrice = true;
  return {
    ticker,
    from,
    to,
    timeframes,
    params,
    lastActualChannelsOnly: req.lastActualChannelsOnly !== false,
    view: CHANNEL_VIEWS.includes(req.view) ? req.view : 'FULL',
  };
};

/**
 * The Screener's "open in Channels" request {ticker, timeframe, startDate, endDate, params, view}
 * as an Explorer request. The end runs through the END of the basis day: DAY bars are stamped
 * 09:00 and a bare date is sent as T00:00:00, which would drop the basis bar itself.
 */
export const channelsRequestFromScreener = (req) => normalizeChannelsRequest({
  ticker: req?.ticker,
  from: req?.startDate,
  to: /^\d{4}-\d{2}-\d{2}$/.test(req?.endDate || '') ? `${req.endDate}T23:59:59` : req?.endDate,
  timeframes: [req?.timeframe],
  params: req?.params,
  lastActualChannelsOnly: true,
  view: req?.view,
});

/** Stable identity of a detection request: equal keys = the same detection. */
export const channelsRequestKey = (req) => {
  const r = normalizeChannelsRequest(req);
  if (!r) return null;
  const params = DETECTOR_PARAM_KEYS.map((k) => `${k}=${r.params[k]}`).join(',');
  return [r.ticker, r.timeframes.join(','), r.from, r.to, r.view, r.lastActualChannelsOnly ? 1 : 0, params].join('|');
};

const sameReadable = (a, b) => !!a && !!b && a.ticker === b.ticker && a.from === b.from && a.to === b.to
  && a.view === b.view && a.timeframes.join(',') === b.timeframes.join(',');

/**
 * Parses a location hash (with its history.state) into a route:
 * {tab, screener: {view, filterId, runId} | null, channels: request | null}.
 * Unknown tab or garbage → the default tab; invalid ids are dropped. The caller compares
 * formatHash(route) with the hash to canonicalise the URL.
 */
export const parseHash = (hash, state = null) => {
  const raw = String(hash || '').replace(/^#/, '');
  const [pathPart, queryPart = ''] = raw.split('?');
  const segments = pathPart.split('/').filter(Boolean);
  const query = new URLSearchParams(queryPart);
  const tab = TABS.includes(segments[0]) ? segments[0] : DEFAULT_TAB;

  if (tab === 'screener') {
    const view = SCREENER_VIEWS.includes(segments[1]) ? segments[1] : 'filters';
    const filterId = view === 'results' ? parseId(query.get('filter')) : null;
    const runId = view === 'results' && filterId != null ? parseId(query.get('run')) : null;
    return { tab, screener: { view, filterId, runId }, channels: null };
  }

  if (tab === 'channels') {
    const fromUrl = query.get('ticker') ? normalizeChannelsRequest({
      ticker: query.get('ticker'),
      from: query.get('from'),
      to: query.get('to'),
      timeframes: (query.get('tf') || '').split(','),
      view: query.get('view'),
    }) : null;
    // The full request from history.state when it is the one this URL names.
    const fromState = normalizeChannelsRequest(state?.channelsRequest);
    const channels = fromState && (!fromUrl || sameReadable(fromState, fromUrl)) && query.get('ticker')
      ? fromState : fromUrl;
    return { tab, screener: null, channels };
  }

  return { tab, screener: null, channels: null };
};

/** The canonical hash of a route. */
export const formatHash = (route) => {
  const tab = TABS.includes(route?.tab) ? route.tab : DEFAULT_TAB;
  if (tab === 'screener') {
    const s = route.screener || {};
    const view = SCREENER_VIEWS.includes(s.view) ? s.view : 'filters';
    if (view === 'filters') return '#/screener';
    if (view === 'universe') return '#/screener/universe';
    const q = new URLSearchParams();
    if (s.filterId != null) {
      q.set('filter', String(s.filterId));
      if (s.runId != null) q.set('run', String(s.runId));
    }
    const qs = q.toString();
    return `#/screener/results${qs ? `?${qs}` : ''}`;
  }
  if (tab === 'channels') {
    const r = normalizeChannelsRequest(route.channels);
    if (!r) return '#/channels';
    const q = new URLSearchParams({ ticker: r.ticker, tf: r.timeframes.join(','), from: r.from, to: r.to, view: r.view });
    return `#/channels?${q.toString()}`;
  }
  return `#/${tab}`;
};

/** history.state for a route (the full Channels request travels here). */
export const routeState = (route) => ({
  channelsRequest: route?.tab === 'channels' ? normalizeChannelsRequest(route.channels) : null,
});
