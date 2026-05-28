import type { Meta, StoryObj } from '@storybook/react-vite';
import { Topbar } from './Topbar';
import { Chip } from './Chip';
import type { AppSwitcherItem } from './AppSwitcher';

const APPS: AppSwitcherItem[] = [
  { slug: 'wall', label: 'Wall', href: '#', iconName: 'Tv' },
  { slug: 'psap', label: 'PSAP', href: '#', iconName: 'Phone' },
  { slug: 'dispatch', label: 'Dispatch', href: '#', iconName: 'Radar' },
  { slug: 'supervisor', label: 'Supervisor', href: '#', iconName: 'UserCog' },
  { slug: 'emt', label: 'EMT', href: '#', iconName: 'Truck' },
  { slug: 'hospital', label: 'Hospital', href: '#', iconName: 'Hospital' },
  { slug: 'claims', label: 'Claims', href: '#', iconName: 'ReceiptText' },
  { slug: 'providers', label: 'Providers', href: '#', iconName: 'Building2' },
  { slug: 'admin', label: 'Admin', href: '#', iconName: 'Shield' },
];

const meta: Meta<typeof Topbar> = {
  title: 'Components/Topbar',
  component: Topbar,
  parameters: { layout: 'fullscreen' },
  args: {
    title: 'NADC · Dispatch',
    subtitle: 'Active incident queue',
    apps: APPS,
    activeSlug: 'dispatch',
  },
};
export default meta;

type Story = StoryObj<typeof Topbar>;

export const Default: Story = {};

export const WithRightSlot: Story = {
  args: {
    title: 'NADC · Claims',
    subtitle: 'SHA payments',
    activeSlug: 'claims',
    rightSlot: <Chip tone="info">42 total</Chip>,
  },
};

export const CriticalContext: Story = {
  args: {
    title: 'NADC · Wall',
    subtitle: 'LED operations',
    activeSlug: 'wall',
    rightSlot: <Chip tone="crit">3 P1 active</Chip>,
  },
};
