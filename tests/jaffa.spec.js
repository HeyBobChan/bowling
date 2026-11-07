import { test, expect } from '@playwright/test';

async function load(page) {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/jaffa.html?sim'); await page.waitForFunction(() => window.__jaffa);
  return errors;
}
async function start(page) { await page.locator('#start').click(); }
async function advance(page, seconds = .29) {
  await page.evaluate(seconds => { for (let t = 0; t < seconds; t += 1 / 120) window.__jaffa.step(1 / 120); window.__jaffa.render(); }, seconds);
}
async function key(page, code) { await page.keyboard.press(code); await advance(page); }
async function clearTraffic(page) {
  await page.evaluate(() => { for (const row of __jaffa.rows.values()) for (const h of row.hazards) { h.x = 12; h.speed = 0; } });
}

test('Jaffa: real controls hop, collect once, obey trees and score only new distance', async ({ page }) => {
  const errors = await load(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Small dog.Big city.');
  await expect(page.locator('.game-home')).toHaveAttribute('href', '/');
  await page.keyboard.press('Space'); await clearTraffic(page);
  await key(page, 'ArrowUp');
  expect(await page.evaluate(() => ({ row: __jaffa.state.row, score: __jaffa.state.score, bones: __jaffa.state.bones }))).toEqual({ row: 1, score: 11, bones: 1 });
  await key(page, 'ArrowDown'); await key(page, 'KeyW');
  expect(await page.evaluate(() => __jaffa.state.score)).toBe(11);
  await key(page, 'KeyD'); expect(await page.evaluate(() => __jaffa.state.col)).toBe(1);
  await key(page, 'KeyA'); expect(await page.evaluate(() => __jaffa.state.col)).toBe(0);
  for (let i = 0; i < 3; i++) await key(page, 'ArrowUp');
  expect(await page.evaluate(() => __jaffa.state.row)).toBe(4);
  await key(page, 'ArrowUp'); await key(page, 'ArrowUp');
  await key(page, 'ArrowLeft'); await key(page, 'ArrowLeft');
  // The ficus at (-3, 6) blocks entry through the actual movement handler.
  await key(page, 'ArrowLeft'); expect(await page.evaluate(() => __jaffa.state.col)).toBe(-2);
  expect(errors).toEqual([]);
});

test('Jaffa: rice bonus protects against real traffic, expires, and cannot be farmed', async ({ page }) => {
  await load(page); await start(page); await clearTraffic(page);
  // Reach the rice from the previous road row, avoiding any plaza furniture.
  for (let i = 0; i < 3; i++) await key(page, 'ArrowUp');
  const col = await page.evaluate(() => __jaffa.rows.get(4).pickup.col);
  for (let i = 0; i < Math.abs(col); i++) await key(page, col > 0 ? 'ArrowRight' : 'ArrowLeft');
  const before = await page.evaluate(() => __jaffa.state.score);
  await key(page, 'ArrowUp');
  expect(await page.evaluate(() => ({ rice: __jaffa.state.rice, score: __jaffa.state.score, shield: __jaffa.state.shield > 4 }))).toEqual({ rice: 1, score: before + 51, shield: true });
  await expect(page.locator('#shield')).toBeVisible();
  await key(page, 'ArrowDown'); await key(page, 'ArrowUp');
  expect(await page.evaluate(() => __jaffa.state.rice)).toBe(1);
  await key(page, 'ArrowUp');
  await page.evaluate(() => { const h = __jaffa.rows.get(5).hazards[0]; h.x = __jaffa.state.col * 1.6; h.speed = 0; });
  await advance(page, .2); expect(await page.evaluate(() => __jaffa.state.hearts)).toBe(3);
  await advance(page, await page.evaluate(() => __jaffa.state.shield + .15));
  expect(await page.evaluate(() => __jaffa.state.hearts)).toBe(2);
  await expect(page.locator('#shield')).toBeHidden();
});

test('Jaffa: three traffic collisions end the run; immunity, restart and best score work', async ({ page }) => {
  await load(page); await start(page); await clearTraffic(page);
  await key(page, 'ArrowUp'); await key(page, 'ArrowUp');
  await page.evaluate(() => { const h = __jaffa.rows.get(2).hazards[0]; h.x = 0; h.speed = 0; });
  await advance(page, .1); expect(await page.evaluate(() => __jaffa.state.hearts)).toBe(2);
  await advance(page, .7); expect(await page.evaluate(() => __jaffa.state.hearts)).toBe(2);
  await advance(page, .5); expect(await page.evaluate(() => __jaffa.state.hearts)).toBe(1);
  await advance(page, 1.3);
  expect(await page.evaluate(() => __jaffa.state.phase)).toBe('over');
  await expect(page.getByRole('dialog')).toBeVisible(); await expect(page.locator('#best-score')).toHaveText('12');
  expect(await page.evaluate(() => __jaffa.music.playing)).toBe(false);
  await page.locator('#again').click();
  expect(await page.evaluate(() => ({ phase: __jaffa.state.phase, score: __jaffa.state.score, hearts: __jaffa.state.hearts, row: __jaffa.state.row, bone: __jaffa.rows.get(1).pickup.collected }))).toEqual({ phase: 'playing', score: 0, hearts: 3, row: 0, bone: false });
});

test('Jaffa: pause freezes a hop and traffic; focus loss pauses; mute persists', async ({ page }) => {
  await load(page); await start(page); await page.keyboard.press('ArrowRight'); await advance(page, .05);
  await page.keyboard.press('KeyP');
  const frozen = await page.evaluate(() => ({ time: __jaffa.state.time, dog: __jaffa.dog.position.toArray(), traffic: __jaffa.rows.get(2).hazards[0].x, camera: __jaffa.camera.matrixWorld.toArray() }));
  await advance(page, 2);
  expect(await page.evaluate(() => ({ time: __jaffa.state.time, dog: __jaffa.dog.position.toArray(), traffic: __jaffa.rows.get(2).hazards[0].x, camera: __jaffa.camera.matrixWorld.toArray() }))).toEqual(frozen);
  expect(await page.evaluate(() => __jaffa.music.playing)).toBe(false);
  await page.keyboard.press('Space'); await advance(page, .3);
  expect(await page.evaluate(() => __jaffa.state.col)).toBe(1);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  expect(await page.evaluate(() => __jaffa.state.phase)).toBe('paused');
  await page.locator('#again').click();
  await page.locator('#sound').click(); await expect(page.locator('#sound')).toHaveAttribute('aria-pressed', 'true');
  await page.reload(); await page.waitForFunction(() => window.__jaffa);
  await expect(page.locator('#sound')).toHaveAttribute('aria-pressed', 'true');
});

test('Jaffa: generation remains navigable and resources stay bounded over a long street and restarts', async ({ page }) => {
  await load(page); await start(page);
  const result = await page.evaluate(() => {
    const g = __jaffa; const samples = []; let traversable = true, bothDirections = new Set(), kinds = new Set();
    for (let distance = 0; distance <= 400; distance += 12) {
      g.state.maxRow = distance; g.state.row = distance; g.state.cameraRow = distance; g.ensureRows(); g.step(.01); g.render();
      for (const row of g.rows.values()) {
        // Each plaza still has several exits; the center is no longer a free route.
        traversable &&= row.blocked.size <= 3 && [...Array(11)].some((_, col) => !row.blocked.has(col -5));
        kinds.add(row.kind); row.hazards.forEach(h => bothDirections.add(h.dir));
      }
      samples.push({ rows: g.rows.size, geometry: g.renderer.info.memory.geometries, textures: g.renderer.info.memory.textures, programs: g.renderer.info.programs.length });
    }
    const reset = [];
    for (let i = 0; i < 5; i++) { g.startGame(); g.render(); reset.push({ geometry: g.renderer.info.memory.geometries, textures: g.renderer.info.memory.textures, programs: g.renderer.info.programs.length }); }
    return { samples, reset, traversable, directions: [...bothDirections], kinds: [...kinds] };
  });
  expect(result.traversable).toBe(true); expect(result.directions.sort()).toEqual([-1, 1]); expect(result.kinds.sort()).toEqual(['delivery', 'plaza', 'scooter']);
  expect(Math.max(...result.samples.map(s => s.rows))).toBeLessThanOrEqual(27);
  expect(Math.max(...result.samples.map(s => s.geometry))).toBeLessThan(450);
  expect(Math.max(...result.samples.map(s => s.textures))).toBeLessThanOrEqual(14);
  expect(Math.max(...result.samples.map(s => s.programs))).toBeLessThan(16);
  expect(result.reset.slice(1)).toEqual(Array(4).fill(result.reset[0]));
});

test('Jaffa: mobile tap, swipe, d-pad and camera stay usable without page overflow', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await context.newPage(); const errors = await load(page); await page.locator('#start').tap(); await clearTraffic(page);
  await page.locator('[data-dir="up"]').tap(); await advance(page);
  expect(await page.evaluate(() => __jaffa.state.row)).toBe(1);
  // A swipe is routed through the actual pointer handlers on the canvas.
  await page.locator('#world canvas').dispatchEvent('pointerdown', { pointerId: 1, clientX: 180, clientY: 350, pointerType: 'touch' });
  await page.locator('#world canvas').dispatchEvent('pointerup', { pointerId: 1, clientX: 260, clientY: 350, pointerType: 'touch' });
  await advance(page); expect(await page.evaluate(() => __jaffa.state.col)).toBe(1);
  for (let i = 0; i < 4; i++) { await page.locator('[data-dir="right"]').tap(); await advance(page); }
  await advance(page, 1);
  const result = await page.evaluate(() => {
    const g = __jaffa, projected = g.dog.position.clone().project(g.camera);
    const btn = document.querySelector('[data-dir="right"]'), r = btn.getBoundingClientRect();
    return { overflow: document.documentElement.scrollWidth > innerWidth, dpr: g.renderer.getPixelRatio(), x: projected.x, col: g.state.col, hit: document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === btn };
  });
  expect(result).toMatchObject({ overflow: false, dpr: 2, col: 5, hit: true }); expect(Math.abs(result.x)).toBeLessThan(.8);
  expect(errors).toEqual([]); await context.close();
});

