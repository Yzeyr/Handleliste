import { test } from 'node:test';
import assert from 'node:assert/strict';

import { pendingReminders, today } from './reminders.ts';

test('alt står igjen når ingenting er kvittert', () => {
  assert.deepEqual(
    pendingReminders(['Handlenett', 'Pant'], { date: '', names: [] }, '2026-09-01'),
    ['Handlenett', 'Pant'],
  );
});

test('det du har kvittert for i dag forsvinner', () => {
  assert.deepEqual(
    pendingReminders(['Handlenett', 'Pant'], { date: '2026-09-01', names: ['Handlenett'] }, '2026-09-01'),
    ['Pant'],
  );
});

test('en kvittering fra i går teller ikke', () => {
  // Poenget med hele mekanismen: neste dag er den tilbake, uten at appen må
  // forstå hva en handletur er.
  assert.deepEqual(
    pendingReminders(['Handlenett'], { date: '2026-08-31', names: ['Handlenett'] }, '2026-09-01'),
    ['Handlenett'],
  );
});

test('tomme linjer vises ikke', () => {
  assert.deepEqual(pendingReminders(['  ', 'Pant'], { date: '', names: [] }, '2026-09-01'), ['Pant']);
});

test('datoen leses i telefonens egen tidssone, ikke UTC', () => {
  // Sent på kvelden er norsk dato allerede i morgen sammenlignet med UTC.
  // Leste vi UTC, ville en kvittering fra i kveld sett ut som gårsdagens.
  const kvelden = new Date('2026-09-01T23:30:00Z');
  const lokal = [
    kvelden.getFullYear(),
    String(kvelden.getMonth() + 1).padStart(2, '0'),
    String(kvelden.getDate()).padStart(2, '0'),
  ].join('-');
  assert.equal(today(kvelden), lokal);
  assert.match(today(kvelden), /^\d{4}-\d{2}-\d{2}$/);
});
