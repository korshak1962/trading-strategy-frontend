// src/components/SaveCaseControl.jsx
//
// "Save case" button + inline form in the results header (screener
// TASK_saved_optimization_cases.md §3.3). Optimize mode saves the finished job on the server
// (POST /optimize-jobs/{jobId}/save: its request ranges + best values); backtest mode saves the
// config of the run that produced the results on screen (POST /cases). App remounts this
// component (key) for every new run, so the form and messages never outlive their result.

import { useState } from 'react';
import { saveCase, saveCaseFromJob } from '../api/strategyApi';

const JOB_GONE_MESSAGE = 'This optimization is no longer on the server (the backend restarted or newer '
  + 'optimizations replaced it). Run it again to save it.';

/**
 * @param {Object} props
 * @param {'backtest'|'optimize'} props.mode
 * @param {string|null} props.jobId optimize mode: the job whose result is on screen
 * @param {() => Object|null} props.getConfig backtest mode: the StrategiesConfigDTO of the run on screen
 * @param {() => void} props.onSaved called after every successful save (refreshes the saved-cases list)
 */
const SaveCaseControl = ({ mode, jobId, getConfig, onSaved }) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [savedAs, setSavedAs] = useState(null);

  const send = (overwrite) => {
    if (mode === 'optimize') return saveCaseFromJob(jobId, { name, note, overwrite });
    const config = getConfig();
    if (!config) throw new Error('No backtest configuration to save');
    return saveCase({ name, note, overwrite, config });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSavedAs(null);
    try {
      let res;
      try {
        res = await send(false);
      } catch (err) {
        if (err.status !== 409 || err.body?.error !== 'NAME_EXISTS') throw err;
        // Name taken: ask, then resend with overwrite. Cancel leaves everything as it was.
        const existing = err.body?.name ?? name.trim();
        if (!window.confirm(`Case "${existing}" already exists. Overwrite?`)) return;
        res = await send(true);
      }
      setSavedAs(res?.name ?? name.trim());
      setOpen(false);
      setName('');
      setNote('');
      onSaved();
    } catch (err) {
      if (mode === 'optimize' && err.status === 404) {
        setError(JOB_GONE_MESSAGE);
      } else if (err.status === 409) {
        // Not saveable (job still running / no result) — `{status, error}`; or a second
        // NAME_EXISTS after confirming (someone else took the name meanwhile).
        setError(err.body?.error === 'NAME_EXISTS'
          ? `Case "${err.body?.name ?? name.trim()}" already exists`
          : (err.body?.error || err.message));
      } else {
        setError(err.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setOpen(false);
    setError(null);
  };

  return (
    <div className="flex flex-col items-end gap-2 text-sm">
      {!open && (
        <div className="flex items-center gap-3">
          {savedAs && (
            <span className="text-green-700" role="status">Saved as «{savedAs}»</span>
          )}
          <button
            type="button"
            onClick={() => { setOpen(true); setSavedAs(null); setError(null); }}
            className="py-1 px-3 border border-blue-600 text-blue-600 rounded hover:bg-blue-50"
          >
            Save case
          </button>
        </div>
      )}
      {open && (
        <div className="w-80 p-3 border border-gray-200 rounded bg-gray-50 flex flex-col gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-700">Name</span>
            <input
              type="text"
              value={name}
              maxLength={255}
              onChange={(e) => setName(e.target.value)}
              placeholder="Empty = auto-generated name"
              className="p-1.5 border rounded bg-white"
              autoFocus
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-700">Note</span>
            <textarea
              value={note}
              maxLength={10000}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="p-1.5 border rounded bg-white resize-y"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving}
              className="py-1 px-3 border rounded text-gray-700 hover:bg-gray-100 disabled:text-gray-400"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="py-1 px-3 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-400"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
      {error && (
        <div className="w-80 p-2 rounded bg-red-50 border border-red-200 text-red-700" role="alert">
          {error}
        </div>
      )}
    </div>
  );
};

export default SaveCaseControl;
