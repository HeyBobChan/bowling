import { test, expect } from '@playwright/test';

async function prepare(page) {
  await page.goto('/bowling.html?sim');
  await page.waitForFunction(() => !!window.__game);
  await page.evaluate(() => {
    const G = window.__game;
    window.controls = {
      reset(s = 0, d = 0) {
        // Keep collisions and random strikes out of these input/trajectory checks.
        let seed = 42;
        Math.random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
        G.startGame();
        for (const monster of G.state.monsters) G.app.scene.remove(monster);
        for (const rack of G.state.racks) G.app.scene.remove(rack.group);
        G.state.monsters = []; G.state.racks = [];
        G.state.spawnTimer = Infinity; G.state.nextRackS = 1000;
        G.state.s = s; G.state.d = d; G.state.heading = G.track.heading(s);
        G.track.point(s, d, G.ball.position); G.ball.position.y = 1;
        const forward = G.track.tangent(G.state.heading);
        G.camera.position.copy(G.ball.position).addScaledVector(forward, -12);
        G.camera.position.y = 8;
        G.camera.lookAt(G.ball.position.clone().addScaledVector(forward, 6));
      },
      step(frames = 1) { for (let i = 0; i < frames; i++) G.step(1 / 60); },
      pointer(type, x, y, id = 1, time = 0, target = '#bowling-touch') {
        const event = new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true });
        Object.defineProperty(event, 'timeStamp', { value: time });
        document.querySelector(target).dispatchEvent(event);
      },
      swipe(dx, dy, duration = 120) {
        this.pointer('pointerdown', 170, 450);
        this.pointer('pointermove', 170 + dx, 450 + dy, 1, duration);
        this.pointer('pointerup', 170 + dx, 450 + dy, 1, duration);
        this.step();
      },
      key(code, down) { window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code })); },
    };
    window.controls.reset();
  });
}

