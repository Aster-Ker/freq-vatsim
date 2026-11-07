// First, and it has to be first: this is what loads the Tailwind pipeline and
// the theme tokens every class name below resolves through.
import '../global.css';

import { useEffect } from 'react';
import { DarkTheme, DefaultTheme, SplashScreen, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useFonts } from 'expo-font';
import { Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold } from '@expo-google-fonts/geist';
import { GeistMono_500Medium } from '@expo-google-fonts/geist-mono';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Uniwind, useCSSVariable } from 'uniwind';
import { PanelUIProvider } from 'panelui-native/provider';
import { useThemeMode } from 'panelui-native/theme';
import { PlayerLayer } from '@/components/player';
import { CaptionsProvider } from '@/lib/captions';
import { FeedProvider } from '@/lib/feed';
import { ListenProvider } from '@/lib/listen';
import { PrefsProvider } from '@/lib/prefs';
import { TunedProvider } from '@/lib/tuned';

// Dark by default: most listening happens at night, beside a sim. Settings can switch it.
Uniwind.setTheme('moon-dark');
void SplashScreen.preventAutoHideAsync();

/**
 * React Navigation paints its own background over every screen; feeding it the
 * live tokens keeps it in step with the PanelUI theme, including on switches.
 */
function ThemedNavigation() {
  const { mode } = useThemeMode();
  const [background, card, text, border, primary] = useCSSVariable([
    '--color-background',
    '--color-card',
    '--color-foreground',
    '--color-border',
    '--color-primary',
  ]) as (string | undefined)[];

  useEffect(() => {
    if (background) void SystemUI.setBackgroundColorAsync(background);
  }, [background]);

  const base = mode === 'dark' ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...base,
    dark: mode === 'dark',
    colors: {
      ...base.colors,
      ...(background ? { background } : null),
      ...(card ? { card } : null),
      ...(text ? { text } : null),
      ...(border ? { border } : null),
      ...(primary ? { primary, notification: primary } : null),
    },
  };

  return (
    <ThemeProvider value={navigationTheme}>
      <Stack screenOptions={{ headerShown: false, animation: 'fade_from_bottom' }} />
      {/* The player sits above every screen so its WebView, and the audio in
          it, survive navigation. */}
      <PlayerLayer />
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    Geist_700Bold,
    GeistMono_500Medium,
  });
  const ready = fontsLoaded || !!fontError;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <PanelUIProvider>
        <PrefsProvider>
          <FeedProvider>
            <ListenProvider>
              <TunedProvider>
                <CaptionsProvider>
                  <ThemedNavigation />
                </CaptionsProvider>
              </TunedProvider>
            </ListenProvider>
          </FeedProvider>
        </PrefsProvider>
      </PanelUIProvider>
    </SafeAreaProvider>
  );
}
