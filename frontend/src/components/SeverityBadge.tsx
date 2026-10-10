import type { Severity } from '../types/evaluation';
import { Badge } from '@/components/ui/badge';

interface SeverityBadgeProps {
  severity?: Severity | string | null;
  className?: string;
}

export function SeverityBadge({ severity, className = '' }: SeverityBadgeProps) {
  if (!severity) return null;

  const sevUpper = severity.toUpperCase();

  let colorClasses = 'bg-slate-800 text-slate-300 border-slate-700';
  if (sevUpper === 'CRITICAL') {
    colorClasses = 'bg-red-950/60 text-red-400 border-red-600/60';
  } else if (sevUpper === 'HIGH') {
    colorClasses = 'bg-orange-950/60 text-orange-400 border-orange-600/60';
  } else if (sevUpper === 'MEDIUM') {
    colorClasses = 'bg-yellow-950/60 text-yellow-400 border-yellow-600/60';
  } else if (sevUpper === 'LOW') {
    colorClasses = 'bg-slate-800/80 text-slate-400 border-slate-600/60';
  }

  return (
    <Badge
      variant="outline"
      className={`font-semibold tracking-wide text-[10px] px-1.5 py-0.5 border ${colorClasses} ${className}`}
    >
      {sevUpper}
    </Badge>
  );
}
