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
            // Må treffe begge skrivemåtene: main.ts importerer './lib/db.ts',
            // mens filene i src/lib/ importerer './db.ts'. Regexen er ankret i
            // begge ender, så hele id-en byttes ut — treffer den bare en del
            // av strengen, blir resultatet en sti som ikke finnes.
            find: /^\.{1,2}\/(?:lib\/)?db\.ts$/,
            replacement: fileURLToPath(new URL('./src/lib/db.mock.ts', import.meta.url)),
          },
        ]
      : [],
  },
  server: { host: true },
  build: { target: 'es2022' },
});
