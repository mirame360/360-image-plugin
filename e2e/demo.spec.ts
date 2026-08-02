import { expect, test, type Page } from '@playwright/test';

const TEST_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8Dwn4GBgYGJAQoAHgQCAf6cWQAAAABJRU5ErkJggg==',
  'base64',
);

async function openDemo(page: Page): Promise<void> {
  await page.route('https://pannellum.org/images/alma.jpg', route => route.fulfill({
    status: 200,
    contentType: 'image/png',
    body: TEST_PNG,
  }));
  await page.route('https://images.unsplash.com/**', route => route.fulfill({
    status: 200,
    contentType: 'image/png',
    body: TEST_PNG,
  }));
  await page.goto('/');
  await expect(page.locator('#console-logs')).toContainText('Panorama texture loaded');
}

test.describe('360 Image Player demo', () => {
  test.beforeEach(async ({ page }) => {
    await openDemo(page);
  });

  test('renders WebGL, controls, compass and updates the viewport', async ({ page }) => {
    const canvas = page.locator('#viewer canvas');
    await expect(canvas).toBeVisible();
    await expect(page.locator('#viewer')).toHaveCSS('touch-action', 'none');
    await expect(canvas).toHaveCSS('touch-action', 'none');
    await expect(page.getByRole('button', { name: 'Zoom in' })).toBeVisible();
    await expect(page.getByLabel('Panorama heading')).toBeVisible();

    await page.getByRole('button', { name: 'Zoom in' }).click();
    await expect(page.locator('#hud-hfov')).toHaveText('hfov 80.0°');

    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.5);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.4, { steps: 5 });
      await page.mouse.up();
      await expect(page.locator('#hud-yaw')).not.toHaveText('yaw 0.0°');
    }
  });

  test('loads the next ordered image URL when the primary source fails', async ({ page }) => {
    await page.route('**/fallback-primary.webp', route => route.fulfill({ status: 415 }));
    await page.route('**/fallback.jpeg', route => route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: TEST_PNG,
    }));

    await page.evaluate(() => {
      const player = (window as typeof window & {
        __image360Player?: {
          load: () => void;
          on: (name: string, callback: () => void) => void;
          setImageUrl: (source: string[]) => void;
        };
      }).__image360Player;
      if (!player) throw new Error('Demo player is unavailable');
      const result = new Promise<string>((resolve) => {
        player.on('load', () => resolve('loaded'));
        player.on('error', () => resolve('error'));
        player.setImageUrl(['/fallback-primary.webp', '/fallback.jpeg']);
      });
      (window as typeof window & { __fallbackResult?: Promise<string> }).__fallbackResult = result;
    });

    const result = await page.evaluate(() => (
      (window as typeof window & { __fallbackResult?: Promise<string> }).__fallbackResult
    ));
    expect(result).toBe('loaded');
    await expect(page.locator('#viewer canvas')).toBeVisible();
  });

  test('updates MLS mode, color filters and serialized state', async ({ page }) => {
    await page.locator('#btn-branding').click();
    await expect(page.locator('#hud-mode')).toHaveText('unbranded');

    const exposure = page.locator('[data-filter="exposure"]');
    await exposure.evaluate((input: HTMLInputElement) => {
      input.value = '0.5';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.locator('#btn-show-config').click();

    const state = page.locator('#state-view');
    await expect(state).toContainText('"brandingMode": "unbranded"');
    await expect(state).toContainText('"exposure": 0.5');
  });

  test('completes the clue, quiz and product flow', async ({ page }) => {
    await page.locator('#btn-focus-clue').click();
    const clue = page.locator('.default-hotspot-container').filter({ hasText: 'Find the key' });
    await expect(clue).toBeVisible();
    await clue.click();
    await expect(page.locator('#console-logs')).toContainText('Discovered "gallery-key"');

    await page.locator('#btn-focus-quiz').click();
    const quiz = page.locator('.default-hotspot-container').filter({
      has: page.getByRole('button', { name: 'ZIP' }),
    });
    await expect(quiz).toBeVisible();
    await quiz.hover();
    await quiz.getByRole('button', { name: 'ZIP' }).click();
    await expect(page.locator('#console-logs')).toContainText('"ZIP" is correct');

    await page.locator('#btn-focus-product').click();
    const product = page.locator('.default-hotspot-container').filter({ hasText: 'Panorama lamp' });
    await expect(product).toBeVisible();
    await product.click();
    await expect(page.locator('#console-logs')).toContainText('Host callback received for Panorama lamp');
  });

  test('uploads panorama and nadir images and captures a local snapshot', async ({ page }) => {
    await page.locator('#file-upload').setInputFiles({
      name: 'panorama.png',
      mimeType: 'image/png',
      buffer: TEST_PNG,
    });
    await expect(page.locator('#console-logs')).toContainText('Loaded panorama.png');

    await page.locator('#nadir-upload').setInputFiles({
      name: 'nadir.png',
      mimeType: 'image/png',
      buffer: TEST_PNG,
    });
    await expect(page.locator('#console-logs')).toContainText('Applied nadir.png');

    await page.locator('#btn-snapshot').click();
    await expect(page.locator('#snapshot-result')).toBeVisible();
    await expect(page.locator('#snapshot-caption')).toHaveText('Local canvas snapshot');
  });

  test('sends the current viewport to the remote snapshot endpoint', async ({ page }) => {
    let requestBody: Record<string, unknown> | undefined;
    await page.route('**/snapshot-test', async route => {
      requestBody = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: '/snapshot-result.png' }),
      });
    });
    await page.route('**/snapshot-result.png', route => route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: TEST_PNG,
    }));

    await page.locator('#snapshot-endpoint').fill('/snapshot-test');
    await page.locator('#snapshot-width').fill('1920');
    await page.locator('#snapshot-height').fill('1080');
    await page.locator('#btn-remote-snapshot').click();

    await expect(page.locator('#snapshot-caption')).toHaveText('High-resolution server snapshot');
    expect(requestBody).toMatchObject({
      width: 1920,
      height: 1080,
      format: 'jpeg',
      yaw: expect.any(Number),
      pitch: expect.any(Number),
      hfov: expect.any(Number),
    });
  });
});
