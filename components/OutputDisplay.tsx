
import React from 'react';
import type { PermissionSummarizationOutput } from '../types';
import RiskBadge from './RiskBadge';
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  ShieldExclamationIcon,
} from './Icons';

interface OutputDisplayProps {
  data: PermissionSummarizationOutput;
}

const BulletPoint: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <li className="flex items-start gap-3">
    <CheckCircleIcon className="h-5 w-5 text-brand-secondary flex-shrink-0 mt-0.5" />
    <span className="text-brand-text-secondary">{children}</span>
  </li>
);

const OutputDisplay: React.FC<OutputDisplayProps> = ({ data }) => {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Access Request</h3>
        <p className="mt-1 text-lg font-semibold text-brand-text-primary">{data.header_line}</p>
      </div>
      
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-gray-50 p-4 rounded-lg">
           <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Summary</h3>
          <p className="text-brand-text-primary">{data.summary_one_liner}</p>
        </div>
        <div className="bg-gray-50 p-4 rounded-lg flex flex-col justify-center">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Risk Level</h3>
          <RiskBadge risk={data.risk_score} />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Details</h3>
        <ul className="space-y-2">
          {data.bullets.map((bullet, index) => (
            <BulletPoint key={index}>{bullet}</BulletPoint>
          ))}
        </ul>
      </div>

      {data.red_flags && data.red_flags.length > 0 && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-r-lg">
          <div className="flex items-center">
            <ExclamationTriangleIcon className="h-6 w-6 text-yellow-500 mr-3" />
            <div>
              <h4 className="font-semibold text-yellow-800">Potential Red Flags</h4>
              <p className="text-sm text-yellow-700">{data.red_flags.join(', ')}</p>
            </div>
          </div>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Privacy Policy</h3>
        <div className="flex items-start gap-3 bg-gray-50 p-4 rounded-lg">
          <InformationCircleIcon className="h-5 w-5 text-gray-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-brand-text-secondary italic">{data.policy_summary}</p>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 p-5 rounded-lg text-center shadow-sm">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Recommendation</h3>
        <p className="text-xl font-bold text-brand-primary">{data.action_hint}</p>
      </div>
    </div>
  );
};

export default OutputDisplay;
