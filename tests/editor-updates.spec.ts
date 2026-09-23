import { test, expect } from "@playwright/test";

test("F2 selection editing saves, cancels, restores focus and supports undo", async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("cm6-buffer")) localStorage.setItem("cm6-buffer", "alpha beta");
  });
  await page.goto("/");
  const editor = page.locator(".cm-content");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("F2 action")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.reload();
  await editor.focus();
  await page.keyboard.press("Control+Home");
  await page.keyboard.press("F2");
  await expect(page.getByRole("dialog", { name: "Edit selection", exact: true })).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "Switch between Annotate and Edit mode" })).toBeChecked();
  await page.keyboard.press("Escape");
  for (let i = 0; i < 5; i++) await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("F2");
  const dialog = page.getByRole("dialog", { name: "Edit selection", exact: true });
  const draft = page.getByLabel("Selected text", { exact: true });
  await expect(draft).toHaveValue("alpha");
  await expect(draft).toBeFocused();
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize()!;
  expect(Math.abs(box!.x + box!.width / 2 - viewport.width / 2)).toBeLessThan(2);
  expect(Math.abs(box!.y + box!.height / 2 - viewport.height / 2)).toBeLessThan(2);
  await draft.fill("cancelled");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(editor).toBeFocused();
  await expect(editor).toHaveText("alpha beta");
  await page.keyboard.press("F2");
  await draft.fill("omega\nnew");
  await page.keyboard.press("Control+Enter");
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("cm6-buffer"))).toBe("omega\nnew beta");
  await expect(editor).toBeFocused();
  await page.keyboard.press("Control+z");
  await expect(editor).toHaveText("alpha beta");
});

test("current line guide matches column guide and persists", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Current line highlight").selectOption("guide");
  await page.getByRole("button", { name: "Increase column guide thickness" }).click();
  await page.keyboard.press("Escape");
  await page.reload();
  await page.locator(".cm-content").focus();
  const column = page.locator(".cm-column-guide");
  const line = page.locator(".cm-visual-line-marker");
  await expect(column).toBeVisible();
  await expect(line).toBeVisible();
  const style = await column.evaluate(el => {
    const s = getComputedStyle(el);
    return { color: s.backgroundColor, opacity: s.opacity, width: s.width };
  });
  await expect(line).toHaveCSS("border-bottom-color", style.color);
  await expect(line).toHaveCSS("border-bottom-width", style.width);
  await expect(line).toHaveCSS("opacity", style.opacity);
});

test("Escape closes help, settings, and style dialogs from their controls", async ({ page }) => {
  await page.goto("/");
  const editor = page.locator(".cm-content");
  await editor.focus();
  await page.keyboard.press("F1");
  await expect(page.locator(".help-overlay")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".help-overlay")).toHaveCount(0);
  await expect(editor).toBeFocused();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Current line highlight").focus();
  await page.keyboard.press("Escape");
  await expect(page.locator(".settings-popover")).toHaveCount(0);
  await expect(editor).toBeFocused();
  await page.getByRole("button", { name: "Add annotation style", exact: true }).click();
  await page.getByLabel("New annotation style hotkey").focus();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Add annotation style", exact: true })).toHaveCount(0);
  await expect(editor).toBeFocused();
  await page.getByRole("button", { name: /^Edit color for / }).first().click();
  await page.getByRole("dialog", { name: /^Edit color for / }).getByRole("button", { name: "Save", exact: true }).focus();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: /^Edit color for / })).toHaveCount(0);
  await expect(editor).toBeFocused();
});
