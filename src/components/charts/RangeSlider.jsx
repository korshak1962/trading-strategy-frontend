// src/components/charts/RangeSlider.jsx
import { memo, useCallback, useMemo } from 'react';
import { ComposedChart, LineChart, Line, XAxis, YAxis, Brush } from 'recharts';

// Brush track height; a bit taller than a bare brush because it also carries a mini close-price
// line (panorama).
export const RANGE_SLIDER_HEIGHT = 40;
// Height of the start/end date row under the track. Fixed (not left to line-height) so
// ReporterStyleChart can take it out of its height budget exactly.
export const RANGE_SLIDER_DATES_HEIGHT = 16;

// recharts' own brush labels are drawn 5px outside each traveller, which would need side margins
// and make the track narrower than the panes; they are suppressed and the window's dates are
// shown in an HTML row under the track instead.
const NO_LABEL = () => '';

const DAY_MS = 24 * 60 * 60 * 1000;

// Formatters built once (the date row re-formats its two labels on every drag step).
// timeZone UTC: bar Dates are UTC-faked exchange wall clock (see utils/dates.js).
const dailyFormat = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
const intradayFormat = new Intl.DateTimeFormat(undefined, {
  year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC'
});

/**
 * Bottom range slider (recharts Brush over a mini close-price line), controlled by bar indices.
 * Memoized: the parent re-renders on every mouse move (crosshair); with stable props the brush
 * and its panorama are left alone.
 * @param {Array<{ms:number, close:number}>} props.rows - one row per price bar (stable identity)
 * @param {number} props.startIndex - first visible bar index
 * @param {number} props.endIndex - last visible bar index
 * @param {(range:{startIndex:number,endIndex:number}) => void} props.onChange
 * @param {number} props.width - track width in px: the panes' canvas width (floored to whole px
 *   by ReporterStyleChart), so both ends line up exactly with the canvases.
 */
const RangeSlider = ({ rows, startIndex, endIndex, onChange, width }) => {
  const intraday = rows.length > 1 && (rows[rows.length - 1].ms - rows[0].ms) / (rows.length - 1) < DAY_MS / 2;
  const formatLabel = useCallback(
    (ms) => (intraday ? intradayFormat : dailyFormat).format(new Date(ms)),
    [intraday]
  );
  const handleChange = useCallback((range) => {
    if (!range) return;
    if (range.startIndex !== startIndex || range.endIndex !== endIndex) {
      onChange({ startIndex: range.startIndex, endIndex: range.endIndex });
    }
  }, [startIndex, endIndex, onChange]);

  // Panorama element memoized so brush re-renders don't rebuild it.
  const panorama = useMemo(() => (
    <LineChart>
      <YAxis hide domain={['dataMin', 'dataMax']} />
      <Line type="linear" dataKey="close" stroke="#8884d8" strokeWidth={1} dot={false} isAnimationActive={false} />
    </LineChart>
  ), []);

  if (rows.length < 2) return null;

  const startRow = rows[Math.max(0, Math.min(startIndex, rows.length - 1))];
  const endRow = rows[Math.max(0, Math.min(endIndex, rows.length - 1))];

  return (
    <div className="reporter-range-slider">
      {/* No side margin: the track spans the full canvas width (the 1px .chart-wrapper border
          is mirrored by .reporter-range-slider's side borders). */}
      <ComposedChart
        width={width}
        height={RANGE_SLIDER_HEIGHT + 2}
        data={rows}
        margin={{ top: 1, right: 0, left: 0, bottom: 1 }}
      >
        <XAxis dataKey="ms" hide />
        <Brush
          dataKey="ms"
          height={RANGE_SLIDER_HEIGHT}
          stroke="#8884d8"
          fill="#f5f5f5"
          travellerWidth={10}
          gap={5}
          startIndex={startIndex}
          endIndex={endIndex}
          tickFormatter={NO_LABEL}
          onChange={handleChange}
        >
          {panorama}
        </Brush>
      </ComposedChart>
      <div className="reporter-range-slider-dates" style={{ width, height: RANGE_SLIDER_DATES_HEIGHT }}>
        <span>{formatLabel(startRow.ms)}</span>
        <span>{formatLabel(endRow.ms)}</span>
      </div>
    </div>
  );
};

export default memo(RangeSlider);
