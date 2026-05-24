'use client';
import { useEffect, useRef, useState } from 'react';
import * as LucideIcons from 'lucide-react';
import { ChevronDown, LayoutGrid, type LucideIcon } from 'lucide-react';
import { cn } from '../lib/cn';

// Icon name string instead of a component reference so the item list can be
// defined in server components and passed to this client component without
// the "functions cannot cross the server→client boundary" error.
export interface AppSwitcherItem {
  slug: string;
  label: string;
  href: string;
  iconName: keyof typeof LucideIcons;
}

interface Props {
  items: AppSwitcherItem[];
  activeSlug: string;
  className?: string;
}

// Single 'Apps' button that opens a 3xN grid popover of every screen.
// Ported pattern from sha-nadc v1, now a typed React component.
export function AppSwitcher({ items, activeSlug, className }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const activeLabel = items.find((i) => i.slug === activeSlug)?.label ?? 'Apps';

  // Outside-click to close
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={wrapRef} className={cn('relative inline-flex', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-pill border border-line/60',
          'bg-white/[0.04] hover:bg-white/[0.08] text-t1',
          'font-display text-[12.5px] font-semibold',
          open && 'bg-g/10 border-g/30',
        )}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <LayoutGrid className="size-4 text-g" />
        <span className="tracking-[0.02em]">{activeLabel}</span>
        <ChevronDown
          className={cn(
            'size-[14px] text-t3 transition-transform duration-150',
            open && 'rotate-180',
          )}
        />
      </button>
      {open && (
        <div
          role="menu"
          className={cn(
            'absolute top-[calc(100%+8px)] left-0 z-[9000]',
            'w-[296px] p-2 rounded-[14px] overflow-hidden',
            'bg-[oklch(0.055_0.012_230_/_0.96)] backdrop-blur-md',
            'border border-line2 shadow-modal',
          )}
        >
          <div className="grid grid-cols-3 gap-1.5">
            {items.map(({ slug, label, href, iconName }) => {
              const Icon = (LucideIcons as unknown as Record<string, LucideIcon>)[iconName];
              const isActive = slug === activeSlug;
              return (
                <a
                  key={slug}
                  href={href}
                  className={cn(
                    'flex flex-col items-center justify-center gap-1.5',
                    'px-1 pt-3.5 pb-2.5 rounded-[10px] text-center',
                    'border border-transparent',
                    'transition-colors duration-150 ease-out-strong',
                    isActive
                      ? 'bg-g/10 text-g border-g/25'
                      : 'text-t2 hover:text-t1 hover:bg-white/[0.05] hover:border-white/[0.08]',
                  )}
                  title={label}
                >
                  {Icon ? <Icon className="size-[30px]" /> : null}
                  <span className="text-[11px] font-medium font-display tracking-[0.01em]">
                    {label}
                  </span>
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
