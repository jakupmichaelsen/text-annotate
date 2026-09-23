import { test, expect } from '@playwright/test';

test('scroll border Off persists and preserves margins', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const settings = () => page.evaluate(() => JSON.parse(localStorage.getItem('cm6-layout-settings') || '{}'));
  const before = await settings();
  await page.getByLabel('Scroll border color').selectOption('off');
  await expect(page.locator('.scroll-border-guide-top, .scroll-border-guide-bottom')).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByLabel('Scroll border color')).toHaveValue('off');
  await expect(page.locator('.scroll-border-guide-top, .scroll-border-guide-bottom')).toHaveCount(0);
  const after = await settings();
  expect(after.cursorScrollMarginTopLines).toBe(before.cursorScrollMarginTopLines);
  expect(after.cursorScrollMarginBottomLines).toBe(before.cursorScrollMarginBottomLines);
  await page.getByLabel('Scroll border color').selectOption('accent');
  await expect(page.locator('.scroll-border-guide-bottom')).toHaveCount(1);
});

for (const hoverSelectionMode of ['off', 'word']) {
  test(`Alt-click plays timestamped words with hover ${hoverSelectionMode}`, async ({ page }) => {
    await page.addInitScript(hoverSelectionMode => {
      localStorage.setItem('cm6-buffer', 'alpha beta');
      localStorage.setItem('textAnnotate-settings', JSON.stringify({ hoverSelectionMode }));
      localStorage.setItem('textAnnotate-transcript-word-timestamps', JSON.stringify({ text: 'alpha beta', timestamps: [
        {from: 0, to: 5, start: 0, end: 1}, {from: 6, to: 10, start: 2, end: 3}
      ] }));
    }, hoverSelectionMode);
    await page.goto('/');
    // Four seconds of silent PCM audio exercises actual media seeking without a network dependency.
    const dataSize = 8000 * 4 * 2;
    const wav = Buffer.alloc(44 + dataSize);
    wav.write('RIFF', 0); wav.writeUInt32LE(36 + dataSize, 4); wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
    wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
    wav.write('data', 36); wav.writeUInt32LE(dataSize, 40);
    await page.locator('input[type=file]').setInputFiles({name:'test.wav', mimeType:'audio/wav', buffer:wav});
    const audio = page.locator('audio');
    await expect.poll(() => audio.evaluate(el => (el as HTMLAudioElement).readyState)).toBeGreaterThan(0);
    const point = await page.locator('.cm-line').first().evaluate(el => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const offset = node.textContent!.indexOf('beta');
        if (offset < 0) continue;
        const range = document.createRange();
        range.setStart(node, offset); range.setEnd(node, offset + 4);
        const rect = range.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      }
      throw new Error('beta not found');
    });
    await page.mouse.click(point.x, point.y);
    await page.waitForTimeout(350);
    expect(await audio.evaluate(el => (el as HTMLAudioElement).paused)).toBe(true);
    expect(await audio.evaluate(el => (el as HTMLAudioElement).currentTime)).toBe(0);
    await page.keyboard.down('Alt');
    await page.mouse.click(point.x, point.y);
    await page.keyboard.up('Alt');
    await expect.poll(() => audio.evaluate(el => (el as HTMLAudioElement).currentTime)).toBeGreaterThanOrEqual(2);
    await expect.poll(() => audio.evaluate(el => (el as HTMLAudioElement).paused)).toBe(false);
    await audio.evaluate(el => { el.pause(); el.currentTime = 0; });
    await page.mouse.dblclick(point.x, point.y);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('cm6-buffer'))).toBe('alpha `beta`');
    expect(await audio.evaluate(el => (el as HTMLAudioElement).paused)).toBe(true);
  });
}
