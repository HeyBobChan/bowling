import test from 'node:test';
import assert from 'node:assert/strict';
import { createNavigationGuard } from '../../src/chana/navigation-guard.js';

function fixture({ previous = true, activated = true, entries, index } = {}) {
  const win = new EventTarget(), document = new EventTarget();
  const historyEntries = entries || [...(previous ? [{}] : []), { retained: 'other history state' }];
  let position = index ?? historyEntries.length - 1, confirm, prompts = 0, saves = 0, overlay = false;
  const queue = [], destinations = [];
  const timers = new Map();
  win.setTimeout = callback => { const id = timers.size + 1; timers.set(id, callback); return id; };
  win.clearTimeout = id => timers.delete(id);
  win.document = document;
  document.documentElement = { classList: { toggle() {} } };
  win.navigator = { userActivation: { isActive: activated } };
  win.location = { href: 'https://example.com/chana.html?room=123456',
    replace: href => destinations.push(href), assign: href => destinations.push(href) };
  win.history = {
    get state() { return historyEntries[position]; },
    get length() { return historyEntries.length; },
    scrollRestoration: 'auto',
    replaceState(state) { historyEntries[position] = structuredClone(state); },
    pushState(state) { historyEntries.splice(position + 1); historyEntries.push(structuredClone(state)); position++; },
    go(delta) { queue.push(() => {
      const next = position + delta;
      if (next < 0 || next >= historyEntries.length) return;
      position = next; win.dispatchEvent(new Event('popstate'));
    }); },
    back() { this.go(-1); }, forward() { this.go(1); },
  };
  const options = { win, fallback: '/chana.html',
    confirmLeave: () => { prompts++; return new Promise(resolve => { confirm = resolve; }); },
    closeOverlay: () => { const hadOverlay = overlay; overlay = false; return hadOverlay; },
    onLeave: () => { saves++; },
  };
  const guard = createNavigationGuard(options);
  const flush = () => { let count = 0; while (queue.length) { assert.ok(++count < 20, 'history must settle'); queue.shift()(); } };
  return { win, guard, destinations, historyEntries, flush,
    advanceTimers() { for (const callback of timers.values()) callback(); timers.clear(); },
    get position() { return position; }, get prompts() { return prompts; }, get saves() { return saves; },
    get overlay() { return overlay; }, set overlay(value) { overlay = value; },
    async answer(value) { confirm(value); await Promise.resolve(); flush(); },
    back() { win.history.back(); flush(); },
  };
}

test('Back asks once, Stay preserves the entry, and repeated Back never grows history', async () => {
  const f = fixture(); f.guard.setActive(true);
  for (let i = 0; i < 4; i++) {
    f.back(); assert.equal(f.prompts, i + 1); assert.equal(f.position, 2);
    await f.answer(false); assert.equal(f.historyEntries.length, 3);
  }
  assert.equal(f.win.history.state.retained, 'other history state');
  assert.equal(f.saves, 0);
});

test('confirmed Back flushes progress and reaches the actual preceding page', async () => {
  const f = fixture(); f.guard.setActive(true); f.back(); await f.answer(true);
  assert.equal(f.position, 0); assert.equal(f.saves, 1);
  const event = new Event('beforeunload', { cancelable: true });
  f.win.dispatchEvent(event); assert.equal(event.defaultPrevented, false);
});

test('a directly opened game has an intentional exit even with no preceding page', async () => {
  const f = fixture({ previous: false }); f.guard.setActive(true); f.back(); await f.answer(true);
  assert.deepEqual(f.destinations, ['/chana.html']);
});

test('resuming from the first history entry still allows exit despite forward entries', async () => {
  const f = fixture({ entries: [{}, {}, {}], index: 0 });
  f.guard.setActive(true); f.back(); await f.answer(true); f.advanceTimers();
  assert.deepEqual(f.destinations, ['/chana.html']);
});

test('successful navigation cancels the fallback, including a future bfcache return', async () => {
  const f = fixture(); f.guard.setActive(true); f.back(); await f.answer(true);
  f.win.dispatchEvent(new Event('pagehide')); f.advanceTimers();
  assert.deepEqual(f.destinations, []);
});

test('Back closes an enlarged painting before asking to leave the game', async () => {
  const f = fixture(); f.guard.setActive(true); f.overlay = true; f.back();
  assert.equal(f.overlay, false); assert.equal(f.prompts, 0); assert.equal(f.position, 2);
  f.back(); assert.equal(f.prompts, 1); await f.answer(false);
});

test('Back again with the confirmation open keeps one confirmation', async () => {
  const f = fixture(); f.guard.setActive(true); f.back(); f.back();
  assert.equal(f.prompts, 1); await f.answer(false); assert.equal(f.position, 2);
});

test('reload reuses the existing guard; results remove it and restore normal Back', () => {
  const f = fixture(); f.guard.setActive(true);
  const reloaded = fixture({ entries: structuredClone(f.historyEntries), index: f.position });
  reloaded.guard.setActive(true); assert.equal(reloaded.historyEntries.length, 3);
  reloaded.guard.setActive(false); reloaded.flush();
  assert.equal(reloaded.position, 1); assert.equal(reloaded.win.history.state.chanaNavigation, undefined);
  assert.equal(reloaded.win.history.state.retained, 'other history state');
  assert.equal(reloaded.win.history.scrollRestoration, 'auto');
  reloaded.back(); assert.equal(reloaded.position, 0); assert.equal(reloaded.prompts, 0);
});

test('a resumed game waits for touch/key activation before adding history', () => {
  const f = fixture({ activated: false }); f.guard.setActive(true);
  assert.equal(f.historyEntries.length, 2);
  f.win.document.dispatchEvent(new Event('touchend'));
  assert.equal(f.historyEntries.length, 3);
  f.win.document.dispatchEvent(new Event('keydown'));
  assert.equal(f.historyEntries.length, 3);
});

test('refresh/close protection is attached only during an active game', () => {
  const f = fixture();
  for (const active of [false, true, false]) {
    f.guard.setActive(active); f.flush();
    const event = new Event('beforeunload', { cancelable: true });
    f.win.dispatchEvent(event); assert.equal(event.defaultPrevented, active);
  }
});

test('results arriving during the leave prompt cancel a pending exit', async () => {
  const f = fixture(); f.guard.setActive(true); f.back();
  f.guard.setActive(false); f.flush(); await f.answer(true);
  assert.equal(f.position, 1); assert.equal(f.saves, 0);
});

test('same-tab links require confirmation; new-tab intent remains normal', async () => {
  const f = fixture(); f.guard.setActive(true);
  function click(target = '') {
    const anchor = { href: 'https://example.com/', target, hasAttribute: () => false };
    const event = new Event('click', { cancelable: true });
    Object.defineProperties(event, { target: { value: { closest: () => anchor } }, button: { value: 0 } });
    f.win.document.dispatchEvent(event); return event;
  }
  assert.equal(click('_blank').defaultPrevented, false); assert.equal(f.prompts, 0);
  assert.equal(click().defaultPrevented, true); await f.answer(false); assert.equal(f.destinations.length, 0);
  click(); await f.answer(true); assert.deepEqual(f.destinations, ['https://example.com/']);
});
