import { useState, useEffect, useRef } from 'react';

const TickerCombobox = ({ value, onChange, tickers = [] }) => {
  const [inputValue, setInputValue] = useState(value);
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

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

  const filtered = inputValue
    ? tickers.filter(t => t.toUpperCase().includes(inputValue.toUpperCase()))
    : tickers;

  const handleInput = (e) => {
    const val = e.target.value.toUpperCase();
    setInputValue(val);
    onChange(val);
    setOpen(true);
  };

  const handleSelect = (ticker) => {
    setInputValue(ticker);
    onChange(ticker);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={inputValue}
        onChange={handleInput}
        onFocus={() => setOpen(true)}
        className="w-full p-2 border rounded"
        required
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 w-full bg-white border rounded shadow-lg max-h-48 overflow-y-auto mt-1">
          {filtered.map(ticker => (
            <li
              key={ticker}
              onMouseDown={() => handleSelect(ticker)}
              className={`px-3 py-1.5 cursor-pointer text-sm hover:bg-blue-50 ${
                ticker === inputValue ? 'bg-blue-100 font-medium' : ''
              }`}
            >
              {ticker}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default TickerCombobox;
