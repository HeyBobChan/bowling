import { test, expect } from '@playwright/test';

async function finish(page, score = 125) {
  await page.evaluate((value) => {
    window.__game.startGame(); window.__game.state.score = value; window.__game.state.strikes = Math.floor(value / 10); window.__game.state.knocked = (value % 10) / 5; window.__game.state.time = 60; window.__game.showGameOver();
  }, score);
}
async function prepare(page, options = {}) {
  const calls = [], entries = [];
  let failed = false;
  await page.route('**/api/leaderboards/main**', async (route) => {
    if (route.request().url().endsWith('/runs')) return route.fulfill({ json: { run: { id: '00000000-0000-4000-8000-000000000001', token: 'a'.repeat(64) } } });
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: { entries } });
    }
    const body = route.request().postDataJSON(); calls.push(body);
    const entry = { id: body.submissionId, name: body.name, score: body.score, rank: 1 };
    if (!entries.some((item) => item.id === entry.id)) entries.push(entry);
    if (options.loseResponse && !failed) { failed = true; return route.abort(); }
    return route.fulfill({ status: 201, json: { entry } });
  });
  await page.goto('/bowling.html?sim');
  await page.waitForFunction(() => !!window.__game);
  return { calls, entries };
}

test('keyboard initials and Enter save without restarting, then remember the name', async ({ page }) => {
  const { calls } = await prepare(page);
  await finish(page);
  await page.locator('#score-name').pressSequentially('was');
  await expect(page.locator('#score-name')).toHaveValue('WAS');
  await page.locator('#score-name').press('Enter');
  await expect(page.locator('#score-form [role=status]')).toContainText('נשמר!');
  expect(calls).toHaveLength(1);
  expect(calls[0].score).toBe(125);
  expect(calls[0]).toMatchObject({ durationMs: 60000, strikes: 12, knocked: 1, runToken: 'a'.repeat(64) });
  expect(await page.evaluate(() => window.__game.state.phase)).toBe('over');
  await expect(page.locator('#gameover .leaderboard-mine')).toContainText('WAS');
  await page.reload(); await page.waitForFunction(() => !!window.__game);
  await page.locator('#intro-leaderboard summary').click();
  await expect(page.locator('#intro-leaderboard tbody')).toContainText('WAS');
  await finish(page, 50);
  await expect(page.locator('#score-name')).toHaveValue('WAS');
});

test('invalid names cannot submit, skip sends nothing, and local best survives offline', async ({ page }) => {
  const { calls } = await prepare(page);
  await finish(page);
  await page.locator('#score-name').fill('AB');
  await page.locator('#score-form [type=submit]').click();
  expect(calls).toHaveLength(0);
  await page.locator('#score-form [data-skip]').click();
  await expect(page.locator('#score-form [role=status]')).toContainText('לא נשלחה');
  expect(calls).toHaveLength(0);
  await page.unroute('**/api/leaderboards/main**');
  await page.route('**/api/leaderboards/main**', (route) => route.abort());
  await finish(page, 150);
  await expect(page.locator('#gameover [data-leaderboard] [role=status]')).toContainText('לא זמינה');
  await expect(page.locator('#score-form [type=submit]')).toBeDisabled();
  expect(await page.evaluate(() => localStorage.getItem('bowling-best'))).toBe('150');
  await page.locator('#restartBtn').click();
  expect(await page.evaluate(() => window.__game.state.phase)).toBe('play');
});

test('a rejected run offers a new game without endlessly retrying the score', async ({ page }) => {
  await prepare(page);
  await page.route('**/api/leaderboards/main', (route) => route.request().method() === 'POST'
    ? route.fulfill({ status: 403, json: { error: 'invalid_request' } })
    : route.fulfill({ json: { entries: [] } }));
  await finish(page);
  await page.locator('#score-name').fill('ABC');
  await page.locator('#score-form [type=submit]').click();
  await expect(page.locator('#score-form [role=status]')).toContainText('אי אפשר לאמת');
  await expect(page.locator('#score-form [type=submit]')).toBeDisabled();
  await page.locator('#restartBtn').click();
  expect(await page.evaluate(() => window.__game.state.phase)).toBe('play');
});

test('a lost save response retries the same submission, even with repeated clicks', async ({ page }) => {
  const { calls, entries } = await prepare(page, { loseResponse: true });
  await finish(page);
  await page.locator('#score-name').fill('אבג');
  await page.locator('#score-form [type=submit]').click();
  await expect(page.locator('#score-form [type=submit]')).toHaveText('לנסות שוב');
  await expect(page.locator('#score-name')).toHaveAttribute('readonly', '');
  await page.locator('#score-form [type=submit]').click();
  await expect(page.locator('#score-form [role=status]')).toContainText('נשמר!');
  expect(calls).toHaveLength(2);
  expect(calls[1]).toEqual(calls[0]);
  expect(entries).toHaveLength(1);
});

test('late saves cannot mark a new round as saved', async ({ page }) => {
  await prepare(page);
  await page.unroute('**/api/leaderboards/main**');
  let release, started;
  const waiting = new Promise((resolve) => { started = resolve; });
  await page.route('**/api/leaderboards/main**', async (route) => {
    if (route.request().url().endsWith('/runs')) return route.fulfill({ json: { run: { id: '00000000-0000-4000-8000-000000000001', token: 'a'.repeat(64) } } });
    if (route.request().method() === 'GET') return route.fulfill({ json: { entries: [] } });
    const body = route.request().postDataJSON(); started();
    await new Promise((resolve) => { release = resolve; });
    await route.fulfill({ json: { entry: { id: body.submissionId, name: body.name, score: body.score, rank: 1 } } }).catch(() => {});
  });
  await finish(page);
  await page.locator('#score-name').fill('ABC');
  await page.locator('#score-form [type=submit]').click();
  await waiting;
  await finish(page, 200);
  release();
  await expect(page.locator('#score-form [type=submit]')).toBeEnabled();
  await expect(page.locator('#score-form [role=status]')).toBeEmpty();
});

test.describe('phone leaderboard', () => {
  test.use({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true });
  test('name entry, saving, scrolling and restart work in portrait and landscape', async ({ page }) => {
    await prepare(page);
    for (const viewport of [{ width: 320, height: 568 }, { width: 568, height: 320 }]) {
      await page.setViewportSize(viewport);
      await finish(page);
      await page.locator('#score-name').fill('אבג');
      await page.locator('#score-form [type=submit]').tap();
      await expect(page.locator('#gameover .leaderboard-mine')).toContainText('אבג');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.locator('#restartBtn').tap();
      expect(await page.evaluate(() => window.__game.state.phase)).toBe('play');
    }
  });
});