test('Jaffa: original drawing cutouts and the rendered game remain monochrome', async ({ page }) => {
  await load(page); await start(page);
  const art = await page.evaluate(() => {
    const g = __jaffa;
    const actors = [g.dog, g.rows.get(2).hazards[0].mesh, g.rows.get(5).hazards[0].mesh, g.rows.get(1).pickup.mesh, g.rows.get(4).pickup.mesh];
    const sources = actors.map(actor => {
      const sprite = actor.userData.sprite, canvas = sprite.material.map.image;
      const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let colored = 0, dark = 0, transparent = 0, white = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] !== data[i +1] || data[i] !== data[i +2]) colored++;
        if (data[i +3] === 0) transparent++;
        else if (data[i] < 80) dark++;
        else if (data[i] > 245) white++;
      }
      return { name: sprite.material.map.name, width: canvas.width, height: canvas.height, colored, dark, white, transparent, isSprite: sprite.isSprite };
    });
    const canvas = document.createElement('canvas'); canvas.width = g.renderer.domElement.width; canvas.height = g.renderer.domElement.height;
    const ctx = canvas.getContext('2d'); g.render(); ctx.drawImage(g.renderer.domElement, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data; let coloredPixels = 0;
    for (let i = 0; i < pixels.length; i += 4) if (Math.max(pixels[i], pixels[i +1], pixels[i +2]) -Math.min(pixels[i], pixels[i +1], pixels[i +2]) > 1) coloredPixels++;
    const uiColors = [...document.querySelectorAll('button,h1,.scoreboard,.lives,.toast,.shield-status')].flatMap(element => {
      const style = getComputedStyle(element); return [style.color, style.backgroundColor, style.borderTopColor];
    });
    return { sources, coloredPixels, uiColors, materialCount: actors.map(a => a.children.length) };
  });
  expect(art.sources.map(({ name, width, height }) => ({ name, width, height }))).toEqual([
    { name: 'original-drawing:dog', width: 371, height: 222 },
    { name: 'original-drawing:delivery', width: 374, height: 334 },
    { name: 'original-drawing:scooter', width: 173, height: 260 },
    { name: 'original-drawing:bone', width: 98, height: 55 },
    { name: 'original-drawing:rice', width: 82, height: 104 },
  ]);
  for (const source of art.sources) {
    expect(source.isSprite).toBe(true); expect(source.colored).toBe(0);
    expect(source.dark).toBeGreaterThan(100); expect(source.white).toBeGreaterThan(100); expect(source.transparent).toBeGreaterThan(100);
  }
  expect(art.coloredPixels).toBe(0);
  for (const color of art.uiColors) { const [r, g, b] = color.match(/[\d.]+/g).map(Number); expect(r).toBe(g); expect(r).toBe(b); }
  // The same source art must mirror when the dog changes horizontal direction.
  await key(page, 'ArrowRight'); const right = await page.evaluate(() => __jaffa.dog.userData.sprite.geometry.getAttribute('uv').getX(0));
  await key(page, 'ArrowLeft'); const left = await page.evaluate(() => __jaffa.dog.userData.sprite.geometry.getAttribute('uv').getX(0));
  expect(right + left).toBe(1); expect(right).not.toBe(left);
});

