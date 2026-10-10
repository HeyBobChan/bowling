import { test, expect } from '@playwright/test';

// Use the actual WebGL engine: ?sim intentionally uses Babylon's NullEngine,
// which cannot verify the canvas pixels a phone must draw each frame.
async function drawingSize(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('#app canvas');
    return { width: canvas.width, height: canvas.height };
  });
}

for (const deviceScaleFactor of [1, 3]) {
  test.describe(`ski at device pixel ratio ${deviceScaleFactor}`, () => {
    test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor });

    test('caps drawing pixels on load, rotation and pixel density changes', async ({ page, context }) => {
      await page.goto('/ski.html');
      await page.waitForFunction(() => !!window.__ski);
      await page.evaluate(() => window.__ski.engine.stopRenderLoop());
      const scale = Math.min(deviceScaleFactor, 2);
      expect(await drawingSize(page)).toEqual({ width: 390 * scale, height: 844 * scale });

      await page.setViewportSize({ width: 844, height: 390 });
      await expect.poll(() => drawingSize(page)).toEqual({ width: 844 * scale, height: 390 * scale });

      // Changing displays/zoom must reapply the cap, not multiply the old scale
      // by the new DPR (Babylon's adaptToDeviceRatio resize behavior).
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 390, height: 844, deviceScaleFactor: 4, mobile: false,
      });
      await expect.poll(() => drawingSize(page)).toEqual({ width: 780, height: 1688 });
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 844, height: 390, deviceScaleFactor: 1, mobile: false,
      });
      await expect.poll(() => drawingSize(page)).toEqual({ width: 844, height: 390 });
    });
  });
}
