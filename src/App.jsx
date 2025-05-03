import { useState, useEffect } from "react";
import Header from "./components/Header";
import StrategySelector from "./components/StrategySelector";
import StrategyConfig from "./components/StrategyConfig";
import DateRangePicker from "./components/DateRangePicker";
import ReporterStyleChart from "./components/ReporterStyleChart";
import StrategyResults from "./components/StrategyResults";
import {
  getAvailableStrategies,
  getAvailableTickers,
  submitStrategies,
  formatStrategyConfig,
  getParametersByCaseId,
  saveParameters,
} from "./api/strategyApi";

const App = () => {
  // State for available strategies
  const [availableStrategies, setAvailableStrategies] = useState([]);

  // State for available tickers
  const [availableTickers, setAvailableTickers] = useState([]);

  // State for selected strategies
  const [selectedStrategies, setSelectedStrategies] = useState({});

  // State for ticker and timeframe
  const [ticker, setTicker] = useState("");
  const [timeFrame, setTimeFrame] = useState("DAY");

  // State for date range
  const [startDate, setStartDate] = useState(new Date(2023, 0, 1));
  const [endDate, setEndDate] = useState(new Date());

  // State for loading and results
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  // State for case ID loading
  const [loadingCaseId, setLoadingCaseId] = useState(false);

  // State for saving configuration
  const [saveConfigCaseId, setSaveConfigCaseId] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Utility function to safely convert string date to Date object
  const safeParseDate = (dateString, fallback) => {
    try {
      const date = new Date(dateString);
      return isNaN(date.getTime()) ? fallback : date;
    } catch (e) {
      console.warn("Error parsing date:", e);
      return fallback;
    }
  };

  // Fetch available strategies and tickers on component mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch strategies
        const strategies = await getAvailableStrategies();
        setAvailableStrategies(strategies);

        // Fetch tickers
        const tickers = await getAvailableTickers();
        setAvailableTickers(tickers);

        // Set default ticker if available
        if (tickers.length > 0) {
          setTicker(tickers[0].ticker);

          // Update date range based on ticker data availability
          setStartDate(new Date(tickers[0].minDate));
          setEndDate(new Date(tickers[0].maxDate));
        }
      } catch (err) {
        setError("Failed to load initial data");
        console.error(err);
      }
    };

    fetchData();
  }, []);

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const config = formatStrategyConfig(
        ticker,
        timeFrame,
        startDate,
        endDate,
        selectedStrategies
      );

      const result = await submitStrategies(config);
      setResults(result);
    } catch (err) {
      setError("Failed to submit strategies: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Add strategy to selected strategies
  const handleAddStrategy = (strategy) => {
    setSelectedStrategies((prev) => ({
      ...prev,
      [strategy.name]: strategy.parameters.reduce((acc, param) => {
        acc[param.paramName] = param;
        return acc;
      }, {}),
    }));
  };

  // Remove strategy from selected strategies
  const handleRemoveStrategy = (strategyName) => {
    setSelectedStrategies((prev) => {
      const newStrategies = { ...prev };
      delete newStrategies[strategyName];
      return newStrategies;
    });
  };

  // Update parameter for a strategy
  const handleUpdateParam = (strategyName, paramName, value) => {
    setSelectedStrategies((prev) => ({
      ...prev,
      [strategyName]: {
        ...prev[strategyName],
        [paramName]: {
          ...prev[strategyName][paramName],
          value: Number(value),
        },
      },
    }));
  };

  // Function to handle loading parameters by case ID
  const handleLoadCaseId = async (caseId) => {
    if (!caseId) return;

    setLoadingCaseId(true);
    setError(null);

    try {
      const params = await getParametersByCaseId(caseId);

      if (!params || params.length === 0) {
        setError(`No parameters found for case ID: ${caseId}`);
        return;
      }

      // Group parameters by strategy name
      const strategiesByName = {};
      const firstParam = params[0];

      // Set ticker and timeframe from the first parameter
      if (firstParam.ticker) {
        setTicker(firstParam.ticker);
      }

      if (firstParam.timeframe) {
        setTimeFrame(firstParam.timeframe);
      }

      // Process parameters
      params.forEach((param) => {
        if (!strategiesByName[param.strategy]) {
          strategiesByName[param.strategy] = {};
        }

        // Create a parameter object compatible with our app's state structure
        const strategy = availableStrategies.find(
          (s) => s.name === param.strategy
        );
        const paramTemplate = strategy?.parameters.find(
          (p) => p.paramName === param.paramName
        );

        if (paramTemplate) {
          strategiesByName[param.strategy][param.paramName] = {
            ...paramTemplate,
            value: param.value,
            valueString: param.valueString,
          };
        }
      });

      // Update selected strategies state
      setSelectedStrategies(strategiesByName);

      // Find the ticker date range if we have a new ticker
      if (firstParam.ticker) {
        const tickerInfo = availableTickers.find(
          (t) => t.ticker === firstParam.ticker
        );
        if (tickerInfo) {
          // Update date range based on ticker data availability
          setStartDate(new Date(tickerInfo.minDate));
          setEndDate(new Date(tickerInfo.maxDate));
        }
      }
    } catch (err) {
      setError(`Failed to load configuration: ${err.message}`);
    } finally {
      setLoadingCaseId(false);
    }
  };

  // New function to handle saving configurations
  const handleSaveConfig = async (e) => {
    e.preventDefault();

    if (!saveConfigCaseId.trim()) {
      setError("Please enter a Case ID to save the configuration");
      return;
    }

    setSavingConfig(true);
    setSaveSuccess(false);
    setError(null);

    try {
      // Prepare parameters to save
      const params = [];

      // Convert selected strategies to parameter objects
      Object.entries(selectedStrategies).forEach(
        ([strategyName, strategyParams]) => {
          Object.entries(strategyParams).forEach(([paramName, param]) => {
            params.push({
              ticker: ticker,
              timeframe: timeFrame,
              strategy: strategyName,
              caseId: saveConfigCaseId.trim(),
              paramName: paramName,
              value: param.value,
              valueString: param.valueString || param.value.toString(),
              min: param.min,
              max: param.max,
              step: param.step,
              strategyClass: param.strategyClass || "",
            });
          });
        }
      );

      // Save parameters to server
      const savedCount = await saveParameters(params);

      setSaveSuccess(true);
      console.log(`Successfully saved ${savedCount} parameters`);
    } catch (err) {
      setError(`Failed to save configuration: ${err.message}`);
    } finally {
      setSavingConfig(false);
      // Clear the success message after a delay
      if (saveSuccess) {
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <Header />

      <main className="flex-grow container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Configuration Panel */}
          <div className="lg:col-span-4 bg-white p-6 rounded-lg shadow">
            <form onSubmit={handleSubmit}>
              {/* Ticker and TimeFrame */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Ticker
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={ticker}
                    onChange={(e) => {
                      setTicker(e.target.value);
                    }}
                    onBlur={() => {
                      // When user finishes typing, check if input matches a ticker
                      const selectedTickerData = availableTickers.find(
                        (t) => t.ticker === ticker
                      );
                      if (selectedTickerData) {
                        const min = safeParseDate(
                          selectedTickerData.minDate,
                          startDate
                        );
                        const max = safeParseDate(
                          selectedTickerData.maxDate,
                          endDate
                        );
                        setStartDate(min);
                        setEndDate(max);
                      }
                    }}
                    className="w-full p-2 pr-8 border rounded"
                    list="ticker-options"
                    placeholder="Type to search tickers..."
                    required
                  />
                  {ticker && (
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      onClick={() => setTicker("")}
                      aria-label="Clear ticker"
                    >
                      ×
                    </button>
                  )}
                  <datalist id="ticker-options">
                    {availableTickers.map((tickerData) => (
                      <option
                        key={tickerData.ticker}
                        value={tickerData.ticker}
                      />
                    ))}
                  </datalist>
                </div>
                {ticker &&
                  !availableTickers.some((t) => t.ticker === ticker) && (
                    <p className="mt-1 text-sm text-red-600">
                      Please select a valid ticker from the list
                    </p>
                  )}
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Time Frame
                </label>
                <select
                  value={timeFrame}
                  onChange={(e) => setTimeFrame(e.target.value)}
                  className="w-full p-2 border rounded"
                >
                  <option value="MIN5">5 Minutes</option>
                  <option value="HOUR">Hour</option>
                  <option value="DAY">Day</option>
                  <option value="WEEK">Week</option>
                  <option value="MONTH">Month</option>
                </select>
              </div>

              {/* Date Range Picker */}
              <DateRangePicker
                startDate={startDate}
                endDate={endDate}
                onStartDateChange={setStartDate}
                onEndDateChange={setEndDate}
                minDate={
                  availableTickers.find((t) => t.ticker === ticker)?.minDate
                    ? new Date(
                        availableTickers.find(
                          (t) => t.ticker === ticker
                        ).minDate
                      )
                    : null
                }
                maxDate={
                  availableTickers.find((t) => t.ticker === ticker)?.maxDate
                    ? new Date(
                        availableTickers.find(
                          (t) => t.ticker === ticker
                        ).maxDate
                      )
                    : null
                }
              />

              {/* Strategy Selector with Case ID Selector */}
              <div className="mb-6">
                <h3 className="text-lg font-medium text-gray-900 mb-3">
                  Strategies
                </h3>
                <StrategySelector
                  availableStrategies={availableStrategies}
                  selectedStrategies={selectedStrategies}
                  onAddStrategy={handleAddStrategy}
                  onLoadCaseId={handleLoadCaseId}
                />
              </div>

              {/* Loading indicator for case ID */}
              {loadingCaseId && (
                <div className="mb-4 p-2 bg-blue-50 text-blue-700 rounded text-center">
                  Loading saved configuration...
                </div>
              )}

              {/* Selected Strategies Configuration */}
              {Object.keys(selectedStrategies).length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-3">
                    Configure Strategies
                  </h3>
                  <StrategyConfig
                    selectedStrategies={selectedStrategies}
                    onRemoveStrategy={handleRemoveStrategy}
                    onUpdateParam={handleUpdateParam}
                  />
                </div>
              )}

              {/* Submit and Save Buttons */}
              <div className="flex flex-col gap-4 mb-6">
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={
                      loading ||
                      loadingCaseId ||
                      Object.keys(selectedStrategies).length === 0 ||
                      !ticker ||
                      !availableTickers.some((t) => t.ticker === ticker)
                    }
                    className="flex-1 bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 disabled:bg-gray-400"
                  >
                    {loading ? "Processing..." : "Run Backtest"}
                  </button>
                </div>

                {/* Save Configuration Section */}
                <div className="border-t pt-4 mt-2">
                  <h3 className="text-lg font-medium text-gray-900 mb-3">
                    Save Configuration
                  </h3>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={saveConfigCaseId}
                      onChange={(e) => setSaveConfigCaseId(e.target.value)}
                      placeholder="Enter Case ID"
                      className="flex-grow p-2 border rounded"
                    />
                    <button
                      type="button"
                      onClick={handleSaveConfig}
                      disabled={
                        savingConfig ||
                        Object.keys(selectedStrategies).length === 0 ||
                        !saveConfigCaseId.trim() ||
                        !ticker
                      }
                      className="bg-green-600 text-white py-2 px-4 rounded hover:bg-green-700 disabled:bg-gray-400"
                    >
                      {savingConfig ? "Saving..." : "Save Config"}
                    </button>
                  </div>
                  {saveSuccess && (
                    <div className="mt-2 p-2 bg-green-100 text-green-700 rounded text-sm">
                      Configuration saved successfully!
                    </div>
                  )}
                </div>
              </div>

              {error && (
                <div className="mt-4 p-3 bg-red-100 text-red-700 rounded">
                  {error}
                </div>
              )}
            </form>
          </div>

          {/* Results Panel */}
          <div className="lg:col-span-8">
            {results ? (
              <div className="bg-white p-6 rounded-lg shadow">
                <h2 className="text-xl font-bold mb-4">
                  Results for {results.ticker}
                </h2>

                {/* Chart */}
                <div className="mb-6">
                  <ReporterStyleChart data={results.chartDataDTO} />
                </div>

                {/* Results Summary */}
                <StrategyResults results={results} />
              </div>
            ) : (
              <div className="bg-white p-6 rounded-lg shadow flex items-center justify-center h-64">
                <p className="text-gray-500">
                  {loading
                    ? "Processing your request..."
                    : "Configure and run a strategy to see results"}
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="py-4 bg-gray-800 text-white text-center">
        <p>Strategy Backtesting Tool &copy; {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
};

export default App;
