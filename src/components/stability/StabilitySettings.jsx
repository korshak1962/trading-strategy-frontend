// src/components/stability/StabilitySettings.jsx
//
// Optimize-form section "Parameter stability by channel" (screener architect.md §6 item 1).
// The user sets only the channel timeframe (never coarser than the strategy timeframe: coarser
// options are disabled; the backend also answers 400) and the channel-detector params (the Channel
// Explorer's RecursiveParamsPanel). Sent with Optimize requests only, and only when enabled.

import { useState } from 'react';
import RecursiveParamsPanel from '../channelExplorer/RecursiveParamsPanel';
import {
  STABILITY_DEFAULT_PARAMS, TIME_FRAME_LABELS, TIME_FRAME_ORDER, fmtDetectorParams, isCoarserTimeFrame,
} from './stabilityFormat';

/**
 * @param {Object} props
 * @param {{enabled: boolean, channelTimeFrame: string, params: Object}} props.settings
 * @param {(next: Object) => void} props.onChange receives the whole next settings object
 * @param {string} props.strategyTimeFrame the form's timeframe
 * @param {boolean} [props.disabled]
 */
const StabilitySettings = ({ settings, onChange, strategyTimeFrame, disabled = false }) => {
  const [showParams, setShowParams] = useState(false);
  const coarser = isCoarserTimeFrame(settings.channelTimeFrame, strategyTimeFrame);

  const set = (patch) => onChange({ ...settings, ...patch });
  const setParam = (name, value) => set({ params: { ...settings.params, [name]: value } });

  return (
    <div className="mb-6 border border-gray-200 rounded p-3" data-testid="stability-settings">
      <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
        <input
          type="checkbox"
          checked={settings.enabled}
          disabled={disabled}
          onChange={(e) => set({ enabled: e.target.checked })}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          data-testid="stability-enabled"
        />
        Parameter stability by channel
      </label>
      <p className="mt-1 text-xs text-gray-500">
        Splits every channel of the current chain (root → deepest, all ending at the end date) into a
        Fit half and a Check half and shows how the best parameters hold up. One grid, no extra runs.
      </p>

      {settings.enabled && (
        <div className="mt-3">
          <label htmlFor="stability-tf" className="block text-sm font-medium text-gray-700 mb-1">Channel timeframe</label>
          <select
            id="stability-tf"
            data-testid="stability-tf"
            value={settings.channelTimeFrame}
            disabled={disabled}
            onChange={(e) => set({ channelTimeFrame: e.target.value })}
            className="w-full p-2 border rounded"
          >
            {TIME_FRAME_ORDER.map((tf) => {
              const tooCoarse = isCoarserTimeFrame(tf, strategyTimeFrame);
              return (
                <option key={tf} value={tf} disabled={tooCoarse}>
                  {TIME_FRAME_LABELS[tf]}{tooCoarse ? ' (coarser than the strategy)' : ''}
                </option>
              );
            })}
          </select>
          {coarser ? (
            <p className="mt-1 text-xs text-red-600" role="alert">
              The channel timeframe must not be coarser than the strategy timeframe.
            </p>
          ) : (
            <p className="mt-1 text-xs text-gray-500">
              Same or finer than the strategy timeframe ({TIME_FRAME_LABELS[strategyTimeFrame] || strategyTimeFrame}).
            </p>
          )}

          <button
            type="button"
            onClick={() => setShowParams((v) => !v)}
            className="mt-3 text-sm text-blue-700 hover:text-blue-900"
            aria-expanded={showParams}
            data-testid="stability-params-toggle"
          >
            {showParams ? '▼' : '►'} Detector parameters
          </button>
          {!showParams && (
            <p className="mt-1 text-xs text-gray-500">{fmtDetectorParams(settings.params)}</p>
          )}
          {showParams && (
            <div className="mt-2">
              <RecursiveParamsPanel
                params={settings.params}
                setParam={setParam}
                onReset={() => set({ params: { ...STABILITY_DEFAULT_PARAMS } })}
              />
              <label className="mt-2 flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.params.logPrice !== false}
                  onChange={(e) => setParam('logPrice', e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                Log price
              </label>
            </div>
          )}
          <p className="mt-2 text-xs text-amber-700">
            Detector params are stored with the snapshot; do not tune them to get a nicer verdict.
          </p>
        </div>
      )}
    </div>
  );
};

export default StabilitySettings;
