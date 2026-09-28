import { useState, useEffect, useRef, useId } from 'react';

// Tickers that start with the query come first, then those that only contain it.
const rankTickers = (tickers, query) => {
  if (!query) return tickers;
  const q = query.toUpperCase();
  const prefix = [];
  const other = [];
  tickers.forEach(t => {
    const idx = t.toUpperCase().indexOf(q);
    if (idx === 0) prefix.push(t);
    else if (idx > 0) other.push(t);
  });
  return [...prefix, ...other];
};

// Wraps the first occurrence of the query in <mark>.
const Highlighted = ({ text, query }) => {
  const idx = query ? text.toUpperCase().indexOf(query.toUpperCase()) : -1;
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 text-inherit rounded-sm">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
};

const TickerCombobox = ({ value, onChange, tickers = [], id }) => {
  const [inputValue, setInputValue] = useState(value);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef(null);
  const listRef = useRef(null);
  const generatedId = useId();
  const inputId = id || `ticker-${generatedId}`;
  const listId = `${inputId}-listbox`;

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = rankTickers(tickers, inputValue);
  const listVisible = open && filtered.length > 0;

  // Keep the highlighted option scrolled into view.
  useEffect(() => {
    if (!listVisible || activeIndex < 0 || !listRef.current) return;
    const el = listRef.current.children[activeIndex];
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, listVisible]);

  const handleInput = (e) => {
    const val = e.target.value.toUpperCase();
    setInputValue(val);
    onChange(val);
    setOpen(true);
    // Pre-highlight the best match so Enter picks it.
    setActiveIndex(val ? 0 : -1);
  };

  const handleSelect = (ticker) => {
    setInputValue(ticker);
    onChange(ticker);
    setOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (e) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!listVisible) {
          setOpen(true);
          setActiveIndex(0);
        } else {
          setActiveIndex(i => (i + 1) % filtered.length);
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!listVisible) {
          setOpen(true);
          setActiveIndex(filtered.length - 1);
        } else {
          setActiveIndex(i => (i <= 0 ? filtered.length - 1 : i - 1));
        }
        break;
      case 'Enter':
        // While the list is open, Enter picks an option and never submits the form.
        if (listVisible) {
          e.preventDefault();
          if (activeIndex >= 0 && activeIndex < filtered.length) {
            handleSelect(filtered[activeIndex]);
          } else {
            setOpen(false);
          }
        }
        break;
      case 'Escape':
        if (listVisible) {
          e.preventDefault();
          setOpen(false);
          setActiveIndex(-1);
        }
        break;
      case 'Tab':
        setOpen(false);
        break;
      default:
        break;
    }
  };

  const activeOptionId = listVisible && activeIndex >= 0 ? `${listId}-opt-${activeIndex}` : undefined;

  return (
    <div ref={containerRef} className="relative">
      <input
        id={inputId}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={listVisible}
        aria-controls={listVisible ? listId : undefined}
        aria-activedescendant={activeOptionId}
        value={inputValue}
        onChange={handleInput}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        className="w-full p-2 border rounded"
        autoComplete="off"
        spellCheck={false}
      />
      {listVisible && (
        <ul
          id={listId}
          ref={listRef}
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded border border-gray-200 bg-white py-1 shadow-lg"
        >
          {filtered.map((ticker, i) => {
            const active = i === activeIndex;
            // "current" = the committed ticker (bold only). aria-selected follows the keyboard/mouse
            // highlight, which is also the option aria-activedescendant points at.
            const current = ticker === value;
            return (
              <li
                key={ticker}
                id={`${listId}-opt-${i}`}
                role="option"
                aria-selected={active}
                onMouseDown={(e) => { e.preventDefault(); handleSelect(ticker); }}
                onMouseEnter={() => setActiveIndex(i)}
                className={`cursor-pointer px-3 py-1.5 text-sm ${
                  active ? 'bg-blue-100 text-blue-900' : 'text-gray-800'
                } ${current ? 'font-semibold' : ''}`}
              >
                <Highlighted text={ticker} query={inputValue} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default TickerCombobox;
