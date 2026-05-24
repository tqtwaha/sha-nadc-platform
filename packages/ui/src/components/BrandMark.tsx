import { cn } from '../lib/cn';

interface Props {
  size?: number;
  className?: string;
}

// SHA mark tile — gradient SHA-blue, consistent across every screen.
export function BrandMark({ size = 30, className }: Props) {
  return (
    <div
      className={cn(
        'inline-flex items-center justify-center font-display font-bold text-t1',
        'select-none',
        className,
      )}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.235),
        background: 'linear-gradient(135deg, oklch(0.45 0.16 230), oklch(0.62 0.18 215))',
        fontSize: Math.round(size * 0.37),
        letterSpacing: 0.4,
      }}
      aria-label="SHA"
    >
      SHA
    </div>
  );
}
