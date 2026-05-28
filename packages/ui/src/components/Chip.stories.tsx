import type { Meta, StoryObj } from '@storybook/react-vite';
import { Chip } from './Chip';

const meta: Meta<typeof Chip> = {
  title: 'Components/Chip',
  component: Chip,
  tags: ['autodocs'],
  argTypes: {
    tone: {
      control: 'select',
      options: ['crit', 'warn', 'caution', 'ok', 'info', 'muted'],
    },
    children: { control: 'text' },
  },
  args: { tone: 'info', children: 'P1' },
};
export default meta;

type Story = StoryObj<typeof Chip>;

export const Playground: Story = {};

export const AllTones: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <Chip tone="crit">P1 critical</Chip>
      <Chip tone="warn">P2 warning</Chip>
      <Chip tone="caution">P3 caution</Chip>
      <Chip tone="ok">Cleared</Chip>
      <Chip tone="info">En route</Chip>
      <Chip tone="muted">Off duty</Chip>
    </div>
  ),
};

export const StatusExamples: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <Chip tone="crit">Pending</Chip>
      <Chip tone="warn">Dispatched</Chip>
      <Chip tone="info">Transport</Chip>
      <Chip tone="ok">Paid</Chip>
      <Chip tone="muted">A-014 · ALS</Chip>
    </div>
  ),
};
