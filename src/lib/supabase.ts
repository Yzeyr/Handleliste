import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadConfig } from './config.ts';

let cached: SupabaseClient | null = null;

/**
 * Realtime er skrudd ned til 5 hendelser/sekund. Vi henter uansett hele lista
 * på nytt ved endring, så høyere frekvens gir bare flere runder.
 */
export function getClient(): SupabaseClient {
  if (cached !== null) return cached;
  const config = loadConfig();
  if (config === null) throw new Error('Supabase er ikke satt opp ennå.');
  cached = createClient(config.url, config.anonKey, {
    auth: { persistSession: false },
    realtime: { params: { eventsPerSecond: 5 } },
  });
  return cached;
}

/** Kalles når nøklene endres, så neste kall bygger en ny klient. */
export function resetClient(): void {
  cached = null;
}
