// src/components/charts/CumulativePnLChart.jsx
import { useEffect, useRef } from 'react';
import {
  drawNoDataMessage,
  drawGrid,
  drawDateAxis,
  drawPnLAxis,
  findMinMaxCumulative,
  drawCumulativePnLLine
} from '../../utils/ChartDrawingUtils';

/**
 * CumulativePnLChart - realized cumulative trade PnL pane of the Reporter-style chart.
 * Same canvas pattern and time->x mapping as PnLChart, so it lines up bar-for-bar with the
 * price and trade panes and follows the same dateRange (zoom).
 * @param {Object} props
 * @param {Array<{date: Date, value: number}>} props.points - cumulative PnL per bar (see
 *   cumulativeClosedPnLByBar), ascending by date
 * @param {boolean} props.hasTrades - false when there is no closed trade at all
 * @param {number} props.width
 * @param {number} props.height
 * @param {[Date, Date]} props.dateRange
 */
const DATE_LABEL_BAND = 16; // px kept clear at the bottom for drawDateAxis

const CumulativePnLChart = ({ points, hasTrades, width, height, dateRange }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvasElement = canvasRef.current;
    if (!canvasElement) return;

    const pixelRatio = window.devicePixelRatio || 1;
    canvasElement.width = width * pixelRatio;
    canvasElement.height = height * pixelRatio;
    canvasElement.style.width = `${width}px`;
    canvasElement.style.height = `${height}px`;

    const ctx = canvasElement.getContext('2d');
    ctx.scale(pixelRatio, pixelRatio);
    ctx.clearRect(0, 0, width, height);

    if (!points || points.length === 0 || !dateRange) {
      drawNoDataMessage(ctx, width, height);
      return;
    }
    if (!hasTrades) {
      drawNoDataMessage(ctx, width, height, 'No completed trades available');
      return;
    }

    // Scale to the visible window (plus the value carried in from before it)
    const [startDate, endDate] = dateRange;
    const startMs = startDate.getTime();
    const endMs = endDate.getTime();
    const visibleValues = [];
    let carried = 0;
    points.forEach(point => {
      const ms = point.date.getTime();
      if (ms < startMs) carried = point.value;
      else if (ms <= endMs) visibleValues.push(point.value);
    });
    visibleValues.push(carried);
    const valueRange = findMinMaxCumulative(visibleValues);
    // Stretch the bottom so the curve stays above the date-axis labels (a mostly-positive equity
    // curve otherwise runs along zero right through them).
    const span = valueRange.max - valueRange.min;
    const minMax = { min: valueRange.min - span * (DATE_LABEL_BAND / Math.max(1, height - DATE_LABEL_BAND)), max: valueRange.max };

    drawGrid(ctx, width, height);
    drawCumulativePnLLine(ctx, points, dateRange, minMax, width, height);
    // Axes last, so their labels sit on top of the curve
    drawDateAxis(ctx, dateRange, width, height);
    drawPnLAxis(ctx, minMax, width, height, 'Cum. PnL');
  }, [points, hasTrades, width, height, dateRange]);

  return (
    <div className="chart-wrapper">
      <canvas ref={canvasRef} className="cumulative-pnl-chart-canvas"></canvas>
    </div>
  );
};

export default CumulativePnLChart;
