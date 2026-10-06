import { test, expect } from '@playwright/test';
test('complete neutral pages render, stack and preserve large reading text', async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:4390' ? route.continue() : route.abort());
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/', '/workshops/', '/project-support/', '/contact/', '/404/']) {
      await page.goto(path);
      await expect(page.locator('main')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await page.locator('body').evaluate(el => Number.parseFloat(getComputedStyle(el).fontSize))).toBe(22);
      await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', 'noindex,nofollow');
    }
  }
});
test('theme supports persistence, keyboard and system preference', async ({ page }) => {
  await page.goto('/');
  const button = page.getByRole('button', { name: 'Switch light or dark theme' });
  await expect(button).toHaveAttribute('id', 'site-theme-toggle');
  const target = await button.boundingBox(); expect(target!.width).toBeGreaterThanOrEqual(48); expect(target!.height).toBeGreaterThanOrEqual(48);
  await button.focus(); await page.keyboard.press('Enter');
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await page.reload(); await expect(button).toHaveAttribute('aria-pressed', 'true');
  await button.click(); await expect(button).toHaveAttribute('aria-pressed', 'false');
  await page.evaluate(() => localStorage.clear());
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.reload(); await expect(button).toHaveAttribute('aria-pressed', 'true');
});
test('service prices align on desktop and stack on mobile without a live form', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 }); await page.goto('/workshops/');
  const positions = await page.locator('.package-price').evaluateAll(elements => elements.map(el => el.getBoundingClientRect().top));
  expect(positions).toHaveLength(3); expect(Math.max(...positions) - Math.min(...positions)).toBeLessThan(1);
  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await page.locator('.package-price').evaluateAll(elements => elements.map(el => el.getBoundingClientRect().top));
  expect(mobile[1]).toBeGreaterThan(mobile[0]);
  await page.goto('/contact/');
  await expect(page.locator('fieldset')).toHaveAttribute('disabled', '');
  await expect(page.locator('input[name=name]')).toBeDisabled();
  await expect(page.locator('textarea')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Sending unavailable' })).toBeDisabled();
  expect(await page.locator('form').getAttribute('action')).toBeNull();
});
