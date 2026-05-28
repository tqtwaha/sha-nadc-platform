import type { Meta, StoryObj } from '@storybook/react-vite';
import { BrandMark } from './BrandMark';

const meta: Meta<typeof BrandMark> = {
  title: 'Components/BrandMark',
  component: BrandMark,
  tags: ['autodocs'],
  argTypes: { size: { control: { type: 'range', min: 16, max: 96, step: 2 } } },
  args: { size: 30 },
};
export default meta;

type Story = StoryObj<typeof BrandMark>;

export const Default: Story = {};

export const Sizes: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
      <BrandMark size={20} />
      <BrandMark size={30} />
      <BrandMark size={48} />
      <BrandMark size={72} />
    </div>
  ),
};
