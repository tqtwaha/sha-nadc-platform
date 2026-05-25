'use client';
import * as LucideIcons from 'lucide-react';
import { type LucideIcon } from 'lucide-react';
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

// Inline 9-app rail. Always visible in the topbar so every surface is one
// click away — matches the v1 prototypes' app-switcher behavior. Each app
// shows its icon + label; active app gets the SHA-green pill. On narrow
// screens (md and below) labels collapse and only icons show.
export function AppSwitcher({ items, activeSlug, className }: Props) {
  return (
    <nav
      className={cn('flex items-center gap-0.5 overflow-x-auto', className)}
      aria-label="App switcher"
    >
      {items.map(({ slug, label, href, iconName }) => {
        const Icon = (LucideIcons as unknown as Record<string, LucideIcon>)[iconName];
        const isActive = slug === activeSlug;
        return (
          <a
            key={slug}
            href={href}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-pill text-[12px] font-display font-medium',
              'transition-colors duration-150 whitespace-nowrap',
              isActive
                ? 'bg-g/15 text-g'
                : 'text-t2 hover:bg-white/[0.06] hover:text-t1',
            )}
            title={label}
          >
            {Icon && <Icon className="size-[14px] shrink-0" />}
            <span className="hidden md:inline">{label}</span>
          </a>
        );
      })}
    </nav>
  );
}
