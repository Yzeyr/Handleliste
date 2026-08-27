import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

/**
 * MOCK=1 bytter datalaget mot en in-memory-utgave (npm run dev:mock), slik at
 * appen kan prøves uten Supabase-prosjekt. Aliaset gjelder bare da — vanlig
 * dev og build treffer alltid den ekte db.ts.
 */
const useMock = process.env.MOCK === '1';

export default defineConfig({
  resolve: {
    alias: useMock
      ? [
          {
            // Streng, ikke regex: Vite bytter hele id-en bare ved eksakt treff.
            find: './lib/db.ts',
            replacement: fileURLToPath(new URL('./src/lib/db.mock.ts', import.meta.url)),
          },
        ]
      : [],
  },
  server: { host: true },
  build: { target: 'es2022' },
});
