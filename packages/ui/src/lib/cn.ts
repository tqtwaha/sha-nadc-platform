import clsx, { type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Standard shadcn helper — merges class names while resolving Tailwind conflicts.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
