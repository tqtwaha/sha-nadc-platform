# @sha-nadc/mobile — EMT crew companion (Expo + React Native)

A native mobile app for ambulance crews. Mirrors the `/emt` web view:
pick your unit, see the active incident, walk it through the lifecycle,
and clear with a tap to mint a draft SHIF claim.

## Quick start

```bash
# from repo root
pnpm install
cp apps/mobile/.env.example apps/mobile/.env
# edit .env — set EXPO_PUBLIC_SUPABASE_URL + EXPO_PUBLIC_SUPABASE_ANON_KEY
pnpm --filter @sha-nadc/mobile dev
```

Scan the QR code with Expo Go on iOS or Android. The app connects directly
to the same Supabase backend the web platform uses (anon key, RLS-aware).

## Routes

- `/` — unit picker (units with active incidents on top, available below)
- `/unit/[id]` — crew screen with incident card, status buttons, and the
  Clear + Bill finalizer

## Production build (EAS)

```bash
pnpm --filter @sha-nadc/mobile build:android
pnpm --filter @sha-nadc/mobile build:ios
```

Requires `eas login` first.

## What's left

- Realtime subscriptions (incidents/fleet_units) so the unit screen
  pushes status changes without reload.
- Vitals capture form on Clear + Bill (matches web /emt EPCR fields).
- Mapbox view of incident location.
- Clerk auth bridge — currently writes as anon; should attribute the
  crew member like the web `/emt` does via `currentAgent()`.
- Push notifications when a new call is dispatched to this unit.
- Background GPS reporting (Phase 7 TRACKER item).
- Offline-first storage + retry queue.
- Camera for ePCR photos.
