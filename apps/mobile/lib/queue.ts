// Offline-first write queue for the EMT field app.
//
// Field crews work on patchy rural networks. Every mutating Supabase
// call (status update, ePCR/claim, vitals) goes through enqueueWrite().
// If the device is online it flushes immediately; if offline the op is
// persisted to AsyncStorage and replayed when connectivity returns.
//
// Safe fallback: if AsyncStorage / NetInfo aren't available for any
// reason, writes execute directly — identical to the pre-queue behavior,
// so this can never *block* the existing flow.

import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { supabase } from './supabase';

const QUEUE_KEY = 'nadc_write_queue_v1';

export type WriteOp =
  | { kind: 'update'; table: string; match: Record<string, unknown>; values: Record<string, unknown> }
  | { kind: 'insert'; table: string; values: Record<string, unknown> }
  | { kind: 'upsert'; table: string; values: Record<string, unknown>; onConflict?: string };

interface QueuedOp extends Record<string, unknown> {
  id: string;
  op: WriteOp;
  ts: number;
  tries: number;
}

let _online = true;
let _flushing = false;
const _listeners: Array<(pending: number) => void> = [];

export function onQueueChange(fn: (pending: number) => void) {
  _listeners.push(fn);
  return () => {
    const i = _listeners.indexOf(fn);
    if (i >= 0) _listeners.splice(i, 1);
  };
}

async function readQueue(): Promise<QueuedOp[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedOp[]) : [];
  } catch {
    return [];
  }
}

async function writeQueue(q: QueuedOp[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch {
    /* storage full / unavailable — best effort */
  }
  _listeners.forEach((fn) => fn(q.length));
}

async function execute(op: WriteOp): Promise<{ error: unknown }> {
  if (op.kind === 'update') {
    let q = supabase.from(op.table).update(op.values);
    for (const [k, v] of Object.entries(op.match)) q = q.eq(k, v as never);
    return await q;
  }
  if (op.kind === 'insert') {
    return await supabase.from(op.table).insert(op.values);
  }
  // upsert
  return await supabase
    .from(op.table)
    .upsert(op.values, op.onConflict ? { onConflict: op.onConflict } : undefined);
}

/** Queue (or immediately run) a mutating write. Returns true if it ran
 *  online now, false if it was deferred to the offline queue. */
export async function enqueueWrite(op: WriteOp): Promise<boolean> {
  if (_online) {
    const { error } = await execute(op);
    if (!error) {
      void flush(); // opportunistically drain anything queued earlier
      return true;
    }
    // fall through to persist on error (likely transient network)
  }
  const q = await readQueue();
  q.push({ id: Math.random().toString(36).slice(2), op, ts: Date.now(), tries: 0 });
  await writeQueue(q);
  return false;
}

export async function flush(): Promise<void> {
  if (_flushing || !_online) return;
  _flushing = true;
  try {
    let q = await readQueue();
    if (q.length === 0) return;
    const remaining: QueuedOp[] = [];
    for (const item of q) {
      const { error } = await execute(item.op);
      if (error) {
        item.tries += 1;
        if (item.tries < 25) remaining.push(item); // give up after ~25 tries
      }
    }
    await writeQueue(remaining);
  } finally {
    _flushing = false;
  }
}

export async function pendingCount(): Promise<number> {
  return (await readQueue()).length;
}

// Wire connectivity changes → flush on reconnect.
export function initQueue() {
  try {
    NetInfo.addEventListener((state) => {
      const wasOnline = _online;
      _online = !!state.isConnected;
      if (_online && !wasOnline) void flush();
      _listeners.forEach(async (fn) => fn(await pendingCount()));
    });
    // Drain anything left over from a previous session
    void flush();
  } catch {
    _online = true; // NetInfo unavailable — assume online, writes go direct
  }
}
