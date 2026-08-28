/**
 * Varsler på låseskjermen, via ntfy.
 *
 * En nettside kan ikke sende push til en iPhone på egen hånd — det krever en
 * server som signerer, og en Edge Function som må deployes fra en datamaskin.
 * ntfy snur på det: den som VIL ha varsler abonnerer på en kanal i ntfy-appen,
 * og de andre telefonene POSTer dit rett fra nettleseren.
 *
 * Konsekvensen er den viktige: bare mottakeren trenger å installere noe. Den
 * som bare skal utløse varsler gjør ingenting — nettleseren hennes sender.
 *
 * Kanalene ligger i databasen, én rad per telefon som har slått det på, slik
 * at ingen må sette opp hverandres kanaler for hånd. Din egen kanal hoppes
 * over ved sending, så du aldri varsles om det du selv nettopp gjorde.
 */
import { deviceId, deviceName, pushTopic } from './config.ts';

const NTFY = 'https://ntfy.sh';

export interface PushTarget {
  device_id: string;
  label: string | null;
  topic: string;
}

/**
 * Et langt tilfeldig kanalnavn. Kanalen er en delt hemmelighet på en åpen
 * tjeneste: den som gjetter navnet kan lese varslene og sende falske. Innholdet
 * er «Kari la til melk», så innsatsen er lav — men navnet skal likevel ikke
 * være gjettbart.
 */
export function freshTopic(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const tail = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `handleliste-${tail}`;
}

export const subscribeUrl = (topic: string): string => `${NTFY}/${topic}`;

/**
 * Sender ett varsel. Feiler stille: et varsel som ikke kom fram skal aldri
 * stoppe en endring i handlelista.
 */
async function post(topic: string, message: string): Promise<boolean> {
  try {
    const response = await fetch(NTFY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic,
        title: 'Handleliste',
        message,
        click: window.location.href,
        tags: ['shopping_cart'],
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** «Send testvarsel» — den eneste raske måten å se at det faktisk virker. */
export function sendTest(topic: string): Promise<boolean> {
  return post(topic, 'Testvarsel. Da virker det.');
}

/** Varsler de andre telefonene, aldri din egen. */
export async function notifyOthers(
  targets: readonly PushTarget[],
  message: string,
): Promise<void> {
  const me = deviceId();
  const mine = pushTopic();
  const others = targets.filter((t) => t.device_id !== me && t.topic !== mine);
  if (others.length === 0) return;

  const who = deviceName() ?? 'Noen';
  await Promise.all(others.map((t) => post(t.topic, `${who} ${message}`)));
}