test('Jaffa: original leg and wheel ink animates, body art stays fixed, and pause freezes motion', async ({ page }, testInfo) => {
  const errors = await load(page), shaderErrors = [];
  page.on('console', message => { if (message.type() === 'error' && /WebGL|shader|GLSL/.test(message.text())) shaderErrors.push(message.text()); });
  await start(page);
  const result = await page.evaluate(() => {
    const g = __jaffa, scene = g.scene.clone(false), camera = g.camera.clone(); scene.fog = null;
    camera.left = -1.5; camera.right = 1.5; camera.top = 2.2; camera.bottom = -.2;
    camera.position.set(0, 0, 5); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix();
    g.renderer.setPixelRatio(1); g.renderer.setSize(400, 320, false);
    const capture = actor => {
      // Inspect ink deformation separately from the whole-character lean/contact tilt.
      const sprite = actor.userData.sprite, rotation = sprite.material.rotation;
      sprite.material.rotation = 0;
      scene.clear(); scene.add(sprite.clone()); g.renderer.render(scene, camera);
      sprite.material.rotation = rotation;
      const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = 320;
      const ctx = canvas.getContext('2d'); ctx.drawImage(g.renderer.domElement, 0, 0);
      return { canvas, pixels: ctx.getImageData(0, 0, 400, 320).data };
    };
    const differences = (a, b, actor, upperLimit) => {
      let changed = 0, fixedBodyChanged = 0, color = 0;
      const sprite = actor.userData.sprite, sourceHeight = sprite.material.map.image.height;
      for (let i = 0; i < a.pixels.length; i += 4) {
        const pixelY = Math.floor(i / 4 / 400);
        const worldY = camera.top -(pixelY + .5) / 320 * (camera.top -camera.bottom);
        const sourceY = (sprite.position.y + sprite.scale.y * (1 -sprite.center.y) -worldY) / sprite.scale.y * sourceHeight;
        const delta = Math.max(...[0, 1, 2, 3].map(channel => Math.abs(a.pixels[i +channel] -b.pixels[i +channel])));
        if (delta > 8) { changed++; if (sourceY >= 0 && sourceY < upperLimit) fixedBodyChanged++; }
        if (Math.max(b.pixels[i], b.pixels[i +1], b.pixels[i +2]) -Math.min(b.pixels[i], b.pixels[i +1], b.pixels[i +2]) > 1) color++;
      }
      return { changed, fixedBodyChanged, color };
    };
    const delivery = g.rows.get(2).hazards[0], scooter = g.rows.get(5).hazards[0];
    const dogRest = capture(g.dog), deliveryRest = capture(delivery.mesh), scooterRest = capture(scooter.mesh);
    // At rest, the rig must render identically to a plain original-art sprite.
    // This catches crop-edge artifacts caused by implicit texture derivatives.
    const originalMatch = [g.dog, delivery.mesh, scooter.mesh].map((actor, index) => {
      const sprite = actor.userData.sprite, rig = sprite.material;
      const plain = rig.clone(); sprite.material = plain;
      const original = capture(actor); sprite.material = rig; plain.dispose();
      return differences([dogRest, deliveryRest, scooterRest][index], original, actor, 0).changed;
    });
    g.hop('up'); for (let i = 0; i < 10; i++) g.step(1 / 120);
    const dogHop = capture(g.dog), deliveryRoll = capture(delivery.mesh), scooterRoll = capture(scooter.mesh);
    const anglesBeforePause = [delivery.mesh.userData.motion.angles.toArray(), scooter.mesh.userData.motion.angles.toArray(), g.dog.userData.motion.hop];
    g.pause(); for (let i = 0; i < 60; i++) g.step(1 / 120);
    const frozenDog = capture(g.dog), frozenDelivery = capture(delivery.mesh);
    const anglesAfterPause = [delivery.mesh.userData.motion.angles.toArray(), scooter.mesh.userData.motion.angles.toArray(), g.dog.userData.motion.hop];
    g.resume(); for (let i = 0; i < 25; i++) g.step(1 / 120);
    const dogLanding = capture(g.dog);
    // Two riders of the same type must own independent, distance-driven motion.
    const a = g.rows.get(2).hazards[0], b = g.rows.get(3).hazards[0];
    const beforeA = a.mesh.userData.motion.distance, beforeB = b.mesh.userData.motion.distance;
    a.speed = 2; b.speed = 4; g.step(.1);
    const travelRatio = (b.mesh.userData.motion.distance -beforeB) / (a.mesh.userData.motion.distance -beforeA);
    // Crossing the off-screen wrap boundary must not spin a wheel by 26 units.
    a.x = 12.99; const wrapBefore = a.mesh.userData.motion.distance; g.step(.02);
    const wrapTravel = a.mesh.userData.motion.distance -wrapBefore;
    const sheet = document.createElement('canvas'); sheet.width = 1200; sheet.height = 1050;
    const ctx = sheet.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, sheet.width, sheet.height); ctx.fillStyle = '#222'; ctx.font = '17px sans-serif';
    const frames = [[dogRest, dogHop, dogLanding], [deliveryRest, deliveryRoll, frozenDelivery], [scooterRest, scooterRoll, null]];
    const captions = [['Original / standing', 'Mid-hop / legs tucked', 'Landed / original pose'], ['Delivery / original wheels', 'Delivery / turning wheels', 'Paused / unchanged'], ['Scooter / original wheels', 'Scooter / turning wheels', '']];
    frames.forEach((row, y) => row.forEach((frame, x) => { if (frame) ctx.drawImage(frame.canvas, x * 400, y * 350 + 30); ctx.fillText(captions[y][x], x * 400 + 20, y * 350 + 25); }));
    return {
      dog: differences(dogRest, dogHop, g.dog, 100), delivery: differences(deliveryRest, deliveryRoll, delivery.mesh, 230), scooter: differences(scooterRest, scooterRoll, scooter.mesh, 200),
      landed: differences(dogRest, dogLanding, g.dog, 100).changed,
      frozen: differences(dogHop, frozenDog, g.dog, 100).changed + differences(deliveryRoll, frozenDelivery, delivery.mesh, 230).changed,
      anglesBeforePause, anglesAfterPause, travelRatio, wrapTravel, originalMatch, sheet: sheet.toDataURL('image/png'),
    };
  });
  const { writeFile } = await import('node:fs/promises');
  await writeFile(testInfo.outputPath('jaffa-motion-sheet.png'), Buffer.from(result.sheet.split(',')[1], 'base64'));
  expect(errors).toEqual([]); expect(shaderErrors).toEqual([]);
  expect(result.dog.changed).toBeGreaterThan(250); expect(result.delivery.changed).toBeGreaterThan(40); expect(result.scooter.changed).toBeGreaterThan(15);
  for (const actor of [result.dog, result.delivery, result.scooter]) { expect(actor.fixedBodyChanged).toBe(0); expect(actor.color).toBe(0); }
  expect(result.landed).toBe(0); expect(result.frozen).toBe(0); expect(result.anglesAfterPause).toEqual(result.anglesBeforePause);
  expect(result.originalMatch).toEqual([0, 0, 0]);
  expect(result.travelRatio).toBeCloseTo(2, 6); expect(result.wrapTravel).toBeGreaterThan(0); expect(result.wrapTravel).toBeLessThan(.06);
});

