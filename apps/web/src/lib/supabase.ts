// Re-export the typed Supabase clients so app code reaches them via @/lib/supabase
// without bouncing through @sha-nadc/supabase directly. Lets us add app-local
// hooks (auth context, logging) later in one place.
export { browserClient, serverClient, serviceClient } from '@sha-nadc/supabase';
