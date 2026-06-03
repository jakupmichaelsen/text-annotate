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
  type BreakMarker = { id: number; position: number };
  let breakMarkers: BreakMarker[] = [];
  let nextBreakMarkerId = 1;
  let selectionStart = 0;
  let selectionEnd = 0;
  let textareaScrollTop = 0;
  let lastDraftText = pdfDraftText;
  const textareaPaddingTop = 12;
  const textareaLineHeight = 15.95;

  $: if (pdfDraftText !== lastDraftText) {
    lastDraftText = pdfDraftText;
  }

  function handlePdfTextareaInput(event: Event) {
    const textarea = event.target as HTMLTextAreaElement;
    pdfDraftText = textarea.value;
    lastDraftText = pdfDraftText;
    rememberTextareaSelection(textarea);
    pruneBreakMarkers();
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

  function handleTextareaScroll() {
    textareaScrollTop = textareaEl?.scrollTop ?? 0;
  }

  async function insertParagraphBreak() {
    if (pdfIsParsing) return;

    const from = Math.max(0, Math.min(selectionStart, pdfDraftText.length));
    const to = Math.max(from, Math.min(selectionEnd, pdfDraftText.length));
    const cursor = from + 2;
    pdfDraftText = `${pdfDraftText.slice(0, from)}\n\n${pdfDraftText.slice(to)}`;
    lastDraftText = pdfDraftText;
    breakMarkers = [
      ...breakMarkers.map(marker => ({
        ...marker,
        position: marker.position > from ? marker.position + 2 - (to - from) : marker.position
      })),
      { id: nextBreakMarkerId, position: from + 1 }
    ];
    nextBreakMarkerId += 1;
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

  function pruneBreakMarkers() {
    breakMarkers = breakMarkers.filter(marker => marker.position >= 0 && marker.position <= pdfDraftText.length);
  }

  function markerTop(position: number) {
    const lineIndex = pdfDraftText.slice(0, position).split("\n").length - 1;
    return textareaPaddingTop + lineIndex * textareaLineHeight - textareaScrollTop;
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
          type="button"
          on:click={insertParagraphBreak}
          title="Insert paragraph break at cursor"
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
      <div class="pdf-pane">
        <iframe class="pdf-frame" src={pdfFrameSrc} title="PDF preview"></iframe>
      </div>
      <div class="pdf-pane">
        <div class="pdf-textarea-wrap">
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
            on:scroll={handleTextareaScroll}
          ></textarea>
          <div class="pdf-break-overlay" aria-hidden="true">
            {#each breakMarkers as marker (marker.id)}
              {@const top = markerTop(marker.position)}
              {#if top >= 0 && top <= 900}
                <div class="pdf-break-marker" style={`top: ${top}px`}></div>
              {/if}
            {/each}
          </div>
        </div>
      </div>
    </div>

    <div class="pdf-modal-footer">
      <span>
        {pdfIsParsing ? "Extracting text..." : `${pdfDraftText.length} characters`}
        {#if breakMarkers.length > 0}
          · {breakMarkers.length} break{breakMarkers.length === 1 ? "" : "s"} inserted
        {/if}
      </span>
      <button class="toolbar-btn load-confirm-btn" type="button" on:click={loadMarkedPdfDraft} disabled={pdfIsParsing}>Load text</button>
    </div>
  </div>
</div>
