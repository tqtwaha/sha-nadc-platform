// Foreground GPS reporting for the EMT crew app.
//
// While the crew screen is open, watch the device location and push the
// unit's position to fleet_units.current_lat/lng so its dot moves on the
// wall + dispatch maps in real time from the actual ambulance GPS.
//
// Foreground only (works in Expo Go). True background reporting needs
// expo-task-manager + a dev build + the location background plugin — see
// the tracker (bg-gps card) for that follow-up.
//
// Safe: if permission is denied or expo-location is unavailable, this
// no-ops — the unit keeps its simulated position.

import * as Location from 'expo-location';
import { enqueueWrite } from './queue';

let _sub: Location.LocationSubscription | null = null;
let _lastPush = 0;

const MIN_PUSH_INTERVAL_MS = 8000; // throttle DB writes to ~every 8s

export async function startUnitLocationReporting(unitId: string): Promise<boolean> {
  await stopUnitLocationReporting();
  try {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    if (!granted) {
      console.warn('[location] foreground permission denied');
      return false;
    }
    _sub = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 25 },
      (pos) => {
        const now = Date.now();
        if (now - _lastPush < MIN_PUSH_INTERVAL_MS) return;
        _lastPush = now;
        void enqueueWrite({
          kind: 'update',
          table: 'fleet_units',
          match: { id: unitId },
          values: {
            current_lat: pos.coords.latitude,
            current_lng: pos.coords.longitude,
            last_seen: new Date().toISOString(),
          },
        });
      },
    );
    return true;
  } catch (e) {
    console.warn('[location] watch failed:', e);
    return false;
  }
}

export async function stopUnitLocationReporting(): Promise<void> {
  if (_sub) {
    try { _sub.remove(); } catch { /* ignore */ }
    _sub = null;
  }
}
