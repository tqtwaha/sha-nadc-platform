import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initQueue, onQueueChange, pendingCount } from '../lib/queue';

export default function RootLayout() {
  const [pending, setPending] = useState(0);

  useEffect(() => {
    initQueue();
    pendingCount().then(setPending);
    return onQueueChange(setPending);
  }, []);

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
      {pending > 0 && (
        <View style={styles.syncBadge} pointerEvents="none">
          <Text style={styles.syncText}>↻ {pending} change{pending === 1 ? '' : 's'} queued offline</Text>
        </View>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  syncBadge: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    backgroundColor: '#FF8C0022',
    borderColor: '#FF8C0066',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  syncText: { color: '#FFAE4D', fontSize: 12, fontWeight: '600' },
});
