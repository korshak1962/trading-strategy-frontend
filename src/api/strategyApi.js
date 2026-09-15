// src/api/strategyApi.js

// Base URL for API
const API_BASE_URL = '/api/strategy';
/**
 * Get available strategies from the server
 * @returns {Promise<Array>} List of available strategies
 */
export const getAvailableTickers = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/available-tickers`);
    if (!response.ok) throw new Error(`Error: ${response.status}`);
    const data = await response.json();
    return data.map(item => item.ticker).filter(Boolean);
  } catch (error) {
    console.error('Failed to fetch available tickers:', error);
    throw error;
  }
};

export const getAvailableStrategies = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/available-strategies`);
    if (!response.ok) {
      throw new Error(`Error: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch available strategies:', error);
    throw error;
  }
};

export const submitStrategies = async (config) => {
  try {
    const response = await fetch(`${API_BASE_URL}/submitStrategies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (!response.ok) throw new Error(`Error: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Failed to submit strategies:', error);
    throw error;
  }
};

export const optimizeStrategies = async (config) => {
  try {
    const response = await fetch(`${API_BASE_URL}/optimize-strategies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (!response.ok) throw new Error(`Error: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Failed to optimize strategies:', error);
    throw error;
  }
};

/**
 * Format the strategy configuration object for the API
 * @param {string} ticker - Stock ticker symbol
 * @param {string} timeFrame - Time frame (MIN5, HOUR, DAY, WEEK, MONTH)
 * @param {Date} startDate - Start date for backtest
 * @param {Date} endDate - End date for backtest
 * @param {Object} strategyParams - Map of strategy names to parameter maps
 * @param {boolean} [longOnly=false] - When true the backend evaluates only the long leg
 *   (short signals are ignored); applies to both backtest and optimize requests
 * @returns {Object} Formatted configuration object
 */
export const formatStrategyConfig = (ticker, timeFrame, startDate, endDate, strategyParams, longOnly = false) => {
  // Convert JavaScript dates to the LocalDateTime format expected by the Java backend. The
  // pickers hand us calendar days, so the range is inclusive of both ends: start at 00:00:00,
  // end at 23:59:59. (toISOString() would give the end day's midnight and drop its bars.)
  const pad = (n) => String(n).padStart(2, '0');
  const formatDate = (date, time) =>
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${time}`;
  
  return {
    ticker,
    timeFrame,
    startDate: formatDate(startDate, '00:00:00'),
    endDate: formatDate(endDate, '23:59:59'),
    strategyNameToParams: strategyParams,
    longOnly
  };
};