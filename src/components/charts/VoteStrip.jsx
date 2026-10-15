// src/components/charts/VoteStrip.jsx
import { useEffect, useRef } from 'react';
import { drawVoteStrip } from '../../utils/ChartDrawingUtils';
import { VOTE_COLORS } from '../signals/signalPanes';

/** Strip height, px (Signals mode, under the price pane of a strategy that votes). */
export const VOTE_STRIP_HEIGHT = 10;

/**
 * Signals mode vote strip: what a stateless strategy votes on every bar (collapsed runs), drawn
 * under its price pane on the same x axis. Hover is handled by ReporterStyleChart (pane 'votes').
 * @param {Array<{startMs, endMs, type}>} props.votes - signalPanes.js normalizeVotes
 * @param {number} props.width
 * @param {[Date, Date]} props.dateRange - the plot range, as the price pane gets it
 */
const VoteStrip = ({ votes, width, dateRange }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pixelRatio = window.devicePixelRatio || 1;
    canvas.width = width * pixelRatio;
    canvas.height = VOTE_STRIP_HEIGHT * pixelRatio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${VOTE_STRIP_HEIGHT}px`;
    const ctx = canvas.getContext('2d');
    ctx.scale(pixelRatio, pixelRatio);
    ctx.clearRect(0, 0, width, VOTE_STRIP_HEIGHT);
    drawVoteStrip(ctx, votes, dateRange, width, VOTE_STRIP_HEIGHT, VOTE_COLORS);
  }, [votes, width, dateRange]);

  return <canvas ref={canvasRef} className="vote-strip-canvas" data-testid="vote-strip" />;
};

export default VoteStrip;
