<script lang="ts">
  export let word: string;
  export let active = false;
  export let selected = false;
</script>

<span
  class="word"
  class:active-word={active}
  class:selected-word={selected}
>
  {word}
</span>

<style>
  .word {
    display: inline-block;
    border-radius: 0.35rem;
    padding: 0.04rem 0.1rem;
    transition:
      opacity 120ms ease,
      transform 120ms ease,
      background 120ms ease,
      outline 120ms ease;
  }

  .active-word {
    outline: 2px solid rgba(255, 255, 255, 0.55);
    background: rgba(255, 255, 255, 0.08);
    transform: scale(1.04);
  }

  .selected-word {
    background: rgba(255, 220, 110, 0.28);
  }
</style>