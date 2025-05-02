// src/components/CaseIdSelector.jsx
import { useState, useEffect } from 'react';
import './CaseIdSelector.css';
import { getStoredCaseIds } from '../api/strategyApi';

const CaseIdSelector = ({ onSelectCaseId }) => {
  const [caseIds, setCaseIds] = useState([]);
  const [selectedCaseId, setSelectedCaseId] = useState('');
  const [loading, setLoading] = useState(false);

  // Fetch available case IDs on component mount
  useEffect(() => {
    const fetchCaseIds = async () => {
      setLoading(true);
      
      try {
        const data = await getStoredCaseIds();
        setCaseIds(data);
      } catch (err) {
        console.error('Failed to fetch case IDs:', err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchCaseIds();
  }, []);

  const handleCaseIdChange = (e) => {
    const newCaseId = e.target.value;
    setSelectedCaseId(newCaseId);
    
    if (newCaseId) {
      onSelectCaseId(newCaseId);
    }
  };

  return (
    <select
      value={selectedCaseId}
      onChange={handleCaseIdChange}
      className="form-select case-id-selector-select"
      disabled={loading || caseIds.length === 0}
    >
      <option value="">Load saved configuration...</option>
      {caseIds.map((caseId) => (
        <option key={caseId} value={caseId}>
          {caseId}
        </option>
      ))}
    </select>
  );
};

export default CaseIdSelector;