import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { quiet, seedReady } from './helpers';

test.beforeEach(async ({ context }) => quiet(context));

for (const path of ['/', '/signin', '/help', '/vault', '/playbooks', '/build']) {
  test(`accessibility audit: ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('[data-page-loading]')).toHaveCount(0);
    for (const width of [1366, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze();
      expect(result.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })), `${path} at ${width}px`).toEqual([]);
    }
  });
}

test('mobile navigation contains keyboard focus and returns it on Escape', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/playbooks');
  const rail = page.locator('#rail-nav');
  await expect(rail).toHaveAttribute('inert', '');
  const trigger = page.getByRole('button', { name: 'Playbook navigation', exact: true });
  await trigger.click();
  await expect(page.getByRole('button', { name: 'Close navigation' })).toBeFocused();
  for (let i = 0; i < 35; i++) {
    await page.keyboard.press('Tab');
    expect(await rail.evaluate(el => el.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(rail).toHaveAttribute('inert', '');
});

test('feedback rating supports arrow keys and a single tab stop', async ({ page }) => {
  await page.goto('/help');
  const group = page.getByRole('radiogroup');
  await group.getByRole('radio', { name: '1 out of 5' }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(group.getByRole('radio', { name: '5 out of 5' })).toBeFocused();
  await expect(group.getByRole('radio', { name: '5 out of 5' })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Home');
  await expect(group.getByRole('radio', { name: '1 out of 5' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Your email (optional)')).toBeFocused();
});

test('populated Vault has consecutive heading levels', async ({ page }) => {
  await seedReady(page);
  const levels = await page.locator('h1,h2,h3,h4,h5,h6').evaluateAll(nodes => nodes.map(n => Number(n.tagName.slice(1))));
  for (let i = 1; i < levels.length; i++) expect(levels[i]).toBeLessThanOrEqual(levels[i - 1] + 1);
});

test('Extras keeps focus inside and Escape returns to its trigger', async ({ page }) => {
  await seedReady(page);
  await page.getByRole('button', { name: 'Open 17 · Stick in the designer' }).click();
  await page.locator('.stage-frame svg').first().waitFor();
  await expect(page.locator('meta[name="viewport"]')).not.toHaveAttribute('content', /maximum-scale|user-scalable/);
  const trigger = page.locator('button[aria-controls="dz-more-menu"]');
  await trigger.click();
  const extras = page.getByRole('group', { name: 'Extras', exact: true });
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    expect(await extras.evaluate(el => el.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Shift+Tab');
  expect(await extras.evaluate(el => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(extras).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
