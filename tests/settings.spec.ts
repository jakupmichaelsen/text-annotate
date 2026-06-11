import { test, expect } from "@playwright/test";

test("settings controls update values and stay text-like", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();

  const layoutTab = page.getByRole("button", { name: "layout" });
  await expect(layoutTab).toHaveCSS("border-bottom-style", "solid");
  await expect(layoutTab).not.toHaveCSS("text-decoration-line", "underline");

  const lineHeightRow = page.locator(".settings-row", { hasText: "line height" }).first();
  const fontSizeRow = page.locator(".settings-row", { hasText: "font size" }).first();
  const paragraphSpacingRow = page.locator(".settings-row", { hasText: "paragraph spacing" }).first();

  await expect(lineHeightRow).toContainText("1.60");
  await expect(fontSizeRow).toContainText("14px");
  await expect(paragraphSpacingRow).toContainText("0.00");

  const layoutButtons = page.locator(".settings-row-controls button");
  await expect(layoutButtons.first()).not.toHaveCSS("text-decoration-line", "underline");
  await expect(layoutButtons.last()).not.toHaveCSS("text-decoration-line", "underline");

  await lineHeightRow.locator("button").last().click();
  await fontSizeRow.locator("button").last().click();
  await paragraphSpacingRow.locator("button").last().click();

  await expect(lineHeightRow).toContainText("1.75");
  await expect(fontSizeRow).toContainText("15px");
  await expect(paragraphSpacingRow).toContainText("0.15");

  const markupSelect = page.getByLabel("Markup visibility");
  await expect(markupSelect).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(markupSelect).toHaveCSS("border-top-style", "none");
  await expect(markupSelect).toHaveCSS("border-bottom-style", "solid");
  await expect(markupSelect).not.toHaveCSS("text-decoration-line", "underline");

  const themeSelect = page.getByLabel("Theme");
  await expect(themeSelect).toHaveValue("nord");

  const currentHighlightSelect = page.getByLabel("Current line highlight");
  await currentHighlightSelect.selectOption("underline");
  await expect(currentHighlightSelect).toHaveValue("underline");

  const columnGuideRow = page.locator(".settings-row", { hasText: "column guide" }).first();
  await expect(columnGuideRow).toContainText("1px");
  await columnGuideRow.locator("button").last().click();
  await expect(columnGuideRow).toContainText("2px");
});


test("annotate mode blocks unhandled editing keys", async ({ page }) => {
  await page.goto("/");
  const editor = page.locator(".cm-content");
  await editor.click();

  const before = await editor.innerText();

  await page.keyboard.press("t");
  expect(await editor.innerText()).toBe(before);

  await page.keyboard.press("Backspace");
  expect(await editor.innerText()).toBe(before);

  await page.keyboard.press("Delete");
  expect(await editor.innerText()).toBe(before);

  await page.keyboard.press("Control+A");
  await page.keyboard.press("Control+X");
  expect(await editor.innerText()).toBe(before);

  await page.keyboard.press("Control+V");
  expect(await editor.innerText()).toBe(before);
});

test("edit mode keeps CodeMirror multiple-selection commands active", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("cm6-buffer", "alpha\nbeta\nalpha");
  });
  await page.goto("/");

  const editor = page.locator(".cm-content");
  const editorText = () => editor.evaluate(el => (el as HTMLElement).innerText);
  await page.locator(".mode-switch").click();
  await editor.click();

  await page.keyboard.press("Control+Home");
  await page.keyboard.press("Control+D");
  await page.keyboard.press("Control+D");
  await page.keyboard.type("omega");
  await expect.poll(editorText).toBe("omega\nbeta\nomega");
});

test("edit mode keeps CodeMirror line movement active", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("cm6-buffer", "alpha\nbeta\ngamma");
  });
  await page.goto("/");

  const editor = page.locator(".cm-content");
  const editorText = () => editor.evaluate(el => (el as HTMLElement).innerText);
  await page.locator(".mode-switch").click();
  await editor.click();
  await page.keyboard.press("Control+Home");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Alt+ArrowUp");
  await expect.poll(editorText).toBe("beta\nalpha\ngamma");
});

test("escape exits edit mode", async ({ page }) => {
  await page.goto("/");
  const modeSwitch = page.locator(".mode-switch input");
  const editor = page.locator(".cm-content");

  await page.locator(".mode-switch").click();
  await expect(modeSwitch).toBeChecked();
  await editor.click();
  await page.keyboard.press("Escape");
  await expect(modeSwitch).not.toBeChecked();
});
