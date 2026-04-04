<script lang="ts">
  import { onMount } from "svelte";

  import { EditorState, type Extension } from "@codemirror/state";

  import {
    EditorView,
    keymap,
    lineNumbers,
    drawSelection,
    highlightActiveLineGutter,
    ViewPlugin,
    type ViewUpdate
  } from "@codemirror/view";


  import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
  import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";

  import {
    indentOnInput,
    bracketMatching,
    foldGutter,
    syntaxHighlighting,
    HighlightStyle
  } from "@codemirror/language";

  import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
  import { tags } from "@lezer/highlight";
  import { vim, Vim, getCM, CodeMirror } from "@replit/codemirror-vim";

  declare global {
    interface Window {
      CodeMirror?: {
        Vim?: {
          on: (event: string, handler: (data: any) => void) => void;
          off?: (event: string, handler: (data: any) => void) => void;
        };
      };
    }
  }

  let editorEl: HTMLDivElement;
  let view: EditorView;

  let statusMode = "NORMAL";
  let line = 1;
  let column = 1;
  let selectionInfo = "0 selected";

  const gruvbox = {
    bg: "#282828",
    bgSoft: "#32302f",
    bgHard: "#1d2021",
    bgAlt: "#3c3836",
    border: "#504945",
    fg: "#ebdbb2",
    fgMuted: "#a89984",
    yellow: "#fabd2f",
    green: "#b8bb26",
    blue: "#83a598",
    aqua: "#8ec07c",
    orange: "#fe8019",
    red: "#fb4934",
    purple: "#d3869b",
    selection: "#665c54",
    activeLine: "#3c3836aa",
    gutterText: "#7c6f64",
    cursor: "#fe8019",
    comment: "#928374"
  };

  function starterDoc() {
    return `# Markdown first

This editor now starts in **Markdown**.

## Checklist

- CodeMirror 6
- Vim bindings
- Alt+M wraps selection or word in backticks
- Gruvbox shell + editor theme
- Custom syntax highlighting
- Status bar
- Real Vim mode display

Inline code: \`hello_world\`

\`\`\`js
function hello(name) {
  return \`Hello, \${name}\`;
}
\`\`\`



`;
  }

  const gruvboxHighlight = HighlightStyle.define([
    { tag: tags.heading, color: gruvbox.yellow, fontWeight: "700" },
    { tag: tags.contentSeparator, color: gruvbox.orange },
    { tag: tags.emphasis, color: gruvbox.fg, fontStyle: "italic" },
    { tag: tags.strong, color: gruvbox.fg, fontWeight: "700" },
    { tag: tags.strikethrough, color: gruvbox.fgMuted, textDecoration: "line-through" },

    { tag: tags.link, color: gruvbox.blue, textDecoration: "underline" },
    { tag: tags.url, color: gruvbox.aqua, textDecoration: "underline" },
    { tag: tags.labelName, color: gruvbox.yellow },

    { tag: tags.keyword, color: gruvbox.red },
    { tag: tags.operatorKeyword, color: gruvbox.red },
    { tag: tags.controlKeyword, color: gruvbox.red },
    { tag: tags.moduleKeyword, color: gruvbox.red },

    { tag: [tags.atom, tags.bool, tags.null], color: gruvbox.purple },
    { tag: [tags.number, tags.integer, tags.float], color: gruvbox.purple },

    { tag: [tags.string, tags.special(tags.string)], color: gruvbox.green },
    { tag: tags.regexp, color: gruvbox.aqua },
    { tag: tags.escape, color: gruvbox.orange },

    { tag: [tags.variableName, tags.name], color: gruvbox.fg },
    { tag: tags.definition(tags.variableName), color: gruvbox.blue },
    { tag: tags.definition(tags.propertyName), color: gruvbox.blue },
    { tag: tags.propertyName, color: gruvbox.blue },

    { tag: tags.function(tags.variableName), color: gruvbox.green },
    { tag: tags.function(tags.propertyName), color: gruvbox.green },

    { tag: [tags.className, tags.typeName], color: gruvbox.yellow },

    { tag: [tags.operator, tags.compareOperator, tags.logicOperator], color: gruvbox.red },
    { tag: [tags.punctuation, tags.separator, tags.bracket], color: gruvbox.fgMuted },

    { tag: tags.comment, color: gruvbox.comment, fontStyle: "italic" },
    { tag: tags.lineComment, color: gruvbox.comment, fontStyle: "italic" },
    { tag: tags.blockComment, color: gruvbox.comment, fontStyle: "italic" },
    { tag: tags.docComment, color: gruvbox.comment, fontStyle: "italic" },

    { tag: tags.meta, color: gruvbox.orange },
    { tag: tags.processingInstruction, color: gruvbox.orange },

    { tag: tags.monospace, color: gruvbox.yellow }
  ]);

  function buildGruvboxTheme(): Extension {
    return EditorView.theme(
      {
        "&": {
          height: "100%",
          color: gruvbox.fg,
          backgroundColor: gruvbox.bg
        },

        ".cm-scroller": {
          overflow: "auto",
          fontFamily: '"JetBrains Mono", "Fira Code", monospace',
          lineHeight: "1.6"
        },
        ".cm-content": {
          textAlign: "left",
          padding: "1rem 1.25rem 4rem",
          minHeight: "100%",
          caretColor: gruvbox.cursor,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word"
        },
        
        ".cm-line": {
          textAlign: "left"
        },

        "&.cm-focused .cm-cursor": {
          borderLeftColor: gruvbox.cursor
        },

        "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
          backgroundColor: gruvbox.selection,
          opacity: 0.5
        },

        ".cm-gutters": {
          backgroundColor: gruvbox.bgHard,
          color: gruvbox.gutterText,
          borderRight: `1px solid ${gruvbox.border}`
        },

        ".cm-activeLine": {
          backgroundColor: gruvbox.activeLine
        },

        ".cm-activeLineGutter": {
          backgroundColor: gruvbox.bgAlt,
          color: gruvbox.yellow
        },

        ".cm-foldGutter .cm-gutterElement": {
          color: gruvbox.fgMuted
        },

        ".cm-panels": {
          backgroundColor: gruvbox.bgSoft,
          color: gruvbox.fg
        },

        ".cm-searchMatch": {
          backgroundColor: "#665c54",
          outline: `1px solid ${gruvbox.yellow}`
        },

        ".cm-searchMatch.cm-searchMatch-selected": {
          backgroundColor: "#7c6f64"
        },

        ".cm-matchingBracket, .cm-nonmatchingBracket": {
          backgroundColor: gruvbox.bgAlt,
          outline: `1px solid ${gruvbox.blue}`
        },

        ".cm-inline-code": {
          color: gruvbox.yellow,
          backgroundColor: gruvbox.bgSoft,
          border: `1px solid ${gruvbox.border}`,
          borderRadius: "4px",
          padding: "0 0.25rem"
        },

        ".cm-formatting-code": {
          color: gruvbox.orange
        },

        ".cm-formatting-code-block": {
          color: gruvbox.orange
        },

        ".cm-formatting": {
          color: gruvbox.fgMuted
        }
      },
      { dark: true }
    );
  }

  function updateStatusFromView(view: EditorView) {
    const sel = view.state.selection.main;
    const pos = sel.head;
    const lineInfo = view.state.doc.lineAt(pos);

    line = lineInfo.number;
    column = pos - lineInfo.from + 1;

    const selectedChars = Math.abs(sel.to - sel.from);
    selectionInfo = `${selectedChars} selected`;
  }

  function updateCursorClass(view: EditorView, mode: string) {
    const dom = view.dom;
    dom.classList.remove("vim-normal", "vim-insert", "vim-visual");

    if (mode === "INSERT") {
      dom.classList.add("vim-insert");
    } else if (mode === "VISUAL") {
      dom.classList.add("vim-visual");
    } else {
      dom.classList.add("vim-normal");
    }
  }

  function normalizeVimMode(mode?: string) {
    const m = (mode ?? "").toLowerCase();

    if (m.includes("insert")) return "INSERT";
    if (m.includes("visual")) return "VISUAL";
    return "NORMAL";
  }

  const pasteBehavior = EditorView.domEventHandlers({
    paste(event, view) {
      const cm = getCM(view);
      const isInsert = cm.state?.vim?.insertMode;

      // In INSERT mode, let Vim handle it
      if (isInsert) {
        return false;
      }

      // In NORMAL mode, replace the whole document with pasted plain text
      event.preventDefault();

      const text = event.clipboardData?.getData("text/plain") ?? "";
      if (!text) return true;

      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
        selection: { anchor: 0 }
      });

      view.focus();
      return true;
    },

    keydown(event, view) {
      const cm = getCM(view);
      const isInsert = cm?.state?.vim?.insertMode;

      // Ctrl+V in NORMAL mode: trigger paste via clipboard API
      if (!isInsert && (event.ctrlKey || event.metaKey) && event.key === "v") {
        event.preventDefault();
        event.stopPropagation();

        navigator.clipboard.readText().then((text) => {
          if (!text) return;
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: text },
            selection: { anchor: 0 }
          });
          view.focus();
        });

        return true;
      }

      return false;
    }
  });

  function wrapSelectionOrWordInBackticks(view: EditorView) {
    const state = view.state;
    const range = state.selection.main;

    if (!range.empty) {
      const selected = state.doc.sliceString(range.from, range.to);
      view.dispatch({
        changes: {
          from: range.from,
          to: range.to,
          insert: `\`${selected}\``
        },
        selection: {
          anchor: range.from + 1,
          head: range.to + 1
        }
      });
      updateStatusFromView(view);
      return true;
    }

    const pos = range.from;
    const lineInfo = state.doc.lineAt(pos);
    const lineText = lineInfo.text;
    const offset = pos - lineInfo.from;

    const isWordChar = (ch: string) => /[A-Za-z0-9_-]/.test(ch);

    let start = offset;
    let end = offset;

    while (start > 0 && isWordChar(lineText[start - 1])) start--;
    while (end < lineText.length && isWordChar(lineText[end])) end++;

    if (start === end) return true;

    const from = lineInfo.from + start;
    const to = lineInfo.from + end;
    const word = state.doc.sliceString(from, to);

    view.dispatch({
      changes: { from, to, insert: `\`${word}\`` },
      selection: { anchor: from + word.length + 2 }
    });

    updateStatusFromView(view);
    return true;
  }

  // const altMKeymap = keymap.of([
  //   { key: "Alt-m", run: wrapSelectionOrWordInBackticks },
  //   { key: "Alt-M", run: wrapSelectionOrWordInBackticks }
  // ]);

  const statusPlugin = ViewPlugin.fromClass(
    class {
      constructor(view: EditorView) {
        updateStatusFromView(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.selectionSet || update.focusChanged || update.viewportChanged) {
          updateStatusFromView(update.view);
        }
      }
    }
  );


  function baseExtensions(): Extension[] {
    return [
      vim(),
      pasteBehavior,
      EditorView.lineWrapping,
      lineNumbers(),
      foldGutter(),
      drawSelection(),
      history(),
      indentOnInput(),
      bracketMatching(),
      // highlightActiveLine(),
      highlightActiveLineGutter(),
      // highlightSelectionMatches(),
      syntaxHighlighting(gruvboxHighlight),
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
      markdown({
        base: markdownLanguage
      }),
      statusPlugin,
      buildGruvboxTheme()
    ];
  }

  let removeVimModeListener: (() => void) | undefined;

  function setupVimModeTracking(view: EditorView) {
    const cm = getCM(view);

    const handler = (e: { mode?: string; subMode?: string }) => {
      statusMode = normalizeVimMode(e?.mode);
      updateCursorClass(view, statusMode);
    };

    CodeMirror.signal(cm, "vim-mode-change", { mode: "normal" });
    CodeMirror.on(cm, "vim-mode-change", handler);

    statusMode = normalizeVimMode(
      cm.state?.vim?.insertMode
        ? "insert"
        : cm.state?.vim?.visualMode
          ? "visual"
          : "normal"
    );
    updateCursorClass(view, statusMode);

    removeVimModeListener = () => {
      if ((CodeMirror as any).off) {
        (CodeMirror as any).off(cm, "vim-mode-change", handler);
      }
    };
  }

  let vimKeysRegistered = false;

  function registerVimKeybindings(view: EditorView) {
    if (vimKeysRegistered) return;

    Vim.defineAction("wrap-inline-code", () => {
      if (statusMode !== "NORMAL" && statusMode !== "VISUAL") return;

      wrapSelectionOrWordInBackticks(view);

      const cm = getCM(view);
      if (cm.state?.vim?.visualMode) {
        Vim.exitVisualMode(cm);
      }
    });

    Vim.mapCommand("<Space>", "action", "wrap-inline-code", {}, { context: "normal" });
    Vim.mapCommand("<Space>", "action", "wrap-inline-code", {}, { context: "visual" });

    // Override p/P in NORMAL mode to replace the whole document from clipboard
    Vim.defineAction("paste-replace-doc", () => {
      navigator.clipboard.readText().then((text) => {
        if (!text) return;
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: text },
          selection: { anchor: 0 }
        });
        view.focus();
      });
    });

    Vim.mapCommand("p", "action", "paste-replace-doc", {}, { context: "normal" });
    Vim.mapCommand("P", "action", "paste-replace-doc", {}, { context: "normal" });

    // Unmap Ctrl+V from visual-block so the DOM keydown handler can catch it
    Vim.mapCommand("<C-v>", "action", "paste-replace-doc", {}, { context: "normal" });

    // Explicitly ensure Shift+V triggers visual line mode
    Vim.mapCommand("V", "action", "toggleVisualMode", { linewise: true }, { context: "normal" });

    vimKeysRegistered = true;
  }

  onMount(() => {
    view = new EditorView({
      state: EditorState.create({
        doc: starterDoc(),
        extensions: [...baseExtensions()]
      }),
      parent: editorEl
    });

    setupVimModeTracking(view);
    registerVimKeybindings(view);

    view.focus();
    updateStatusFromView(view);
    updateCursorClass(view, statusMode);

    return () => {
      removeVimModeListener?.();
      view?.destroy();
    };
  });
