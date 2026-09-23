import { test, expect, type Page } from '@playwright/test';

async function pointAt(page: Page, offset: number) {
  return page.locator('.cm-content .cm-line').first().evaluate((el, offset) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const length = node.textContent!.length;
      if (offset >= length) { offset -= length; continue; }
      const range = document.createRange();
      range.setStart(node, offset); range.setEnd(node, offset + 1);
      const rect = range.getBoundingClientRect();
      return { x: rect.x + 1, y: rect.y + rect.height / 2 };
    }
    throw new Error('Text position missing');
  }, offset);
}

for (const hoverSelectionMode of ['word', 'sentence']) {
  test(`${hoverSelectionMode} hover drag selects without moving or annotating text`, async ({ page }) => {
    await page.addInitScript(hoverSelectionMode => {
      localStorage.setItem('cm6-buffer', 'alpha beta gamma.');
      localStorage.setItem('textAnnotate-settings', JSON.stringify({ hoverSelectionMode }));
    }, hoverSelectionMode);
    await page.goto('/');
    await page.locator('.cm-content').focus();
    const start = await pointAt(page, 1);
    const end = await pointAt(page, 9);
    await page.evaluate(() => {
      (window as any).dragStarts = 0;
      document.addEventListener('dragstart', () => (window as any).dragStarts++);
    });
    await page.mouse.move(start.x, start.y);
    await expect.poll(() => page.evaluate(() => getSelection()?.toString())).toContain('alpha');
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 12 });
    await page.mouse.up();
    expect(await page.evaluate(() => (window as any).dragStarts)).toBe(0);
    expect(await page.evaluate(() => localStorage.getItem('cm6-buffer'))).toBe('alpha beta gamma.');
    await expect.poll(() => page.evaluate(() => getSelection()?.toString())).toBe('lpha bet');
    await page.keyboard.press('Space');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('cm6-buffer'))).toBe('a`lpha bet`a gamma.');
  });
}

for (const hoverSelectionMode of ['off', 'word', 'sentence']) {
  test(`double-click annotates one word with hover ${hoverSelectionMode}`, async ({ page }) => {
    await page.addInitScript(hoverSelectionMode => {
      localStorage.setItem('cm6-buffer', 'alpha beta gamma.');
      localStorage.setItem('textAnnotate-settings', JSON.stringify({ hoverSelectionMode }));
    }, hoverSelectionMode);
    await page.goto('/');
    await page.locator('.cm-content').focus();
    await page.keyboard.press('1');
    const point = await pointAt(page, 7);
    await page.mouse.dblclick(point.x, point.y);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('cm6-buffer'))).toMatch(/^alpha `beta`<!-- red fill, .* --> gamma\.$/);
  });
}

test('double-click in Edit mode selects without annotating', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('cm6-buffer', 'alpha beta gamma.'));
  await page.goto('/');
  await page.locator('.cm-content').focus();
  await page.keyboard.press('F2');
  const point = await pointAt(page, 7);
  await page.mouse.dblclick(point.x, point.y);
  await expect.poll(() => page.evaluate(() => getSelection()?.toString())).toBe('beta');
  expect(await page.evaluate(() => localStorage.getItem('cm6-buffer'))).toBe('alpha beta gamma.');
});
