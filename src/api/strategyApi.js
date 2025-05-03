// src/api/strategyApi.js - Fixed version

// Base URL for API
const API_BASE_URL = '/api/strategy';
/**
 * Get available strategies from the server
 * @returns {Promise<Array>} List of available strategies
 */
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

/**
 * Get available tickers from the server
 * @returns {Promise<Array>} List of available tickers with date ranges
 */
export const getAvailableTickers = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/available-tickers`);
    if (!response.ok) {
      throw new Error(`Error: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch available tickers:', error);
    throw error;
  }
};

/**
 * Get stored case IDs from the server
 * @returns {Promise<Array>} List of stored case IDs
 */
export const getStoredCaseIds = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/stored-caseIds`);
    if (!response.ok) {
      throw new Error(`Error: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch stored case IDs:', error);
    throw error;
  }
};

/**
 * Get parameters for a specific case ID
 * @param {string} caseId - The case ID to fetch parameters for
 * @returns {Promise<Array>} List of parameters
 */
export const getParametersByCaseId = async (caseId) => {
  try {
    // Use the correct endpoint URL with path variable
    const response = await fetch(`${API_BASE_URL}/stored-caseIds/${caseId}`);
    
    if (!response.ok) {
      throw new Error(`Error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Failed to fetch parameters for case ID ${caseId}:`, error);
    throw error;
  }
};

/**
 * Submit strategies configuration to the server
 * @param {Object} config - Configuration object with ticker, timeFrame, dates, and strategy parameters
 * @returns {Promise<Object>} Strategy results
 */
export const submitStrategies = async (config) => {
  try {
    const response = await fetch(`${API_BASE_URL}/submitStrategies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(config),
    });
    
    if (!response.ok) {
      throw new Error(`Error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Failed to submit strategies:', error);
    throw error;
  }
};

/**
 * Save strategy parameters
 * @param {Array} params - Array of parameter objects
 * @returns {Promise<number>} Number of saved parameters
 */
export const saveParameters = async (params) => {
  try {
    const response = await fetch(`${API_BASE_URL}/save-parameters`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });
    
    if (!response.ok) {
      throw new Error(`Error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Failed to save parameters:', error);
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
  
  // Format the strategy parameters to match what the backend expects
  const formattedParams = {};
  
  // Convert the UI strategy parameters format to the format expected by the backend
  for (const [strategyName, params] of Object.entries(strategyParams)) {
    formattedParams[strategyName] = {};
    
    for (const [paramName, paramConfig] of Object.entries(params)) {
      // Create a proper ParamVO object for each parameter
      formattedParams[strategyName][paramName] = {
        paramName: paramName,
        strategy: strategyName,
        ticker: ticker,
        timeframe: timeFrame,
        value: paramConfig.value,
        valueString: paramConfig.valueString || paramConfig.value.toString(),
        min: paramConfig.min,
        max: paramConfig.max,
        step: paramConfig.step,
        // Include strategyClass if available
        strategyClass: paramConfig.strategyClass || ""
      };
    }
  }
  
  return {
    ticker,
    timeFrame,
    startDate: formatDate(startDate),
    endDate: formatDate(endDate),
    strategyNameToParams: formattedParams
  };
};