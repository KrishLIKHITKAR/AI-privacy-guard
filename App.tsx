import React, { useState, useEffect, useCallback } from 'react';
import { SCENARIOS, PREVIOUS_POLICY_TEXT, CURRENT_POLICY_TEXT } from './constants';
import type { PermissionSummarizationInput, PermissionSummarizationOutput, PolicyChangeOutput, PolicySummaryOutput } from './types';
import { summarizePermissionRequest, summarizePolicyChange, summarizePolicy } from './services/geminiService';
import ScenarioSelector from './components/ScenarioSelector';
import OutputDisplay from './components/OutputDisplay';
import PrivacyPolicyAnalyzer from './components/PrivacyPolicyAnalyzer';
import { ShieldExclamationIcon, ShieldCheckIcon } from './components/Icons';

const App: React.FC = () => {
  // State for Permission Summarization
  const [currentScenario, setCurrentScenario] = useState<PermissionSummarizationInput>(SCENARIOS[0].value);
  const [output, setOutput] = useState<PermissionSummarizationOutput | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedScenarioLabel, setSelectedScenarioLabel] = useState<string>(SCENARIOS[0].label);

  // State for Policy Analysis
  const [previousPolicy, setPreviousPolicy] = useState<string>(PREVIOUS_POLICY_TEXT);
  const [currentPolicy, setCurrentPolicy] = useState<string>(CURRENT_POLICY_TEXT);
  const [policyDiffOutput, setPolicyDiffOutput] = useState<PolicyChangeOutput | null>(null);
  const [policySummaryOutput, setPolicySummaryOutput] = useState<PolicySummaryOutput | null>(null);
  const [isPolicyLoading, setIsPolicyLoading] = useState<boolean>(false);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [isComparisonMode, setIsComparisonMode] = useState<boolean>(false);


  const handleSummarizePermission = useCallback(async (input: PermissionSummarizationInput) => {
    setIsLoading(true);
    setError(null);
    setOutput(null);
    try {
      const result = await summarizePermissionRequest(input);
      setOutput(result);
    } catch (e) {
      console.error(e);
      setError('Failed to get analysis from AI. Please ensure your API key is configured correctly.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    handleSummarizePermission(currentScenario);
  }, [currentScenario, handleSummarizePermission]);

  const handleScenarioChange = (label: string) => {
    const scenario = SCENARIOS.find(s => s.label === label);
    if (scenario) {
      setSelectedScenarioLabel(label);
      setCurrentScenario(scenario.value);
    }
  };
  
  const handleAnalyzePolicy = async () => {
    setIsPolicyLoading(true);
    setPolicyError(null);
    setPolicyDiffOutput(null);
    setPolicySummaryOutput(null);

    try {
        if (isComparisonMode) {
            const result = await summarizePolicyChange({
                old_policy_excerpt: previousPolicy,
                new_policy_excerpt: currentPolicy,
            });
            setPolicyDiffOutput(result);
        } else {
            const result = await summarizePolicy({
                policy_excerpt: currentPolicy,
            });
            setPolicySummaryOutput(result);
        }
    } catch (e) {
        console.error(e);
        setPolicyError('Failed to get policy analysis from AI. Please try again.');
    } finally {
        setIsPolicyLoading(false);
    }
  };


  return (
    <div className="min-h-screen bg-gray-50 text-brand-text-primary font-sans">
      <main className="container mx-auto p-4 md:p-8 max-w-4xl">
        <header className="text-center mb-8">
          <div className="flex items-center justify-center gap-3">
            <ShieldCheckIcon className="h-10 w-10 text-brand-primary" />
            <h1 className="text-4xl font-bold tracking-tight text-gray-800">
              AI Privacy Guard
            </h1>
          </div>
          <p className="mt-2 text-lg text-brand-text-secondary">
            Simulating how a browser extension analyzes AI permission requests on websites.
          </p>
        </header>

        <div className="bg-brand-surface p-6 rounded-2xl shadow-lg mb-8">
          <ScenarioSelector
            scenarios={SCENARIOS.map(s => s.label)}
            selectedScenario={selectedScenarioLabel}
            onScenarioChange={handleScenarioChange}
          />

          <div className="mt-6 border-t border-gray-200 pt-6">
            {isLoading && (
              <div className="flex flex-col items-center justify-center text-center p-8">
                <svg className="animate-spin h-12 w-12 text-brand-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p className="mt-4 text-lg font-semibold text-brand-text-secondary">Analyzing AI Request...</p>
                <p className="text-sm text-gray-500">Communicating with Gemini API.</p>
              </div>
            )}
            {error && (
              <div className="flex flex-col items-center justify-center text-center p-8 bg-red-50 rounded-lg">
                <ShieldExclamationIcon className="h-12 w-12 text-red-500" />
                <p className="mt-4 text-lg font-semibold text-red-700">An Error Occurred</p>
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}
            {output && !isLoading && <OutputDisplay data={output} />}
          </div>
        </div>
        
        <PrivacyPolicyAnalyzer
            previousPolicy={previousPolicy}
            setPreviousPolicy={setPreviousPolicy}
            currentPolicy={currentPolicy}
            setCurrentPolicy={setCurrentPolicy}
            onAnalyze={handleAnalyzePolicy}
            diffOutput={policyDiffOutput}
            summaryOutput={policySummaryOutput}
            isLoading={isPolicyLoading}
            error={policyError}
            isComparisonMode={isComparisonMode}
            setIsComparisonMode={setIsComparisonMode}
        />

        <footer className="text-center mt-8 text-sm text-gray-500">
          <p>&copy; {new Date().getFullYear()} AI Privacy Guard. All rights reserved.</p>
           <p className="mt-1">This is a demo application and does not represent a real browser extension.</p>
        </footer>
      </main>
    </div>
  );
};

export default App;