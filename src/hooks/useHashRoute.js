// src/hooks/useHashRoute.js
//
// Browser navigation (screener logs/agents/architect.md "Browser navigation" §1, §3): the route
// lives in the location hash and history.state; Back / Forward (popstate) move between the entries
// the app pushed. Hand-written instead of react-router: the "routes" are five tabs plus a few ids.
//
// - navigate(route) pushes an entry, navigate(route, {replace: true}) rewrites the current one;
//   navigating to the URL (and Channels request) already shown does nothing.
// - Before every push the scroll position is written into the entry being left; popstate
//   restores it (history.scrollRestoration = 'manual', the panels render first).
// - On load the URL is canonicalised by replace (unknown tab → #/backtest, invalid ids dropped).

import { useCallback, useEffect, useState } from 'react';
import { channelsRequestKey, formatHash, parseHash, routeState } from '../navigation/route';

const urlWithHash = (hash) => `${window.location.pathname}${window.location.search}${hash}`;

const readRoute = () => parseHash(window.location.hash, window.history.state);

const sameEntry = (hash, state) => hash === window.location.hash
  && channelsRequestKey(state.channelsRequest) === channelsRequestKey(window.history.state?.channelsRequest);

/**
 * @returns {{route: {tab: string, screener: Object|null, channels: Object|null},
 *   navigate: (route: Object, opts?: {replace?: boolean}) => void}}
 */
export function useHashRoute() {
  const [route, setRoute] = useState(readRoute);

  useEffect(() => {
    // Canonical URL of the initial entry (also stores the full Channels request in its state).
    const initial = readRoute();
    const hash = formatHash(initial);
    const state = routeState(initial);
    if (!sameEntry(hash, state)) {
      window.history.replaceState({ ...state, scrollY: window.scrollY }, '', urlWithHash(hash));
    }

    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';

    const onPopState = (e) => {
      const next = parseHash(window.location.hash, e.state);
      const canonical = formatHash(next);
      const nextState = routeState(next);
      // A hand-edited hash (no state) or an invalid one: rewrite it in place.
      if (!sameEntry(canonical, nextState)) {
        window.history.replaceState({ ...nextState, scrollY: 0 }, '', urlWithHash(canonical));
      }
      setRoute(next);
      const y = Number(e.state?.scrollY) || 0;
      // Two frames: the panels shown by this route render and lay out first.
      requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, y)));
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      window.history.scrollRestoration = previousRestoration;
    };
  }, []);

  const navigate = useCallback((next, { replace = false } = {}) => {
    const hash = formatHash(next);
    const state = routeState(next);
    if (sameEntry(hash, state)) return;
    if (replace) {
      window.history.replaceState({ ...state, scrollY: window.scrollY }, '', urlWithHash(hash));
    } else {
      // Remember where the page was scrolled in the entry being left.
      window.history.replaceState({ ...(window.history.state || {}), scrollY: window.scrollY }, '', window.location.href);
      window.history.pushState({ ...state, scrollY: 0 }, '', urlWithHash(hash));
    }
    setRoute(parseHash(hash, state));
  }, []);

  return { route, navigate };
}
