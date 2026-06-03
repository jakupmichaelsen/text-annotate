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
    loadPdfDraft(pdfDraftText);
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
          · {pdfBreakLines.length} PDF line{pdfBreakLines.length === 1 ? "" : "s"}
        {/if}
        {#if manualBreakCount > 0}
          · {manualBreakCount} break{manualBreakCount === 1 ? "" : "s"} inserted
        {/if}
      </span>
      <button class="toolbar-btn load-confirm-btn" type="button" on:click={loadMarkedPdfDraft} disabled={pdfIsParsing}>Load text</button>
    </div>
  </div>
</div>
