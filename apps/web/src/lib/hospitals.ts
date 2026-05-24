// Hospital read-helpers — wraps the receiving-hospital queries the /hospital
// pages need. Joins live incidents + recent claims so each hospital card can
// show what's heading to them right now and what they've recently received.

import 'server-only';
import { serviceClient } from './supabase';

export interface HospitalCore {
  id: string;
  name: string;
  full_name: string;
  level: 4 | 5 | 6;
  is_national_referral: boolean;
  county: string;
  ed_capacity_pct: number;
  diversion_status: 'open' | 'caution' | 'diverting' | 'bypass';
  specialties: string[];
  lat: number;
  lng: number;
}

export interface HospitalListRow extends HospitalCore {
  enRouteCount: number;
  arrivedTodayCount: number;
  claimsLast7d: number;
  totalKesLast7d: number;
}

const EN_ROUTE_STATUSES = ['dispatched', 'en_route', 'on_scene', 'transport'];

export async function listHospitalsWithIncoming(): Promise<HospitalListRow[]> {
  const sb = serviceClient();
  const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  const [
    { data: hospitals, error: hErr },
    { data: incidents, error: iErr },
    { data: claims, error: cErr },
  ] = await Promise.all([
    sb
      .from('hospitals')
      .select(
        'id, name, full_name, level, is_national_referral, county, ed_capacity_pct, diversion_status, specialties, lat, lng',
      )
      .order('level', { ascending: false })
      .order('name'),
    sb
      .from('incidents')
      .select('hospital_id, status, at_hospital_at')
      .not('hospital_id', 'is', null),
    sb.from('claims').select('hospital_id, total_kes, created_at').gte('created_at', since7d),
  ]);
  if (hErr) throw hErr;
  if (iErr) throw iErr;
  if (cErr) throw cErr;

  return (hospitals ?? []).map((h) => {
    const enRoute = (incidents ?? []).filter(
      (i) => i.hospital_id === h.id && EN_ROUTE_STATUSES.includes(i.status),
    ).length;
    const arrivedToday = (incidents ?? []).filter(
      (i) =>
        i.hospital_id === h.id &&
        i.at_hospital_at &&
        (i.at_hospital_at as string) >= since24h,
    ).length;
    const claims7d = (claims ?? []).filter((c) => c.hospital_id === h.id);
    return {
      ...(h as HospitalCore),
      enRouteCount: enRoute,
      arrivedTodayCount: arrivedToday,
      claimsLast7d: claims7d.length,
      totalKesLast7d: claims7d.reduce((a, c) => a + (c.total_kes ?? 0), 0),
    };
  });
}

export interface HospitalDetail extends HospitalCore {
  incoming: IncomingIncident[];
  recentArrivals: IncomingIncident[];
  recentClaims: HospitalClaim[];
}

export interface IncomingIncident {
  id: string;
  display_id: string;
  priority: number;
  complaint: string;
  status: string;
  unit_id: string | null;
  county: string;
  created_at: string;
  dispatched_at: string | null;
  on_scene_at: string | null;
  transport_at: string | null;
}

export interface HospitalClaim {
  id: string;
  claim_number: string;
  chief_complaint: string;
  status: string;
  total_kes: number;
  created_at: string;
}

export async function getHospitalDetail(id: string): Promise<HospitalDetail | null> {
  const sb = serviceClient();
  const { data: h, error: hErr } = await sb
    .from('hospitals')
    .select('*')
    .eq('id', id)
    .single();
  if (hErr) {
    if (hErr.code === 'PGRST116') return null;
    throw hErr;
  }

  const [{ data: incidents, error: iErr }, { data: claims, error: cErr }] = await Promise.all([
    sb
      .from('incidents')
      .select(
        'id, display_id, priority, complaint, status, unit_id, county, created_at, dispatched_at, on_scene_at, transport_at, at_hospital_at',
      )
      .eq('hospital_id', id)
      .order('created_at', { ascending: false })
      .limit(50),
    sb
      .from('claims')
      .select('id, claim_number, chief_complaint, status, total_kes, created_at')
      .eq('hospital_id', id)
      .order('created_at', { ascending: false })
      .limit(10),
  ]);
  if (iErr) throw iErr;
  if (cErr) throw cErr;

  const all = (incidents ?? []) as Array<IncomingIncident & { at_hospital_at: string | null }>;
  const incoming = all.filter((i) => EN_ROUTE_STATUSES.includes(i.status));
  const recentArrivals = all
    .filter((i) => i.status === 'cleared' || !!i.at_hospital_at)
    .slice(0, 10);

  return {
    ...(h as HospitalCore),
    incoming,
    recentArrivals,
    recentClaims: (claims ?? []) as HospitalClaim[],
  };
}
