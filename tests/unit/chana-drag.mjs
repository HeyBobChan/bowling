import test from 'node:test';
import assert from 'node:assert/strict';
import { dropSlot } from '../../src/chana/drop-slot.js';

const phone = { rect: { left: 16, right: 374, top: 340, bottom: 2835 },
  columns: [114.67, 114.67, 114.66], rows: Array(18).fill(132),
  columnGap: 7, rowGap: 7, rtl: true, count: 52 };
test('phone drops follow RTL slot order within and across rows', () => {
  assert.equal(dropSlot(phone, { clientX: 316, clientY: 414 }), 0);
  assert.equal(dropSlot(phone, { clientX: 73, clientY: 414 }), 2);
  assert.equal(dropSlot(phone, { clientX: 194, clientY: 555 }), 4);
  assert.equal(dropSlot(phone, { clientX: 73, clientY: 555 }), 5);
});
test('gaps choose the nearest slot and the incomplete last row appends', () => {
  assert.equal(dropSlot(phone, { clientX: 255, clientY: 414 }), 1);
  assert.equal(dropSlot(phone, { clientX: 73, clientY: 2800 }), 51);
});
test('drops outside the grid and canceled gestures retain the current order', () => {
  assert.equal(dropSlot(phone, { clientX: 390, clientY: 414 }), null);
  assert.equal(dropSlot(phone, { clientX: 316, clientY: 100 }), null);
  assert.equal(dropSlot(phone, undefined), null);
});
test('scrolling and a temporary taller placeholder do not shift the chosen row', () => {
  const scrolled = { ...phone, rect: { ...phone.rect, top: -160, bottom: 2335 }, rows: [134, ...Array(17).fill(132)] };
  assert.equal(dropSlot(scrolled, { clientX: 316, clientY: 190 }), 6);
});
test('four-column desktop grids and LTR layouts resolve the release slot', () => {
  const desktop = { ...phone, rect: { left: 264, right: 1016, top: 404, bottom: 2000 }, columns: [179,179,179,179], columnGap: 12 };
  assert.equal(dropSlot(desktop, { clientX: 920, clientY: 505 }), 0);
  assert.equal(dropSlot(desktop, { clientX: 350, clientY: 505 }), 3);
  assert.equal(dropSlot({ ...desktop, rtl: false }, { clientX: 350, clientY: 505 }), 0);
});
test('larger two-column phone cards can move across rows', () => {
  const largePhone = { rect: { left: 16, right: 374, top: 340, bottom: 6050 },
    columns: [174, 174], rows: Array(26).fill(210), columnGap: 10, rowGap: 10, rtl: true, count: 52 };
  assert.equal(dropSlot(largePhone, { clientX: 287, clientY: 450 }), 0);
  assert.equal(dropSlot(largePhone, { clientX: 104, clientY: 670 }), 3);
  assert.equal(dropSlot(largePhone, { clientX: 104, clientY: 5950 }), 51);
});
