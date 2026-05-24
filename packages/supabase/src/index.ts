// @sha-nadc/supabase — typed Supabase client wrappers.
//
// Three flavours of client, picked by what's calling:
//   - browserClient()      — anon key, browser-safe, respects RLS
//   - serverClient()       — anon key, used in Next.js server components
//   - serviceClient()      — service-role key, SERVER ONLY, bypasses RLS
//
// All three are typed against packages/types domain schemas. Reads return
// validated rows; writes accept Zod-validated input.

export { browserClient } from './browser';
export { serverClient }  from './server';
export { serviceClient } from './service';
export * from './assertEnv';