test.describe('Bowling swipe rolling', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test.beforeEach(async ({ page }) => { await prepare(page); });

  test('finger movement pushes immediately, release adds no launch, and power follows travel and speed', async ({ page }) => {
    await expect(page.locator('#touch')).toHaveCount(0);
    const result = await page.evaluate(() => {
      const C = window.controls, G = window.__game;
      C.pointer('pointerdown', 180, 450);
      C.pointer('pointermove', 180, 300, 1, 120);
      C.step();
      const moving = G.state.vel.length();
      C.pointer('pointerup', 180, 300, 1, 120);
      C.step();
      const forward = { speed: G.state.vel.length(), s: G.state.s, d: G.state.d };
      C.reset(); C.swipe(0, -40); const short = G.state.vel.length();
      C.reset(); C.swipe(0, -150, 800); const slow = G.state.vel.length();
      C.reset(); C.swipe(100, -100);
      const diagonal = { s: G.state.s, d: G.state.d };
      for (let i = 0; i < 10; i++) C.swipe(0, -150);
      return { moving, forward, short, slow, diagonal, max: G.state.vel.length() };
    });
    expect(result.moving).toBeGreaterThan(15);
    expect(result.forward.speed).toBeLessThan(result.moving);
    expect(result.forward.s).toBeGreaterThan(0);
    expect(Math.abs(result.forward.d)).toBeLessThan(0.01);
    expect(result.forward.speed).toBeGreaterThan(result.short + 5);
    expect(result.forward.speed).toBeGreaterThan(result.slow + 2);
    expect(result.diagonal.s).toBeGreaterThan(0);
    expect(result.diagonal.d).toBeGreaterThan(0);
    expect(result.max).toBeLessThanOrEqual(19);
  });

  test('one unbroken stroke can roll forward, turn right, then steer left before lifting', async ({ page }) => {
    const result = await page.evaluate(() => {
      const C = window.controls, G = window.__game;
      let x = 150, y = 600, time = 0;
      C.pointer('pointerdown', x, y);
      const move = (dx, dy) => {
        for (let i = 0; i < 12; i++) {
          x += dx; y += dy; time += 1000 / 60;
          C.pointer('pointermove', x, y, 1, time); C.step();
        }
        return { s: G.state.s, d: G.state.d, x: G.state.vel.x, z: G.state.vel.z, contact: G.app.input.contactId };
      };
      const forward = move(0, -8);
      const right = move(8, 0);
      const left = move(-8, 0);
      const beforeRelease = G.state.vel.length();
      C.pointer('pointerup', x, y, 1, time); C.step();
      return { forward, right, left, beforeRelease, afterRelease: G.state.vel.length() };
    });
    expect(result.forward.s).toBeGreaterThan(0.5);
    expect(result.forward.z).toBeLessThan(-5);
    expect(result.right.s).toBeGreaterThan(result.forward.s);
    expect(result.right.d).toBeGreaterThan(result.forward.d + 0.5);
    expect(result.right.x).toBeGreaterThan(5);
    expect(result.left.x).toBeLessThan(-2);
    expect(result.forward.contact).not.toBeNull();
    expect(result.right.contact).toBe(result.forward.contact);
    expect(result.left.contact).toBe(result.forward.contact);
    expect(result.afterRelease).toBeLessThan(result.beforeRelease);
  });

  test('resting a finger brakes to a stop, lifting coasts, and a fresh touch can grip a rolling ball', async ({ page }) => {
    const result = await page.evaluate(() => {
      const C = window.controls, G = window.__game;
      C.pointer('pointerdown', 170, 450);
      C.pointer('pointermove', 170, 300, 1, 120); C.step();
      const moving = G.state.vel.length();
      // A resting thumb may still generate tiny coordinate changes.
      for (let i = 0; i < 30; i++) {
        C.pointer('pointermove', 170 + Math.sin(i) * 0.7, 300 + Math.cos(i) * 0.7, 1, 120 + (i + 1) * 1000 / 60);
        C.step();
      }
      const held = { speed: G.state.vel.length(), s: G.state.s, time: G.state.worldTime };
      C.pointer('pointerup', 170, 300, 1, 620); C.step(60);
      const liftedAfterStop = { speed: G.state.vel.length(), s: G.state.s, time: G.state.worldTime };
      C.reset(); C.swipe(0, -150); C.step(30);
      const released = G.state.vel.length();
      C.pointer('pointerdown', 170, 450); C.step(30);
      return { moving, held, liftedAfterStop, released, gripped: G.state.vel.length() };
    });
    expect(result.moving).toBeGreaterThan(15);
    expect(result.held.speed).toBe(0);
    expect(result.liftedAfterStop).toEqual(result.held);
    expect(result.released).toBeGreaterThan(12);
    expect(result.gripped).toBe(0);
  });

  test('a held finger can start and gently brake again after changing direction', async ({ page }) => {
    const result = await page.evaluate(() => {
      const C = window.controls, G = window.__game;
      C.pointer('pointerdown', 170, 450);
      const move = (y, time) => { C.pointer('pointermove', 170, y, 1, time); C.step(); return G.state.vel.z; };
      const first = move(410, 120);
      const brake = move(440, 300);
      const resume = move(400, 420);
      const brakeAgain = move(430, 600);
      return { first, brake, resume, brakeAgain };
    });
    expect(result.first).toBeLessThan(-3);
    expect(Math.abs(result.brake)).toBeLessThan(0.001);
    expect(result.resume).toBeLessThan(-3);
    expect(Math.abs(result.brakeAgain)).toBeLessThan(0.001);
  });

  test('the same finger path behaves consistently at different touch sampling rates', async ({ page }) => {
    const samples = await page.evaluate(() => {
      const C = window.controls, G = window.__game;
      return [30, 60, 120].map(rate => {
        C.reset(); C.pointer('pointerdown', 170, 500);
        const steps = rate * 0.3;
        for (let i = 1; i <= steps; i++) {
          C.pointer('pointermove', 170, 500 - 120 * i / steps, 1, 1000 * i / rate);
          G.step(1 / rate);
        }
        return { rate, speed: G.state.vel.length(), s: G.state.s };
      });
    });
    expect(Math.min(...samples.map(s => s.speed))).toBeGreaterThan(10);
    expect(Math.max(...samples.map(s => s.speed)) - Math.min(...samples.map(s => s.speed))).toBeLessThan(0.35);
    expect(Math.max(...samples.map(s => s.s)) - Math.min(...samples.map(s => s.s))).toBeLessThan(0.35);
  });

  test('momentum coasts, sideways swipes steer, opposing swipes brake, and stopping freezes the world', async ({ page }) => {
    const result = await page.evaluate(() => {
      const C = window.controls, G = window.__game;
      C.swipe(0, -150); C.step(60);
      const coast = { speed: G.state.vel.length(), s: G.state.s };
      C.swipe(80, 0); C.step(20);
      const steer = { d: G.state.d, s: G.state.s };
      C.reset(); C.swipe(0, -150); C.step(30);
      const beforeBrake = -G.state.vel.z;
      C.swipe(0, 60); const afterBrake = -G.state.vel.z;
      C.swipe(0, 150); const reverse = G.state.vel.z;
      C.reset(); C.swipe(0, -150); C.step(420);
      const stopped = { speed: G.state.vel.length(), time: G.state.worldTime, s: G.state.s };
      C.step(120);
      return { coast, steer, beforeBrake, afterBrake, reverse, stopped, later: { time: G.state.worldTime, s: G.state.s } };
    });
    expect(result.coast.speed).toBeGreaterThan(8);
    expect(result.coast.s).toBeGreaterThan(10);
    expect(result.steer.d).toBeGreaterThan(1);
    expect(result.steer.s).toBeGreaterThan(result.coast.s);
    expect(result.afterBrake).toBeGreaterThan(0);
    expect(result.afterBrake).toBeLessThan(result.beforeBrake);
    expect(result.reverse).toBeGreaterThan(0);
    expect(result.stopped.speed).toBe(0);
    expect(result.later).toEqual({ time: result.stopped.time, s: result.stopped.s });
  });

  test('rolling follows bends without centering, screen-relative swipes still steer, and lane edges stop sideways motion', async ({ page }) => {
    const result = await page.evaluate(() => {
      const C = window.controls, G = window.__game;
      C.reset(61, 4);
      const heading = G.state.heading;
      C.swipe(0, -150); C.step(120);
      const bend = { turn: Math.abs(G.state.heading - heading), d: G.state.d, s: G.state.s, side: G.state.vel.dot(G.track.right(G.state.heading)) };
      // The current camera, after turning, defines the next swipe's direction.
      const screenRight = G.camera.getWorldDirection(G.state.vel.clone());
      const yaw = Math.atan2(-screenRight.x, -screenRight.z);
      G.track.right(yaw, screenRight);
      G.state.vel.set(0, 0, 0);
      C.swipe(100, 0);
      const screenSteer = G.state.vel.dot(screenRight);
      C.reset(61, 11.8); C.swipe(150, 0); C.step(120);
      return { bend, screenSteer, edge: { d: G.state.d, speed: G.state.vel.length() } };
    });
    expect(result.bend.turn).toBeGreaterThan(0.15);
    expect(result.bend.s).toBeGreaterThan(75);
    expect(result.bend.d).toBeCloseTo(4, 5);
    expect(Math.abs(result.bend.side)).toBeLessThan(0.001);
    expect(result.screenSteer).toBeGreaterThan(10);
    expect(result.edge.d).toBeLessThanOrEqual(12.001);
    expect(result.edge.speed).toBeLessThan(0.7);
  });

  test('a gentle opposing swipe stops a slow roll without launching it backward', async ({ page }) => {
    const result = await page.evaluate(() => {
      const C = window.controls, G = window.__game;
      C.swipe(0, -150); C.step(180);
      const before = -G.state.vel.z;
      C.swipe(0, 18, 180);
      const stopped = { speed: G.state.vel.length(), s: G.state.s };
      C.step(120);
      const later = G.state.s;
      C.swipe(0, 18, 180);
      return { before, stopped, later, freshPush: G.state.vel.z };
    });
    expect(result.before).toBeGreaterThan(2);
    expect(result.before).toBeLessThan(3);
    expect(result.stopped.speed).toBe(0);
    expect(result.later).toBe(result.stopped.s);
    expect(result.freshPush).toBeGreaterThan(0);
  });

  test('forward and reverse rolls do not jump above the speed cap at bend boundaries', async ({ page }) => {
    const results = await page.evaluate(() => {
      const G = window.__game;
      G.track.extendTo(2000);
      const boundaries = G.track.segments.slice(1).map((segment, index) => ({ before: G.track.segments[index], after: segment }))
        .filter(({ before, after }) => before.k !== after.k);
      // Keep boundaries near-to-far so track trimming never removes a later sample.
      return boundaries.flatMap(({ before, after }) => {
        const samples = [];
        for (const d of [-12, 12]) for (const direction of [1, -1]) for (const dt of [1 / 60, 0.05]) {
          const s = after.s0 - direction * 0.001;
          G.state.s = s; G.state.d = d; G.state.heading = G.track.heading(s);
          G.track.point(s, d, G.ball.position); G.ball.position.y = 1;
          G.state.vel.copy(G.track.tangent(G.state.heading)).multiplyScalar(19 * direction);
          G.app.input.rolling = true;
          const previous = G.ball.position.clone();
          const previousTime = G.app.time;
          G.step(dt);
          // A rack encountered this far along the track can trigger hitstop;
          // compare speed in simulated seconds, as the movement loop does.
          const elapsed = G.app.time - previousTime;
          samples.push({ from: before.k, to: after.k, d, direction, dt, speed: previous.distanceTo(G.ball.position) / elapsed, offset: G.state.d });
        }
        return samples;
      });
    });
    expect(results.length).toBeGreaterThan(50);
    for (const sample of results) {
      expect(sample.speed, JSON.stringify(sample)).toBeLessThanOrEqual(19.01);
      expect(sample.speed, JSON.stringify(sample)).toBeGreaterThan(18);
      expect(sample.offset).toBeCloseTo(sample.d, 4);
    }
  });

  test('rotating the screen cancels a partial gesture but preserves existing rolling momentum', async ({ page }) => {
    await page.evaluate(() => {
      window.controls.swipe(0, -150);
      window.controls.pointer('pointerdown', 170, 450);
      window.controls.pointer('pointermove', 300, 450);
    });
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.locator('.roll-guide')).not.toHaveClass(/visible/);
    const result = await page.evaluate(() => {
      window.controls.pointer('pointerup', 300, 450);
      window.controls.step(30);
      return { rolling: window.__game.app.input.rolling, speed: window.__game.state.vel.length(), d: window.__game.state.d };
    });
    expect(result.rolling).toBe(true);
    expect(result.speed).toBeGreaterThan(12);
    expect(Math.abs(result.d)).toBeLessThan(0.01);
  });

  test('accessible activation and a touch tap between frames each fire one shot', async ({ page }) => {
    await page.locator('.roll-fire').evaluate((button) => button.click());
    expect(await page.evaluate(() => { window.controls.step(30); return window.__game.state.ammo; })).toBe(5);
    await page.locator('.roll-fire').tap();
    expect(await page.evaluate(() => { window.controls.step(30); return window.__game.state.ammo; })).toBe(4);
    await page.evaluate(() => {
      window.__game.state.phase = 'over';
      document.querySelector('.roll-fire').click();
      window.controls.reset();
      window.controls.step();
    });
    expect(await page.evaluate(() => window.__game.state.ammo)).toBe(6);
  });

  test('taps, canceled gestures, overlays, restart, and focus loss do not leave pending pushes or firing', async ({ page }) => {
    const result = await page.evaluate(() => {
      const C = window.controls, G = window.__game;
      const speeds = [];
      C.swipe(4, -6); speeds.push(G.state.vel.length());
      for (const event of ['pointercancel', 'lostpointercapture']) {
        C.pointer('pointerdown', 170, 450);
        C.pointer('pointermove', 170, 300);
        C.pointer(event, 170, 300);
        C.pointer('pointerup', 170, 300);
        C.step(); speeds.push(G.state.vel.length());
      }
      G.state.phase = 'over';
      C.swipe(0, -150);
      C.reset(); C.step(); speeds.push(G.state.vel.length());
      C.pointer('pointerdown', 170, 450);
      C.pointer('pointerup', 170, 300, 1, 120);
      C.reset(); C.step(); speeds.push(G.state.vel.length());
      C.pointer('pointerdown', 300, 700, 2, 0, '.roll-fire');
      C.pointer('pointerdown', 170, 450);
      C.pointer('pointerup', 170, 300, 1, 120);
      window.dispatchEvent(new Event('blur'));
      C.step(); speeds.push(G.state.vel.length());
      return { speeds, fire: G.app.input.p1.down('a'), guide: document.querySelector('.roll-guide').classList.contains('visible') };
    });
    expect(result.speeds.every((speed) => speed === 0)).toBe(true);
    expect(result.fire).toBe(false);
    expect(result.guide).toBe(false);
  });

  test('real touch capture supports firing with one finger while another rolls', async ({ page, context }) => {
    const fire = await page.locator('.roll-fire').boundingBox();
    const cdp = await context.newCDPSession(page);
    const shoot = { id: 1, x: fire.x + fire.width / 2, y: fire.y + fire.height / 2 };
    const start = { id: 2, x: 140, y: 490 };
    const end = { id: 2, x: 140, y: 330 };
    const side = { id: 2, x: 220, y: 330 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [shoot] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [shoot, start] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [shoot, end] });
    await expect(page.locator('.roll-guide')).toHaveClass(/visible/);
    expect(await page.evaluate(() => { window.controls.step(); return window.__game.state.vel.z; })).toBeLessThan(-10);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [shoot, side] });
    await expect(page.locator('.roll-guide')).toHaveCSS('left', '220px');
    expect(await page.evaluate(() => { window.controls.step(); return window.__game.state.vel.x; })).toBeGreaterThan(3);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [side] });
    await page.evaluate(() => window.controls.step(30));
    const rolling = await page.evaluate(() => ({ speed: window.__game.state.vel.length(), ammo: window.__game.state.ammo, fire: window.__game.app.input.p1.down('a') }));
    expect(rolling.speed).toBeGreaterThan(10);
    expect(rolling.ammo).toBeLessThan(6);
    expect(rolling.fire).toBe(true);
    await page.keyboard.down('ArrowLeft');
    expect(await page.evaluate(() => window.__game.app.input.p1.down('a'))).toBe(true);
    await page.keyboard.up('ArrowLeft');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    expect(await page.evaluate(() => window.__game.app.input.p1.down('a'))).toBe(false);
    await expect(page.locator('.roll-guide')).not.toHaveClass(/visible/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await cdp.detach();
  });
});

