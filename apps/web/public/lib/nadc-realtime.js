/* ═══════════════════════════════════════════════════════════════════════════
   NADC REALTIME  v1.0.0  (Phase 4d)
   SHA National Ambulance Dispatch Centre

   Supabase Realtime subscriptions for Phase 4d tables.
   One channel per table — never share channels across tables
   (prevents duplicate delivery on schema-change events).

   Usage:
     // After NACDState.init() and Supabase client is available:
     var sb = supabase.createClient(url, key);
     NACDRealtime.init(sb, { screen: 'dispatch' });

   Screen filter controls which channels are opened:
     'dashboard'  → incidents, units, dispatch_events, qa_flags, supervisor_actions
     'dispatch'   → above + clinical_observations, case_consumables, case_invoices,
                    supervisor_notes (allowlisted view), patient_profiles
     'supervisor' → all tables
     'emt'        → patient_profiles, clinical_observations, case_consumables
     'admin'      → agents, agent_shifts, agent_assignments, sla_policies
     (omit screen → subscribe to all — useful for debugging)

   DELETE events: payload arrives on payload.old, not payload.new.
   QA badge clearing relies on this — handle explicitly below.
   ═══════════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var NACDRealtime = {

    _channels: [],
    _sb: null,

    init: function (supabaseClient, opts) {
      if (!supabaseClient) {
        console.warn('[NACDRealtime] No Supabase client provided — Realtime not active.');
        return;
      }
      this._sb = supabaseClient;
      var screen = (opts && opts.screen) || 'all';
      var self = this;

      // ── Helper — open one channel ────────────────────────────────────────
      function subscribe(table, events, handler) {
        var evList = events || ['INSERT', 'UPDATE', 'DELETE'];
        var ch = supabaseClient.channel('rt:' + table);
        for (var i = 0; i < evList.length; i++) {
          ch.on('postgres_changes',
            { event: evList[i], schema: 'public', table: table },
            handler
          );
        }
        ch.subscribe(function (status) {
          if (status === 'SUBSCRIBED') {
            console.info('[NACDRealtime] Subscribed → ' + table);
          }
        });
        self._channels.push(ch);
      }

      // ── dispatch_events — immutable audit stream ─────────────────────────
      // Rescue Slice 5: 'claims' screen added so NACDRealtime.init(sb,{screen:'claims'})
      // opens this channel and the claims page gets live ePCR notifications from DB.
      if (screen === 'all' || screen === 'dashboard' || screen === 'dispatch' ||
          screen === 'supervisor' || screen === 'claims') {
        subscribe('dispatch_events', ['INSERT'], function (payload) {
          var row = payload.new;
          if (!row) return;
          // Rescue Slice 4 — surface ePCR submissions to the claims screen.
          // Any page listening for 'nadc:epcr:submitted' can inject the claim.
          if (row.event_type === 'epcr_submitted') {
            if (typeof global.dispatchEvent === 'function') {
              try {
                global.dispatchEvent(new CustomEvent('nadc:epcr:submitted', { detail: row }));
              } catch (e) {}
            }
            console.info('[NACDRealtime] dispatch_events — epcr_submitted →',
              row.incident_id, row.event_note);
          } else {
            console.log('[NACDRealtime] dispatch_events INSERT', row.event_type, row.incident_id);
          }
        });
      }

      // ── qa_flags — badge updates and deletions ───────────────────────────
      if (screen === 'all' || screen === 'dashboard' || screen === 'dispatch' || screen === 'supervisor') {
        subscribe('qa_flags', ['INSERT', 'UPDATE', 'DELETE'], function (payload) {
          var row = payload.eventType === 'DELETE' ? payload.old : payload.new;
          if (!row) return;
          // Rescue Slice 5: fire CustomEvent so pages can show DB-confirmed QA badge.
          // Supervisor page uses NACDState in-memory (no duplicate risk — different source).
          if (typeof global.dispatchEvent === 'function') {
            try {
              global.dispatchEvent(new CustomEvent('nadc:qa:flagged', {
                detail: { row: row, eventType: payload.eventType }
              }));
            } catch (e) {}
          }
          console.log('[NACDRealtime] qa_flags', payload.eventType, row.id, row.status);
        });
      }

      // ── supervisor_actions ───────────────────────────────────────────────
      if (screen === 'all' || screen === 'dashboard' || screen === 'dispatch' || screen === 'supervisor') {
        subscribe('supervisor_actions', ['INSERT', 'UPDATE'], function (payload) {
          var row = payload.new;
          if (!row) return;
          // Rescue Slice 5: fire CustomEvent so pages can confirm DB persistence of actions.
          if (typeof global.dispatchEvent === 'function') {
            try {
              global.dispatchEvent(new CustomEvent('nadc:supervisor:action', { detail: row }));
            } catch (e) {}
          }
          console.log('[NACDRealtime] supervisor_actions', row.action_type, row.incident_id);
        });
      }

      // ── supervisor_notes — allowlist enforced at DB view level ───────────
      // Dispatch subscribes to dispatch_visible_supervisor_notes (the view),
      // Supervisor subscribes to the full table.
      if (screen === 'all' || screen === 'supervisor') {
        subscribe('supervisor_notes', ['INSERT'], function (payload) {
          var row = payload.new;
          if (!row) return;
          console.log('[NACDRealtime] supervisor_notes', row.note_type, row.incident_id,
            '| visibleToDispatch:', ['operational','case','dispatch','transfer','takeover','field']
              .indexOf(row.note_type) !== -1);
        });
      }
      if (screen === 'dispatch') {
        // Subscribe to the view, not the base table — RLS enforces the allowlist
        subscribe('dispatch_visible_supervisor_notes', ['INSERT'], function (payload) {
          var row = payload.new;
          if (!row) return;
          console.log('[NACDRealtime] dispatch_visible_supervisor_notes INSERT', row.note_type);
        });
      }

      // ── patient_profiles ─────────────────────────────────────────────────
      if (screen === 'all' || screen === 'dispatch' || screen === 'supervisor' || screen === 'emt') {
        subscribe('patient_profiles', ['INSERT', 'UPDATE'], function (payload) {
          var row = payload.new;
          if (!row) return;
          console.log('[NACDRealtime] patient_profiles', payload.eventType, row.incident_id);
        });
      }

      // ── clinical_observations ────────────────────────────────────────────
      if (screen === 'all' || screen === 'dispatch' || screen === 'supervisor' || screen === 'emt') {
        subscribe('clinical_observations', ['INSERT'], function (payload) {
          var row = payload.new;
          if (!row) return;
          // Rescue Slice 4 — notify EMT/dispatch panels that a new vitals row arrived.
          // The 'nadc:vitals:recorded' event carries the full DB row so listeners
          // can update their UI without a separate re-fetch.
          if (typeof global.dispatchEvent === 'function') {
            try {
              global.dispatchEvent(new CustomEvent('nadc:vitals:recorded', { detail: row }));
            } catch (e) {}
          }
          console.log('[NACDRealtime] clinical_observations INSERT heart_rate:', row.heart_rate,
            'incident:', row.incident_id);
        });
      }

      // ── case_consumables ─────────────────────────────────────────────────
      if (screen === 'all' || screen === 'dispatch' || screen === 'supervisor' || screen === 'emt') {
        subscribe('case_consumables', ['INSERT'], function (payload) {
          var row = payload.new;
          if (!row) return;
          console.log('[NACDRealtime] case_consumables INSERT', row.item_name, row.incident_id);
        });
      }

      // ── case_invoices ────────────────────────────────────────────────────
      // Rescue Slice 5: 'claims' screen added; fires nadc:invoice:updated so the
      // claims page can sync DB status changes without a full page reload.
      if (screen === 'all' || screen === 'dispatch' || screen === 'supervisor' || screen === 'claims') {
        subscribe('case_invoices', ['INSERT', 'UPDATE'], function (payload) {
          var row = payload.new;
          if (!row) return;
          // Surface status changes to any page that cares (claims page listens below).
          if (typeof global.dispatchEvent === 'function') {
            try {
              global.dispatchEvent(new CustomEvent('nadc:invoice:updated', {
                detail: { row: row, eventType: payload.eventType }
              }));
            } catch (e) {}
          }
          console.log('[NACDRealtime] case_invoices', payload.eventType, row.status, row.incident_id);
        });
      }

      // ── agents ───────────────────────────────────────────────────────────
      if (screen === 'all' || screen === 'supervisor' || screen === 'admin') {
        subscribe('agents', ['INSERT', 'UPDATE'], function (payload) {
          var row = payload.new;
          if (!row) return;
          console.log('[NACDRealtime] agents', payload.eventType, row.display_name, row.status);
        });
      }

      // ── agent_shifts ─────────────────────────────────────────────────────
      if (screen === 'all' || screen === 'supervisor' || screen === 'admin') {
        subscribe('agent_shifts', ['INSERT', 'UPDATE', 'DELETE'], function (payload) {
          var row = payload.eventType === 'DELETE' ? payload.old : payload.new;
          if (!row) return;
          console.log('[NACDRealtime] agent_shifts', payload.eventType, row.shift_type, row.shift_date);
        });
      }

      // ── agent_assignments ────────────────────────────────────────────────
      if (screen === 'all' || screen === 'supervisor' || screen === 'admin') {
        subscribe('agent_assignments', ['INSERT', 'UPDATE'], function (payload) {
          var row = payload.new;
          if (!row) return;
          console.log('[NACDRealtime] agent_assignments', payload.eventType,
            row.assignment_type, row.incident_id);
        });
      }

      // ── sla_policies ─────────────────────────────────────────────────────
      if (screen === 'all' || screen === 'admin') {
        subscribe('sla_policies', ['UPDATE'], function (payload) {
          var row = payload.new;
          if (!row) return;
          console.log('[NACDRealtime] sla_policies UPDATE priority:', row.priority,
            'target:', row.target_response_minutes, 'min');
        });
      }

      console.info('[NACDRealtime] Initialised for screen:', screen,
        '|', self._channels.length, 'channels active');
    },

    // Clean up all subscriptions (call on page unload or screen switch)
    destroy: function () {
      for (var i = 0; i < this._channels.length; i++) {
        try { this._channels[i].unsubscribe(); } catch (e) {}
      }
      this._channels = [];
      console.info('[NACDRealtime] All channels unsubscribed.');
    }
  };

  global.NACDRealtime = NACDRealtime;

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
