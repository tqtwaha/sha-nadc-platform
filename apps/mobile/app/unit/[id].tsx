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
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase, ACTIVE_STATUSES } from '../../lib/supabase';

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

  async function advance(next: Status) {
    if (!incident) return;
    setBusy(true);
    const ts = STATUS_TS[next];
    const update: Record<string, unknown> = { status: next };
    if (ts) update[ts] = new Date().toISOString();
    const { error } = await supabase.from('incidents').update(update).eq('id', incident.id);
    if (error) {
      Alert.alert('Update failed', error.message);
    } else {
      if (unit) await supabase.from('fleet_units').update({ status: next }).eq('id', unit.id);
      await supabase.from('dispatch_events').insert({
        incident_id: incident.id,
        unit_id: incident.unit_id,
        event_type: next,
        event_note: `${incident.display_id} → ${next} (mobile)`,
        actor_type: 'emt',
        payload: { source: 'mobile' },
      });
      await load();
    }
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
                <Text style={[styles.kvVal, styles.mono]}>
                  {incident.lat.toFixed(5)}, {incident.lng.toFixed(5)}
                </Text>
              </View>
              {incident.caller_phone && (
                <View style={styles.kv}>
                  <Text style={styles.kvLabel}>Caller</Text>
                  <Text style={styles.kvVal}>
                    {incident.caller_name ?? '—'} · {incident.caller_phone}
                  </Text>
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
});
