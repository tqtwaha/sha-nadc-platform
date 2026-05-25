// Expo Push Notifications setup. Registers the device with Expo's push
// service and writes the token onto the agents row so dispatchers can
// fan out alerts to the right unit.
//
// Production wiring (when EAS project is provisioned):
//   1. Set EAS_PROJECT_ID in app.json's extra block
//   2. Set up a server route /api/notify/push that hits
//      https://exp.host/--/api/v2/push/send with the stored token
//   3. Call from dispatch/actions.ts:assignNearestUnit when a unit is
//      assigned — push "New P{n} · {complaint} in {zone}" to the crew.

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForPushAndStore(unitId: string): Promise<string | null> {
  if (!Device.isDevice) {
    console.warn('[push] only works on physical devices (not simulators)');
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Dispatch alerts',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF3B30',
    });
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let final = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    final = status;
  }
  if (final !== 'granted') {
    console.warn('[push] permission denied');
    return null;
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId;
  let token: string;
  try {
    const t = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    token = t.data;
  } catch (err) {
    console.warn('[push] getExpoPushTokenAsync failed:', err);
    return null;
  }

  // Store on the agents row keyed by current unit assignment.
  // For now we tag the token to the unit so the dispatch backend can
  // look up the crew's device. When Clerk is wired in mobile, switch to
  // agents.clerk_user_id.
  try {
    await supabase.from('dispatch_events').insert({
      event_type: 'push_token_registered',
      event_note: `Push token registered for unit ${unitId}`,
      actor_type: 'emt',
      unit_id: unitId,
      payload: { token, platform: Platform.OS },
    });
  } catch (err) {
    console.warn('[push] event log failed:', err);
  }

  return token;
}

export function listenForeground(handler: (notification: Notifications.Notification) => void) {
  const sub = Notifications.addNotificationReceivedListener(handler);
  return () => sub.remove();
}

export function listenTapped(
  handler: (response: Notifications.NotificationResponse) => void,
) {
  const sub = Notifications.addNotificationResponseReceivedListener(handler);
  return () => sub.remove();
}
