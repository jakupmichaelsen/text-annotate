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
  await expect.poll(editorText).toBe("one two three\nfour five six\n> \n> ");
  await expect(page.locator(".mode-switch input")).toBeChecked();
  await page.keyboard.press("Escape");

  await loadBuffer("one two three\nfour five six");
  const firstLine = page.locator(".cm-line").first();
  const firstLineBox = await firstLine.boundingBox();
  if (!firstLineBox) throw new Error("First editor line was not visible");
  await page.mouse.click(firstLineBox.x + 35, firstLineBox.y + firstLineBox.height / 2);
  await page.keyboard.press("Shift+.");
  await expect.poll(editorText).toBe("one \n> two three\n> \nfour five six");
  await expect(page.locator(".mode-switch input")).toBeChecked();
});

test("blockquote edit mode keeps a visible trailing quote line", async ({ page }) => {
  const loadBufferAtEnd = async (text: string) => {
    await page.evaluate(value => {
      localStorage.clear();
      localStorage.setItem("cm6-buffer", value);
      location.reload();
    }, text);
    await page.waitForLoadState("networkidle");
    await page.locator(".cm-content").click();
    await page.keyboard.press("F2");
    await page.keyboard.press("Control+End");
    await page.keyboard.press("Escape");
  };
  const editorText = () => page.locator(".cm-content").evaluate(el => (el as HTMLElement).innerText);

  await page.goto("/");

  await loadBufferAtEnd("alpha");
  await page.keyboard.press("Shift+,");
  await page.keyboard.type("note");
  await expect.poll(editorText).toBe("alpha\n> note\n> ");

  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("more");
  await expect.poll(editorText).toBe("alpha\n> note\n> more\n> ");

  await page.keyboard.press("Tab");
  await expect.poll(editorText).toBe("alpha\n> note\n> > more\n> ");
  await page.keyboard.press("Shift+Tab");
  await expect.poll(editorText).toBe("alpha\n> note\n> more\n> ");

  await page.keyboard.press("Enter");
  await page.keyboard.press("F2");
  await page.keyboard.type("after");
  await expect.poll(editorText).toBe("alpha\n> note\n> more\nafter");

  await loadBufferAtEnd("beta");
  await page.keyboard.press("Shift+,");
  await page.keyboard.press("Escape");
  await page.keyboard.press("F2");
  await page.keyboard.type("X");
  await expect.poll(editorText).toBe("betaX\n> \n> ");
});

test("annotates exact short selections", async ({ page }) => {
  const loadBuffer = async (text: string) => {
    await page.evaluate(value => {
      localStorage.clear();
      localStorage.setItem("cm6-buffer", value);
      location.reload();
    }, text);
    await page.waitForLoadState("networkidle");
    await page.locator(".cm-content").click();
    await page.keyboard.press("F2");
    await page.keyboard.press("Control+Home");
    await page.keyboard.press("Escape");
  };
  const editorText = () => page.locator(".cm-content").evaluate(el => (el as HTMLElement).innerText);
  const selectedText = () => page.evaluate(() => getSelection()?.toString() ?? "");

  await page.goto("/");

  await loadBuffer("abc de");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Space");
  await expect.poll(editorText).toBe("abc` `de");

  await loadBuffer("played");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Shift+ArrowRight");
  await expect.poll(selectedText).toBe("ed");
  await page.keyboard.press("Space");
  await expect.poll(editorText).toBe("play`ed`");
});

test("navigation settings split arrows, WASD cluster, and HJKL word movement", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("cm6-buffer", "alpha beta gamma");
    localStorage.setItem("cm6-layout-settings", JSON.stringify({
      arrowWordNavigation: false,
      wasdNavigation: true,
      hjklNavigation: true,
      hjklWordNavigation: false,
      columnStride: 6
    }));
  });
  await page.goto("/");
  await page.locator(".cm-content").click();

  const resetCursor = async () => {
    await page.keyboard.press("F2");
    await page.keyboard.press("Control+Home");
    await page.keyboard.press("Escape");
  };
  const selectedText = () => page.evaluate(() => getSelection()?.toString() ?? "");

  await resetCursor();
  await page.keyboard.press("Shift+ArrowRight");
  await expect.poll(selectedText).toBe("a");

  await resetCursor();
  await page.keyboard.press("Shift+q");
  await expect.poll(selectedText).toBe("");
  await page.keyboard.press("Shift+e");
  await expect.poll(selectedText).toBe("a");

  await resetCursor();
  await page.keyboard.press("Shift+d");
  await expect.poll(selectedText).toBe("alpha");

  await resetCursor();
  await page.keyboard.press("Shift+l");
  await expect.poll(selectedText).toBe("a");

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "hotkeys" }).click();
  await page.locator(".settings-toggle-row", { hasText: "arrows use word navigation" }).locator("input").check();
  await page.locator(".settings-toggle-row", { hasText: "HJKL uses word navigation" }).locator("input").check();

  await page.keyboard.press("Escape");
  await page.locator(".cm-content").click();
  await resetCursor();
  await page.keyboard.press("Shift+ArrowRight");
  await expect.poll(selectedText).toBe("alpha");

  await resetCursor();
  await page.keyboard.press("Shift+l");
  await expect.poll(selectedText).toBe("alpha");
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

  await page.keyboard.press("Shift+P");
  await expect.poll(selectedText).toBe("alpha");
});

