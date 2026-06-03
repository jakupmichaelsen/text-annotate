<script lang="ts">
  import { tick } from "svelte";

  export let pdfFrameSrc = "";
  export let pdfFileName = "";
  export let pdfParseError = "";
  export let pdfDraftText = "";
  export let pdfIsParsing = false;
  export let closePdfModal: () => void;
  export let loadPdfDraft: (text: string) => void;

  let textareaEl: HTMLTextAreaElement;
  let manualBreakCount = 0;
  let pdfLineMarkMode = false;
  let pdfBreakLines: number[] = [];
  let selectionStart = 0;
  let selectionEnd = 0;
  let lastDraftText = pdfDraftText;
  const textareaPaddingX = 12;
  const textareaPaddingTop = 12;
  const textareaLineHeight = 15.95;
  const averageCharacterWidth = 6.8;

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
    pdfBreakLines = [...pdfBreakLines, y];
  }

  function applyPdfLineBreaks(text: string) {
    if (!textareaEl || pdfBreakLines.length === 0) return text;

    const positions = pdfBreakLines
      .map(line => offsetForPdfLine(text, line))
      .filter((position): position is number => position !== null);
    let result = text;

    for (const position of Array.from(new Set(positions)).sort((a, b) => b - a)) {
      result = insertParagraphBreakAt(result, position);
    }

    return result;
  }

  function offsetForPdfLine(text: string, linePercent: number) {
    if (!textareaEl) return null;
    const y = textareaEl.scrollTop + textareaEl.clientHeight * (linePercent / 100);
    const visualRow = Math.max(0, Math.floor((y - textareaPaddingTop) / textareaLineHeight));
    const wrapColumn = Math.max(12, Math.floor((textareaEl.clientWidth - textareaPaddingX * 2) / averageCharacterWidth));
    return offsetForVisualRow(text, visualRow, wrapColumn);
  }

  function offsetForVisualRow(text: string, targetRow: number, wrapColumn: number) {
    const lines = text.split("\n");
    let offset = 0;
    let row = 0;

    for (const line of lines) {
      const rowCount = Math.max(1, Math.ceil(Math.max(line.length, 1) / wrapColumn));
      if (targetRow < row + rowCount) {
        return offset + Math.min(line.length, (targetRow - row) * wrapColumn);
      }
      row += rowCount;
      offset += line.length + 1;
    }

    return text.length;
  }

  function insertParagraphBreakAt(text: string, position: number) {
    const from = Math.max(0, Math.min(position, text.length));
    const before = text.slice(0, from).replace(/[ \t]+$/, "");
    const after = text.slice(from).replace(/^[ \t]+/, "");
    return `${before}\n\n${after}`;
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
            <div class="pdf-line-marker" style={`top: ${line}%`}></div>
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
