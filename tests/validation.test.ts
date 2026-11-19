import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bookingSchema } from '../lib/validation';

function valid() {
  return {
    mode: 'mobile' as const,
    contact: {
      name: 'Pat Driver',
      phone: '(334) 555-0100',
      email: 'Pat@Example.com',
    },
    address: {
      street: '12 Oak St',
      city: 'Phenix City',
      state: 'AL' as const,
      zip: '36869',
      parkingNotes: '',
    },
    afterHoursKeyDrop: false,
    vehicle: {
      year: 2016,
      make: 'Ford',
      model: 'F-150',
      engine: '',
      vin: '',
      mileage: 128000,
    },
    serviceIds: ['alternator'],
    symptoms: '',
    mediaPaths: [],
    date: '2026-12-01',
    windowId: 'w0900',
    promoCode: '',
    paymentChoice: 'estimate' as const,
    utm: {},
  };
}

test('valid input succeeds and lowercases email', () => {
  const res = bookingSchema.safeParse(valid());
  assert.equal(res.success, true);
  if (res.success) {
    assert.equal(res.data.contact.email, 'pat@example.com');
  }
});

test('mobile with address deleted fails with Service address message', () => {
  const input = valid() as unknown as Record<string, unknown>;
  delete input.address;
  const res = bookingSchema.safeParse(input);
  assert.equal(res.success, false);
  if (!res.success) {
    const hasMsg = res.error.issues.some((i) => i.message.includes('Service address'));
    assert.equal(hasMsg, true);
  }
});

test('serviceIds alignment in mobile mode fails with shop bay message', () => {
  const input = valid() as unknown as Record<string, unknown>;
  input.serviceIds = ['alignment'];
  const res = bookingSchema.safeParse(input);
  assert.equal(res.success, false);
  if (!res.success) {
    const hasMsg = res.error.issues.some((i) => i.message.includes('shop bay'));
    assert.equal(hasMsg, true);
  }
});

test('vehicle.vin valid string succeeds and uppercases', () => {
  const input = valid();
  input.vehicle.vin = '1ftew1ef0gkd00000';
  const res = bookingSchema.safeParse(input);
  assert.equal(res.success, true);
  if (res.success) {
    assert.equal(res.data.vehicle.vin, '1FTEW1EF0GKD00000');
  }
});

test('vehicle.vin with letter O fails', () => {
  const input = valid();
  input.vehicle.vin = '1FTEW1EF0GKD0000O';
  const res = bookingSchema.safeParse(input);
  assert.equal(res.success, false);
});

test('website honeypot fails', () => {
  const input = { ...valid(), website: 'spam' } as unknown as Record<string, unknown>;
  const res = bookingSchema.safeParse(input);
  assert.equal(res.success, false);
});

test('serviceIds empty with short symptoms fails', () => {
  const input = valid() as unknown as Record<string, unknown>;
  input.serviceIds = [];
  input.symptoms = 'hi';
  const res = bookingSchema.safeParse(input);
  assert.equal(res.success, false);
});

test('mediaPaths with directory traversal fails', () => {
  const input = valid() as unknown as Record<string, unknown>;
  input.mediaPaths = ['../etc/passwd'];
  const res = bookingSchema.safeParse(input);
  assert.equal(res.success, false);
});

test('mediaPaths with valid pending path succeeds', () => {
  const input = valid() as unknown as Record<string, unknown>;
  input.mediaPaths = ['pending/2026-11/a.jpg'];
  const res = bookingSchema.safeParse(input);
  assert.equal(res.success, true);
});

test('shop mode without address and shop service succeeds', () => {
  const input = valid() as unknown as Record<string, unknown>;
  input.mode = 'shop';
  delete input.address;
  input.serviceIds = ['alignment'];
  const res = bookingSchema.safeParse(input);
  assert.equal(res.success, true);
});
