
import React from 'react';
import { ShieldCheckIcon, ShieldExclamationIcon } from './Icons';

interface RiskBadgeProps {
  risk: 'Low' | 'Medium' | 'High';
}

const riskStyles = {
  Low: {
    bg: 'bg-green-100',
    text: 'text-green-800',
    icon: <ShieldCheckIcon className="h-5 w-5 mr-1.5" />,
  },
  Medium: {
    bg: 'bg-yellow-100',
    text: 'text-yellow-800',
    icon: <ShieldExclamationIcon className="h-5 w-5 mr-1.5" />,
  },
  High: {
    bg: 'bg-red-100',
    text: 'text-red-800',
    icon: <ShieldExclamationIcon className="h-5 w-5 mr-1.5" />,
  },
};

const RiskBadge: React.FC<RiskBadgeProps> = ({ risk }) => {
  const styles = riskStyles[risk] || riskStyles.Medium;

  return (
    <div
      className={`inline-flex items-center px-3 py-1 rounded-full text-md font-semibold ${styles.bg} ${styles.text}`}
    >
      {styles.icon}
      {risk} Risk
    </div>
  );
};

export default RiskBadge;
