import { el, replaceChildren } from '../dom.ts';
import {
  addCard,
  cropFromDrag,
  FULL_IMAGE,
  loadCards,
  removeCard,
  saveCards,
  shrinkImage,
  type Card,
  type Crop,
} from '../lib/cards.ts';

/**
 * Medlemskortene. Ett skjermbilde per kjede, vist stort når du står i kassa.
 *
 * Visningen legger seg over hele skjermen på hvit bakgrunn og utenfor appens
 * vanlige ramme: en skanner leser kontrast, og appens mørke bakgrunn rundt en
 * lys kode er akkurat det som gjør at den ikke fanges.
 */
export function createCardsView(onClose: () => void): HTMLElement {
  const list = el('div', { class: 'card-list' });
  const feedback = el('p', { class: 'fine-print' });

  const nameInput = el('input', {
    attrs: { type: 'text', placeholder: 'Coop, Trumf, Rema …', 'aria-label': 'Navn på kortet', autocomplete: 'off' },
  });
  const numberInput = el('input', {
    attrs: {
      type: 'text',
      inputmode: 'numeric',
      placeholder: 'Medlemsnummer (valgfritt)',
      'aria-label': 'Medlemsnummer',
      autocomplete: 'off',
    },
  });
  // capture er bevisst utelatt: da tilbyr iOS både «Ta bilde» og bildebiblioteket,
  // og et skjermbilde fra kjedens egen app er den beste kilden.
  const fileInput = el('input', {
    class: 'card-file',
    attrs: { type: 'file', accept: 'image/*', 'aria-label': 'Bilde av koden' },
  });

  // Et skjermbilde fra kjedens egen app har koden midt i mye annet. Vist
  // tilpasset skjermen blir selve koden liten, og det er den skanneren skal
  // lese. Derfor: dra en firkant rundt koden før du lagrer.
  const previewImage = el('img', { class: 'crop-img', attrs: { alt: 'Valgt bilde' } });
  const cropBox = el('div', { class: 'crop-box' });
  const cropArea = el('div', { class: 'crop-area' }, [previewImage, cropBox]);
  const cropHint = el('p', { class: 'fine-print' });
  const cropWrap = el('div', { class: 'crop-wrap' }, [
    cropArea,
    cropHint,
    el('button', {
      class: 'ghost',
      text: 'Bruk hele bildet',
      attrs: { type: 'button' },
      on: { click: () => setCrop(FULL_IMAGE) },
    }),
  ]);
  cropWrap.hidden = true;

  let crop: Crop = FULL_IMAGE;
  let objectUrl: string | null = null;

  function setCrop(next: Crop): void {
    crop = next;
    const whole = next === FULL_IMAGE || (next.w === 1 && next.h === 1);
    cropBox.style.display = whole ? 'none' : 'block';
    if (!whole) {
      cropBox.style.left = `${next.x * 100}%`;
      cropBox.style.top = `${next.y * 100}%`;
      cropBox.style.width = `${next.w * 100}%`;
      cropBox.style.height = `${next.h * 100}%`;
    }
    cropHint.textContent = whole
      ? 'Dra en firkant rundt koden, så blir den stor i kassa.'
      : 'Utsnitt valgt. Dra på nytt for å endre.';
  }

  let dragStart: { x: number; y: number } | null = null;

  cropArea.addEventListener('pointerdown', (event: PointerEvent) => {
    const rect = cropArea.getBoundingClientRect();
    dragStart = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    cropArea.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  cropArea.addEventListener('pointermove', (event: PointerEvent) => {
    if (dragStart === null) return;
    const rect = cropArea.getBoundingClientRect();
    const now = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    // Under dragningen tegnes firkanten rått, uten minstemålet: den skal
    // følge fingeren. Minstemålet avgjør først når du slipper.
    cropBox.style.display = 'block';
    cropBox.style.left = `${(Math.min(dragStart.x, now.x) / rect.width) * 100}%`;
    cropBox.style.top = `${(Math.min(dragStart.y, now.y) / rect.height) * 100}%`;
    cropBox.style.width = `${(Math.abs(now.x - dragStart.x) / rect.width) * 100}%`;
    cropBox.style.height = `${(Math.abs(now.y - dragStart.y) / rect.height) * 100}%`;
  });

  function endDrag(event: PointerEvent): void {
    if (dragStart === null) return;
    const rect = cropArea.getBoundingClientRect();
    setCrop(
      cropFromDrag(
        dragStart,
        { x: event.clientX - rect.left, y: event.clientY - rect.top },
        rect.width,
        rect.height,
      ),
    );
    dragStart = null;
  }

  cropArea.addEventListener('pointerup', endDrag);
  cropArea.addEventListener('pointercancel', endDrag);

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (objectUrl !== null) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
    if (file === undefined) {
      cropWrap.hidden = true;
      return;
    }
    objectUrl = URL.createObjectURL(file);
    previewImage.src = objectUrl;
    cropWrap.hidden = false;
    setCrop(FULL_IMAGE);
  });

  function render(): void {
    const cards = loadCards();
    replaceChildren(list, [
      cards.length === 0 &&
        el('p', {
          class: 'fine-print',
          text: 'Ingen kort ennå. Ta et skjermbilde av koden i kjedens egen app og legg det inn under.',
        }),
      ...cards.map((card) =>
        el('button', {
          class: 'card-tile',
          attrs: { type: 'button', 'aria-label': `Vis ${card.name}` },
          on: { click: () => showFullscreen(card, render) },
        }, [
          el('img', { class: 'card-thumb', attrs: { src: card.image, alt: '' } }),
          el('span', { class: 'card-name', text: card.name }),
        ]),
      ),
    ]);
  }

  async function save(): Promise<void> {
    const name = nameInput.value.trim();
    const file = fileInput.files?.[0];
    if (name === '') {
      feedback.textContent = 'Gi kortet et navn.';
      return;
    }
    if (file === undefined) {
      feedback.textContent = 'Velg et bilde av koden.';
      return;
    }
    feedback.textContent = 'Lagrer …';
    try {
      const image = await shrinkImage(file, crop);
      saveCards(
        addCard(loadCards(), { id: crypto.randomUUID(), name, image, number: numberInput.value.trim() }),
      );
      nameInput.value = '';
      numberInput.value = '';
      fileInput.value = '';
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl);
      objectUrl = null;
      cropWrap.hidden = true;
      setCrop(FULL_IMAGE);
      feedback.textContent = `${name} lagret på denne telefonen.`;
      render();
    } catch (error) {
      feedback.textContent = error instanceof Error ? error.message : 'Klarte ikke å lagre bildet';
    }
  }

  render();

  return el('section', { class: 'view' }, [
    el('h2', { class: 'view-title', text: 'Kort' }),
    el('p', {
      class: 'fine-print',
      text: 'Ligger bare på denne telefonen — ikke i den delte lista. Samboeren legger inn sine egne.',
    }),
    list,
    el('hr'),
    el('h2', { class: 'view-title', text: 'Legg til kort' }),
    nameInput,
    fileInput,
    cropWrap,
    numberInput,
    el('button', {
      class: 'primary wide',
      text: 'Lagre kort',
      attrs: { type: 'button' },
      on: { click: () => void save() },
    }),
    feedback,
    el('button', { class: 'ghost', text: 'Tilbake', attrs: { type: 'button' }, on: { click: onClose } }),
  ]);
}

function showFullscreen(card: Card, onChange: () => void): void {
  const overlay = el('div', { class: 'card-fullscreen', attrs: { role: 'dialog', 'aria-label': card.name } }, [
    el('img', { class: 'card-big', attrs: { src: card.image, alt: card.name } }),
    card.number !== '' && el('p', { class: 'card-number', text: card.number }),
    el('div', { class: 'card-actions' }, [
      el('button', {
        class: 'primary grow',
        text: 'Lukk',
        attrs: { type: 'button' },
        on: { click: () => overlay.remove() },
      }),
      el('button', {
        class: 'ghost danger',
        text: 'Slett',
        attrs: { type: 'button' },
        on: {
          click: () => {
            saveCards(removeCard(loadCards(), card.id));
            overlay.remove();
            onChange();
          },
        },
      }),
    ]),
  ]);
  document.body.append(overlay);
}
