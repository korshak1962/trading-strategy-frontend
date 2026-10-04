// src/components/downloader/TickerChips.jsx
import { useState } from 'react';

/**
 * Editable ticker list: removable chips, an input (Enter or comma adds; uppercased,
 * deduplicated) and a "reset to portfolio" link.
 */
const TickerChips = ({ tickers, onChange, onReset, disabled = false }) => {
  const [draft, setDraft] = useState('');

  const addDraft = () => {
    const parts = draft
      .split(/[\s,;]+/)
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);
    if (parts.length) {
      const next = [...tickers];
      parts.forEach((t) => { if (!next.includes(t)) next.push(t); });
      onChange(next);
    }
    setDraft('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addDraft();
    } else if (e.key === 'Backspace' && draft === '' && tickers.length > 0) {
      onChange(tickers.slice(0, -1));
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1 p-2 border rounded bg-white min-h-[42px]">
        {tickers.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-sm"
          >
            {t}
            {!disabled && (
              <button
                type="button"
                className="text-blue-600 hover:text-red-600 leading-none"
                onClick={() => onChange(tickers.filter((x) => x !== t))}
                aria-label={`Remove ${t}`}
                title={`Remove ${t}`}
              >
                ×
              </button>
            )}
          </span>
        ))}
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={addDraft}
          disabled={disabled}
          placeholder={tickers.length ? 'Add…' : 'Add ticker, Enter'}
          className="flex-1 min-w-[80px] outline-none text-sm py-0.5"
          aria-label="Add ticker"
        />
      </div>
      <div className="mt-1 flex justify-between text-xs text-gray-500">
        <span>{tickers.length} ticker{tickers.length === 1 ? '' : 's'}</span>
        <button
          type="button"
          onClick={onReset}
          disabled={disabled}
          className="text-blue-600 hover:underline disabled:text-gray-400 disabled:no-underline"
        >
          reset to portfolio
        </button>
      </div>
    </div>
  );
};

export default TickerChips;
