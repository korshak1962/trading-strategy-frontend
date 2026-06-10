import { useState, useEffect } from 'react';
import Header from './components/Header';
import StrategySelector from './components/StrategySelector';
import StrategyConfig from './components/StrategyConfig';
import DateRangePicker from './components/DateRangePicker';
import EnhancedResultChart from './components/EnhancedResultChart';
import ReporterStyleChart from './components/ReporterStyleChart';
import ResultChart from './components/ResultChart';
import StrategyResults from './components/StrategyResults';
import TradesTable from './components/TradesTable';
import PerformanceMetricsTable from './components/PerformanceMetricsTable';
import TradeStatisticsTable from './components/TradeStatisticsTable';
import { getAvailableStrategies, getAvailableTickers, submitStrategies, optimizeStrategies, formatStrategyConfig } from './api/strategyApi';
import TickerCombobox from './components/TickerCombobox';

const App = () => {
  // State for available strategies
  const [availableStrategies, setAvailableStrategies] = useState([]);
  const [availableTickers, setAvailableTickers] = useState([]);
  
  // State for selected strategies
  const [selectedStrategies, setSelectedStrategies] = useState({});
  
  // State for ticker and timeframe
  const [ticker, setTicker] = useState('SPY');
  const [timeFrame, setTimeFrame] = useState('DAY');
  
  // State for date range
  const [startDate, setStartDate] = useState(new Date(2023, 0, 1));
  const [endDate, setEndDate] = useState(new Date());
  
  // State for mode, loading and results
  const [mode, setMode] = useState('backtest'); // 'backtest' | 'optimize'
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  const [chartView, setChartView] = useState('enhanced'); // 'enhanced' | 'reporter' | 'simple'

  // Fetch available strategies on component mount
  useEffect(() => {
    const fetchStrategies = async () => {
      try {
        const strategies = await getAvailableStrategies();
        setAvailableStrategies(strategies);
      } catch (err) {
        setError('Failed to load available strategies');
        console.error(err);
      }
    };

    const fetchTickers = async () => {
      try {
        const tickers = await getAvailableTickers();
        setAvailableTickers(tickers);
      } catch (err) {
        console.error('Failed to load tickers:', err);
      }
    };

    fetchStrategies();
    fetchTickers();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const config = formatStrategyConfig(ticker, timeFrame, startDate, endDate, selectedStrategies);
      const result = mode === 'optimize'
        ? await optimizeStrategies(config)
        : await submitStrategies(config);
      setResults(result);
    } catch (err) {
      setError((mode === 'optimize' ? 'Optimization failed: ' : 'Backtest failed: ') + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Add strategy to selected strategies
  const handleAddStrategy = (strategy) => {
    setResults(null);
    setSelectedStrategies(prev => ({
      ...prev,
      [strategy.name]: strategy.parameters.reduce((acc, param) => {
        acc[param.paramName] = param;
        return acc;
      }, {})
    }));
  };

  // Remove strategy from selected strategies
  const handleRemoveStrategy = (strategyName) => {
    setResults(null);
    setSelectedStrategies(prev => {
      const newStrategies = { ...prev };
      delete newStrategies[strategyName];
      return newStrategies;
    });
  };

  // field: 'value' | 'min' | 'max' | 'step' | 'timeframe'
  const handleUpdateParam = (strategyName, paramName, field, value) => {
    setResults(null);
    setSelectedStrategies(prev => ({
      ...prev,
      [strategyName]: {
        ...prev[strategyName],
        [paramName]: {
          ...prev[strategyName][paramName],
          [field]: field === 'timeframe' ? value : Number(value)
        }
      }
    }));
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <Header />
      
      <main className="flex-grow container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Configuration Panel */}
          <div className="lg:col-span-4 bg-white p-6 rounded-lg shadow">
            {/* Mode Toggle */}
            <div className="mb-6">
              <div className="flex border-2 border-blue-600 rounded overflow-hidden">
                <button
                  type="button"
                  className={mode === 'backtest'
                    ? 'flex-1 py-2 text-sm font-semibold bg-blue-600 text-white'
                    : 'flex-1 py-2 text-sm font-medium bg-white text-blue-600 hover:bg-blue-50'}
                  onClick={() => { setMode('backtest'); setResults(null); }}
                >
                  Backtest
                </button>
                <button
                  type="button"
                  className={mode === 'optimize'
                    ? 'flex-1 py-2 text-sm font-semibold bg-blue-600 text-white'
                    : 'flex-1 py-2 text-sm font-medium bg-white text-blue-600 hover:bg-blue-50'}
                  onClick={() => { setMode('optimize'); setResults(null); }}
                >
                  Optimize
                </button>
              </div>
              {mode === 'optimize' && (
                <p className="mt-1 text-xs text-gray-500">Set Min/Max/Step for each parameter to grid-search the best combination.</p>
              )}
            </div>

            <form onSubmit={handleSubmit}>
              {/* Ticker and TimeFrame */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Ticker</label>
                <TickerCombobox
                  value={ticker}
                  onChange={(val) => { setTicker(val); setResults(null); }}
                  tickers={availableTickers}
                />
              </div>
              
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Time Frame</label>
                <select
                  value={timeFrame}
                  onChange={(e) => { setTimeFrame(e.target.value); setResults(null); }}
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
              />
              
              {/* Strategy Selector */}
              <div className="mb-6">
                <h3 className="text-lg font-medium text-gray-900 mb-3">Strategies</h3>
                <StrategySelector
                  availableStrategies={availableStrategies}
                  onAddStrategy={handleAddStrategy}
                />
              </div>
              
              {/* Selected Strategies Configuration */}
              {Object.keys(selectedStrategies).length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-3">Configure Strategies</h3>
                  <StrategyConfig
                    selectedStrategies={selectedStrategies}
                    onRemoveStrategy={handleRemoveStrategy}
                    onUpdateParam={handleUpdateParam}
                    mode={mode}
                  />
                </div>
              )}
              
              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading || Object.keys(selectedStrategies).length === 0}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 disabled:bg-gray-400"
              >
                {loading
                  ? (mode === 'optimize' ? 'Optimizing… (may take minutes)' : 'Processing…')
                  : (mode === 'optimize' ? 'Run Optimization' : 'Run Backtest')}
              </button>
              
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
                  {mode === 'optimize' ? 'Optimization Results' : 'Results'} for {results.ticker}
                </h2>
                
                {/* Chart View Toggle */}
                <div className="flex mb-4 border-b">
                  <button 
                    className={`py-2 px-4 font-medium border-b-2 ${
                      chartView === 'enhanced' 
                        ? 'border-blue-500 text-blue-600' 
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                    onClick={() => setChartView('enhanced')}
                  >
                    Enhanced Chart
                  </button>
                  <button 
                    className={`py-2 px-4 font-medium border-b-2 ${
                      chartView === 'reporter' 
                        ? 'border-blue-500 text-blue-600' 
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                    onClick={() => setChartView('reporter')}
                  >
                    Reporter-Style Chart
                  </button>
                  <button 
                    className={`py-2 px-4 font-medium border-b-2 ${
                      chartView === 'simple' 
                        ? 'border-blue-500 text-blue-600' 
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                    onClick={() => setChartView('simple')}
                  >
                    Simple Chart
                  </button>
                </div>
                
                {/* Chart */}
                <div className="mb-6">
                  {chartView === 'enhanced' ? (
                    <EnhancedResultChart data={results.chartDataDTO} />
                  ) : chartView === 'reporter' ? (
                    <ReporterStyleChart data={results.chartDataDTO} />
                  ) : (
                    <div style={{ height: '400px' }}>
                      <ResultChart data={results.chartDataDTO} />
                    </div>
                  )}
                </div>
                
                {/* Results Summary */}
                <StrategyResults
                  results={results}
                  mode={mode}
                  fileContext={{ ticker, timeFrame, selectedStrategies, startDate, endDate }}
                />
              </div>
            ) : (
              <div className="bg-white p-6 rounded-lg shadow flex items-center justify-center h-64">
                <p className="text-gray-500">
                  {loading ? 'Processing your request...' : 'Configure and run a strategy to see results'}
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