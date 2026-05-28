import { useEffect, useState, useCallback } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
  ActivityIndicator,
  Alert,
  TextInput,
  Linking,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase, ACTIVE_STATUSES } from '../../lib/supabase';
import { registerForPushAndStore, listenTapped } from '../../lib/push';
import { enqueueWrite } from '../../lib/queue';

function openInMaps(lat: number, lng: number, label?: string) {
  const q = label ? encodeURIComponent(label) : `${lat},${lng}`;
  // Apple Maps on iOS, Google Maps on Android via geo: scheme
  const url = Platform.select({
    ios: `http://maps.apple.com/?ll=${lat},${lng}&q=${q}`,
    android: `geo:${lat},${lng}?q=${lat},${lng}(${q})`,
    default: `https://www.google.com/maps?q=${lat},${lng}`,
  });
  Linking.openURL(url!).catch(() => {
    Linking.openURL(`https://www.google.com/maps?q=${lat},${lng}`);
  });
}

type Status = 'pending' | 'dispatched' | 'en_route' | 'on_scene' | 'transport' | 'cleared' | 'cancelled';

const NEXT_STATUS: Partial<Record<Status, Status>> = {
  dispatched: 'en_route',
  en_route: 'on_scene',
  on_scene: 'transport',
};
const STATUS_TS: Record<string, string> = {
  dispatched: 'dispatched_at',
  en_route: 'en_route_at',
  on_scene: 'on_scene_at',
  transport: 'transport_at',
  cleared: 'cleared_at',
};
const BTN_LABEL: Partial<Record<Status, string>> = {
  en_route: 'Mark en route',
  on_scene: 'Arrived on scene',
  transport: 'Begin transport',
};

interface Incident {
  id: string;
  display_id: string;
  priority: number;
  complaint: string;
  status: Status;
  address: string;
  zone: string;
  county: string;
  lat: number;
  lng: number;
  caller_name: string | null;
  caller_phone: string | null;
  patient_age: number | null;
  patient_sex: string | null;
  notes: string;
  unit_id: string | null;
  hospital_id: string | null;
}

interface UnitRow {
  id: string;
  type: 'ALS' | 'BLS';
  status: string;
  zone: string;
  provider_id: string | null;
}

