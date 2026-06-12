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

test("editor selection color follows the CM theme", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("cm6-buffer", "alpha beta");
    localStorage.setItem("cm6-theme", "nord");
  });
  await page.goto("/");

  const selectionColor = async () => {
    const selection = page.locator(".cm-selectionBackground").first();
    return selection.evaluate(el => getComputedStyle(el).backgroundColor);
  };

  const editor = page.locator(".cm-content");
  await page.locator(".mode-switch").click();
  await editor.click();
  await page.keyboard.press("Control+A");

  const nordColor = await selectionColor();
  await page.getByRole("button", { name: "Settings" }).click();
  await page.evaluate(() => {
    const select = document.querySelector('select[aria-label="Theme"]') as HTMLSelectElement | null;
    if (!select) throw new Error("Theme select not found");
    select.value = "gruvbox-dark";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.keyboard.press("Escape");
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+A");
  const gruvboxColor = await selectionColor();
  expect(gruvboxColor).not.toBe(nordColor);
});

test("annotate mode handles shifted action keys", async ({ page }) => {
  const loadBuffer = async (text: string) => {
    await page.evaluate(value => {
      localStorage.clear();
      localStorage.setItem("cm6-buffer", value);
      location.reload();
    }, text);
    await page.waitForLoadState("networkidle");
    await page.locator(".cm-content").click();
  };
  const editorText = () => page.locator(".cm-content").evaluate(el => (el as HTMLElement).innerText);
  const selectedText = () => page.evaluate(() => getSelection()?.toString() ?? "");

  await page.goto("/");

  await loadBuffer("one two three\nfour five six");
  await page.keyboard.press("Shift+V");
  await expect.poll(selectedText).toBe("four five six");

  await loadBuffer("one two three\nfour five six");
  await page.keyboard.press("Shift+X");
  await expect.poll(editorText).toBe("one two three\n\n");

  await loadBuffer("top\n`alpha`<!-- red, now: \"\" -->\nmiddle\n`beta`<!-- green, now: \"\" -->\nend");
  await page.keyboard.press("Shift+N");
  await expect.poll(selectedText).toBe("beta");

  await loadBuffer("one two three\nfour five six");
  await page.keyboard.press("Shift+,");
  await expect.poll(editorText).toBe("one two three\nfour five six\n> ");
  await expect(page.locator(".mode-switch input")).toBeChecked();
  await page.keyboard.press("Escape");

  await loadBuffer("one two three\nfour five six");
  const firstLine = page.locator(".cm-line").first();
  const firstLineBox = await firstLine.boundingBox();
  if (!firstLineBox) throw new Error("First editor line was not visible");
  await page.mouse.click(firstLineBox.x + 35, firstLineBox.y + firstLineBox.height / 2);
  await page.keyboard.press("Shift+.");
  await expect.poll(editorText).toBe("one \n> two three\nfour five six");
  await expect(page.locator(".mode-switch input")).toBeChecked();
});

test("capslock state controls word navigation", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("cm6-buffer", "alpha beta");
  });
  await page.goto("/");
  await page.locator(".cm-content").click();

  const dispatchCapsLock = async (active: boolean) => {
    await page.locator(".cm-content").evaluate((target, capsActive) => {
      const event = new KeyboardEvent("keyup", { key: "CapsLock", bubbles: true, cancelable: true });
      Object.defineProperty(event, "getModifierState", {
        value: (key: string) => key === "CapsLock" ? capsActive : false
      });
      target.dispatchEvent(event);
    }, active);
  };
  const wordNavigationToggle = () =>
    page.locator(".settings-toggle-row", { hasText: "CapsLock on = word navigation" }).locator("input");

  await dispatchCapsLock(true);
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "hotkeys" }).click();
  await expect(wordNavigationToggle()).toBeChecked();

  await page.keyboard.press("Escape");
  await page.locator(".cm-content").click();
  await dispatchCapsLock(false);
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "hotkeys" }).click();
  await expect(wordNavigationToggle()).not.toBeChecked();
});

test("annotation previous follows user-configured shortcut", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("cm6-buffer", "top\n`alpha`<!-- red, now: \"\" -->\nmiddle\n`beta`<!-- green, now: \"\" -->\nend");
    localStorage.setItem("cm6-layout-settings", JSON.stringify({
      customShortcuts: {
        annotationPrevious: "Shift+p",
        annotationNext: "n"
      }
    }));
  });
  await page.goto("/");
  await page.locator(".cm-content").click();
  const selectedText = () => page.evaluate(() => getSelection()?.toString() ?? "");

  await page.keyboard.press("Shift+N");
  await expect.poll(selectedText).toBe("");

  await page.keyboard.press("Shift+P");
  await expect.poll(selectedText).toBe("beta");
});
