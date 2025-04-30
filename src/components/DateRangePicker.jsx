// src/components/DateRangePicker.jsx
import './DateRangePicker.css';

const DateRangePicker = ({ 
  startDate, 
  endDate, 
  onStartDateChange, 
  onEndDateChange,
  minDate,
  maxDate
}) => {
  // Format date for input
  const formatDateForInput = (date) => {
    return date.toISOString().split('T')[0];
  };

  // Parse date from input
  const parseInputDate = (dateString) => {
    return new Date(dateString);
  };

  // Validate date is within allowed range
  const validateDate = (date, isStartDate) => {
    // Clone the date to avoid modifying the original
    let validatedDate = new Date(date);
    
    // Apply min date constraint
    if (minDate && validatedDate < minDate) {
      validatedDate = new Date(minDate);
    }
    
    // Apply max date constraint
    if (maxDate && validatedDate > maxDate) {
      validatedDate = new Date(maxDate);
    }
    
    // For start date, ensure it's not after end date
    if (isStartDate && validatedDate > endDate) {
      validatedDate = new Date(endDate);
    }
    
    // For end date, ensure it's not before start date
    if (!isStartDate && validatedDate < startDate) {
      validatedDate = new Date(startDate);
    }
    
    return validatedDate;
  };

  // Handle start date change with validation
  const handleStartDateChange = (event) => {
    const newDate = parseInputDate(event.target.value);
    const validatedDate = validateDate(newDate, true);
    onStartDateChange(validatedDate);
  };

  // Handle end date change with validation
  const handleEndDateChange = (event) => {
    const newDate = parseInputDate(event.target.value);
    const validatedDate = validateDate(newDate, false);
    onEndDateChange(validatedDate);
  };

  // Create date shortcut with validation
  const createDateShortcut = (monthsBack) => {
    return () => {
      const end = maxDate ? new Date(Math.min(new Date().getTime(), maxDate.getTime())) : new Date();
      const start = new Date(end);
      start.setMonth(end.getMonth() - monthsBack);
      
      // Validate start date (ensure it's not before minDate)
      const validStart = minDate && start < minDate ? new Date(minDate) : start;
      
      onStartDateChange(validStart);
      onEndDateChange(end);
    };
  };

  return (
    <div className="date-range-picker">
      <h3 className="date-range-title">Date Range</h3>
      
      <div className="date-constraints-info">
        {minDate && maxDate && (
          <p className="date-constraints-text">
            Data available from {formatDateForInput(minDate)} to {formatDateForInput(maxDate)}
          </p>
        )}
      </div>
      
      <div className="date-grid">
        <div className="date-field">
          <label className="date-label">Start Date</label>
          <input
            type="date"
            value={formatDateForInput(startDate)}
            onChange={handleStartDateChange}
            min={minDate ? formatDateForInput(minDate) : undefined}
            max={formatDateForInput(endDate)}
            className="date-input"
          />
        </div>
        
        <div className="date-field">
          <label className="date-label">End Date</label>
          <input
            type="date"
            value={formatDateForInput(endDate)}
            onChange={handleEndDateChange}
            min={formatDateForInput(startDate)}
            max={maxDate ? formatDateForInput(maxDate) : formatDateForInput(new Date())}
            className="date-input"
          />
        </div>
      </div>
      
      {/* Quick date range selectors */}
      <div className="date-shortcuts">
        <button
          type="button"
          onClick={createDateShortcut(1)}
          className="date-shortcut-btn"
        >
          Last Month
        </button>
        
        <button
          type="button"
          onClick={createDateShortcut(3)}
          className="date-shortcut-btn"
        >
          Last 3 Months
        </button>
        
        <button
          type="button"
          onClick={createDateShortcut(12)}
          className="date-shortcut-btn"
        >
          Last Year
        </button>
        
        <button
          type="button"
          onClick={createDateShortcut(36)}
          className="date-shortcut-btn"
        >
          Last 3 Years
        </button>
      </div>
    </div>
  );
};

export default DateRangePicker;