test('Jaffa: the dog remains visibly drawn at both mobile edges and in front of scenery', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage(); await load(page); await page.locator('#start').tap(); await clearTraffic(page);
  for (const [direction, count, col] of [['right', 5, 5], ['left', 10, -5]]) {
    for (let i = 0; i < count; i++) { await page.locator(`[data-dir="${direction}"]`).tap(); await advance(page); }
    const evidence = await page.evaluate(() => {
      const g = __jaffa, canvas = document.createElement('canvas'); canvas.width = g.renderer.domElement.width; canvas.height = g.renderer.domElement.height;
      const ctx = canvas.getContext('2d');
      const capture = () => { g.render(); ctx.drawImage(g.renderer.domElement, 0, 0); return ctx.getImageData(0, 0, canvas.width, canvas.height).data; };
      const visible = capture(); g.dog.visible = false; const hidden = capture(); g.dog.visible = true; g.render();
      let changed = 0; for (let i = 0; i < visible.length; i += 4) if (Math.abs(visible[i] -hidden[i]) > 15) changed++;
      return { col: g.state.col, changed, x: g.dog.position.clone().project(g.camera).x };
    });
    expect(evidence.col).toBe(col); expect(evidence.changed).toBeGreaterThan(200); expect(Math.abs(evidence.x)).toBeLessThan(.8);
  }
  await context.close();
});