export default function CrewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [unit, setUnit] = useState<UnitRow | null>(null);
  const [incident, setIncident] = useState<Incident | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [distance, setDistance] = useState('8');
  const [hr, setHr] = useState('');
  const [bpSys, setBpSys] = useState('');
  const [bpDia, setBpDia] = useState('');
  const [spo2, setSpo2] = useState('');
  const [rr, setRr] = useState('');
  const [gcs, setGcs] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: u }, { data: i }] = await Promise.all([
      supabase
        .from('fleet_units')
        .select('id, type:unit_type, status, zone, provider_id')
        .eq('id', id as string)
        .maybeSingle(),
      supabase
        .from('incidents')
        .select('*')
        .eq('unit_id', id as string)
        .in('status', ACTIVE_STATUSES as unknown as string[])
        .order('priority', { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);
    setUnit(u as UnitRow | null);
    setIncident(i as Incident | null);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime — re-fetch whenever this unit's incidents change
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`mobile-unit-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'incidents', filter: `unit_id=eq.${id}` },
        () => {
          load();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, load]);

  // Register for push notifications + handle taps
  useEffect(() => {
    if (!id) return;
    void registerForPushAndStore(String(id));
    const unsub = listenTapped((response) => {
      const data = response.notification.request.content.data;
      if (data?.incidentId && typeof data.incidentId === 'string') {
        load();
      }
    });
    return unsub;
  }, [id, load]);

  async function advance(next: Status) {
    if (!incident) return;
    setBusy(true);
    const ts = STATUS_TS[next];
    const update: Record<string, unknown> = { status: next };
    if (ts) update[ts] = new Date().toISOString();

    // Route through the offline queue — runs now if online, else persists
    // and replays on reconnect. Optimistically update the UI either way.
    const online = await enqueueWrite({ kind: 'update', table: 'incidents', match: { id: incident.id }, values: update });
    if (unit) {
      await enqueueWrite({ kind: 'update', table: 'fleet_units', match: { id: unit.id }, values: { status: next } });
    }
    await enqueueWrite({
      kind: 'insert',
      table: 'dispatch_events',
      values: {
        incident_id: incident.id,
        unit_id: incident.unit_id,
        event_type: next,
        event_note: `${incident.display_id} → ${next} (mobile)`,
        actor_type: 'emt',
        payload: { source: 'mobile' },
      },
    });

    // Optimistic local update so the UI advances even offline
    setIncident({ ...incident, status: next });
    if (online) await load();
    setBusy(false);
  }

  async function clearAndBill() {
    if (!incident || !unit) return;
    const km = Math.max(0, Number(distance) || 0);
    const rate =
      unit.type === 'ALS'
        ? { base: 3500, perKm: 120, freeKm: 25 }
        : { base: 2000, perKm: 80, freeKm: 25 };
    const chargeable = Math.max(0, km - rate.freeKm);
    const total = rate.base + Math.round(chargeable * rate.perKm);

    Alert.alert('Clear and bill', `Create draft claim for KES ${total.toLocaleString('en-KE')}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        style: 'default',
        onPress: async () => {
          setBusy(true);
          const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
          const { data: last } = await supabase
            .from('claims')
            .select('claim_number')
            .like('claim_number', `CLM-${today}-%`)
            .order('claim_number', { ascending: false })
            .limit(1);
          let next = 1;
          if (last && last.length > 0) {
            const tail = parseInt((last[0]!.claim_number as string).slice(`CLM-${today}-`.length), 10);
            if (!Number.isNaN(tail)) next = tail + 1;
          }
          const claimNumber = `CLM-${today}-${String(next).padStart(4, '0')}`;

          const numOrUndef = (v: string) => (v === '' ? undefined : Number(v));
          const vitalsRaw: Record<string, number | undefined> = {
            hr: numOrUndef(hr),
            bp_sys: numOrUndef(bpSys),
            bp_dia: numOrUndef(bpDia),
            spo2: numOrUndef(spo2),
            rr: numOrUndef(rr),
            gcs: numOrUndef(gcs),
          };
          const vitals: Record<string, number> = {};
          for (const [k, v] of Object.entries(vitalsRaw)) {
            if (v !== undefined && !Number.isNaN(v)) vitals[k] = v;
          }

          const { error: cErr } = await supabase.from('claims').insert({
            claim_number: claimNumber,
            incident_id: incident.id,
            provider_id: unit.provider_id,
            unit_id: unit.id,
            hospital_id: incident.hospital_id,
            chief_complaint: incident.complaint,
            tariff_type: unit.type,
            base_kes: rate.base,
            distance_km: km,
            per_km_kes: rate.perKm,
            free_km: rate.freeKm,
            consumables_kes: 0,
            total_kes: total,
            status: 'draft',
            notes: '',
            vitals: Object.keys(vitals).length > 0 ? vitals : null,
          });
          if (cErr) {
            Alert.alert('Claim insert failed', cErr.message);
            setBusy(false);
            return;
          }
          await supabase
            .from('incidents')
            .update({ status: 'cleared', cleared_at: new Date().toISOString() })
            .eq('id', incident.id);
          await supabase.from('fleet_units').update({ status: 'available' }).eq('id', unit.id);
          await supabase.from('dispatch_events').insert({
            incident_id: incident.id,
            unit_id: unit.id,
            event_type: 'epcr_submitted',
            event_note: `${incident.display_id} cleared, claim ${claimNumber} (mobile, ${km}km, KES ${total})`,
            actor_type: 'emt',
            payload: { source: 'mobile', claim_number: claimNumber, distance_km: km },
          });
          setBusy(false);
          Alert.alert('Cleared', `Claim ${claimNumber} created.`, [
            { text: 'OK', onPress: () => router.replace('/') },
          ]);
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#50C020" />
      </View>
    );
  }

  if (!unit) {
    return (
      <View style={styles.center}>
        <Text style={styles.dim}>Unit not found.</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.unitBar}>
          <Text style={styles.unitId}>{unit.id}</Text>
          <Text style={styles.unitMeta}>
            {unit.type} · {unit.zone} · {unit.status}
          </Text>
        </View>

        {!incident && (
          <View style={styles.card}>
            <Text style={styles.h2}>No active assignment</Text>
            <Text style={styles.dim}>When dispatch sends a call, it will appear here.</Text>
          </View>
        )}

        {incident && (
          <>
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={[styles.priority, priorityStyle(incident.priority)]}>P{incident.priority}</Text>
                <Text style={styles.displayId}>{incident.display_id}</Text>
              </View>
              <Text style={styles.complaint}>{incident.complaint}</Text>
              <Text style={styles.dim}>Status: {incident.status}</Text>

              <View style={styles.kv}>
                <Text style={styles.kvLabel}>Address</Text>
                <Text style={styles.kvVal}>{incident.address}</Text>
              </View>
              <View style={styles.kv}>
                <Text style={styles.kvLabel}>Zone</Text>
                <Text style={styles.kvVal}>
                  {incident.zone} · {incident.county}
                </Text>
              </View>
              <View style={styles.kv}>
                <Text style={styles.kvLabel}>GPS</Text>
                <View style={styles.gpsRow}>
                  <Text style={[styles.kvVal, styles.mono, { flex: 1 }]}>
                    {incident.lat.toFixed(5)}, {incident.lng.toFixed(5)}
                  </Text>
                  <Pressable
                    onPress={() => openInMaps(incident.lat, incident.lng, incident.address)}
                    style={styles.mapsBtn}
                  >
                    <Text style={styles.mapsBtnText}>Open in Maps →</Text>
                  </Pressable>
                </View>
              </View>
              {incident.caller_phone && (
                <View style={styles.kv}>
                  <Text style={styles.kvLabel}>Caller</Text>
                  <View style={styles.gpsRow}>
                    <Text style={[styles.kvVal, { flex: 1 }]}>
                      {incident.caller_name ?? '—'} · {incident.caller_phone}
                    </Text>
                    <Pressable
                      onPress={() => Linking.openURL(`tel:${incident.caller_phone}`)}
                      style={styles.mapsBtn}
                    >
                      <Text style={styles.mapsBtnText}>Call →</Text>
                    </Pressable>
                  </View>
                </View>
              )}
              {(incident.patient_age || incident.patient_sex) && (
                <View style={styles.kv}>
                  <Text style={styles.kvLabel}>Patient</Text>
                  <Text style={styles.kvVal}>
                    {incident.patient_sex ?? '?'}, {incident.patient_age ?? '?'}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.section}>Actions</Text>
              {NEXT_STATUS[incident.status] && (
                <Pressable
                  onPress={() => advance(NEXT_STATUS[incident.status]!)}
                  disabled={busy}
                  style={[styles.btn, styles.btnPrimary]}
                >
                  <Text style={styles.btnPrimaryText}>
                    {BTN_LABEL[NEXT_STATUS[incident.status]!]}
                  </Text>
                </Pressable>
              )}

              {(incident.status === 'transport' || incident.status === 'on_scene') && (
                <>
                  <Text style={[styles.section, { marginTop: 16 }]}>Distance to hospital (km)</Text>
                  <TextInput
                    value={distance}
                    onChangeText={setDistance}
                    keyboardType="decimal-pad"
                    style={styles.input}
                    placeholder="km"
                    placeholderTextColor="#FFFFFF40"
                  />

                  <Text style={[styles.section, { marginTop: 16 }]}>Vitals at handoff (optional)</Text>
                  <View style={styles.vitalsRow}>
                    <VitalInput label="HR" unit="bpm" value={hr} onChange={setHr} />
                    <VitalInput label="BP sys" unit="mmHg" value={bpSys} onChange={setBpSys} />
                    <VitalInput label="BP dia" unit="mmHg" value={bpDia} onChange={setBpDia} />
                  </View>
                  <View style={styles.vitalsRow}>
                    <VitalInput label="SpO₂" unit="%" value={spo2} onChange={setSpo2} />
                    <VitalInput label="RR" unit="/min" value={rr} onChange={setRr} />
                    <VitalInput label="GCS" unit="/15" value={gcs} onChange={setGcs} />
                  </View>

                  <Pressable
                    onPress={clearAndBill}
                    disabled={busy}
                    style={[styles.btn, styles.btnClear]}
                  >
                    <Text style={styles.btnPrimaryText}>{busy ? 'Working…' : 'Clear + Bill'}</Text>
                  </Pressable>
                </>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function VitalInput({
  label,
  unit,
  value,
  onChange,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (s: string) => void;
}) {
  return (
    <View style={styles.vitalCell}>
      <View style={styles.vitalLabelRow}>
        <Text style={styles.vitalLabel}>{label}</Text>
        <Text style={styles.vitalUnit}>{unit}</Text>
      </View>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="numeric"
        placeholder="—"
        placeholderTextColor="#FFFFFF40"
        style={styles.vitalInput}
      />
    </View>
  );
}

function priorityStyle(p: number) {
  switch (p) {
    case 1:
      return { backgroundColor: '#FF3B30', color: '#fff' };
    case 2:
      return { backgroundColor: '#FF8C00', color: '#fff' };
    case 3:
      return { backgroundColor: '#F5B100', color: '#000' };
    default:
      return { backgroundColor: '#27AAE1', color: '#fff' };
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0B0F14' },
  scroll: { padding: 14, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0B0F14' },
  unitBar: { paddingVertical: 4 },
  unitId: { color: '#FFFFFFF2', fontSize: 22, fontWeight: '700' },
  unitMeta: { color: '#FFFFFF66', fontSize: 12, marginTop: 2 },
  card: { backgroundColor: '#11161D', borderColor: '#FFFFFF10', borderWidth: 1, borderRadius: 10, padding: 14 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  priority: { fontSize: 16, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  displayId: { color: '#FFFFFF66', fontSize: 11 },
  complaint: { color: '#FFFFFFF2', fontSize: 18, fontWeight: '600', marginTop: 8 },
  h2: { color: '#FFFFFFF2', fontSize: 16, fontWeight: '600' },
  dim: { color: '#FFFFFF66', fontSize: 12, marginTop: 4 },
  kv: { marginTop: 8 },
  kvLabel: { color: '#FFFFFF66', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 },
  kvVal: { color: '#FFFFFFF2', fontSize: 13, marginTop: 2 },
  mono: { fontVariant: ['tabular-nums'] },
  section: { color: '#FFFFFF66', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 6 },
  btn: { paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginTop: 6 },
  btnPrimary: { backgroundColor: '#27AAE125', borderColor: '#27AAE166', borderWidth: 1 },
  btnClear: { backgroundColor: '#50C02025', borderColor: '#50C02066', borderWidth: 1, marginTop: 12 },
  btnPrimaryText: { color: '#FFFFFFF2', fontSize: 16, fontWeight: '600' },
  input: {
    backgroundColor: '#161C25',
    borderColor: '#FFFFFF10',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    color: '#FFFFFFF2',
    fontSize: 16,
  },
  gpsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mapsBtn: {
    backgroundColor: '#27AAE125',
    borderColor: '#27AAE166',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  mapsBtnText: { color: '#27AAE1', fontSize: 11, fontWeight: '600' },
  vitalsRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  vitalCell: { flex: 1 },
  vitalLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  vitalLabel: { color: '#FFFFFF66', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1 },
  vitalUnit: { color: '#FFFFFF40', fontSize: 9 },
  vitalInput: {
    backgroundColor: '#161C25',
    borderColor: '#FFFFFF10',
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 8,
    color: '#FFFFFFF2',
    fontSize: 15,
    textAlign: 'center',
  },
});
