<script lang="ts">
  import { onMount } from 'svelte';
  import FocusViewport from './FocusViewport.svelte';
  import { parseDocument } from './parsing';
  import {
    jumpToEndOfUnit,
    jumpToStartOfUnit,
    moveBackward,
    moveFineBackward,
    moveFineForward,
    moveForward,
    zoomIn,
    zoomOut
  } from './navigation';
  import type { ColorName, DocumentData, Position, ZoomLevel } from './types';

  const colors: ColorName[] = ['red', 'yellow', 'green', 'blue', 'purple'];

  let rawText = `Paste text here and press Load.

This is a first sentence. This is a second sentence. This is a third sentence, and it is somewhat longer so you can feel the zoom rendering better.

Here is another paragraph. It also contains multiple sentences.`;

  let doc: DocumentData = [];
  let zoom: ZoomLevel = 'sentence';
  let cursor: Position = { p: 0, s: 0, w: 0, c: 0 };
  let colorIndex = 0;

  function currentColor() {
    return colors[colorIndex];
  }

  function loadText() {
    doc = parseDocument(rawText);
    cursor = { p: 0, s: 0, w: 0, c: 0 };
    zoom = 'sentence';
  }

  function prevColor() {
    colorIndex = (colorIndex - 1 + colors.length) % colors.length;
  }

  function nextColor() {
    colorIndex = (colorIndex + 1) % colors.length;
  }

  function handleKeydown(e: KeyboardEvent) {
    const target = e.target as HTMLElement | null;
    const tag = target?.tagName?.toLowerCase();

    if (tag === 'textarea' || tag === 'input') return;
    if (!doc.length) return;

    if (e.shiftKey && e.key === 'j') {
      e.preventDefault();
      cursor = jumpToEndOfUnit(doc, cursor, zoom);
      return;
    }

    if (e.shiftKey && e.key === 'k') {
      e.preventDefault();
      cursor = jumpToStartOfUnit(doc, cursor, zoom);
      return;
    }

    switch (e.key) {
      case 'j':
        e.preventDefault();
        cursor = moveForward(doc, cursor, zoom);
        break;
      case 'k':
        e.preventDefault();
        cursor = moveBackward(doc, cursor, zoom);
        break;
      case 'h':
        e.preventDefault();
        cursor = moveFineBackward(doc, cursor, zoom);
        break;
      case 'l':
        e.preventDefault();
        cursor = moveFineForward(doc, cursor, zoom);
        break;
      case 'w':
        e.preventDefault();

        zoom = zoomIn(zoom);
        break;
      case 's':
        e.preventDefault();
        zoom = zoomOut(zoom);
        break;
      case 'a':
        e.preventDefault();
        prevColor();
        break;
      case 'd':
        e.preventDefault();
        nextColor();
        break;
    }
  }

  onMount(() => {
    loadText();
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  });
</script>

<div class="app">
  <aside class="sidebar">
    <h1>Swirl</h1>
    <p class="sub">Component prototype for focus/zoom rendering</p>

    <label for="text">Input text</label>
    <textarea id="text" bind:value={rawText} rows="12"></textarea>

    <button on:click={loadText}>Load text</button>

    <div class="panel">
      <div><strong>Zoom:</strong> {zoom}</div>
      <div><strong>Color:</strong> {currentColor()}</div>
      <div><strong>Cursor:</strong> p{cursor.p} s{cursor.s} w{cursor.w} c{cursor.c}</div>
    </div>

    <div class="panel">
      <h2>Keys</h2>
      <ul>
        <li><code>j / k</code> next / previous unit</li>
        <li><code>h / l</code> finer previous / next</li>
        <li><code>Shift+j / Shift+k</code> end / start of unit</li>
        <li><code>w / s</code> zoom in / out</li>
        <li><code>a / d</code> previous / next color</li>
      </ul>
    </div>
  </aside>

  <main class="main">
    <FocusViewport {doc} {cursor} {zoom} />
  </main>
</div>

<style>
  :global(body) {
    margin: 0;
    background: #111;
    color: #eee;
    font-family: Inter, system-ui, sans-serif;
  }

  .app {
    display: grid;
    grid-template-columns: 360px 1fr;
    min-height: 100vh;
  }

  .sidebar {
    padding: 1rem;
    border-right: 1px solid #262626;
    background: #151515;
    box-sizing: border-box;
    overflow: auto;
  }

  .sub {
    color: #b8b8b8;
    margin-top: -0.25rem;
  }

  textarea {
    width: 100%;
    box-sizing: border-box;
    background: #0f0f0f;
    color: #f5f5f5;
    border: 1px solid #333;
    border-radius: 0.8rem;
    padding: 0.75rem;
    margin: 0.5rem 0 1rem;
  }

  button {
    background: #2a2a2a;
    color: white;
    border: 1px solid #444;
    border-radius: 0.8rem;
    padding: 0.6rem 0.9rem;
    cursor: pointer;
  }

  .panel {
    margin-top: 1rem;
    padding: 0.85rem;
    border: 1px solid #2b2b2b;
    border-radius: 0.9rem;
    background: #131313;
  }

  .panel h2 {
    margin-top: 0;
  }

  .panel ul {
    margin-bottom: 0;
    padding-left: 1.2rem;
  }

  .main {
    min-width: 0;
  }
</style>