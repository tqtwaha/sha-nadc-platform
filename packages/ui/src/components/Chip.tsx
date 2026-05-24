import { cn } from '../lib/cn';

type Tone = 'crit' | 'warn' | 'caution' | 'ok' | 'info' | 'muted';

interface Props {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}

// One chip system, parameterised by tone. Replaces the half-dozen ad-hoc
// chip styles scattered across v1.
const toneStyles: Record<Tone, string> = {
  crit:    'bg-p1/15 text-p1 border-p1/30',
  warn:    'bg-p2/15 text-p2 border-p2/30',
  caution: 'bg-p3/15 text-p3 border-p3/30',
  ok:      'bg-ok/15 text-ok border-ok/30',
  info:    'bg-b2/15 text-b2 border-b2/30',
  muted:   'bg-white/[0.06] text-t2 border-line2',
};

export function Chip({ tone = 'muted', className, children }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-sm border',
        'font-display font-bold text-[11px] tracking-[0.4px] uppercase leading-tight',
        toneStyles[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