test("style title changes update existing annotation markup", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("cm6-buffer", "`alpha beta`<!-- red underline, now: \"note\" -->");
  });
  await page.goto("/");

  await page.locator('button[title="Edit red title"]').click();
  const titleInput = page.getByLabel("Title for red");
  await titleInput.fill("Urgent review");
  await titleInput.press("Enter");

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByLabel("Markup visibility").selectOption("all");
  await expect(page.locator(".cm-content")).toContainText("red underline, now: \"note\", title: \"Urgent review\"");
});

test("hyphenated styles keep multi-word inline comments and editable colors", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("cm6-buffer", "`multiple word selection`<!-- custom-style fill, now: \"old note\", title: \"Custom title\" -->");
    localStorage.setItem("cm6-custom-styles", JSON.stringify({
      version: 2,
      styles: [{ name: "custom-style", colorName: "steel" }]
    }));
    localStorage.setItem("cm6-style-titles", JSON.stringify({ "custom-style": "Custom title" }));
    localStorage.setItem("textAnnotate-settings", JSON.stringify({ annotationMode: "sticky" }));
  });
  await page.goto("/");

  await expect(page.locator(".cm-annotation-comment")).toHaveText("old note");
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+Home");
  await page.keyboard.press("Enter");
  const commentInput = page.getByPlaceholder("add note…");
  await expect(commentInput).toBeVisible();
  await commentInput.fill("new note");
  await commentInput.press("Enter");
  await page.getByRole("button", { name: "Edit color for Custom title" }).click();
  const colorDialog = page.getByRole("dialog", { name: "Edit color for Custom title" });
  await colorDialog.getByRole("button", { name: "mint" }).click();
  await colorDialog.getByRole("button", { name: "Save" }).click();

  const storedColor = await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem("cm6-custom-styles") || "{}");
    return stored.styles?.[0]?.colorName;
  });
  expect(storedColor).toBe("mint");

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByLabel("Markup visibility").selectOption("all");
  await expect(page.locator(".cm-content")).toContainText("now: \"new note\", title: \"Custom title\"");
});

test("scroll border guides use theme colors and configurable opacity", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("cm6-layout-settings", JSON.stringify({
      cursorScrollMarginTopLines: 3,
      cursorScrollMarginBottomLines: 5,
      scrollBorderTone: "accent",
      scrollBorderOpacity: 0.2
    }));
    localStorage.setItem("cm6-theme", "nord");
  });
  await page.goto("/");

  const topGuide = page.locator(".scroll-border-guide-top");
  const bottomGuide = page.locator(".scroll-border-guide-bottom");
  await expect(topGuide).toHaveCSS("opacity", "0.2");
  await expect(bottomGuide).toHaveCSS("opacity", "0.2");
  await expect(topGuide).toHaveCSS("background-color", "rgb(208, 135, 112)");
  const topHeight = Number.parseFloat(await topGuide.evaluate(el => getComputedStyle(el).height));
  const bottomHeight = Number.parseFloat(await bottomGuide.evaluate(el => getComputedStyle(el).height));
  await expect(topGuide).toHaveCSS("top", "0px");
  await expect(bottomGuide).toHaveCSS("bottom", "0px");
  expect(topHeight).toBe(0);
  expect(bottomHeight).toBeGreaterThan(0);

  await page.locator(".cm-scroller").evaluate(el => {
    el.scrollTop = Math.min(120, el.scrollHeight - el.clientHeight);
    el.dispatchEvent(new Event("scroll"));
  });
  await expect.poll(async () => Number.parseFloat(await topGuide.evaluate(el => getComputedStyle(el).height))).toBeGreaterThan(0);

  await page.locator(".cm-scroller").evaluate(el => {
    el.scrollTop = el.scrollHeight;
    el.dispatchEvent(new Event("scroll"));
  });
  await expect.poll(async () => Number.parseFloat(await bottomGuide.evaluate(el => getComputedStyle(el).height))).toBe(0);

  await page.getByRole("button", { name: "Settings" }).click();
  const colorSelect = page.getByLabel("Scroll border color");
  await expect(colorSelect).toHaveValue("accent");
  await colorSelect.selectOption("background");
  await expect(topGuide).toHaveCSS("background-color", "rgb(46, 52, 64)");
  await colorSelect.selectOption("accent");
  const opacityRow = page.locator(".settings-row", { hasText: "opacity" }).last();
  await expect(opacityRow).toContainText("20%");
  await opacityRow.getByRole("button", { name: "Increase scroll border opacity" }).click();
  await expect(topGuide).toHaveCSS("opacity", "0.25");

  await page.getByLabel("Theme").selectOption("gruvbox-dark");
  await expect(topGuide).toHaveCSS("background-color", "rgb(254, 128, 25)");
});
