import { useState, useEffect, useRef, useId } from 'react';

// Searchable portfolio picker for the Downloader tab. Same markup, aria wiring and styling as
// the Strategy tab's TickerCombobox, but select-only: typing filters the list by a
// case-insensitive name prefix and only a picked option is committed via onChange (a partial
// query is never passed up). Closing without a pick restores the committed name.
const PortfolioCombobox = ({ value, onChange, portfolios = [], id, disabled = false, placeholder = '' }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef(null);
  const listRef = useRef(null);
  const generatedId = useId();
  const inputId = id || `portfolio-${generatedId}`;
  const listId = `${inputId}-listbox`;

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const q = query.trim().toUpperCase();
  const filtered = q ? portfolios.filter((p) => p.name.toUpperCase().startsWith(q)) : portfolios;
  const listOpen = open && !disabled;
  const listVisible = listOpen && filtered.length > 0;

  // Keep the highlighted option scrolled into view.
  useEffect(() => {
    if (!listVisible || activeIndex < 0 || !listRef.current) return;
    const el = listRef.current.children[activeIndex];
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, listVisible]);

  const openList = () => {
    setQuery('');
    setOpen(true);
    // Start on the committed portfolio so Enter keeps it.
    setActiveIndex(Math.max(0, portfolios.findIndex((p) => p.name === value)));
  };

  const close = () => {
    setOpen(false);
    setActiveIndex(-1);
  };

  const handleInput = (e) => {
    setQuery(e.target.value);
    setOpen(true);
    // Pre-highlight the first match so Enter picks it.
    setActiveIndex(0);
  };

  const handleSelect = (name) => {
    close();
    if (name !== value) onChange(name);
  };

  const handleKeyDown = (e) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!listOpen) openList();
        else if (filtered.length) setActiveIndex((i) => (i + 1) % filtered.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!listOpen) openList();
        else if (filtered.length) setActiveIndex((i) => (i <= 0 ? filtered.length - 1 : i - 1));
        break;
      case 'Enter':
        // While the list is open, Enter picks an option and never submits the form.
        if (listOpen) {
          e.preventDefault();
          if (activeIndex >= 0 && activeIndex < filtered.length) handleSelect(filtered[activeIndex].name);
          else close();
        }
        break;
      case 'Escape':
        if (listOpen) {
          e.preventDefault();
          close();
        }
        break;
      case 'Tab':
        close();
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
        value={listOpen ? query : value}
        placeholder={listOpen ? value || 'Type to filter…' : placeholder}
        onChange={handleInput}
        onFocus={openList}
        onClick={() => { if (!listOpen) openList(); }}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className="w-full p-2 border rounded disabled:bg-gray-100 disabled:text-gray-500"
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
          {filtered.map((p, i) => {
            const active = i === activeIndex;
            const current = p.name === value;
            return (
              <li
                key={p.name}
                id={`${listId}-opt-${i}`}
                role="option"
                aria-selected={active}
                onMouseDown={(e) => { e.preventDefault(); handleSelect(p.name); }}
                onMouseEnter={() => setActiveIndex(i)}
                className={`cursor-pointer px-3 py-1.5 text-sm ${
                  active ? 'bg-blue-100 text-blue-900' : 'text-gray-800'
                } ${current ? 'font-semibold' : ''}`}
              >
                {q ? (
                  <>
                    <mark className="bg-yellow-200 text-inherit rounded-sm">{p.name.slice(0, q.length)}</mark>
                    {p.name.slice(q.length)}
                  </>
                ) : p.name}
                <span className="text-gray-500"> ({(p.tickers || []).length})</span>
              </li>
            );
          })}
        </ul>
      )}
      {listOpen && filtered.length === 0 && (
        <div
          role="status"
          className="absolute left-0 right-0 top-full z-50 mt-1 rounded border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-500 shadow-lg"
        >
          No matches
        </div>
      )}
    </div>
  );
};

export default PortfolioCombobox;
