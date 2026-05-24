import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase, ACTIVE_STATUSES } from '../lib/supabase';

interface Unit {
  id: string;
  type: 'ALS' | 'BLS';
  status: string;
  zone: string;
  active_incident?: { id: string; priority: number; complaint: string } | null;
}

export default function UnitPickerScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [units, setUnits] = useState<Unit[]>([]);

  async function load() {
    setLoading(true);
    const [{ data: u }, { data: i }] = await Promise.all([
      supabase
        .from('fleet_units')
        .select('id, type:unit_type, status, zone')
        .order('id')
        .limit(50),
      supabase
        .from('incidents')
        .select('id, unit_id, priority, complaint')
        .in('status', ACTIVE_STATUSES as unknown as string[])
        .not('unit_id', 'is', null),
    ]);
    const byUnit = new Map(
      (i ?? []).map((inc) => [inc.unit_id, { id: inc.id, priority: inc.priority, complaint: inc.complaint }]),
    );
    setUnits(
      (u ?? []).map((row) => ({
        ...row,
        active_incident: byUnit.get(row.id) ?? null,
      })) as Unit[],
    );
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#50C020" />
      </View>
    );
  }

  const withWork = units.filter((u) => !!u.active_incident);
  const available = units.filter((u) => !u.active_incident && u.status === 'available');

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={undefined /* TODO add RefreshControl */}
      >
        <Text style={styles.h1}>Select your unit</Text>

        {withWork.length > 0 && (
          <>
            <Text style={styles.section}>Units with active incidents</Text>
            {withWork.map((u) => (
              <Pressable
                key={u.id}
                onPress={() => router.push(`/unit/${u.id}`)}
                style={[styles.card, styles.cardActive]}
              >
                <View style={styles.row}>
                  <Text style={styles.unitId}>{u.id}</Text>
                  <Text style={[styles.chip, u.type === 'ALS' ? styles.chipCrit : styles.chipInfo]}>{u.type}</Text>
                </View>
                {u.active_incident && (
                  <>
                    <Text style={styles.complaint}>{u.active_incident.complaint}</Text>
                    <Text style={styles.meta}>P{u.active_incident.priority}</Text>
                  </>
                )}
              </Pressable>
            ))}
          </>
        )}

        <Text style={styles.section}>Available ({available.length})</Text>
        <View style={styles.grid}>
          {available.slice(0, 24).map((u) => (
            <Pressable
              key={u.id}
              onPress={() => router.push(`/unit/${u.id}`)}
              style={styles.tile}
            >
              <Text style={styles.tileTitle}>{u.id}</Text>
              <Text style={styles.tileMeta}>
                {u.type} · {u.zone}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0B0F14' },
  scroll: { padding: 16, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0B0F14' },
  h1: { color: '#FFFFFFF2', fontSize: 20, fontWeight: '600', marginBottom: 4 },
  section: { color: '#FFFFFF66', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.2, marginTop: 12 },
  card: { backgroundColor: '#11161D', borderColor: '#FFFFFF10', borderWidth: 1, borderRadius: 10, padding: 14 },
  cardActive: { backgroundColor: '#FF8C0010', borderColor: '#FF8C0066' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  unitId: { color: '#FFFFFFF2', fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
  chip: { color: '#fff', fontSize: 11, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  chipCrit: { backgroundColor: '#FF3B3030', color: '#FF3B30' },
  chipInfo: { backgroundColor: '#27AAE130', color: '#27AAE1' },
  complaint: { color: '#FFFFFFF2', fontSize: 14, marginTop: 6 },
  meta: { color: '#FFFFFF66', fontSize: 11, marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: {
    width: '23%',
    backgroundColor: '#11161D',
    borderColor: '#FFFFFF10',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
  },
  tileTitle: { color: '#FFFFFFF2', fontSize: 14, fontWeight: '600' },
  tileMeta: { color: '#FFFFFF66', fontSize: 10, marginTop: 2 },
});
