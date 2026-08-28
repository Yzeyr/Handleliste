import { el } from '../dom.ts';
import { buildShareLink, deviceName, isConfigFixed, loadConfig, setDeviceName } from '../lib/config.ts';

/**
 * Innstillinger: dele oppsettet med den andre telefonen, og bytte nøkler.
 * Ikke en fane — dette er noe man gjør én gang, ikke noe man blar i.
 */
export function createSettingsView(actions: {
  changeKeys: () => void;
  close: () => void;
}): HTMLElement {
  const config = loadConfig();
  const link = config === null ? null : buildShareLink(config);

  const linkBox = el('input', {
    class: 'share-link',
    attrs: { type: 'text', readonly: true, 'aria-label': 'Delingslenke', value: link ?? '' },
  });

  const feedback = el('p', { class: 'fine-print' });

  const copyButton = el('button', {
    class: 'primary wide',
    text: 'Kopier delingslenke',
    attrs: { type: 'button' },
    on: {
      click: () => {
        if (link === null) return;
        // Klippebordet krever HTTPS og kan avvises; da markerer vi teksten i
        // stedet, så lenka fortsatt kan kopieres for hånd.
        void navigator.clipboard
          ?.writeText(link)
          .then(() => {
            feedback.textContent = 'Kopiert. Send den til samboeren din.';
          })
          .catch(() => {
            linkBox.select();
            feedback.textContent = 'Fikk ikke kopiert automatisk — merk teksten over og kopier.';
          });
      },
    },
  });

  const nameInput = el('input', {
    attrs: {
      type: 'text',
      placeholder: 'Fornavn',
      'aria-label': 'Navnet ditt',
      autocomplete: 'off',
      value: deviceName() ?? '',
    },
    on: { change: () => setDeviceName(nameInput.value) },
  });

  return el('section', { class: 'view' }, [
    el('h2', { class: 'view-title', text: 'Navnet ditt' }),
    el('p', {
      class: 'fine-print',
      text: 'Brukes bare til å vise hvem som endret hva. Tomt felt blir «Noen».',
    }),
    nameInput,
    el('hr'),
    el('h2', { class: 'view-title', text: 'Del med den andre telefonen' }),
    el('p', {
      text:
        'Lenka inneholder både adressen og nøkkelen. Den andre åpner den én gang, ' +
        'og appen er satt opp — ingenting å taste inn.',
    }),
    linkBox,
    copyButton,
    feedback,
    el('hr'),
    el('p', {
      class: 'fine-print',
      text: `Koblet til ${config?.url ?? 'ingenting'}`,
    }),
    !isConfigFixed() &&
      el('button', {
        class: 'ghost danger',
        text: 'Bytt nøkler',
        attrs: { type: 'button' },
        on: { click: actions.changeKeys },
      }),
    el('button', { class: 'ghost', text: 'Tilbake', attrs: { type: 'button' }, on: { click: actions.close } }),
  ]);
}

/** Tannhjulet i toppen. Egen funksjon fordi headeren bygges før visningene. */
export function createSettingsButton(onClick: () => void): HTMLElement {
  return el('button', {
    class: 'settings-button',
    text: '⚙',
    attrs: { type: 'button', 'aria-label': 'Innstillinger og deling' },
    on: { click: onClick },
  });
}
