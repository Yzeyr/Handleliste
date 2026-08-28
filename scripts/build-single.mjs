/**
 * Bygger appen til én selvstendig HTML-fil.
 *
 * Vite lager index.html + én js + én css; her limes de to inn i HTML-en slik
 * at fila kan lastes opp hvor som helst — GitHub Pages, en mappe, en
 * e-postvedlegg — uten at noe annet må følge med. Ingen ekstra avhengighet:
 * bygget er allerede én chunk hver, så det er ren tekstsammenslåing.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const distDir = join(projectRoot, 'dist');
// docs/ fordi GitHub Pages kan servere den mappa direkte fra main-branchen,
// uten byggesteg i skya. index.html her er den ferdige appen; index.html i
// rota er Vite sin dev-mal.
const outDir = join(projectRoot, 'docs');
const outFile = join(outDir, 'index.html');

rmSync(distDir, { recursive: true, force: true });
execFileSync('npx', ['vite', 'build'], { cwd: projectRoot, stdio: 'inherit' });

const assets = readdirSync(join(distDir, 'assets'));
const jsFiles = assets.filter((name) => name.endsWith('.js'));
const cssFiles = assets.filter((name) => name.endsWith('.css'));
if (jsFiles.length !== 1 || cssFiles.length !== 1) {
  throw new Error(`Forventet én js og én css, fant ${jsFiles.length} og ${cssFiles.length}`);
}

const js = readFileSync(join(distDir, 'assets', jsFiles[0]), 'utf8');
const css = readFileSync(join(distDir, 'assets', cssFiles[0]), 'utf8');

// Byggets identitet. Vite navngir chunken etter innholdet, så den endrer seg
// bare når koden faktisk har endret seg — og da, og bare da, skal appen si
// fra at det finnes en ny utgave.
const build = jsFiles[0].replace(/^index-|\.js$/g, '');

// </script> inne i kildekoden ville lukket taggen vi limer den inn i.
const safeJs = js.replaceAll('</script', '<\\/script');

// Erstatningene MÅ være funksjoner, ikke strenger: String.replace tolker $&,
// $` og $' i en streng-erstatning, og Supabase-bundelen inneholder `$&`.
// Med streng-erstatning ble den sekvensen byttet ut med treffet, og bundelen
// kom ut syntaktisk ødelagt.
const styleTag = `<style>\n${css}\n</style>`;
const scriptTag = `<script type="module">\n${safeJs}\n</script>\n</body>`;

const html = readFileSync(join(distDir, 'index.html'), 'utf8')
  .replace(/<script type="module"[^>]*><\/script>/, () => '')
  .replace(/<link rel="stylesheet"[^>]*>/, () => styleTag)
  .replace('</body>', () => scriptTag);

if (html.includes('assets/')) throw new Error('Noe peker fortsatt på en ekstern fil');
if (!html.includes(safeJs)) throw new Error('JS-en ble endret under innliming');
if (!html.includes(css)) throw new Error('CSS-en ble endret under innliming');

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, html);

// Ikoner og manifest kan ikke limes inn i HTML-en: iOS henter
// apple-touch-icon som en egen fil, og et manifest må ligge på en URL.
// De kommer fra public/ via Vite, og følger med til docs/.
const extras = readdirSync(distDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name !== 'index.html')
  .map((entry) => entry.name);
for (const name of extras) copyFileSync(join(distDir, name), join(outDir, name));

// Service workeren må endre seg mellom bygg, ellers ser nettleseren aldri at
// det finnes en ny utgave å installere.
const swPath = join(outDir, 'sw.js');
writeFileSync(swPath, readFileSync(swPath, 'utf8').replaceAll('__BUILD__', build));
console.log(
  `\ndocs/index.html — ${(Buffer.byteLength(html) / 1024).toFixed(0)} kB, én fil, ingen eksterne kall` +
    `\nbygg ${build}`,
);
