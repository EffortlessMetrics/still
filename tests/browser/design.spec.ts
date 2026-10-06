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
  expect(positions).toHaveLength(3);
  for (const card of await page.locator('.package-column').all()) {
    expect(await card.locator('.package-price').evaluate(el => getComputedStyle(el).fontSize)).toBe('28px');
  } expect(Math.max(...positions) - Math.min(...positions)).toBeLessThan(1);
  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await page.locator('.package-price').evaluateAll(elements => elements.map(el => el.getBoundingClientRect().top));
  expect(mobile[1]).toBeGreaterThan(mobile[0]);
  expect(await page.locator('.package-price').first().evaluate(el => getComputedStyle(el).fontSize)).toBe('24px');
  await page.goto('/contact/');
  await expect(page.locator('fieldset')).toHaveAttribute('disabled', '');
  await expect(page.locator('input[name=name]')).toBeDisabled();
  await expect(page.locator('textarea')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Sending unavailable' })).toBeDisabled();
  expect(await page.locator('form').getAttribute('action')).toBeNull();
});

test('keyboard navigation and preview metadata work through the public composition', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  expect(new URL(page.url()).hash).toBe('#main');
  await expect(page.locator('main')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Explore workshops' })).toBeFocused();
  expect(await page.locator('html').evaluate(el => getComputedStyle(el).scrollBehavior)).toBe('auto');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/workshops\/$/);
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', 'https://clear-current.example/workshops/');
  const robots = await page.request.get('/robots.txt');
  expect(await robots.text()).toContain('Disallow: /');
  const sitemap = await page.request.get('/sitemap.xml');
  expect(await sitemap.text()).toContain('https://clear-current.example/project-support/');
});

test('theme remains usable when persistence is unavailable and makes no external requests', async ({ page }) => {
  const errors: string[] = [];
  const external: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (new URL(request.url()).origin !== 'http://127.0.0.1:4390') external.push(request.url());
  });
  await page.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage unavailable'); } }));
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const button = page.getByRole('button', { name: 'Switch light or dark theme' });
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test('actions retain comfortable padding with tighter label and arrow spacing', async ({ page }) => {
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    for (const action of await page.locator('.cta').all()) {
      const metrics = await action.evaluate(el => {
        const style = getComputedStyle(el);
        const box = el.getBoundingClientRect();
        return { gap: style.columnGap, horizontalPadding: style.paddingLeft, height: box.height, left: box.left, right: box.right };
      });
      expect(metrics.gap).toBe('12px');
      expect(metrics.horizontalPadding).toBe('22px');
      expect(metrics.height).toBeGreaterThanOrEqual(48);
      expect(metrics.left).toBeGreaterThanOrEqual(0);
      expect(metrics.right).toBeLessThanOrEqual(width);
    }
  }
});

test('editorial dividers stay extremely faint and responsive with or without JavaScript', async ({ browser }) => {
  for (const javascript of [true, false]) for (const scheme of ['light', 'dark'] as const) for (const width of [1440, 390, 320]) {
    const context = await browser.newContext({ javaScriptEnabled: javascript, colorScheme: scheme, viewport: { width, height: 900 } });
    const page = await context.newPage();
    for (const route of ['/workshops/', '/project-support/']) {
      await page.goto('http://127.0.0.1:4390' + route);
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator('.package-columns')).toHaveClass(/service-dividers/);
      expect(await page.locator('.package-column.offer').count()).toBe(0);
      const divider = await page.locator('.package-column').nth(1).evaluate(el => {
        const style = getComputedStyle(el, '::before');
        return { opacity: style.opacity, mask: style.maskImage, dots: style.backgroundImage, repeat: style.backgroundRepeat, width: style.width, height: style.height, filter: style.filter, animation: style.animationName, pointerEvents: style.pointerEvents };
      });
      expect(divider.opacity).toBe('0.1');
      expect(divider.mask).toContain('linear-gradient');
      expect(divider.mask).toContain('50%');
      expect(divider.dots).toContain('radial-gradient');
      expect(divider.filter).toBe('none');
      expect(divider.animation).toBe('none');
      expect(divider.pointerEvents).toBe('none');
      expect(divider.repeat).toBe(width > 760 ? 'repeat-y' : 'repeat-x');
      expect(width > 760 ? divider.width : divider.height).toBe('2px');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await context.close();
  }
});
