import { useCSSVariable } from 'uniwind';

/** Live theme colours, for the few things a class name cannot reach (icons, the WebView backdrop). */
export function useTokens() {
  const [foreground, muted, primary, primaryForeground, background, warning] = useCSSVariable([
    '--color-foreground',
    '--color-muted-foreground',
    '--color-primary',
    '--color-primary-foreground',
    '--color-background',
    '--color-warning-foreground',
  ]) as (string | undefined)[];

  return {
    foreground: foreground ?? '#f7f8f8',
    muted: muted ?? '#8a8f98',
    primary: primary ?? '#5e6ad2',
    primaryForeground: primaryForeground ?? '#ffffff',
    background: background ?? '#000000',
    warning: warning ?? '#f5d97a',
  };
}

/** The design system's one curve: weighted, decelerating into place. */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;
