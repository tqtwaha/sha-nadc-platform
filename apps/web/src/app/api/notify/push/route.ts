import { NextRequest, NextResponse } from 'next/server';
import { serviceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Sends an Expo push notification to the most-recently-registered
// device for a given fleet unit.
//
// Looks up the unit's most-recent push_token_registered dispatch_event,
// extracts the Expo token from payload, and POSTs to Expo's push API.
//
// Called from dispatch/actions.ts:assignNearestUnit when a unit is
// assigned to a new incident. Bail silently if no token is registered
// (e.g., crew hasn't opened the mobile app yet).
//
// Auth: same CRON_SECRET pattern as the other /api/* mutating endpoints.

interface PushBody {
  unitId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  priority?: 'default' | 'normal' | 'high';
}

function isAuthorized(req: NextRequest): boolean {
  if (req.headers.get('x-vercel-cron') === '1') return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  let body: PushBody;
  try {
    body = (await req.json()) as PushBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON body' }, { status: 400 });
  }

  if (!body.unitId || !body.title || !body.body) {
    return NextResponse.json(
      { ok: false, error: 'unitId, title, body required' },
      { status: 400 },
    );
  }

  const sb = serviceClient();
  const { data: events } = await sb
    .from('dispatch_events')
    .select('payload, created_at')
    .eq('unit_id', body.unitId)
    .eq('event_type', 'push_token_registered')
    .order('created_at', { ascending: false })
    .limit(1);

  const token =
    events && events.length > 0
      ? (events[0]!.payload as { token?: string }).token
      : null;
  if (!token) {
    return NextResponse.json({ ok: false, error: 'no push token for unit', unitId: body.unitId }, { status: 404 });
  }

  // POST to Expo Push API
  let pushResp: Response;
  try {
    pushResp = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: token,
        title: body.title,
        body: body.body,
        data: body.data ?? {},
        sound: 'default',
        priority: body.priority ?? 'high',
        channelId: 'default',
      }),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'push fetch failed' },
      { status: 502 },
    );
  }

  const expoBody = await pushResp.json().catch(() => ({}));

  await sb.from('dispatch_events').insert({
    unit_id: body.unitId,
    event_type: 'push_sent',
    event_note: `${body.title} → ${body.unitId}`,
    actor_type: 'system',
    payload: { title: body.title, body: body.body, data: body.data, expo: expoBody },
  });

  return NextResponse.json({ ok: true, expo: expoBody });
}
