import { forwardRef, type ComponentProps } from 'react';
import { Text } from 'panelui-native/primitives/text';
import { cn } from 'panelui-native/utils/cn';

/**
 * The named text styles. Every string in the app uses one of these rather than
 * a loose size and weight, so the type scale stays on Tailwind's steps.
 */
const STYLES = {
  'heading-4': 'text-3xl font-semibold',
  'heading-5': 'text-2xl font-semibold',
  'heading-6': 'text-xl font-semibold',
  'title-2': 'text-lg font-medium',
  'title-3': 'text-base font-medium',
  'title-4': 'text-sm font-medium',
  'title-5': 'text-xs font-medium',
  'body-3': 'text-base font-normal',
  'body-5': 'text-sm font-medium',
  'body-6': 'text-sm font-normal',
  'caption-3': 'text-xs font-semibold',
  'caption-4': 'text-xs font-medium',
  'caption-5': 'text-xs font-normal',
  /** Frequencies and timers: Geist Mono, which keeps digits in fixed columns. */
  'readout-lg': 'text-4xl font-mono',
  'readout-md': 'text-base font-mono',
  'readout-sm': 'text-sm font-mono',
  'readout-xs': 'text-xs font-mono',
} as const;

export type TypeStyle = keyof typeof STYLES;

type Props = Omit<ComponentProps<typeof Text>, 'size' | 'weight'> & { variant: TypeStyle };

export const T = forwardRef<React.ComponentRef<typeof Text>, Props>(function T(
  { variant, className, ...props },
  ref
) {
  return <Text ref={ref} className={cn(STYLES[variant], className)} {...props} />;
});
