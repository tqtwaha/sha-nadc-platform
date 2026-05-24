import { cn } from '../lib/cn';
import { BrandMark } from './BrandMark';
import { AppSwitcher, type AppSwitcherItem } from './AppSwitcher';

interface Props {
  title: string;
  subtitle?: string;
  apps: AppSwitcherItem[];
  activeSlug: string;
  rightSlot?: React.ReactNode;
  className?: string;
}

// Unified topbar — same shape on every screen.
// rightSlot is for per-app context (hospital picker, unit picker, etc.).
export function Topbar({ title, subtitle, apps, activeSlug, rightSlot, className }: Props) {
  return (
    <header
      className={cn(
        'flex items-center gap-4 px-5 h-14',
        'bg-bg1/95 border-b border-line',
        'relative z-50',
        className,
      )}
    >
      <a href="/" className="flex items-center gap-2.5 pr-3.5 border-r border-line h-8 no-underline text-t1">
        <BrandMark />
        <div className="leading-tight">
          <div className="font-display font-semibold text-[13px]">{title}</div>
          {subtitle && (
            <div className="font-mono text-[9px] tracking-[1.2px] uppercase text-t3">
              {subtitle}
            </div>
          )}
        </div>
      </a>
      <AppSwitcher items={apps} activeSlug={activeSlug} />
      <div className="ml-auto flex items-center gap-3">{rightSlot}</div>
    </header>
  );
}
