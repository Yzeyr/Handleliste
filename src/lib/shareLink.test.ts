import { test } from 'node:test';
import assert from 'node:assert/strict';

import { decodeShareLink } from './shareLink.ts';

// Slik en ekte delingslenke ser ut: ["https://…", "eyJ…"] base64url-kodet.
const payload = Buffer.from(JSON.stringify(['https://abcd.supabase.co', 'eyJhbGciOi.demo']))
  .toString('base64')
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/, '');

const forventet = { url: 'https://abcd.supabase.co', anonKey: 'eyJhbGciOi.demo' };

test('leser hele lenka', () => {
  assert.deepEqual(decodeShareLink(`https://yzeyr.github.io/Handleliste/#k=${payload}`), forventet);
});

test('leser bare fragmentet', () => {
  assert.deepEqual(decodeShareLink(`#k=${payload}`), forventet);
});

test('tåler mellomrom og linjeskift rundt', () => {
  assert.deepEqual(decodeShareLink(`\n  https://a.b/#k=${payload}  \n`), forventet);
});

test('en lenke uten oppsett gir null', () => {
  assert.equal(decodeShareLink('https://yzeyr.github.io/Handleliste/'), null);
  assert.equal(decodeShareLink(''), null);
  assert.equal(decodeShareLink('bare litt tekst'), null);
});

test('ødelagt eller avkortet nyttelast gir null, ikke et krasj', () => {
  assert.equal(decodeShareLink('#k=dette_er_soppel'), null);
  assert.equal(decodeShareLink(`#k=${payload.slice(0, 20)}`), null);
});

test('avviser oppsett som ikke gir mening', () => {
  const rart = (verdi: unknown) =>
    '#k=' +
    Buffer.from(JSON.stringify(verdi)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  assert.equal(decodeShareLink(rart(['http://usikker.no', 'nokkel'])), null, 'krever https');
  assert.equal(decodeShareLink(rart(['https://a.b', '   '])), null, 'krever en nøkkel');
  assert.equal(decodeShareLink(rart(['https://a.b'])), null, 'krever begge deler');
  assert.equal(decodeShareLink(rart({ url: 'https://a.b' })), null, 'feil form');
});
