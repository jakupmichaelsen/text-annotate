<script lang="ts">
  import { onMount, tick } from "svelte";
  import * as pdfjsLib from "pdfjs-dist";
  import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

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
  let pdfLineMarkMode = false;
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
    width: number;
    height: number;
    rows: PdfPreviewRow[];
  };
  type PdfBreakLine = { id: number; row: PdfPreviewRow };
  let pdfBreakLines: PdfBreakLine[] = [];
  let nextPdfBreakLineId = 1;
  let pdfPreviewPages: PdfPreviewPage[] = [];
  let pdfPreviewLoading = false;
  let pdfRenderError = "";
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
    loadPdfDraft(applyPdfLineBreaks(pdfDraftText));
  }

  function togglePdfLineMarkMode() {
    pdfLineMarkMode = !pdfLineMarkMode;
  }

  async function loadPdfPreview(url: string) {
    const runId = previewRenderRun + 1;
    previewRenderRun = runId;
    pdfPreviewLoading = true;
    pdfRenderError = "";
    pdfPreviewPages = [];
    pdfBreakLines = [];

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
        visualIndex += rows.length;
        nextPages.push({
          pageNumber,
          width: viewport.width,
          height: viewport.height,
          rows
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
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      await page.render({ canvasContext: context, viewport }).promise;
    }
  }

  function togglePdfBreakRow(row: PdfPreviewRow) {
    if (!pdfLineMarkMode || pdfIsParsing) return;
    if (isPdfRowMarked(row)) {
      pdfBreakLines = pdfBreakLines.filter(line => line.row.id !== row.id);
      return;
    }

    pdfBreakLines = [...pdfBreakLines, { id: nextPdfBreakLineId, row }];
    nextPdfBreakLineId += 1;
  }

  function isPdfRowMarked(row: PdfPreviewRow) {
    return pdfBreakLines.some(line => line.row.id === row.id);
  }

  function applyPdfLineBreaks(text: string) {
    const positions = pdfBreakLines
      .map(line => offsetForMarkedRow(text, line.row))
      .filter((position): position is number => position !== null);
    let result = text;

    for (const position of Array.from(new Set(positions)).sort((a, b) => b - a)) {
      result = insertParagraphBreakAt(result, position);
    }

    return result;
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

  function cleanRowText(text: string) {
    return text
      .replace(/\s+/g, " ")
      .replace(/\s+([.,;:!?])/g, "$1")
      .replace(/([([{“‘])\s+/g, "$1")
      .replace(/\s+([)\]}”’])/g, "$1")
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
          class:active={pdfLineMarkMode}
          type="button"
          on:click={togglePdfLineMarkMode}
          title="Click a PDF text row to mark a paragraph break"
          aria-pressed={pdfLineMarkMode}
          disabled={pdfIsParsing}
        >
          Mark break
        </button>
        <button class="toolbar-btn" type="button" on:click={closePdfModal}>Close</button>
      </div>
    </div>

    {#if pdfParseError}
      <div class="pdf-error">{pdfParseError}</div>
    {/if}

    <div class="pdf-modal-body">
      <div class="pdf-pane pdf-preview-pane" class:line-marking={pdfLineMarkMode}>
        <div class="pdf-preview-scroll" bind:this={previewScrollEl} aria-label="PDF preview">
          {#if pdfPreviewLoading}
            <div class="pdf-preview-status">Rendering PDF...</div>
          {/if}
          {#if pdfRenderError}
            <div class="pdf-preview-status">{pdfRenderError}</div>
          {/if}
          {#each pdfPreviewPages as page}
            <div class="pdf-page" style={`width: ${page.width}px; height: ${page.height}px`}>
              <canvas class="pdf-page-canvas" data-page-number={page.pageNumber}></canvas>
              <div class="pdf-text-row-layer" aria-hidden={!pdfLineMarkMode}>
                {#each page.rows as row}
                  <button
                    class="pdf-text-row-button"
                    class:marked={isPdfRowMarked(row)}
                    type="button"
                    style={`top: ${row.top}px; left: ${row.left}px; width: ${row.width}px; height: ${row.height}px`}
                    title={row.text}
                    aria-label={`Mark paragraph break before ${row.text}`}
                    tabindex={pdfLineMarkMode ? 0 : -1}
                    on:click={() => togglePdfBreakRow(row)}
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
          disabled={pdfIsParsing}
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
        {#if manualBreakCount > 0}
          · {manualBreakCount} break{manualBreakCount === 1 ? "" : "s"} inserted
        {/if}
      </span>
      <button class="toolbar-btn load-confirm-btn" type="button" on:click={loadMarkedPdfDraft} disabled={pdfIsParsing}>Load text</button>
    </div>
  </div>
</div>
