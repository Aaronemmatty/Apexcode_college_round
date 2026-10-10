import React from 'react';

interface SeverityBadgeProps {
  severity?: string;
  className?: string;
}

export const SeverityBadge: React.FC<SeverityBadgeProps> = ({ severity = 'LOW', className = '' }) => {
  const sev = (severity || 'LOW').toUpperCase();
  let color = 'bg-blue-500/10 text-blue-400 border-blue-500/30';
  if (sev === 'CRITICAL') {
    color = 'bg-red-500/10 text-red-400 border-red-500/30';
  } else if (sev === 'HIGH') {
    color = 'bg-orange-500/10 text-orange-400 border-orange-500/30';
  } else if (sev === 'MEDIUM') {
    color = 'bg-amber-500/10 text-amber-400 border-amber-500/30';
  }

  return (
    <span
      data-testid="severity-badge"
      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-medium border ${color} ${className}`}
    >
      {sev}
    </span>
  );
};
