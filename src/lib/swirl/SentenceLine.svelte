<script lang="ts">
  import WordToken from './WordToken.svelte';
  import type { Position, SentenceData, ZoomLevel } from './types';
  import { getWordWindow } from './navigation';

  export let sentence: SentenceData;
  export let pIndex: number;
  export let sIndex: number;
  export let cursor: Position;
  export let zoom: ZoomLevel;
  export let active = false;
  export let dim = false;

  function isWordActive(wIndex: number) {
    return cursor.p === pIndex && cursor.s === sIndex && cursor.w === wIndex;
  }

  $: visibleWords =
    zoom === 'word' && active
      ? getWordWindow(sentence.words, cursor.w, 2)
      : sentence.words.map((word, originalIndex) => ({ word, originalIndex }));
</script>

<div
  class="sentence"
  class:active-sentence={active}
  class:dim-sentence={dim}
  data-sentence-id={sentence.id}
>
  {#each visibleWords as item}
    <WordToken
      word={item.word}
      active={isWordActive(item.originalIndex)}
      selected={false}
    />
    {@html ' '}
  {/each}
</div>

<style>
  .sentence {
    display: block;
    line-height: 2;
    font-size: 1.15rem;
    transform-origin: center center;
    transition:
      opacity 140ms ease,
      transform 140ms ease,
      filter 140ms ease;
  }

  .active-sentence {
    opacity: 1;
    transform: scale(1.02);
  }

  .dim-sentence {
    opacity: 0.22;
    filter: blur(0.4px);
  }
</style>