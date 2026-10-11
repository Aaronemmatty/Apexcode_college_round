import type { Severity } from '../types/evaluation';
import { AlertOctagon, AlertTriangle, Info, Shield } from 'lucide-react';

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
    Icon: Shield,
    classes: 'bg-[var(--sev-low)]/10 text-[var(--sev-low)] border-[var(--sev-low)]/30',
  };

  if (sevUpper === 'CRITICAL') {
    config = {
      label: 'CRITICAL',
      Icon: AlertOctagon,
      classes: 'bg-[var(--sev-critical)]/10 text-[var(--sev-critical)] border-[var(--sev-critical)]/30',
    };
  } else if (sevUpper === 'HIGH') {
    config = {
      label: 'HIGH',
      Icon: AlertTriangle,
      classes: 'bg-[var(--sev-high)]/10 text-[var(--sev-high)] border-[var(--sev-high)]/30',
    };
  } else if (sevUpper === 'MEDIUM') {
    config = {
      label: 'MEDIUM',
      Icon: Info,
      classes: 'bg-[var(--sev-medium)]/10 text-[var(--sev-medium)] border-[var(--sev-medium)]/30',
    };
  } else if (sevUpper === 'LOW') {
    config = {
      label: 'LOW',
      Icon: Shield,
      classes: 'bg-[var(--sev-low)]/10 text-[var(--sev-low)] border-[var(--sev-low)]/30',
    };
  }

  const { label, Icon, classes } = config;
  const paddingClass = size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-0.5 text-xs';

  return (
    <span
      data-testid="severity-badge"
      className={`inline-flex items-center gap-1 font-mono font-medium tracking-wider rounded-sm border uppercase ${paddingClass} ${classes} ${className}`}
    >
      <Icon className="w-3 h-3 shrink-0 stroke-[2.2]" />
      <span>{label}</span>
    </span>
  );
}
