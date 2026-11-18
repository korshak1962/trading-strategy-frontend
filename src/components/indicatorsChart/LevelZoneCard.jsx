// src/components/indicatorsChart/LevelZoneCard.jsx
//
// The card of the level zone selected on the Indicators Chart (TASK_level_zone_hover_select §1.2):
// the zone's characteristics as of the map's date (GET /api/levels/{ticker}/as-of, LevelZoneDTO)
// and its touches, the touch list collapsed when it is long.
import { formatBarKey } from '../charts/workspace/bars';
import { levelZoneExtras } from '../../utils/levelZones';

/** Above this many touches the list starts collapsed. */
const TOUCHES_OPEN_MAX = 6;

const fmt = (v, digits = 2) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? '–' : Number(v).toFixed(digits));

/**
 * @param {Object} props
 * @param {Object} props.zone - LevelZoneDTO
 * @param {string} props.timeframe - the chart timeframe (date format)
 * @param {string|null} [props.asOf] - the bar the zone map is as of
 * @param {() => void} props.onClose
 */
export default function LevelZoneCard({ zone, timeframe, asOf = null, onClose }) {
  const touches = Array.isArray(zone.touches) ? zone.touches : [];
  const date = (d) => (d ? formatBarKey(d, timeframe) : '–');
  const hasDistance = zone.distanceAtr !== null && zone.distanceAtr !== undefined && Number.isFinite(Number(zone.distanceAtr));
  // Level range zones stage 2: pass-through crossings and the raw touch band, only when not default.
  const extras = levelZoneExtras(zone);
  return (
    <div className="ic-zone-card" data-testid="ic-zone-card">
      <div className="ic-zone-card__head">
        <strong>Selected level zone</strong>
        {asOf && <span data-testid="ic-zone-card-asof">· map as of {date(asOf)}</span>}
        <span className="ic-zone-card__range" data-testid="ic-zone-card-range">{fmt(zone.low)}–{fmt(zone.high)}</span>
        {zone.status && <span className="ta-ch-badge">{zone.status}</span>}
        <button type="button" className="ic-chip__btn" onClick={onClose} title="Clear the selection (Esc)" aria-label="Clear the zone selection">×</button>
      </div>
      <div className="ic-zone-card__grid">
        <span>center <b>{fmt(zone.center)}</b></span>
        <span>strength <b>{fmt(zone.strength)}</b></span>
        <span>touches <b>{zone.touchCount ?? '–'}</b></span>
        <span>first touch <b>{date(zone.firstTouch)}</b></span>
        <span>last touch <b>{date(zone.lastTouch)}</b></span>
        {hasDistance && <span>distance <b>{fmt(zone.distanceAtr)} ATR</b></span>}
        <span>
          ATR <b>{fmt(zone.atrValue)}</b>
          {zone.atrDate && <> as of {date(zone.atrDate)}</>}
        </span>
        {extras.crossings && <span data-testid="ic-zone-card-crossings">{extras.crossings}</span>}
        {extras.rawBand && <span data-testid="ic-zone-card-rawband">{extras.rawBand}</span>}
      </div>
      {touches.length > 0 && (
        <details className="ic-zone-card__touches" open={touches.length <= TOUCHES_OPEN_MAX}>
          <summary>{touches.length} touch{touches.length === 1 ? '' : 'es'}</summary>
          <table>
            <thead>
              <tr><th>Date</th><th>Source</th><th>Side</th><th>Kind</th><th>Price</th><th>Bounce, ATR</th></tr>
            </thead>
            <tbody>
              {touches.map((t, i) => (
                <tr key={`${t.touchDate}|${t.sourceTf}|${i}`}>
                  <td>{t.touchDate ? formatBarKey(t.touchDate, t.sourceTf || timeframe) : '–'}</td>
                  <td>{t.sourceTf || '–'}</td>
                  <td>{t.side || '–'}</td>
                  <td>{t.kind || '–'}</td>
                  <td>{fmt(t.price)}</td>
                  <td>{fmt(t.bounceAtr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}