test('Jaffa: contact produces readable damage, a brief impact stop, and a visible player', async ({ page }) => {
  await load(page); await start(page); await clearTraffic(page);
  await key(page, 'ArrowUp'); await key(page, 'ArrowUp');
  await page.evaluate(() => { const h = __jaffa.rows.get(2).hazards[0]; h.x = 1.6; h.speed = 0; });
  await advance(page, 1 / 120);
  await expect(page.locator('#toast')).toHaveText('Ouch! One heart lost. 2 chances left.');
  const before = await page.evaluate(() => ({ time: __jaffa.state.time, x: __jaffa.rows.get(3).hazards[0].x }));
  await advance(page, .05);
  expect(await page.evaluate(() => ({ time: __jaffa.state.time, x: __jaffa.rows.get(3).hazards[0].x }))).toEqual(before);
  expect(await page.evaluate(() => ({ hearts: __jaffa.state.hearts, player: __jaffa.dog.visible, impact: __jaffa.impact.visible }))).toEqual({ hearts: 2, player: true, impact: true });
  await page.evaluate(() => { __jaffa.rows.get(2).hazards[0].x = 12; });
  await advance(page, .8);
  expect(await page.evaluate(() => ({ player: __jaffa.dog.visible, impact: __jaffa.impact.visible, moving: __jaffa.state.time > 1 }))).toEqual({ player: true, impact: false, moving: true });
});

