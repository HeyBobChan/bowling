import { test, expect } from '@playwright/test';

// אברא כדברא: what is written on the notebook line comes alive above it.
// ?sim stops the animation loop; window.__abra.step(dt, n) drives the world by hand.
async function load(page, query = 'sim') {
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/abra.html?${query}`); await page.waitForFunction(() => window.__abra && window.__abra.ready);
  return errors;
}
const cast = (page, text, seconds = 1.5) => page.evaluate(([t, s]) => { __abra.cast(t); __abra.step(1 / 60, Math.round(s * 60)); __abra.render(); return __abra.state(); }, [text, seconds]);
const advance = (page, seconds) => page.evaluate((s) => { __abra.step(1 / 60, Math.round(s * 60)); __abra.render(); return __abra.state(); }, seconds);
const words = (state) => state.ents.map((e) => e.word);

test('Abra: the alphabet keys write on the line and the spell brings the word to life', async ({ page }) => {
  const errors = await load(page);
  await expect(page.locator('.game-home')).toHaveAttribute('href', '/');
  await expect(page.locator('#keys .key')).toHaveCount(27);
  expect(await page.locator('#keys .key').first().textContent()).toBe('א');
  for (const ch of 'כלב') await page.locator(`[data-ch="${ch}"]`).click();
  expect((await advance(page, 0.1)).typing).toBe('כלב');
  await page.locator('#key-cast').click({ force: true });
  const state = await advance(page, 2);
  expect(words(state)).toEqual(['כלב']);
  expect(state.ents[0].kind).toBe('walk');
  expect(state.written).toEqual(['כלב.']);
  expect(state.typing).toBe('');
  expect(state.found).toContain('כלב');
  await expect(page.locator('#found-count')).toHaveText('1');
  // the dog is made of nothing but the letters of its own name
  const letters = await page.evaluate(() => { const e = __abra.world().ents[0]; return [...new Set(e.L.gl)].length; });
  expect(letters).toBe(3);
  expect(state.drawn).toBeGreaterThan(state.glyphs);        // the dog plus the writing on the line
  expect(errors).toEqual([]);
});

test('Abra: a real keyboard writes Hebrew by letter or by key position; backspace, space and Enter work', async ({ page }) => {
  const errors = await load(page);
  await page.keyboard.press('KeyJ'); await page.keyboard.press('KeyU'); await page.keyboard.press('KeyK');   // ח ו ל on an English layout
  expect((await advance(page, 0.05)).typing).toBe('חול');
  await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace');
  expect((await advance(page, 0.05)).typing).toBe('');
  // a Hebrew layout reports the letter itself, whatever the key
  const hebrew = (text) => page.evaluate((t) => { for (const ch of t) dispatchEvent(new KeyboardEvent('keydown', { key: ch, code: 'KeyQ', bubbles: true })); }, text);
  await hebrew('חתול');
  await page.keyboard.press('Space'); await page.keyboard.press('Space');
  await hebrew('כחול');
  expect((await advance(page, 0.05)).typing).toBe('חתול כחול');
  await page.keyboard.press('Enter');
  const state = await advance(page, 1.5);
  expect(words(state)).toEqual(['חתול']);
  expect(state.written).toEqual(['חתול כחול.']);
  const blue = await page.evaluate(() => { const e = __abra.world().ents[0]; let r = 0, b = 0; for (let i = 0; i < e.L.n; i++) if (!e.L.edge[i]) { r += e.L.col[i * 3]; b += e.L.col[i * 3 + 2]; } return b > r * 1.5; });
  expect(blue).toBe(true);
  expect(errors).toEqual([]);
});

test('Abra: plurals and numbers multiply, sizes scale, misspellings are forgiven, and לא takes back the last thing', async ({ page }) => {
  const errors = await load(page);
  expect(words(await cast(page, 'פרפרים'))).toEqual(['פרפר', 'פרפר', 'פרפר']);
  let state = await cast(page, 'חמישה דגים');
  expect(words(state).filter((w) => w === 'דג')).toHaveLength(5);
  state = await cast(page, 'לא');
  expect(words(state).filter((w) => w === 'דג')).toHaveLength(0);
  expect(state.history).toEqual(['פרפרים']);
  const small = (await cast(page, 'פיל קטנטן')).ents.find((e) => e.word === 'פיל').size;
  const huge = (await cast(page, 'פיל ענק')).ents.filter((e) => e.word === 'פיל').map((e) => e.size).sort((a, b) => b - a)[0];
  expect(huge).toBeGreaterThan(small * 2.5);
  state = await cast(page, 'צפור');                                   // ציפור, written without its yod
  expect(state.written.at(-1)).toBe('ציפור.');
  expect(words(state)).toContain('ציפור');
  expect(errors).toEqual([]);
});

test('Abra: a word the page does not know walks as itself, and אני signs the page', async ({ page }) => {
  const errors = await load(page);
  let state = await cast(page, 'גבריאל');
  expect(state.ents).toHaveLength(1);
  expect(state.ents[0]).toMatchObject({ word: 'גבריאל', kind: 'name' });
  expect(state.name).toBe('');
  state = await cast(page, 'אני זאב');
  expect(state.ents.map((e) => e.kind)).toEqual(['name', 'name']);     // not a wolf: it is who you are
  expect(state.name).toBe('זאב');
  const x0 = state.ents[0].x;
  state = await advance(page, 12);
  expect(Math.abs(state.ents[0].x - x0)).toBeGreaterThan(5);            // names really do get up and walk
  expect(errors).toEqual([]);
});

test('Abra: the world answers words: night puts walkers to sleep, a fish asks for water, sun after rain makes a rainbow', async ({ page }) => {
  const errors = await load(page);
  await cast(page, 'כלב'); await cast(page, 'ינשוף');
  let state = await cast(page, 'לילה', 8);
  expect(state.night).toBeGreaterThan(0.9);
  expect(state.ents.find((e) => e.word === 'כלב').asleep).toBe(true);
  expect(state.ents.find((e) => e.word === 'ינשוף').asleep).toBe(false);  // owls are for the night
  state = await cast(page, 'שמש', 8);
  expect(state.night).toBeLessThan(0.1);
  expect(state.ents.find((e) => e.word === 'כלב').asleep).toBe(false);

  await cast(page, 'דג', 3);
  const dry = await page.evaluate(() => __abra.world().ents.find((e) => e.word === 'דג').y);
  state = await cast(page, 'ים', 9);
  expect(state.sea).toBeGreaterThan(0.9);
  const wet = await page.evaluate(() => { const w = __abra.world(); const e = w.ents.find((x) => x.word === 'דג'); return { y: e.y, top: w.seaTop, ground: w.ground }; });
  expect(wet.y).toBeGreaterThanOrEqual(wet.top);
  expect(wet.y).toBeLessThanOrEqual(wet.ground + 3);
  expect(dry).toBeGreaterThanOrEqual(wet.ground - 12);

  state = await cast(page, 'גשם', 4);
  expect(state.rain).toBeGreaterThan(0.4);
  expect(await page.evaluate(() => __abra.world().rainbow.target)).toBe(0);
  await advance(page, 16);
  expect(await page.evaluate(() => __abra.world().rainbow.target)).toBe(1); // nobody wrote קשת
  expect(errors).toEqual([]);
});

test('Abra: a page that keeps being written on stays bounded', async ({ page }) => {
  const errors = await load(page);
  const list = ['כלב', 'חתולים', 'מיליון נמלים', 'פיל ענק', 'בית', 'עץ', 'גשם', 'שלג', 'מפלצות', 'דרקון צבעוני', 'ים', 'לוויתן', 'רכבת', 'יום הולדת', 'בום', 'לרקוד', 'כוכבים', 'נועה', 'שלושה לבבות', 'אש'];
  let peak = { ents: 0, glyphs: 0, drawn: 0 };
  for (let round = 0; round < 3; round++) for (const text of list) {
    const s = await cast(page, text, 0.8);
    peak = { ents: Math.max(peak.ents, s.ents.length), glyphs: Math.max(peak.glyphs, s.glyphs), drawn: Math.max(peak.drawn, s.drawn) };
  }
  const state = await advance(page, 5);
  expect(peak.ents).toBeLessThanOrEqual(34);
  expect(peak.glyphs).toBeLessThan(22000);
  expect(peak.drawn).toBeLessThan(30000);
  expect(state.layouts).toBeLessThanOrEqual(260);
  expect(state.written.length).toBeLessThanOrEqual(14);
  expect(state.history.length).toBeLessThanOrEqual(60);
  expect(errors).toEqual([]);
});

test('Abra: the ending folds the world into its own words, and they can unfold again', async ({ page }) => {
  const errors = await load(page);
  await cast(page, 'שמש'); await cast(page, 'כלב כחול'); await cast(page, 'אני דנה');
  let state = await page.evaluate(() => { __abra.startStory(); __abra.step(1 / 60, 240); __abra.render(); return __abra.state(); });
  expect(state.phase).toBe('story');
  expect(state.ents).toHaveLength(0);
  expect(state.history).toEqual(['שמש', 'כלב כחול', 'אני דנה']);
  expect(state.drawn).toBeGreaterThan(50);                              // the story, written out letter by letter
  await expect(page.locator('#dock')).toHaveAttribute('data-off', '');
  state = await page.evaluate(() => { __abra.leaveStory(false); __abra.step(1 / 60, 360); __abra.render(); return __abra.state(); });
  expect(state.phase).toBe('play');
  expect(words(state).sort()).toEqual(['דנה', 'כלב', 'שמש'].sort());
  expect(state.history).toEqual(['שמש', 'כלב כחול', 'אני דנה']);
  expect(errors).toEqual([]);
});

test('Abra: every word in the dictionary has its picture, and a remembered page comes back', async ({ page }) => {
  const errors = await load(page, 'sim&keep');
  const missing = await page.evaluate(() => [...__abra.byWord.values()].filter((e) => !__abra.world().sprites.has(e.e)).map((e) => e.w));
  expect(missing).toEqual([]);
  await page.evaluate(() => localStorage.clear());
  await page.reload(); await page.waitForFunction(() => window.__abra && window.__abra.ready);
  await cast(page, 'בית'); await cast(page, 'לילה'); await cast(page, 'בום');   // a bang is not something a page keeps
  await page.reload(); await page.waitForFunction(() => window.__abra && window.__abra.ready);
  const state = await advance(page, 6);
  expect(state.history).toEqual(['בית', 'לילה']);
  expect(words(state)).toEqual(['בית']);
  expect(state.night).toBeGreaterThan(0.9);
  expect(state.found.sort()).toEqual(['בום', 'בית', 'לילה'].sort());
  await page.evaluate(() => localStorage.clear());
  expect(errors).toEqual([]);
});
