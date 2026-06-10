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
 * @returns {Object} Formatted configuration object
 */
export const formatStrategyConfig = (ticker, timeFrame, startDate, endDate, strategyParams) => {
  // Convert JavaScript dates to LocalDateTime format expected by Java backend
  const formatDate = (date) => {
    return date.toISOString().replace('Z', '');
  };
  
  return {
    ticker,
    timeFrame,
    startDate: formatDate(startDate),
    endDate: formatDate(endDate),
    strategyNameToParams: strategyParams
  };
};