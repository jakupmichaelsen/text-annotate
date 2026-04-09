<script lang="ts">
  import { afterUpdate } from 'svelte';
  import SentenceLine from './SentenceLine.svelte';
  import type { DocumentData, Position, ZoomLevel } from './types';

  export let doc: DocumentData = [];
  export let cursor: Position;
  export let zoom: ZoomLevel;

  let viewportEl: HTMLDivElement | null = null;

  function isParagraphActive(pIndex: number) {
    return cursor.p === pIndex;
  }

  function isSentenceActive(pIndex: number, sIndex: number) {
    return cursor.p === pIndex && cursor.s === sIndex;
  }

  function shouldDimParagraph(pIndex: number) {
    return zoom !== 'document' && !isParagraphActive(pIndex);
  }

  function shouldDimSentence(pIndex: number, sIndex: number) {
    if (zoom === 'document') return false;
    if (zoom === 'paragraph') return !isParagraphActive(pIndex);
    return !isSentenceActive(pIndex, sIndex);
  }

  afterUpdate(() => {
    if (!viewportEl) return;

    const activeSentence = viewportEl.querySelector(
      `[data-sentence-id="${doc[cursor.p]?.sentences[cursor.s]?.id}"]`
    ) as HTMLElement | null;

    if (!activeSentence) return;

    const viewportRect = viewportEl.getBoundingClientRect();
    const sentenceRect = activeSentence.getBoundingClientRect();

    const currentCenter = sentenceRect.top + sentenceRect.height / 2;
    const targetCenter = viewportRect.top + viewportRect.height / 2;

    viewportEl.scrollBy({
      top: currentCenter - targetCenter,
      behavior: 'smooth'
    });
  });
</script>

<div class="viewport-shell">
  <div class="focus-lane"></div>

  <div class="viewport" bind:this={viewportEl}>
    {#if zoom === 'word'}
      <div class="zoom-word">
        {#each doc as paragraph, pIndex}
          {#if isParagraphActive(pIndex)}
            <div class="paragraph active-paragraph">
              {#each paragraph.sentences as sentence, sIndex}
                {#if isSentenceActive(pIndex, sIndex)}
                  <SentenceLine
                    {sentence}
                    {pIndex}
                    {sIndex}
                    {cursor}
                    {zoom}
                    active={true}
                    dim={false}
                  />
                {/if}
              {/each}
            </div>
          {/if}
        {/each}
      </div>
    {:else}
      {#each doc as paragraph, pIndex}
        <div
          class="paragraph"
          class:active-paragraph={isParagraphActive(pIndex)}
          class:dim-paragraph={shouldDimParagraph(pIndex)}
        >
          {#each paragraph.sentences as sentence, sIndex}
            <SentenceLine
              {sentence}
              {pIndex}
              {sIndex}
              {cursor}
              {zoom}
              active={isSentenceActive(pIndex, sIndex)}
              dim={shouldDimSentence(pIndex, sIndex)}
            />
          {/each}
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .viewport-shell {
    position: relative;
    height: 100vh;
    overflow: hidden;
    background: #111;
  }

  .focus-lane {
    position: absolute;
    left: 0;
    right: 0;
    top: 42vh;
    height: 16vh;
    pointer-events: none;
    z-index: 2;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(255, 255, 255, 0.03);
    box-shadow:
      0 0 60px rgba(255, 255, 255, 0.02) inset,
      0 0 120px rgba(0, 0, 0, 0.28) inset;
  }

  .viewport {
    position: relative;
    z-index: 1;
    height: 100%;
    overflow: auto;
    padding: 40vh 8vw;
    box-sizing: border-box;
    scroll-behavior: smooth;
  }

  .paragraph {
    margin-bottom: 2rem;
    transition:
      opacity 140ms ease,
      transform 140ms ease,
      filter 140ms ease;
  }

  .active-paragraph {
    opacity: 1;
    transform: scale(1.01);
  }

  .dim-paragraph {
    opacity: 0.22;
    filter: blur(0.5px);
  }

  .zoom-word {
    display: flex;
    min-height: 100%;
    align-items: center;
  }
</style>