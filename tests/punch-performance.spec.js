import { test, expect } from '@playwright/test';

async function loadForest(page) {
  await page.goto('/punch.html?sim');
  await page.waitForFunction(() => window.__punch);
}

test('forest render resources stay bounded across restarts and waves', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await loadForest(page);
  const result = await page.evaluate(() => {
    const G = window.__punch;
    const meshes = new Set(), materials = new Set(), geometries = new Set();
    const sample = () => {
      // Camera movement between waves should not count newly visible scenery as
      // a resource leak; warm all scenery and fighter parts from the first frame.
      G.app.scene.traverse((object) => { object.frustumCulled = false; });
      for (const f of G.fighters) {
        for (const root of [f.pivot, f.shadow]) root.traverse((object) => {
          if (!object.isMesh) return;
          meshes.add(object.uuid);
          geometries.add(object.geometry.uuid);
          for (const material of [object.material].flat()) materials.add(material.uuid);
        });
      }
      G.render();
      return {
        geometries: G.app.renderer.info.memory.geometries,
        textures: G.app.renderer.info.memory.textures,
        meshes: meshes.size, materials: materials.size, uniqueGeometries: geometries.size,
      };
    };
    const restarts = [];
    for (let i = 0; i < 10; i++) {
      G.startMatch(i % 2 === 0);
      restarts.push(sample());
    }
    G.startMatch(true);
    const waves = [sample()];
    for (let wave = 2; wave <= 7; wave++) {
      // Drive the normal knockout removal and delayed next-wave path. Avoid
      // depending on random AI combat to knock out all four enemies together.
      for (const f of G.fighters.filter((fighter) => !fighter.isPlayer)) {
        f.alive = false;
        f.koTimer = 2.2;
      }
      G.match.pendingWave = 1.2;
      for (let i = 0; i < 156; i++) G.step(1 / 60);
      waves.push({ ...sample(), wave: G.match.wave, count: G.fighters.length,
        hearts: G.fighters.filter((f) => !f.isPlayer).map((f) => f.maxHearts - f.spec.hearts) });
    }
    return { restarts, waves };
  });
  expect(errors).toEqual([]);
  for (const sample of result.restarts) expect(sample).toEqual(result.restarts[0]);
  for (let i = 1; i < result.waves.length; i++) {
    const { wave, count, hearts, ...resources } = result.waves[i];
    expect(resources).toEqual(result.waves[0]);
    expect(wave).toBe(i + 1);
    expect(count).toBe(6);
    expect(hearts).toEqual([i, i, i, i]);
  }
  console.info('Forest resources after 10 restarts and 7 waves:', result.restarts[0], result.waves.at(-1));
});

test('reused fighters restart with fresh poses and combat state after interrupted animations', async ({ page }) => {
  await loadForest(page);
  const result = await page.evaluate(() => {
    const G = window.__punch;
    const poses = () => Object.fromEntries(G.fighters.map((fighter) => {
      const transforms = [];
      fighter.pivot.traverse((object) => transforms.push([
        ...object.position.toArray(), ...object.quaternion.toArray(), ...object.scale.toArray(),
      ]));
      return [fighter.spec.key, transforms];
    }));
    G.startMatch(true);
    const fresh = poses();
    for (const f of G.fighters) {
      f.hitstun = 0.2;
      f.punch = { arm: 'right', t: 0.12, hit: true, hit2: true };
    }
    G.step(0.01);
    const stretched = G.fighters[0].built.arms.right.arm.scale.x;
    const animated = poses();
    // Interrupt knockout tumbling as well as both kinds of punch animation.
    for (const f of G.fighters) {
      f.alive = false;
      f.koTimer = 2.2;
      f.body.setRotation({ x: 0.6, y: 0, z: 0, w: 0.8 }, true);
    }
    G.step(0.01);
    G.startMatch(false);
    const onePlayer = poses();
    G.startMatch(true);
    return {
      fresh, animated, stretched, onePlayer, restarted: poses(),
      cards: document.querySelectorAll('.card').length,
      state: G.fighters.map((f) => ({ alive: f.alive, hearts: f.hearts, max: f.maxHearts,
        punch: f.punch, dash: f.dash, hitstun: f.hitstun, removed: f.removed })),
    };
  });
  expect(result.stretched).toBeGreaterThan(3);
  expect(result.animated).not.toEqual(result.fresh);
  expect(result.restarted).toEqual(result.fresh);
  for (const [key, pose] of Object.entries(result.onePlayer)) expect(pose).toEqual(result.fresh[key]);
  expect(Object.keys(result.onePlayer)).toHaveLength(5);
  expect(result.cards).toBe(6);
  for (const f of result.state) expect(f).toEqual({ alive: true, hearts: f.max, max: f.max,
    punch: null, dash: 0, hitstun: 0, removed: false });
});
