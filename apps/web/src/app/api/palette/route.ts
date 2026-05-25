import { NextRequest, NextResponse } from 'next/server';
import { PROVIDERS } from '@sha-nadc/domain';
import { serviceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Search endpoint for the Cmd+K palette. Returns up to N recent matches
// across incidents + claims + units. Designed for low-latency type-ahead;
// each query is a single round-trip, no joins beyond what's already
// indexed.

const LIMIT = 8;

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  if (q.length < 1) return NextResponse.json({ results: [] });

  const sb = serviceClient();
  const like = `%${q}%`;

  const [{ data: incidents }, { data: claims }, { data: units }, { data: hospitals }] =
    await Promise.all([
      sb
        .from('incidents')
        .select('id, display_id, priority, complaint, status, zone')
        .or(`display_id.ilike.${like},complaint.ilike.${like}`)
        .order('created_at', { ascending: false })
        .limit(LIMIT),
      sb
        .from('claims')
        .select('id, claim_number, chief_complaint, status, total_kes')
        .or(`claim_number.ilike.${like},chief_complaint.ilike.${like}`)
        .order('created_at', { ascending: false })
        .limit(LIMIT),
      sb
        .from('fleet_units')
        .select('id, unit_type, status, zone')
        .ilike('id', like)
        .limit(LIMIT),
      sb
        .from('hospitals')
        .select('id, name, county')
        .or(`name.ilike.${like},county.ilike.${like}`)
        .limit(LIMIT),
    ]);

  type Result = {
    kind: 'incident' | 'claim' | 'unit' | 'hospital' | 'provider';
    href: string;
    title: string;
    subtitle: string;
    badge?: string;
  };
  const results: Result[] = [];

  // Provider matches are local-only (10 entries), no DB call needed
  const qLower = q.toLowerCase();
  for (const p of PROVIDERS) {
    if (p.name.toLowerCase().includes(qLower) || p.id.toLowerCase().includes(qLower)) {
      results.push({
        kind: 'provider',
        href: `/providers/${p.id}`,
        title: p.name,
        subtitle: p.id,
      });
    }
  }

  for (const i of incidents ?? []) {
    results.push({
      kind: 'incident',
      href: `/dispatch/${i.id}`,
      title: i.complaint,
      subtitle: `${i.display_id} · ${i.status} · ${i.zone}`,
      badge: `P${i.priority}`,
    });
  }
  for (const c of claims ?? []) {
    results.push({
      kind: 'claim',
      href: `/claims/${c.id}`,
      title: c.chief_complaint,
      subtitle: `${c.claim_number} · ${c.status} · KES ${c.total_kes.toLocaleString('en-KE')}`,
    });
  }
  for (const u of units ?? []) {
    results.push({
      kind: 'unit',
      href: `/emt/${u.id}`,
      title: u.id,
      subtitle: `${u.unit_type} · ${u.zone} · ${u.status}`,
    });
  }
  for (const h of hospitals ?? []) {
    results.push({
      kind: 'hospital',
      href: `/hospital/${h.id}`,
      title: h.name,
      subtitle: `${h.id} · ${h.county}`,
    });
  }

  return NextResponse.json({ results });
}
