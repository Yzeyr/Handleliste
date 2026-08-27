import { el } from '../dom.ts';
import { isConfigFixed, loadConfig, saveConfig } from '../lib/config.ts';

/**
 * Oppsettsskjerm for enkeltfil-utgaven: nøklene limes inn her i stedet for å
 * bakes inn ved bygging, slik at HTML-fila kan lastes opp før dere har et
 * Supabase-prosjekt. Hver telefon oppgir dem én gang.
 */
export function createSetupView(onSaved: () => void): HTMLElement {
  const existing = loadConfig();

  const urlInput = el('input', {
    attrs: {
      type: 'url',
      placeholder: 'https://xxxx.supabase.co',
      'aria-label': 'Supabase URL',
      autocomplete: 'off',
      autocapitalize: 'off',
      spellcheck: false,
      value: existing?.url ?? '',
    },
  });
  const keyInput = el('textarea', {
    attrs: {
      rows: 3,
      placeholder: 'eyJhbGciOi...',
      'aria-label': 'Supabase anon key',
      autocomplete: 'off',
      autocapitalize: 'off',
      spellcheck: false,
    },
  });
  keyInput.value = existing?.anonKey ?? '';

  const message = el('p', { class: 'form-error' });

  const form = el(
    'form',
    {
      class: 'setup-form',
      // novalidate: nettleserens egen type=url-validering blokkerer submit før
      // vår egen sjekk rekker å si noe forståelig. Vi validerer selv.
      attrs: { novalidate: true },
      on: {
        submit: (event) => {
          event.preventDefault();
          const url = urlInput.value.trim();
          const anonKey = keyInput.value.trim();
          if (url === '' || anonKey === '') {
            message.textContent = 'Begge feltene må fylles ut.';
            return;
          }
          if (!/^https:\/\/[^\s/]+/.test(url)) {
            message.textContent = 'URL-en skal se ut som https://xxxx.supabase.co';
            return;
          }
          saveConfig({ url, anonKey });
          onSaved();
        },
      },
    },
    [
      el('label', { text: 'Project URL' }),
      urlInput,
      el('label', { text: 'Anon key' }),
      keyInput,
      message,
      el('button', { class: 'primary wide', text: 'Koble til', attrs: { type: 'submit' } }),
    ],
  );

  return el('section', { class: 'view setup' }, [
    el('h2', { text: 'Koble til databasen' }),
    el('ol', { class: 'setup-steps' }, [
      el('li', { text: 'Lag et gratis prosjekt på supabase.com.' }),
      el('li', { text: 'Kjør supabase/setup.sql i SQL Editor.' }),
      el('li', { text: 'Hent Project URL og anon key under Project Settings → API.' }),
    ]),
    isConfigFixed()
      ? el('p', { text: 'Nøklene er satt ved bygging og kan ikke endres her.' })
      : form,
    el('p', {
      class: 'fine-print',
      text:
        'Nøklene lagres bare på denne telefonen. Anon-nøkkelen er offentlig av natur — ' +
        'den som har lenken til appen og nøkkelen, kan endre lista deres.',
    }),
  ]);
}