test('Jaffa: forward-only play cannot bypass route choices or collect protection automatically', async ({ page }) => {
  await load(page); await start(page);
  const runs = await page.evaluate(() => {
    const g = __jaffa, result = [];
    for (const delay of [0, .74, 1.48, 2.59]) {
      g.startGame(); for (let t = 0; t < delay; t += 1 / 120) g.step(1 / 120);
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp' }));
      for (let t = 0; t < 30 && g.state.phase === 'playing'; t += 1 / 120) g.step(1 / 120);
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowUp' }));
      result.push({ row: g.state.row, rice: g.state.rice, phase: g.state.phase });
    }
    return result;
  });
  for (const run of runs) { expect(run.row).toBeLessThanOrEqual(11); expect(run.row).toBeGreaterThan(2); expect(run.rice).toBe(0); expect(run.phase).toBe('over'); }
});

test('Jaffa: a timed route with sidesteps and waits reaches row 40 without damage', async ({ page }) => {
  await load(page); await start(page);
  const result = await page.evaluate(() => {
    // Replay a successful route against real moving traffic, with no changes to
    // player position, health, shields, obstacles or vehicle speeds.
    const route = [
      'up', 'right', 'up', 'up', 'up', 'up', 'up', 'right', 'up', 'right', 'right', 'up',
      'up', 'up', 'wait', 'wait', 'up', 'up', 'up', 'up', 'up', 'up', 'up', 'left',
      'up', 'up', 'up', 'right', 'right', 'up', 'up', 'up', 'up', 'up', 'up', 'up',
      'up', 'up', 'up', 'up', 'wait', 'left', 'up', 'right', 'up', 'up', 'up', 'up',
      'up', 'up', 'left', 'left', 'up', 'left', 'up',
    ];
    for (const direction of route) {
      if (direction !== 'wait') {
        const code = `Arrow${direction[0].toUpperCase()}${direction.slice(1)}`;
        window.dispatchEvent(new KeyboardEvent('keydown', { code }));
        window.dispatchEvent(new KeyboardEvent('keyup', { code }));
      }
      for (let i = 0; i < 30; i++) __jaffa.step(1 / 120);
    }
    return { row: __jaffa.state.row, hearts: __jaffa.state.hearts, phase: __jaffa.state.phase };
  });
  expect(result).toEqual({ row: 40, hearts: 3, phase: 'playing' });
});
