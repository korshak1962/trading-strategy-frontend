// src/utils/formatters.js
import { parseExchangeTs } from './dates';

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
   * Format an exchange timestamp for display (decision 0.18: exchange wall clock, no
   * conversion). A string is an API LocalDateTime; a Date must be UTC-faked (utils/dates.js
   * parseExchangeTs) — it is formatted with timeZone 'UTC' so the browser zone never applies.
   * @param {string|Date} dateInput - Date to format
   * @param {boolean} [includeTime=true] - Whether to include time
   * @returns {string} Formatted date
   */
  export const formatDate = (dateInput, includeTime = true) => {
    const date = parseExchangeTs(dateInput);
    if (Number.isNaN(date.getTime())) return '';
    
    if (includeTime) {
      return new Intl.DateTimeFormat('en-US', {
        timeZone: 'UTC',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }).format(date);
    }
    
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
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
    
    // Java LocalDateTime has format like: "2023-04-21T14:30:00" (exchange-local wall clock)
    return formatDate(dateTimeString, includeTime);
  };

/**
 * Format a number with an explicit sign ("+1.23", "-1.23", "0.00").
 * Used for P&L amounts only (rule D6), not for yields, drawdowns, prices or ratios.
 * @param {number} num
 * @param {number} [dp=2]
 * @returns {string}
 */
export const formatSigned = (num, dp = 2) =>
  new Intl.NumberFormat('en-US', {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
    signDisplay: 'exceptZero'
  }).format(num);

/**
 * Format a fraction as a signed percentage ("+8.47%"). Same input convention as
 * formatPercent: pass pct / 100. Used for P&L percentages only (rule D6).
 * @param {number} fraction
 * @param {number} [dp=2]
 * @returns {string}
 */
export const formatSignedPercent = (fraction, dp = 2) =>
  new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
    signDisplay: 'exceptZero'
  }).format(fraction);
