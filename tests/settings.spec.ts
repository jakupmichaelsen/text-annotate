import { test, expect } from "@playwright/test";

test("settings controls update values and stay text-like", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();

  const layoutTab = page.getByRole("button", { name: "layout" });
  await expect(layoutTab).toHaveCSS("border-bottom-style", "solid");
  await expect(layoutTab).not.toHaveCSS("text-decoration-line", "underline");

  const lineHeightRow = page.locator(".layout-stepper").nth(0);
  const fontSizeRow = page.locator(".layout-stepper").nth(1);
  const paragraphSpacingRow = page.locator(".layout-stepper").nth(2);

  await expect(lineHeightRow).toContainText("1.60");
  await expect(fontSizeRow).toContainText("14px");
  await expect(paragraphSpacingRow).toContainText("0.00");

  const layoutButtons = page.locator(".layout-stepper-buttons button");
  await expect(layoutButtons.first()).not.toHaveCSS("text-decoration-line", "underline");
  await expect(layoutButtons.last()).not.toHaveCSS("text-decoration-line", "underline");

  await lineHeightRow.locator("button").last().click();
  await fontSizeRow.locator("button").last().click();
  await paragraphSpacingRow.locator("button").last().click();

  await expect(lineHeightRow).toContainText("1.75");
  await expect(fontSizeRow).toContainText("15px");
  await expect(paragraphSpacingRow).toContainText("0.15");

  const markupSelect = page.getByLabel("Markup display");
  await expect(markupSelect).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(markupSelect).toHaveCSS("border-top-style", "none");
  await expect(markupSelect).toHaveCSS("border-bottom-style", "solid");
  await expect(markupSelect).not.toHaveCSS("text-decoration-line", "underline");

  const currentHighlightSelect = page.getByLabel("Current line highlight");
  await currentHighlightSelect.selectOption("underline");
  await expect(currentHighlightSelect).toHaveValue("underline");

  const columnGuideRow = page.locator(".layout-stepper").nth(4);
  await expect(columnGuideRow).toContainText("1px");
  await columnGuideRow.locator("button").last().click();
  await expect(columnGuideRow).toContainText("2px");
});
