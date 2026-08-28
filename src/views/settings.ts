import { el } from '../dom.ts';
import {
  buildShareLink,
  deviceName,
  isConfigFixed,
  loadConfig,
  pushTopic,
  setDeviceName,
} from '../lib/config.ts';
import { subscribeUrl } from '../lib/push.ts';

/**
 * Innstillinger: dele oppsettet med den andre telefonen, og bytte nøkler.
 * Ikke en fane — dette er noe man gjør én gang, ikke noe man blar i.
 */
export interface SettingsActions {
  changeKeys: () => void;
  close: () => void;
  aliases: { alias: string; canonical: string }[];
  addAlias: (alias: string, canonical: string) => void;
  removeAlias: (alias: string) => void;
  enablePush: () => void;
  disablePush: () => void;
  testPush: () => void;
  otherReceivers: string[];
}

export function createSettingsView(actions: SettingsActions): HTMLElement {
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
    el('h2', { class: 'view-title', text: 'Varsel på låseskjermen' }),
    pushBlock(actions),
    el('hr'),
    el('h2', { class: 'view-title', text: 'Samme vare, ulike navn' }),
    el('p', {
      class: 'fine-print',
      text:
        'Appen kjenner de vanligste variantene fra før. Her legger dere til deres egne, ' +
        'så «Q-melk» havner på samme linje som «Helmelk» i stedet for å bli en linje til.',
    }),
    aliasList(actions),
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

/**
 * Bare den som VIL ha varsler trenger å gjøre noe her. Den andre telefonen
 * sender fra nettleseren og installerer ingenting.
 */
function pushBlock(actions: SettingsActions): HTMLElement {
  const topic = pushTopic();

  if (topic === null) {
    return el('div', { class: 'setup-form' }, [
      el('p', {
        class: 'fine-print',
        text:
          'Få beskjed på telefonen når den andre legger noe på lista. Krever ' +
          'gratisappen ntfy — men bare på denne telefonen. Den som legger til ' +
          'varer trenger ingenting.',
      }),
      actions.otherReceivers.length > 0 &&
        el('p', {
          class: 'fine-print',
          text: `Får varsler i dag: ${actions.otherReceivers.join(', ')}`,
        }),
      el('button', {
        class: 'primary wide',
        text: 'Slå på varsler',
        attrs: { type: 'button' },
        on: { click: actions.enablePush },
      }),
    ]);
  }

  const url = subscribeUrl(topic);

  // Vi viser emnenavnet, ikke URL-en. Lim man URL-en inn i ntfy havner den i
  // «Use another server» og appen spør en server som ikke finnes — 404.
  // Emnenavnet alene er det eneste som skal inn i skjemaet.
  const topicBox = el('input', {
    class: 'share-link',
    attrs: { type: 'text', readonly: true, 'aria-label': 'Emnenavn i ntfy', value: topic },
  });

  const feedback = el('p', { class: 'fine-print' });

  return el('div', { class: 'setup-form' }, [
    el('p', { class: 'fine-print', text: '1. Installer appen ntfy (bare på denne telefonen).' }),
    el('p', { class: 'fine-print', text: '2. Trykk + i ntfy og lim inn emnenavnet under.' }),
    el('p', {
      class: 'fine-print',
      text: '3. La serveren stå som den er. Ikke slå på «Use another server» — da får du 404.',
    }),
    topicBox,
    el('button', {
      class: 'primary wide',
      text: 'Kopier emnenavn',
      attrs: { type: 'button' },
      on: {
        click: () => {
          void navigator.clipboard
            ?.writeText(topic)
            .then(() => {
              feedback.textContent = 'Kopiert. Lim det inn i topic-feltet i ntfy.';
            })
            .catch(() => {
              topicBox.select();
              feedback.textContent = 'Fikk ikke kopiert automatisk — merk teksten over og kopier.';
            });
        },
      },
    }),
    feedback,
    el('button', {
      class: 'ghost',
      text: 'Send testvarsel',
      attrs: { type: 'button' },
      on: { click: actions.testPush },
    }),
    el('button', {
      class: 'ghost',
      text: 'Åpne kanalen i nettleseren',
      attrs: { type: 'button' },
      on: { click: () => window.open(url, '_blank', 'noopener') },
    }),
    el('button', {
      class: 'ghost danger',
      text: 'Slå av varsler',
      attrs: { type: 'button' },
      on: { click: actions.disablePush },
    }),
  ]);
}

function aliasList(actions: {
  aliases: { alias: string; canonical: string }[];
  addAlias: (alias: string, canonical: string) => void;
  removeAlias: (alias: string) => void;
}): HTMLElement {
  const from = el('input', {
    class: 'grow',
    attrs: { type: 'text', placeholder: 'Skriver du dette', 'aria-label': 'Navnet som skal oversettes', autocomplete: 'off' },
  });
  const to = el('input', {
    class: 'grow',
    attrs: { type: 'text', placeholder: 'blir det dette', 'aria-label': 'Navnet det er samme som', autocomplete: 'off' },
  });

  return el('div', { class: 'alias-block' }, [
    el(
      'ul',
      { class: 'alias-list' },
      actions.aliases.map((row) =>
        el('li', {}, [
          el('span', { text: `${row.alias} → ${row.canonical}` }),
          el('button', {
            class: 'item-remove',
            text: '×',
            attrs: { type: 'button', 'aria-label': `Slett ${row.alias}` },
            on: { click: () => actions.removeAlias(row.alias) },
          }),
        ]),
      ),
    ),
    el('div', { class: 'row' }, [from, to]),
    el('button', {
      class: 'ghost',
      text: '+ Legg til',
      attrs: { type: 'button' },
      on: {
        click: () => {
          actions.addAlias(from.value, to.value);
          from.value = '';
          to.value = '';
        },
      },
    }),
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
