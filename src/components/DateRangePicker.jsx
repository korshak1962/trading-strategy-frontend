// src/components/DateRangePicker.jsx
import './DateRangePicker.css';

const DateRangePicker = ({ startDate, endDate, onStartDateChange, onEndDateChange }) => {
  // Format date for input
  const formatDateForInput = (date) => {
    return date.toISOString().split('T')[0];
  };

  // Parse date from input
  const parseInputDate = (dateString) => {
    return new Date(dateString);
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
            onChange={(e) => onStartDateChange(parseInputDate(e.target.value))}
            max={formatDateForInput(endDate)}
            className="date-input"
          />
        </div>
        
        <div className="date-field">
          <label className="date-label">End Date</label>
          <input
            type="date"
            value={formatDateForInput(endDate)}
            onChange={(e) => onEndDateChange(parseInputDate(e.target.value))}
            min={formatDateForInput(startDate)}
            max={formatDateForInput(new Date())}
            className="date-input"
          />
        </div>
      </div>
      
      {/* Quick date range selectors */}
      <div className="date-shortcuts">
        <button
          type="button"
          onClick={() => {
            const end = new Date();
            const start = new Date();
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
            const end = new Date();
            const start = new Date();
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
            const end = new Date();
            const start = new Date();
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
            const end = new Date();
            const start = new Date();
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