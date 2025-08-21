
import React from 'react';

interface ScenarioSelectorProps {
  scenarios: string[];
  selectedScenario: string;
  onScenarioChange: (scenario: string) => void;
}

const ScenarioSelector: React.FC<ScenarioSelectorProps> = ({ scenarios, selectedScenario, onScenarioChange }) => {
  return (
    <div>
      <h2 className="text-lg font-semibold text-brand-text-primary mb-3">Select a Scenario to Analyze</h2>
      <div className="flex flex-wrap gap-3">
        {scenarios.map((scenario) => (
          <button
            key={scenario}
            onClick={() => onScenarioChange(scenario)}
            className={`px-4 py-2 text-sm font-medium rounded-full transition-all duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-primary ${
              selectedScenario === scenario
                ? 'bg-brand-primary text-white shadow-md'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {scenario}
          </button>
        ))}
      </div>
    </div>
  );
};

export default ScenarioSelector;
