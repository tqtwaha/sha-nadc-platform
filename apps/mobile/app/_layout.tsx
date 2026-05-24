import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#11161D' },
          headerTintColor: '#FFFFFFF2',
          headerTitleStyle: { fontWeight: '600' },
          contentStyle: { backgroundColor: '#0B0F14' },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'SHA NADC · EMT' }} />
        <Stack.Screen name="unit/[id]" options={{ title: 'Crew' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
