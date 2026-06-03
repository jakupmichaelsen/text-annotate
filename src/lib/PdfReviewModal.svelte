<script lang="ts">
  import { tick } from "svelte";

  export let pdfFrameSrc = "";
  export let pdfFileName = "";
  export let pdfParseError = "";
  export let pdfDraftText = "";
  export let pdfSourceLines: string[] = [];
  export let pdfIsParsing = false;
  export let closePdfModal: () => void;
  export let loadPdfDraft: (text: string) => void;

  let textareaEl: HTMLTextAreaElement;
  let manualBreakCount = 0;
  let pdfLineMarkMode = false;
  type PdfBreakLine = { id: number; y: number; lineIndex: number };
  let pdfBreakLines: PdfBreakLine[] = [];
  let nextPdfBreakLineId = 1;
  let selectionStart = 0;
  let selectionEnd = 0;
  let lastDraftText = pdfDraftText;

  $: if (pdfDraftText !== lastDraftText) {
    lastDraftText = pdfDraftText;
  }

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

  function addPdfBreakLine(event: MouseEvent) {
    if (!pdfLineMarkMode || pdfIsParsing) return;
    const rect = (event.currentTarget as HTMLDivElement).getBoundingClientRect();
    const y = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));
    const lineIndex = pdfLineIndexForY(y);
    pdfBreakLines = [...pdfBreakLines, { id: nextPdfBreakLineId, y, lineIndex }];
    nextPdfBreakLineId += 1;
  }

  function applyPdfLineBreaks(text: string) {
    const positions = pdfBreakLines
      .map(line => offsetForSourceLine(text, line.lineIndex))
      .filter((position): position is number => position !== null);
    let result = text;

    for (const position of Array.from(new Set(positions)).sort((a, b) => b - a)) {
      result = insertParagraphBreakAt(result, position);
    }

    return result;
  }

  function pdfLineIndexForY(y: number) {
    if (pdfSourceLines.length <= 1) return 0;
    return Math.max(0, Math.min(pdfSourceLines.length - 1, Math.round((y / 100) * (pdfSourceLines.length - 1))));
  }

  function offsetForSourceLine(text: string, lineIndex: number) {
    const line = (pdfSourceLines[lineIndex] ?? "").trim();
    if (!line) return null;

    const expectedOffset = Math.round(text.length * (lineIndex / Math.max(pdfSourceLines.length - 1, 1)));
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
          title="Click the PDF preview to draw a break line"
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
        <iframe class="pdf-frame" src={pdfFrameSrc} title="PDF preview"></iframe>
        {#if pdfLineMarkMode}
          <button class="pdf-line-overlay" type="button" aria-label="Place PDF break line" on:click={addPdfBreakLine}></button>
        {/if}
        <div class="pdf-line-layer" aria-hidden="true">
          {#each pdfBreakLines as line}
            <div class="pdf-line-marker" style={`top: ${line.y}%`}></div>
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