test('keyboard trajectories match on desktop and touch devices, including after switching from swipes', async ({ browser }) => {
  const trajectories = [];
  for (const hasTouch of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch });
    const page = await context.newPage();
    await prepare(page);
    await expect(page.locator('#bowling-touch')).toHaveCount(hasTouch ? 1 : 0);
    trajectories.push(await page.evaluate((touch) => {
      const C = window.controls, G = window.__game;
      C.key('ArrowUp', true); C.step();
      const firstFrame = { speed: G.state.vel.length(), s: G.state.s };
      C.step(59);
      const fullSpeed = G.state.vel.length();
      C.key('ArrowUp', false); C.step(60);
      const releasedSpeed = G.state.vel.length();
      C.reset(70, 2);
      if (touch) {
        C.swipe(0, -150);
        // Keep the same starting position/velocity, while retaining swipe mode.
        G.state.s = 70; G.state.d = 2; G.state.heading = G.track.heading(70);
        G.track.point(70, 2, G.ball.position); G.ball.position.y = 1;
        G.state.vel.set(0, 0, 0);
      }
      // Settle the camera identically before comparing the two devices.
      G.state.camYaw = G.state.heading;
      const forward = G.track.tangent(G.state.heading);
      G.camera.position.copy(G.ball.position).addScaledVector(forward, -12); G.camera.position.y = 8;
      G.camera.lookAt(G.ball.position.clone().addScaledVector(forward, 6));
      const samples = [];
      for (const [code, down, frames] of [['ArrowUp', true, 60], ['ArrowRight', true, 20], ['ArrowRight', false, 20], ['ArrowUp', false, 60]]) {
        C.key(code, down); C.step(frames);
        samples.push({ s: G.state.s, d: G.state.d, speed: G.state.vel.length(), rolling: G.app.input.rolling });
      }
      return { firstFrame, fullSpeed, releasedSpeed, samples };
    }, hasTouch));
    await context.close();
  }
  // Fixed checkpoints from the pre-swipe keyboard behavior, independent of the
  // desktop/touch parity comparison (which alone could hide a shared regression).
  expect(trajectories[0].firstFrame.speed).toBeCloseTo(0.88, 10);
  expect(trajectories[0].firstFrame.s).toBeCloseTo(0.0146666666666667, 10);
  expect(trajectories[0].fullSpeed).toBeCloseTo(19, 10);
  expect(trajectories[0].releasedSpeed).toBe(0);
  expect(trajectories[0].samples.at(-1).speed).toBe(0);
  expect(trajectories[1]).toEqual(trajectories[0]);
});