</script>

<div
  class="app"
  style={`
    --bg: ${gruvbox.bg};
    --bg-soft: ${gruvbox.bgSoft};
    --bg-hard: ${gruvbox.bgHard};
    --bg-alt: ${gruvbox.bgAlt};
    --border: ${gruvbox.border};
    --fg: ${gruvbox.fg};
    --fg-muted: ${gruvbox.fgMuted};
    --yellow: ${gruvbox.yellow};
    --green: ${gruvbox.green};
    --blue: ${gruvbox.blue};
    --orange: ${gruvbox.orange};
    --selection: ${gruvbox.selection};
  `}
>
  <div class="toolbar">
    <div class="title">Markdown Annotation Tool</div>
    <div class="hint">Gruvbox · Vim integrated · Space wraps word/selection</div>
  </div>

  <div class="editor" bind:this={editorEl}></div>

  <div class="statusbar">
    <div class="status-left">
      <span class="segment mode">{statusMode}</span>
      <span class="segment">{selectionInfo}</span>
    </div>

    <div class="status-right">
      <span class="segment">Ln {line}</span>
      <span class="segment">Col {column}</span>
      <span class="segment syntax">Markdown</span>
    </div>
  </div>
</div>

<style>
  :global(html, body, #app) {
    margin: 0;
    height: 100%;
  }

  :global(body) {
    background: var(--bg);
    font-family: "JetBrains Mono", "Fira Code", monospace;
  }

  .app {
    height: 100vh;
    display: grid;
    grid-template-rows: auto 1fr auto;
    background: var(--bg);
    color: var(--fg);
  }

  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 44px;
    padding: 0 12px;
    background: var(--bg-hard);
    border-bottom: 1px solid var(--border);
  }

  .title {
    font-size: 14px;
    font-weight: 600;
    color: var(--fg);
    white-space: nowrap;
  }

  .hint {
    font-size: 12px;
    color: var(--fg-muted);
    text-align: right;
  }

  .editor {
    min-height: 0;
    height: 100%;
  }

  :global(.editor .cm-editor) {
    width: 100%;
    height: 100%;
  }

  :global(.cm-editor.cm-focused) {
    outline: none;
  }

  .statusbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    min-height: 24px;
    padding: 0 10px;
    background: var(--bg-hard);
    border-top: 1px solid var(--border);
    color: var(--fg-muted);
    font-size: 12px;
  }

  .status-left,
  .status-right {
    display: flex;
    align-items: center;
    gap: 0;
    min-width: 0;
  }

  .segment {
    padding: 0 8px;
    border: none;
    background: transparent;
    border-radius: 0;
    white-space: nowrap;
    border-right: 1px solid var(--border);
  }

  .segment:last-child {
    border-right: none;
  }

  .status-right .segment:first-child {
    border-left: 1px solid var(--border);
    border-right: 1px solid var(--border);
  }

  .mode {
    color: var(--green);
    font-weight: 700;
  }

  .syntax {
    color: var(--yellow);
  }

  :global(.vim-normal .cm-cursor) {
    border-left: none !important;
    width: 0.7em !important;
    background: var(--orange);
    opacity: 0.55;
  }

  :global(.vim-insert .cm-cursor) {
    border-left: 2px solid var(--orange) !important;
    width: 0 !important;
    background: transparent !important;
    opacity: 1;
  }

  :global(.vim-visual .cm-cursor) {
    border-left: none !important;
    width: 0.7em !important;
    background: var(--orange);
    opacity: 0.35;
  }

  :global(.vim-visual .cm-selectionBackground) {
    background: var(--selection) !important;
  }
</style>