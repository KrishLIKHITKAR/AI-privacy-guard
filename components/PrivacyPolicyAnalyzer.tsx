import React from 'react';
import type { PolicyChangeOutput, PolicySummaryOutput } from '../types';
import { DocumentTextIcon, CheckCircleIcon, ShieldExclamationIcon } from './Icons';

interface PrivacyPolicyAnalyzerProps {
  previousPolicy: string;
  setPreviousPolicy: (value: string) => void;
  currentPolicy: string;
  setCurrentPolicy: (value: string) => void;
  onAnalyze: () => void;
  diffOutput: PolicyChangeOutput | null;
  summaryOutput: PolicySummaryOutput | null;
  isLoading: boolean;
  error: string | null;
  isComparisonMode: boolean;
  setIsComparisonMode: (value: boolean) => void;
}

const ToggleSwitch: React.FC<{ isEnabled: boolean; onToggle: () => void; }> = ({ isEnabled, onToggle }) => (
    <button
        type="button"
        className={`${
            isEnabled ? 'bg-brand-primary' : 'bg-gray-200'
        } relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2`}
        role="switch"
        aria-checked={isEnabled}
        onClick={onToggle}
    >
        <span
            aria-hidden="true"
            className={`${
                isEnabled ? 'translate-x-5' : 'translate-x-0'
            } pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
        />
    </button>
);


const PrivacyPolicyAnalyzer: React.FC<PrivacyPolicyAnalyzerProps> = ({
  previousPolicy,
  setPreviousPolicy,
  currentPolicy,
  setCurrentPolicy,
  onAnalyze,
  diffOutput,
  summaryOutput,
  isLoading,
  error,
  isComparisonMode,
  setIsComparisonMode
}) => {
  return (
    <div className="bg-brand-surface p-6 rounded-2xl shadow-lg">
      <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
              <DocumentTextIcon className="h-8 w-8 text-brand-primary" />
              <h2 className="text-2xl font-bold text-gray-800">Privacy Policy Analyzer</h2>
          </div>
          <div className="flex items-center gap-2">
              <label htmlFor="comparison-toggle" className="text-sm font-medium text-gray-700">
                Compare with Previous Policy
              </label>
              <ToggleSwitch isEnabled={isComparisonMode} onToggle={() => setIsComparisonMode(!isComparisonMode)} />
          </div>
      </div>
      <p className="text-brand-text-secondary mb-6">
        {isComparisonMode 
            ? "Paste two versions of a policy to get a summary of the changes." 
            : "Get a plain-English summary of a website's privacy policy."}
      </p>

      <div className={`grid gap-6 mb-6 ${isComparisonMode ? 'md:grid-cols-2' : 'grid-cols-1'}`}>
        {isComparisonMode && (
          <div>
            <label htmlFor="previous-policy" className="block text-sm font-medium text-gray-700 mb-1">
              Previous Policy Text
            </label>
            <textarea
              id="previous-policy"
              rows={8}
              className="w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:ring-brand-primary focus:border-brand-primary transition-colors text-brand-text-primary placeholder:text-gray-400"
              value={previousPolicy}
              onChange={(e) => setPreviousPolicy(e.target.value)}
              placeholder="Paste the old policy text here..."
            />
          </div>
        )}
        <div>
          <label htmlFor="current-policy" className="block text-sm font-medium text-gray-700 mb-1">
            {isComparisonMode ? 'New Policy Text' : 'Current Policy Text'}
          </label>
          <textarea
            id="current-policy"
            rows={8}
            className="w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:ring-brand-primary focus:border-brand-primary transition-colors text-brand-text-primary placeholder:text-gray-400"
            value={currentPolicy}
            onChange={(e) => setCurrentPolicy(e.target.value)}
            placeholder="Paste the policy text here..."
          />
        </div>
      </div>

      <div className="text-center mb-6">
        <button
          onClick={onAnalyze}
          disabled={isLoading || !currentPolicy || (isComparisonMode && !previousPolicy)}
          className="px-8 py-3 text-lg font-semibold rounded-full transition-all duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-primary bg-brand-primary text-white shadow-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Analyzing...' : (isComparisonMode ? 'Compare Policies' : 'Analyze Policy')}
        </button>
      </div>

      <div className="mt-6 border-t border-gray-200 pt-6 min-h-[100px]">
        {isLoading && (
            <div className="flex items-center justify-center text-center p-4">
                <svg className="animate-spin h-8 w-8 text-brand-primary mr-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p className="text-md font-semibold text-brand-text-secondary">Analyzing policy...</p>
            </div>
        )}
        {error && (
            <div className="flex flex-col items-center justify-center text-center p-4 bg-red-50 rounded-lg">
                <ShieldExclamationIcon className="h-10 w-10 text-red-500" />
                <p className="mt-2 text-md font-semibold text-red-700">Analysis Failed</p>
                <p className="text-sm text-red-600">{error}</p>
            </div>
        )}
        
        { (diffOutput || summaryOutput) && !isLoading && (
          <div className="animate-fade-in">
            <h3 className="text-lg font-semibold text-gray-800 mb-3">
                {isComparisonMode ? "Summary of Changes" : "Policy Summary"}
            </h3>
            <ul className="space-y-2">
              {(isComparisonMode ? diffOutput?.change_summary : summaryOutput?.summary_points)?.map((point, index) => (
                <li key={index} className="flex items-start gap-3">
                  <CheckCircleIcon className="h-5 w-5 text-brand-secondary flex-shrink-0 mt-0.5" />
                  <span className="text-brand-text-secondary">{point}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

      </div>
    </div>
  );
};

export default PrivacyPolicyAnalyzer;