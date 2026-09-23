import { test, expect } from "@playwright/test";

const source = '`alpha`<!-- red underline, Sep 23 2026: "keep me" --> beta';
test.beforeEach(async ({ page }) => {
  await page.addInitScript(text => {
    localStorage.clear();
    localStorage.setItem('cm6-buffer', text);
  }, source);
  await page.goto('/');
});

test('context colors preview wheel variants and apply only on click', async ({ page }) => {
  const mark = page.locator('.cm-content .cm-annotation-mark').first();
  await mark.click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'Annotation styles' });
  await expect(menu.getByRole('menuitem')).toHaveCount(4);
  const sample = menu.locator('.popup-variant-choice');
  await expect(sample).toBeVisible();
  const beforeHover = await sample.evaluate(el => {
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return { width: rect.width, height: rect.height, borderTop: style.borderTopWidth, borderBottom: style.borderBottomWidth, shadow: style.boxShadow };
  });
  await sample.hover();
  const afterHover = await sample.evaluate(el => {
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return { width: rect.width, height: rect.height, borderTop: style.borderTopWidth, borderBottom: style.borderBottomWidth, shadow: style.boxShadow };
  });
  expect(afterHover).toEqual(beforeHover);
  await page.locator('.toolbar').hover();
  const scrollTop = await page.locator('.cm-scroller').evaluate(el => el.scrollTop);
  await page.mouse.wheel(0, 100);
  await expect(menu.locator('.popup-variant-choice')).toHaveText('rail');
  expect(await page.locator('.cm-scroller').evaluate(el => el.scrollTop)).toBe(scrollTop);
  expect(await page.evaluate(() => localStorage.getItem('cm6-buffer'))).toBe(source);
  await menu.getByRole('menuitem', { name: 'green', exact: true }).click();
  await expect(menu).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('cm6-buffer'))).toBe(source.replace('red underline', 'green rail'));
  await expect(page.locator('.cm-content')).toBeFocused();
});

test('variant cycling wraps and dismissal leaves defaults and document unchanged', async ({ page }) => {
  const editor = page.locator('.cm-content');
  await editor.locator('.cm-annotation-mark').first().click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'Annotation styles' });
  await menu.locator('.popup-variant-choice').hover();
  for (const variant of ['box', 'fill', 'right']) {
    await page.mouse.wheel(0, -100);
    await expect(menu.locator('.popup-variant-choice')).toHaveText(variant);
  }
  await page.mouse.wheel(0, 100);
  await expect(menu.locator('.popup-variant-choice')).toHaveText('fill');
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('cm6-buffer'))).toBe(source);
  // Open over unannotated text: the cancelled preview must not become the default.
  const line = editor.locator('.cm-line').first();
  const point = await line.evaluate(el => {
    const node = el.lastChild!;
    const range = document.createRange();
    range.selectNodeContents(node);
    const rect = range.getBoundingClientRect();
    return { x: rect.right - 8, y: rect.y + rect.height / 2 };
  });
  await page.mouse.click(point.x, point.y, { button: 'right' });
  await expect(menu.locator('.popup-variant-choice')).toHaveText('fill');
  await menu.locator('.popup-variant-choice').hover();
  await page.mouse.wheel(0, 100);
  await expect(menu.locator('.popup-variant-choice')).toHaveText('box');
  await page.locator('.toolbar').click();
  await expect(menu).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('cm6-buffer'))).toBe(source);
});

test('context top row retains plain, remove annotation, and delete selection', async ({ page }) => {
  const editor = page.locator('.cm-content');
  const menu = page.getByRole('menu', { name: 'Annotation styles' });
  await editor.locator('.cm-annotation-mark').first().click({ button: 'right' });
  await menu.getByRole('menuitem', { name: 'plain', exact: true }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('cm6-buffer'))).toBe('`alpha` beta');
  await page.keyboard.press('Control+z');
  await editor.locator('.cm-annotation-mark').first().click({ button: 'right' });
  await menu.getByRole('button', { name: 'Remove annotation', exact: true }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('cm6-buffer'))).toBe('alpha beta');
  await page.keyboard.press('Control+a');
  await editor.locator('.cm-line').first().click({ button: 'right', position: { x: 15, y: 8 } });
  await menu.getByRole('button', { name: 'Delete selection', exact: true }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('cm6-buffer'))).toBe('');
});
