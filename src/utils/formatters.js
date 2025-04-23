// src/utils/formatters.js

/**
 * Format a number with commas and specified decimal places
 * @param {number} num - The number to format
 * @param {number} [decimalPlaces=2] - Number of decimal places
 * @returns {string} Formatted number
 */
export const formatNumber = (num, decimalPlaces = 2) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: decimalPlaces,
      maximumFractionDigits: decimalPlaces
    }).format(num);
  };
  
  /**
   * Format a number as a percentage
   * @param {number} num - The number to format (e.g., 0.12 for 12%)
   * @param {number} [decimalPlaces=2] - Number of decimal places
   * @returns {string} Formatted percentage
   */
  export const formatPercent = (num, decimalPlaces = 2) => {
    return new Intl.NumberFormat('en-US', {
      style: 'percent',
      minimumFractionDigits: decimalPlaces,
      maximumFractionDigits: decimalPlaces
    }).format(num);
  };
  
  /**
   * Format a date for display
   * @param {string|Date} dateInput - Date to format
   * @param {boolean} [includeTime=true] - Whether to include time
   * @returns {string} Formatted date
   */
  export const formatDate = (dateInput, includeTime = true) => {
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    
    if (includeTime) {
      return new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }).format(date);
    }
    
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }).format(date);
  };
  
  /**
   * Calculate win rate from trade counts
   * @param {number} profitableTrades - Number of profitable trades
   * @param {number} lostTrades - Number of losing trades
   * @returns {number} Win rate (0-1)
   */
  export const calculateWinRate = (profitableTrades, lostTrades) => {
    const totalTrades = profitableTrades + lostTrades;
    return totalTrades > 0 ? profitableTrades / totalTrades : 0;
  };
  
  /**
   * Format a LocalDateTime string from Java backend
   * @param {string} dateTimeString - Java LocalDateTime string
   * @param {boolean} [includeTime=true] - Whether to include time
   * @returns {string} Formatted date string
   */
  export const formatLocalDateTime = (dateTimeString, includeTime = true) => {
    if (!dateTimeString) return '';
    
    // Java LocalDateTime has format like: "2023-04-21T14:30:00"
    const date = new Date(dateTimeString);
    return formatDate(date, includeTime);
  };