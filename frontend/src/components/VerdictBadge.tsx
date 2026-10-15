import { Check, X, AlertTriangle, ShieldCheck } from 'lucide-react';

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
  const isBlocked = vNorm === 'blocked';

  let config = {
    label: 'INCONCLUSIVE',
    Icon: AlertTriangle,
    classes: 'bg-[var(--verdict-inconclusive)]/10 text-[var(--verdict-inconclusive)] border-[var(--verdict-inconclusive)]/30',
    dot: 'bg-[var(--verdict-inconclusive)]',
  };

  if (isHeld) {
    config = {
      label: 'HELD',
      Icon: Check,
      classes: 'bg-[var(--verdict-held)]/10 text-[var(--verdict-held)] border-[var(--verdict-held)]/30 shadow-sm shadow-[var(--verdict-held)]/10',
      dot: 'bg-[var(--verdict-held)]',
    };
  } else if (isViolated) {
    config = {
      label: 'VIOLATED',
      Icon: X,
      classes: 'bg-[var(--verdict-violated)]/10 text-[var(--verdict-violated)] border-[var(--verdict-violated)]/30 shadow-sm shadow-[var(--verdict-violated)]/10',
      dot: 'bg-[var(--verdict-violated)]',
    };
  } else if (isBlocked) {
    config = {
      label: 'BLOCKED',
      Icon: ShieldCheck,
      classes: 'bg-[var(--verdict-blocked)]/10 text-[var(--verdict-blocked)] border-[var(--verdict-blocked)]/30',
      dot: 'bg-[var(--verdict-blocked)]',
    };
  }

  const { label, Icon, classes, dot } = config;
  const paddingClass = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-0.5 text-xs';

  return (
    <span
      data-testid="verdict-badge"
      className={`inline-flex items-center gap-1.5 font-mono font-semibold tracking-wider rounded-none border uppercase select-none ${paddingClass} ${classes} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-none ${dot} shrink-0`} />
      <Icon className="w-3 h-3 shrink-0 stroke-[2.5]" />
      <span>{label}</span>
    </span>
  );
}

