<script lang="ts">
  export let pdfFrameSrc = "";
  export let pdfFileName = "";
  export let pdfParseError = "";
  export let pdfDraftText = "";
  export let pdfIsParsing = false;
  export let closePdfModal: () => void;
  export let loadPdfDraft: (text: string) => void;

  let pdfParagraphBreakMode = false;
  let pdfMarkedBreaks: Set<number> = new Set();
  let lastDraftText = pdfDraftText;

  $: if (pdfDraftText !== lastDraftText) {
    lastDraftText = pdfDraftText;
    clampMarkedBreaks();
  }

  function togglePdfBreakMarkingMode() {
    pdfParagraphBreakMode = !pdfParagraphBreakMode;
    if (!pdfParagraphBreakMode) pdfMarkedBreaks = new Set();
  }

  function handlePdfTextareaInput(event: Event) {
    pdfDraftText = (event.target as HTMLTextAreaElement).value;
    lastDraftText = pdfDraftText;
    clampMarkedBreaks();
  }

  function handlePdfTextareaKeydown(event: KeyboardEvent) {
    if (!((event.ctrlKey || event.metaKey) && event.key === "Enter")) return;
    event.preventDefault();
    if (!pdfParagraphBreakMode || pdfIsParsing) return;

    const textarea = event.target as HTMLTextAreaElement;
    const position = textarea.selectionStart;
    const nextBreaks = new Set(pdfMarkedBreaks);
    if (nextBreaks.has(position)) {
      nextBreaks.delete(position);
    } else {
      nextBreaks.add(position);
    }
    pdfMarkedBreaks = nextBreaks;
  }

  function clampMarkedBreaks() {
    const textLength = pdfDraftText.length;
    const nextBreaks = new Set(Array.from(pdfMarkedBreaks).filter(position => position >= 0 && position <= textLength));
    if (nextBreaks.size !== pdfMarkedBreaks.size) pdfMarkedBreaks = nextBreaks;
  }

  function applyPdfParagraphBreaks(text: string) {
    let result = text;
    for (const position of Array.from(pdfMarkedBreaks).sort((a, b) => b - a)) {
      if (position >= 0 && position <= result.length) {
        result = `${result.slice(0, position)}\n\n${result.slice(position)}`;
      }
    }
    return result;
  }

  function loadMarkedPdfDraft() {
    loadPdfDraft(applyPdfParagraphBreaks(pdfDraftText));
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
          class:active={pdfParagraphBreakMode}
          type="button"
          on:click={togglePdfBreakMarkingMode}
          title="Mark paragraph breaks with Ctrl+Enter"
          aria-pressed={pdfParagraphBreakMode}
        >
          Mark breaks
        </button>
        <button class="toolbar-btn" type="button" on:click={closePdfModal}>Close</button>
      </div>
    </div>

    {#if pdfParseError}
      <div class="pdf-error">{pdfParseError}</div>
    {/if}

    <div class="pdf-modal-body">
      <div class="pdf-pane">
        <iframe class="pdf-frame" src={pdfFrameSrc} title="PDF preview"></iframe>
      </div>
      <div class="pdf-pane">
        <textarea
          class="pdf-textarea"
          value={pdfDraftText}
          disabled={pdfIsParsing}
          aria-label="Extracted PDF text"
          on:input={handlePdfTextareaInput}
          on:keydown={handlePdfTextareaKeydown}
        ></textarea>
      </div>
    </div>

    <div class="pdf-modal-footer">
      <span>
        {pdfIsParsing ? "Extracting text..." : `${pdfDraftText.length} characters`}
        {#if pdfMarkedBreaks.size > 0}
          · {pdfMarkedBreaks.size} break{pdfMarkedBreaks.size === 1 ? "" : "s"} marked
        {/if}
      </span>
      <button class="toolbar-btn load-confirm-btn" type="button" on:click={loadMarkedPdfDraft} disabled={pdfIsParsing}>Load text</button>
    </div>
  </div>
</div>
