// src/components/DateRangePicker.jsx
import './DateRangePicker.css';
import { exchangeTodayLocalDate, US_ZONE } from '../utils/dates';

// `zone`: the selected ticker's exchange zone. Presets end on the EXCHANGE's today
// (decision 0.18), not the browser's.
const DateRangePicker = ({ startDate, endDate, onStartDateChange, onEndDateChange, zone = US_ZONE }) => {
  // Format date for input as local YYYY-MM-DD (toISOString() would use UTC and can shift the day)
  const pad = (n) => String(n).padStart(2, '0');
  const formatDateForInput = (date) => {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  };

  // Parse 'YYYY-MM-DD' as local midnight (new Date('YYYY-MM-DD') would parse it as UTC midnight)
  const parseInputDate = (dateString) => {
    const [y, m, d] = dateString.split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  // Ignore an empty value (cleared field) so state never holds an Invalid Date
  const handleChange = (onChange) => (e) => {
    if (!e.target.value) return;
    onChange(parseInputDate(e.target.value));
  };

  return (
    <div className="date-range-picker">
      <h3 className="date-range-title">Date Range</h3>
      
      <div className="date-grid">
        <div className="date-field">
          <label className="date-label">Start Date</label>
          <input
            type="date"
            value={formatDateForInput(startDate)}
            onChange={handleChange(onStartDateChange)}
            max={formatDateForInput(endDate)}
            className="date-input"
          />
        </div>
        
        <div className="date-field">
          <label className="date-label">End Date</label>
          <input
            type="date"
            value={formatDateForInput(endDate)}
            onChange={handleChange(onEndDateChange)}
            min={formatDateForInput(startDate)}
            className="date-input"
          />
        </div>
      </div>
      
      {/* Quick date range selectors */}
      <div className="date-shortcuts">
        <button
          type="button"
          onClick={() => {
            const end = exchangeTodayLocalDate(zone);
            const start = new Date(end);
            start.setMonth(end.getMonth() - 1);
            onStartDateChange(start);
            onEndDateChange(end);
          }}
          className="date-shortcut-btn"
        >
          Last Month
        </button>
        
        <button
          type="button"
          onClick={() => {
            const end = exchangeTodayLocalDate(zone);
            const start = new Date(end);
            start.setMonth(end.getMonth() - 3);
            onStartDateChange(start);
            onEndDateChange(end);
          }}
          className="date-shortcut-btn"
        >
          Last 3 Months
        </button>
        
        <button
          type="button"
          onClick={() => {
            const end = exchangeTodayLocalDate(zone);
            const start = new Date(end);
            start.setFullYear(end.getFullYear() - 1);
            onStartDateChange(start);
            onEndDateChange(end);
          }}
          className="date-shortcut-btn"
        >
          Last Year
        </button>
        
        <button
          type="button"
          onClick={() => {
            const end = exchangeTodayLocalDate(zone);
            const start = new Date(end);
            start.setFullYear(end.getFullYear() - 3);
            onStartDateChange(start);
            onEndDateChange(end);
          }}
          className="date-shortcut-btn"
        >
          Last 3 Years
        </button>
      </div>
    </div>
  );
};

export default DateRangePicker;