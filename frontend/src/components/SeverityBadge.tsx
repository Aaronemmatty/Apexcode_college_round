import type { Severity } from '../types/evaluation';
import { AlertOctagon, AlertTriangle, Info, Shield, ShieldAlert } from 'lucide-react';

interface SeverityBadgeProps {
  severity?: Severity | string | null;
  className?: string;
  size?: 'sm' | 'default';
}

export function SeverityBadge({ severity, className = '', size = 'default' }: SeverityBadgeProps) {
  if (!severity) return null;

  const sevUpper = String(severity).toUpperCase().trim();

  let config = {
    label: sevUpper,
    Icon: Info,
    classes: 'bg-[var(--sev-info)]/10 text-[var(--sev-info)] border-[var(--sev-info)]/30',
    dot: 'bg-[var(--sev-info)]',
  };

  if (sevUpper === 'CRITICAL') {
    config = {
      label: 'CRITICAL',
      Icon: AlertOctagon,
      classes: 'bg-[var(--sev-critical)]/10 text-[var(--sev-critical)] border-[var(--sev-critical)]/30 shadow-sm shadow-[var(--sev-critical)]/10',
      dot: 'bg-[var(--sev-critical)]',
    };
  } else if (sevUpper === 'HIGH') {
    config = {
      label: 'HIGH',
      Icon: ShieldAlert,
      classes: 'bg-[var(--sev-high)]/10 text-[var(--sev-high)] border-[var(--sev-high)]/30',
      dot: 'bg-[var(--sev-high)]',
    };
  } else if (sevUpper === 'MEDIUM') {
    config = {
      label: 'MEDIUM',
      Icon: AlertTriangle,
      classes: 'bg-[var(--sev-medium)]/10 text-[var(--sev-medium)] border-[var(--sev-medium)]/30',
      dot: 'bg-[var(--sev-medium)]',
    };
  } else if (sevUpper === 'LOW') {
    config = {
      label: 'LOW',
      Icon: Shield,
      classes: 'bg-[var(--sev-low)]/10 text-[var(--sev-low)] border-[var(--sev-low)]/30',
      dot: 'bg-[var(--sev-low)]',
    };
  } else if (sevUpper === 'INFO') {
    config = {
      label: 'INFO',
      Icon: Info,
      classes: 'bg-[var(--sev-info)]/10 text-[var(--sev-info)] border-[var(--sev-info)]/30',
      dot: 'bg-[var(--sev-info)]',
    };
  }

  const { label, Icon, classes, dot } = config;
  const paddingClass = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-0.5 text-xs';

  return (
    <span
      data-testid="severity-badge"
      className={`inline-flex items-center gap-1.5 font-mono font-semibold tracking-wider rounded-none border uppercase select-none ${paddingClass} ${classes} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-none ${dot} shrink-0`} />
      <Icon className="w-3 h-3 stroke-[2.2]" />
      <span>{label}</span>
    </span>
  );
}

