import type { Meta, StoryObj } from '@storybook/react-vite';
import { AppSwitcher, type AppSwitcherItem } from './AppSwitcher';

const APPS: AppSwitcherItem[] = [
  { slug: 'wall', label: 'Wall', href: '#', iconName: 'Tv' },
  { slug: 'psap', label: 'PSAP', href: '#', iconName: 'Phone' },
  { slug: 'dispatch', label: 'Dispatch', href: '#', iconName: 'Radar' },
  { slug: 'supervisor', label: 'Supervisor', href: '#', iconName: 'UserCog' },
  { slug: 'emt', label: 'EMT', href: '#', iconName: 'Truck' },
  { slug: 'hospital', label: 'Hospital', href: '#', iconName: 'Hospital' },
  { slug: 'claims', label: 'Claims', href: '#', iconName: 'ReceiptText' },
  { slug: 'providers', label: 'Providers', href: '#', iconName: 'Building2' },
  { slug: 'reports', label: 'Reports', href: '#', iconName: 'ChartColumn' },
  { slug: 'admin', label: 'Admin', href: '#', iconName: 'Shield' },
];

const meta: Meta<typeof AppSwitcher> = {
  title: 'Components/AppSwitcher',
  component: AppSwitcher,
  tags: ['autodocs'],
  argTypes: {
    activeSlug: { control: 'select', options: APPS.map((a) => a.slug) },
  },
  args: { items: APPS, activeSlug: 'dispatch' },
  decorators: [
    (Story) => (
      <div style={{ background: '#11161D', padding: 12, borderRadius: 8 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof AppSwitcher>;

export const Default: Story = {};
export const WallActive: Story = { args: { activeSlug: 'wall' } };
export const ClaimsActive: Story = { args: { activeSlug: 'claims' } };
