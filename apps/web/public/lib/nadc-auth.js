/* ═══════════════════════════════════════════════════════════════════════════
   NADC AUTH  v1.2.0  (Rescue Slice 3 — demo-mode overlay fix)
   SHA National Ambulance Dispatch Centre

   Clerk JWT → Supabase auth bridge.

   v5 API notes (differs from v4):
   - The CDN script auto-inits a singleton on window.Clerk using the
     data-clerk-publishable-key attribute on its own <script> tag.
   - window.Clerk is the INSTANCE, not a constructor — no `new`.
   - Call window.Clerk.load() to await initialisation, then check
     window.Clerk.user to determine session state.
   - The Clerk frontend-API domain is base64-encoded inside the publishable
     key itself: atob(pk.split('_')[2]).replace(/\$$/, '')

   Call after /api/config resolves:
     NACDAuth.init(cfg, 'dispatch');
     // cfg: { supabaseUrl, supabaseAnonKey, clerkPublishableKey }

   Degrades gracefully:
     - No supabaseUrl / supabaseAnonKey → info + demo mode (overlay dismissed)
     - No clerkPublishableKey → warn + anon Supabase (overlay dismissed)
     - Bad key format (domain decode fails) → warn + anon (overlay dismissed)
     - Clerk CDN unreachable → warn + anon (overlay dismissed)
     - Clerk loads but no active session → openSignIn modal + anon Realtime
     - JWT template "supabase" not found → warn + anon
     - Supabase JS not loaded → warn + demo mode (overlay dismissed)
     - Any synchronous throw inside init → catch + demo mode (overlay dismissed)

   Prerequisites (one-time Clerk dashboard config):
     1. JWT template named "supabase":
          Signing algorithm: HS256
          Signing key: [Supabase JWT Secret from project settings → API]
          Claims: { "role": "{{user.public_metadata.role}}",
                    "provider_id": "{{user.public_metadata.provider_id}}" }
     2. Each user: publicMetadata.role set to their Clerk role
        Provider users also need publicMetadata.provider_id set to their
        providers.id UUID (from 06_provider_seed.sql).
   ═══════════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var NACDAuth = {

    init: function (cfg, screenName) {
      var self = this;
      try {
        this._init(cfg, screenName);
      } catch (e) {
        console.warn('[NACDAuth] Unexpected error during init:', e && e.message,
          '— dismissing overlay in demo mode.');
        self._notifyReady(false, null);
      }
    },

    /* Separated so the outer try/catch above can act as a last-resort safety net. */
    _init: function (cfg, screenName) {
      if (!cfg || !cfg.supabaseUrl || !cfg.supabaseAnonKey) {
        console.info('[NACDAuth] Supabase keys missing — auth bridge skipped; continuing in demo mode.');
        this._notifyReady(false, null);
        return;
      }
      if (!cfg.clerkPublishableKey) {
        console.warn('[NACDAuth] No Clerk publishable key — running unauthenticated.');
        this._wire(cfg, null, screenName);
        return;
      }

      var self = this;
      var pk = cfg.clerkPublishableKey;

      // Derive Clerk frontend-API domain from publishable key.
      // PK format: pk_(live|test)_<base64-encoded-domain>$
      var clerkDomain;
      try {
        clerkDomain = atob(pk.split('_')[2]).replace(/\$$/, '');
        if (!clerkDomain) throw new Error('empty domain');
      } catch (e) {
        console.warn('[NACDAuth] Could not decode Clerk domain from publishable key:', e.message,
          '— running unauthenticated.');
        this._wire(cfg, null, screenName);
        return;
      }

      // v5: pass the publishable key as a data attribute on the script tag;
      // the SDK auto-inits window.Clerk as a singleton on load.
      var script = document.createElement('script');
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.setAttribute('data-clerk-publishable-key', pk);
      script.src = 'https://' + clerkDomain + '/npm/@clerk/clerk-js@latest/dist/clerk.browser.js';

      script.onload = function () {
        // window.Clerk is the instance — no `new`
        global.Clerk.load().then(function () {
          if (!global.Clerk.user) {
            // Not signed in — open Clerk's hosted sign-in modal
            console.warn('[NACDAuth] No active session — opening Clerk sign-in.');
            global.Clerk.openSignIn({ redirectUrl: global.location.href });
            // Anon Realtime still starts so the UI isn't completely dead
            self._wire(cfg, null, screenName);
            return;
          }
          // Signed in — exchange for Supabase-compatible JWT
          return global.Clerk.session.getToken({ template: 'supabase' });
        }).then(function (token) {
          if (token) self._wire(cfg, token, screenName);
        }).catch(function (e) {
          console.warn('[NACDAuth] Clerk error:', e.message, '— falling back to anon.');
          self._wire(cfg, null, screenName);
        });
      };

      script.onerror = function () {
        console.warn('[NACDAuth] Clerk CDN unreachable — falling back to anon.');
        self._wire(cfg, null, screenName);
      };

      document.head.appendChild(script);
    },

    _wire: function (cfg, token, screenName) {
      if (!global.supabase) {
        console.warn('[NACDAuth] Supabase JS not found — cannot create client; continuing in demo mode.');
        this._notifyReady(false, null);
        return;
      }
      var opts = token
        ? { global: { headers: { Authorization: 'Bearer ' + token } } }
        : {};

      var sb = global.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, opts);

      // Patch NACDState so writes (incident upserts, unit updates) carry the JWT
      if (global.NACDState && global.NACDState.setSupabaseClient) {
        global.NACDState.setSupabaseClient(sb);
      }

      // Open screen-scoped Realtime subscriptions
      if (global.NACDRealtime) {
        global.NACDRealtime.init(sb, { screen: screenName || 'all' });
      }

      console.info('[NACDAuth] Supabase auth bridge active |',
        token ? 'authenticated (Clerk JWT)' : 'anon',
        '| screen:', screenName || 'all');

      // Notify screen: overlay dismiss + topbar wiring
      this._notifyReady(!!token, global.Clerk && global.Clerk.user ? global.Clerk.user : null);
    },

    /**
     * Safely invoke _onNACDAuthReady on the page.
     * Centralised so every exit path (demo, anon, authenticated) uses one callsite.
     * authenticated=false + user=null = demo/guest mode; overlay is still dismissed.
     */
    _notifyReady: function (authenticated, user) {
      if (typeof global._onNACDAuthReady === 'function') {
        try {
          global._onNACDAuthReady({ authenticated: !!authenticated, user: user || null });
        } catch (e) { /* screen callback errors must never break auth */ }
      }
    }
  };

  global.NACDAuth = NACDAuth;

})(typeof window !== 'undefined' ? window : this);
