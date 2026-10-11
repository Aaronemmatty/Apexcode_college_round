import { Check, X, AlertTriangle } from 'lucide-react';

interface VerdictBadgeProps {
  verdict?: string | null;
  className?: string;
  size?: 'sm' | 'default';
}

export function VerdictBadge({ verdict, className = '', size = 'default' }: VerdictBadgeProps) {
  if (!verdict) return null;

  const vNorm = verdict.toLowerCase().trim();
  const isHeld = vNorm === 'held' || vNorm === 'pass' || vNorm === 'safe';
  const isViolated = vNorm === 'violated' || vNorm === 'fail' || vNorm === 'unsafe';

  let config = {
    label: 'INCONCLUSIVE',
    Icon: AlertTriangle,
    classes: 'bg-[var(--verdict-inconclusive)]/10 text-[var(--verdict-inconclusive)] border-[var(--verdict-inconclusive)]/30',
  };

  if (isHeld) {
    config = {
      label: 'HELD',
      Icon: Check,
      classes: 'bg-[var(--verdict-held)]/10 text-[var(--verdict-held)] border-[var(--verdict-held)]/30',
    };
  } else if (isViolated) {
    config = {
      label: 'VIOLATED',
      Icon: X,
      classes: 'bg-[var(--verdict-violated)]/10 text-[var(--verdict-violated)] border-[var(--verdict-violated)]/30',
    };
  }

  const { label, Icon, classes } = config;
  const paddingClass = size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-0.5 text-xs';

  return (
    <span
      data-testid="verdict-badge"
      className={`inline-flex items-center gap-1 font-mono font-medium tracking-wider rounded-sm border uppercase ${paddingClass} ${classes} ${className}`}
    >
      <Icon className="w-3 h-3 shrink-0 stroke-[2.5]" />
      <span>{label}</span>
    </span>
  );
}
