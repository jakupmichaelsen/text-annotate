<script lang="ts">
  import { onMount, tick } from "svelte";
  import * as pdfjsLib from "pdfjs-dist";
  import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
  import { createWorker, PSM } from "tesseract.js";
  import tesseractWorkerUrl from "tesseract.js/dist/worker.min.js?url";

  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

  export let pdfPreviewUrl = "";
  export let pdfFileName = "";
  export let pdfParseError = "";
  export let pdfDraftText = "";
  export let pdfSourceLines: string[] = [];
  export let pdfIsParsing = false;
  export let closePdfModal: () => void;
  export let loadPdfDraft: (text: string) => void;

  let textareaEl: HTMLTextAreaElement;
  let previewScrollEl: HTMLDivElement;
  let manualBreakCount = 0;
  let pdfRowMarkMode: "none" | "break" | "ignore" = "none";
  type PdfPreviewRow = {
    id: string;
    pageNumber: number;
    visualIndex: number;
    text: string;
    top: number;
    left: number;
    width: number;
    height: number;
  };
  type PdfPreviewPage = {
    pageNumber: number;
    fullWidth: number;
    fullHeight: number;
    width: number;
    height: number;
    cropLeft: number;
    cropTop: number;
    rows: PdfPreviewRow[];
  };
  type PdfBreakLine = { id: number; row: PdfPreviewRow; insertedBreak: boolean };
  type PdfIgnoredLine = { id: number; row: PdfPreviewRow };
  let pdfBreakLines: PdfBreakLine[] = [];
  let nextPdfBreakLineId = 1;
  let pdfIgnoredLines: PdfIgnoredLine[] = [];
  let nextPdfIgnoredLineId = 1;
  let pdfPreviewPages: PdfPreviewPage[] = [];
  let pdfPreviewLoading = false;
  let pdfRenderError = "";
  let pdfOcrRunning = false;
  let pdfOcrStatus = "";
  let pdfOcrProgress = 0;
  let pdfOcrError = "";
  let pdfOcrRunId = 0;
  let selectionStart = 0;
  let selectionEnd = 0;
  let lastDraftText = pdfDraftText;
  let loadedPreviewUrl = "";
  let previewRenderRun = 0;

  $: if (pdfDraftText !== lastDraftText) {
    lastDraftText = pdfDraftText;
  }

  $: if (pdfPreviewUrl && pdfPreviewUrl !== loadedPreviewUrl) {
    loadedPreviewUrl = pdfPreviewUrl;
    void loadPdfPreview(pdfPreviewUrl);
  }

  onMount(() => {
    if (pdfPreviewUrl) {
      loadedPreviewUrl = pdfPreviewUrl;
      void loadPdfPreview(pdfPreviewUrl);
    }
  });

  function handlePdfTextareaInput(event: Event) {
    const textarea = event.target as HTMLTextAreaElement;
    pdfDraftText = textarea.value;
    lastDraftText = pdfDraftText;
    rememberTextareaSelection(textarea);
  }

  function handlePdfTextareaKeydown(event: KeyboardEvent) {
    if (!((event.ctrlKey || event.metaKey) && event.key === "Enter")) return;
    event.preventDefault();
    void insertParagraphBreak();
  }

  function rememberTextareaSelection(textarea = textareaEl) {
    if (!textarea) return;
    selectionStart = textarea.selectionStart;
    selectionEnd = textarea.selectionEnd;
  }

  async function insertParagraphBreak() {
    if (pdfIsParsing) return;

    const from = Math.max(0, Math.min(selectionStart, pdfDraftText.length));
    const to = Math.max(from, Math.min(selectionEnd, pdfDraftText.length));
    const cursor = from + 2;
    pdfDraftText = `${pdfDraftText.slice(0, from)}\n\n${pdfDraftText.slice(to)}`;
    lastDraftText = pdfDraftText;
    manualBreakCount += 1;
    selectionStart = cursor;
    selectionEnd = cursor;

    await tick();
    if (textareaEl) {
      textareaEl.focus();
      textareaEl.setSelectionRange(cursor, cursor);
    }
  }

  function loadMarkedPdfDraft() {
    loadPdfDraft(textWithoutIgnoredRows(pdfDraftText));
  }

  function togglePdfBreakMarkMode() {
    pdfRowMarkMode = pdfRowMarkMode === "break" ? "none" : "break";
  }

  function togglePdfIgnoreMarkMode() {
    pdfRowMarkMode = pdfRowMarkMode === "ignore" ? "none" : "ignore";
  }

  async function runPdfOcr() {
    if (!pdfPreviewUrl || pdfIsParsing || pdfOcrRunning) return;

    const runId = pdfOcrRunId + 1;
    pdfOcrRunId = runId;
    pdfOcrRunning = true;
    pdfOcrStatus = "Starting OCR...";
    pdfOcrProgress = 0;
    pdfOcrError = "";
    let worker: Awaited<ReturnType<typeof createWorker>> | null = null;

    try {
      const data = await fetch(pdfPreviewUrl).then(response => response.arrayBuffer());
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(data) }).promise;
      worker = await createWorker(["eng", "dan"], 1, {
        workerPath: tesseractWorkerUrl,
        logger: message => {
          if (runId !== pdfOcrRunId) return;
          if (message.status) pdfOcrStatus = message.status;
          if (Number.isFinite(message.progress)) {
            pdfOcrProgress = Math.max(0, Math.min(1, message.progress));
          }
        }
      });

      await worker.setParameters({
        tessedit_pageseg_mode: PSM.AUTO,
        preserve_interword_spaces: "1"
      });

      const pageTexts: string[] = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        if (runId !== pdfOcrRunId) return;
        pdfOcrStatus = `OCR page ${pageNumber} of ${pdf.numPages}`;
        const canvas = await renderPdfPageForOcr(pdf, pageNumber);
        const result = await worker.recognize(canvas);
        pageTexts.push(cleanOcrPageText(result.data.text));
        pdfOcrProgress = pageNumber / Math.max(pdf.numPages, 1);
      }

      if (runId !== pdfOcrRunId) return;
      const nextText = pageTexts.filter(Boolean).join("\n\n").trim();
      pdfDraftText = nextText;
      lastDraftText = nextText;
      pdfOcrStatus = nextText ? "OCR complete" : "OCR found no text";
      if (!nextText) pdfOcrError = "OCR completed, but no text was detected.";
      await tick();
      rememberTextareaSelection();
    } catch (error) {
      if (runId !== pdfOcrRunId) return;
      pdfOcrStatus = "";
      pdfOcrError = error instanceof Error ? error.message : "OCR failed.";
    } finally {
      await worker?.terminate().catch(() => {});
      if (runId === pdfOcrRunId) {
        pdfOcrRunning = false;
        pdfOcrProgress = 0;
      }
    }
  }

  async function loadPdfPreview(url: string) {
    const runId = previewRenderRun + 1;
    previewRenderRun = runId;
    pdfPreviewLoading = true;
    pdfRenderError = "";
    pdfPreviewPages = [];
    pdfBreakLines = [];
    pdfIgnoredLines = [];

    try {
      const data = await fetch(url).then(response => response.arrayBuffer());
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(data) }).promise;
      const nextPages: PdfPreviewPage[] = [];
      let visualIndex = 0;

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        if (runId !== previewRenderRun) return;
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1.25 });
        const content = await page.getTextContent();
        const rows = buildPreviewRows(content.items, viewport, pageNumber, visualIndex);
        const crop = previewCropForRows(rows, viewport);
        visualIndex += rows.length;
        nextPages.push({
          pageNumber,
          fullWidth: viewport.width,
          fullHeight: viewport.height,
          width: crop.width,
          height: crop.height,
          cropLeft: crop.left,
          cropTop: crop.top,
          rows: rows.map(row => ({
            ...row,
            top: row.top - crop.top,
            left: row.left - crop.left
          }))
        });
      }

      if (runId !== previewRenderRun) return;
      pdfPreviewPages = nextPages;
      await tick();
      await renderPdfCanvases(pdf, nextPages, runId);
    } catch (error) {
      if (runId !== previewRenderRun) return;
      pdfRenderError = error instanceof Error ? error.message : "Could not render this PDF preview.";
    } finally {
      if (runId === previewRenderRun) pdfPreviewLoading = false;
    }
  }

  function buildPreviewRows(items: unknown[], viewport: pdfjsLib.PageViewport, pageNumber: number, firstVisualIndex: number) {
    const rows: { top: number; left: number; right: number; bottom: number; parts: { text: string; left: number }[] }[] = [];

    for (const item of items) {
      if (!item || typeof item !== "object" || !("str" in item)) continue;
      const textItem = item as { str: string; transform?: number[]; width?: number; height?: number };
      const text = cleanRowText(textItem.str);
      if (!text || !Array.isArray(textItem.transform)) continue;

      const [left, baseline] = viewport.convertToViewportPoint(textItem.transform[4] ?? 0, textItem.transform[5] ?? 0);
      const height = Math.max(12, Math.abs((textItem.height ?? 10) * viewport.scale));
      const width = Math.max(18, Math.abs((textItem.width ?? text.length * 5) * viewport.scale));
      const top = baseline - height;
      const bottom = baseline + 3;
      const row = rows.find(candidate => Math.abs(candidate.top - top) <= 5);

      if (row) {
        row.left = Math.min(row.left, left);
        row.right = Math.max(row.right, left + width);
        row.top = Math.min(row.top, top);
        row.bottom = Math.max(row.bottom, bottom);
        row.parts.push({ text, left });
      } else {
        rows.push({ top, left, right: left + width, bottom, parts: [{ text, left }] });
      }
    }

    return rows
      .sort((a, b) => a.top - b.top || a.left - b.left)
      .map((row, index) => {
        const text = cleanRowText(row.parts.sort((a, b) => a.left - b.left).map(part => part.text).join(" "));
        return {
          id: `${pageNumber}-${index}`,
          pageNumber,
          visualIndex: firstVisualIndex + index,
          text,
          top: Math.max(0, row.top - 2),
          left: Math.max(0, row.left - 4),
          width: Math.min(viewport.width - Math.max(0, row.left - 4), Math.max(32, row.right - row.left + 8)),
          height: Math.max(14, row.bottom - row.top + 4)
        };
      })
      .filter(row => row.text && !/^Side\s+\d+\s+af\s+\d+$/i.test(row.text));
  }

  function previewCropForRows(rows: PdfPreviewRow[], viewport: pdfjsLib.PageViewport) {
    if (!rows.length) {
      return { left: 0, top: 0, width: viewport.width, height: viewport.height };
    }

    const padding = 14;
    const left = Math.max(0, Math.min(...rows.map(row => row.left)) - padding);
    const top = Math.max(0, Math.min(...rows.map(row => row.top)) - padding);
    const right = Math.min(viewport.width, Math.max(...rows.map(row => row.left + row.width)) + padding);
    const bottom = Math.min(viewport.height, Math.max(...rows.map(row => row.top + row.height)) + padding);

    return {
      left,
      top,
      width: Math.max(80, right - left),
      height: Math.max(80, bottom - top)
    };
  }

  async function renderPdfCanvases(pdf: pdfjsLib.PDFDocumentProxy, pages: PdfPreviewPage[], runId: number) {
    const pixelRatio = window.devicePixelRatio || 1;

    for (const pagePreview of pages) {
      if (runId !== previewRenderRun) return;
      const page = await pdf.getPage(pagePreview.pageNumber);
      const viewport = page.getViewport({ scale: 1.25 });
      const canvas = previewScrollEl?.querySelector<HTMLCanvasElement>(`canvas[data-page-number="${pagePreview.pageNumber}"]`);
      const context = canvas?.getContext("2d");
      if (!canvas || !context) continue;

      canvas.width = Math.floor(viewport.width * pixelRatio);
      canvas.height = Math.floor(viewport.height * pixelRatio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      canvas.style.left = `${-pagePreview.cropLeft}px`;
      canvas.style.top = `${-pagePreview.cropTop}px`;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      await page.render({ canvasContext: context, viewport }).promise;
    }
  }

  async function renderPdfPageForOcr(pdf: pdfjsLib.PDFDocumentProxy, pageNumber: number) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not create an OCR canvas.");

    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport }).promise;
    return canvas;
  }

  async function togglePdfBreakRow(row: PdfPreviewRow) {
    if (pdfRowMarkMode !== "break" || pdfIsParsing) return;
    const existingMark = pdfBreakLines.find(line => line.row.id === row.id);
    if (existingMark) {
      pdfBreakLines = pdfBreakLines.filter(line => line.row.id !== row.id);
      if (existingMark.insertedBreak) removePdfBreakFromDraft(row);
      return;
    }

    const insertedBreak = insertPdfBreakInDraft(row);
    pdfBreakLines = [...pdfBreakLines, { id: nextPdfBreakLineId, row, insertedBreak }];
    nextPdfBreakLineId += 1;
    await tick();
    rememberTextareaSelection();
  }

  function togglePdfIgnoreRow(row: PdfPreviewRow) {
    if (pdfRowMarkMode !== "ignore" || pdfIsParsing) return;
    const existingMark = pdfIgnoredLines.find(line => line.row.id === row.id);
    if (existingMark) {
      pdfIgnoredLines = pdfIgnoredLines.filter(line => line.row.id !== row.id);
      return;
    }
    pdfIgnoredLines = [...pdfIgnoredLines, { id: nextPdfIgnoredLineId, row }];
    nextPdfIgnoredLineId += 1;
  }

  function handlePdfRowClick(row: PdfPreviewRow) {
    if (pdfRowMarkMode === "break") {
      void togglePdfBreakRow(row);
      return;
    }
    if (pdfRowMarkMode === "ignore") togglePdfIgnoreRow(row);
  }

  function isPdfRowIgnored(row: PdfPreviewRow) {
    return pdfIgnoredLines.some(line => line.row.id === row.id);
  }

  function isPdfRowMarked(row: PdfPreviewRow) {
    return pdfBreakLines.some(line => line.row.id === row.id);
  }

  function insertPdfBreakInDraft(row: PdfPreviewRow) {
    const position = offsetForMarkedRow(pdfDraftText, row);
    if (position === null || hasParagraphBreakBefore(pdfDraftText, position)) return false;
    pdfDraftText = insertParagraphBreakAt(pdfDraftText, position);
    lastDraftText = pdfDraftText;
    return true;
  }

  function removePdfBreakFromDraft(row: PdfPreviewRow) {
    const position = offsetForMarkedRow(pdfDraftText, row);
    if (position === null) return;
    pdfDraftText = removeParagraphBreakBefore(pdfDraftText, position);
    lastDraftText = pdfDraftText;
  }

  function hasParagraphBreakBefore(text: string, position: number) {
    return /(?:^|[^\n])\n[ \t]*\n[ \t]*$/.test(text.slice(0, Math.max(0, position)));
  }

  function offsetForMarkedRow(text: string, row: PdfPreviewRow) {
    const line = row.text.trim();
    if (!line) return null;

    const totalRows = Math.max(
      pdfPreviewPages.reduce((count, page) => count + page.rows.length, 0),
      pdfSourceLines.length,
      1
    );
    const expectedOffset = Math.round(text.length * (row.visualIndex / Math.max(totalRows - 1, 1)));
    const candidates = [
      line,
      line.replace(/\s+/g, " "),
      line.length > 80 ? line.slice(0, 80) : line,
      line.length > 40 ? line.slice(0, 40) : line
    ].filter((candidate, index, all) => candidate.length >= 8 && all.indexOf(candidate) === index);

    let bestOffset: number | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const candidate of candidates) {
      for (const offset of offsetsOf(text, candidate)) {
        const distance = Math.abs(offset - expectedOffset);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestOffset = offset;
        }
      }
    }

    return bestOffset;
  }

  function insertParagraphBreakAt(text: string, position: number) {
    const from = Math.max(0, Math.min(position, text.length));
    const before = text.slice(0, from).replace(/[ \t]+$/, "");
    const after = text.slice(from).replace(/^[ \t]+/, "");
    return `${before}\n\n${after}`;
  }

  function removeParagraphBreakBefore(text: string, position: number) {
    const from = Math.max(0, Math.min(position, text.length));
    const before = text.slice(0, from);
    const match = before.match(/[ \t]*\n[ \t]*\n[ \t]*$/);
    if (!match || match.index === undefined) return text;
    return `${before.slice(0, match.index).replace(/[ \t]+$/, "")} ${text.slice(from).replace(/^[ \t]+/, "")}`;
  }

  function offsetsOf(text: string, needle: string) {
    const offsets: number[] = [];
    let from = 0;
    while (from < text.length) {
      const index = text.indexOf(needle, from);
      if (index === -1) break;
      offsets.push(index);
      from = index + Math.max(needle.length, 1);
    }
    return offsets;
  }

  function textWithoutIgnoredRows(text: string) {
    const removals = pdfIgnoredLines
      .map(line => rowRemovalRange(text, line.row))
      .filter((range): range is { from: number; to: number } => !!range)
      .sort((a, b) => b.from - a.from);

    let next = text;
    for (const range of removals) {
      const before = next.slice(0, range.from).replace(/[ \t]+$/, "");
      const after = next.slice(range.to).replace(/^[ \t\n]+/, "");
      next = before + (before && after ? "\n" : "") + after;
    }
    return next.replace(/\n{3,}/g, "\n\n").trim();
  }

  function rowRemovalRange(text: string, row: PdfPreviewRow) {
    const offset = offsetForMarkedRow(text, row);
    if (offset === null) return null;
    let from = offset;
    let to = offset + row.text.trim().length;
    while (from > 0 && text[from - 1] !== "\n") from -= 1;
    while (to < text.length && text[to] !== "\n") to += 1;
    while (to < text.length && text[to] === "\n") to += 1;
    return { from, to };
  }

  function cleanRowText(text: string) {
    return text
      .replace(/\s+/g, " ")
      .replace(/\s+([.,;:!?])/g, "$1")
      .replace(/([([{“‘])\s+/g, "$1")
      .replace(/\s+([)\]}”’])/g, "$1")
      .trim();
  }

  function cleanOcrPageText(text: string) {
    return text
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map(line => line.replace(/[ \t]+/g, " ").trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
</script>

<div class="pdf-modal-overlay">
  <div class="pdf-modal" role="dialog" aria-modal="true" aria-label="Review PDF text">
    <div class="pdf-modal-header">
      <div>
        <div class="pdf-modal-title">Review PDF text</div>
        <div class="pdf-modal-file">{pdfFileName}</div>
        <div class="pdf-modal-help">Correct the extracted text on the right, then load it into the editor.</div>
      </div>
      <div class="pdf-modal-actions">
        <button
          class="toolbar-btn"
          class:active={pdfRowMarkMode === "break"}
          type="button"
          on:click={togglePdfBreakMarkMode}
          title="Click a PDF text row to mark a paragraph break"
          aria-pressed={pdfRowMarkMode === "break"}
          disabled={pdfIsParsing || pdfOcrRunning}
        >
          Mark break
        </button>
        <button
          class="toolbar-btn"
          class:active={pdfRowMarkMode === "ignore"}
          type="button"
          on:click={togglePdfIgnoreMarkMode}
          title="Click a PDF text row to ignore it when loading"
          aria-pressed={pdfRowMarkMode === "ignore"}
          disabled={pdfIsParsing || pdfOcrRunning}
        >
          Ignore text
        </button>
        <button
          class="toolbar-btn"
          type="button"
          on:click={runPdfOcr}
          title="Run OCR on the PDF preview"
          disabled={pdfIsParsing || pdfOcrRunning || !pdfPreviewUrl}
        >
          {pdfOcrRunning ? "OCR..." : "OCR"}
        </button>
        <button class="toolbar-btn" type="button" on:click={closePdfModal}>Close</button>
      </div>
    </div>

    {#if pdfParseError}
      <div class="pdf-error">{pdfParseError}</div>
    {/if}
    {#if pdfOcrError}
      <div class="pdf-error">{pdfOcrError}</div>
    {/if}

    <div class="pdf-modal-body">
      <div class="pdf-pane pdf-preview-pane" class:line-marking={pdfRowMarkMode !== "none"} class:ignore-marking={pdfRowMarkMode === "ignore"}>
        <div class="pdf-preview-scroll" bind:this={previewScrollEl} aria-label="PDF preview">
          {#if pdfPreviewLoading}
            <div class="pdf-preview-status">Rendering PDF...</div>
          {/if}
          {#if pdfRenderError}
            <div class="pdf-preview-status">{pdfRenderError}</div>
          {/if}
          {#each pdfPreviewPages as page}
            <div class="pdf-page" style={`width: ${page.width}px; height: ${page.height}px`}>
              <canvas
                class="pdf-page-canvas"
                data-page-number={page.pageNumber}
                style={`width: ${page.fullWidth}px; height: ${page.fullHeight}px; left: -${page.cropLeft}px; top: -${page.cropTop}px`}
              ></canvas>
              <div class="pdf-text-row-layer" aria-hidden={pdfRowMarkMode === "none"}>
                {#each page.rows as row}
                  <button
                    class="pdf-text-row-button"
                    class:marked={isPdfRowMarked(row)}
                    class:ignored={isPdfRowIgnored(row)}
                    type="button"
                    style={`top: ${row.top}px; left: ${row.left}px; width: ${row.width}px; height: ${row.height}px`}
                    title={row.text}
                    aria-label={pdfRowMarkMode === "ignore" ? `Ignore ${row.text}` : `Mark paragraph break before ${row.text}`}
                    tabindex={pdfRowMarkMode !== "none" ? 0 : -1}
                    on:click={() => handlePdfRowClick(row)}
                  ></button>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      </div>
      <div class="pdf-pane">
        <textarea
          class="pdf-textarea"
          bind:this={textareaEl}
          value={pdfDraftText}
          disabled={pdfIsParsing || pdfOcrRunning}
          aria-label="Extracted PDF text"
          on:input={handlePdfTextareaInput}
          on:keydown={handlePdfTextareaKeydown}
          on:click={() => rememberTextareaSelection()}
          on:keyup={() => rememberTextareaSelection()}
          on:select={() => rememberTextareaSelection()}
        ></textarea>
      </div>
    </div>

    <div class="pdf-modal-footer">
      <span>
        {pdfIsParsing ? "Extracting text..." : `${pdfDraftText.length} characters`}
        {#if pdfBreakLines.length > 0}
          · {pdfBreakLines.length} PDF break{pdfBreakLines.length === 1 ? "" : "s"} ready
        {/if}
        {#if pdfIgnoredLines.length > 0}
          · {pdfIgnoredLines.length} ignored
        {/if}
        {#if manualBreakCount > 0}
          · {manualBreakCount} break{manualBreakCount === 1 ? "" : "s"} inserted
        {/if}
        {#if pdfOcrRunning || pdfOcrStatus}
          · {pdfOcrStatus}{pdfOcrRunning ? ` ${Math.round(pdfOcrProgress * 100)}%` : ""}
        {/if}
      </span>
      <button class="toolbar-btn load-confirm-btn" type="button" on:click={loadMarkedPdfDraft} disabled={pdfIsParsing || pdfOcrRunning}>Load text</button>
    </div>
  </div>
</div>
