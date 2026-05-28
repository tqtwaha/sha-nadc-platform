import type { AppSwitcherItem } from '@sha-nadc/ui';

// Single source of truth for the app switcher across every screen.
// Order: operational flow first (PSAP → Dispatch → Field → Hospital),
// then back-office (Claims → Providers → Admin).
//
// iconName is a string keyed against lucide-react's named exports so this
// list can be defined in a server component and passed to <AppSwitcher>
// (a client component) without crossing the function-prop boundary.
export const APPS: AppSwitcherItem[] = [
  { slug: 'wall',       label: 'Wall',       href: '/wall',             iconName: 'Tv' },
  { slug: 'psap',       label: 'PSAP',       href: '/psap',             iconName: 'Phone' },
  { slug: 'dispatch',   label: 'Dispatch',   href: '/dispatch',         iconName: 'Radar' },
  { slug: 'supervisor', label: 'Supervisor', href: '/supervisor',       iconName: 'UserCog' },
  { slug: 'emt',        label: 'EMT',        href: '/emt',              iconName: 'Truck' },
  { slug: 'hospital',   label: 'Hospital',   href: '/hospital',         iconName: 'Hospital' },
  { slug: 'claims',     label: 'Claims',     href: '/claims',           iconName: 'ReceiptText' },
  { slug: 'providers',  label: 'Providers',  href: '/providers',        iconName: 'Building2' },
  { slug: 'reports',    label: 'Reports',    href: '/reports',          iconName: 'ChartColumn' },
  { slug: 'admin',      label: 'Admin',      href: '/admin/users',      iconName: 'Shield' },
];
