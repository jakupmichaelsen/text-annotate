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
    Decoration,
    WidgetType,
    showTooltip,
    type Tooltip,
    type DecorationSet,
    type ViewUpdate
  } from "@codemirror/view";
  import { EditorSelection, RangeSet, StateField } from "@codemirror/state";


  import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
  import { searchKeymap } from "@codemirror/search";
  import { RangeSetBuilder } from "@codemirror/state";

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

  let editorEl: HTMLDivElement;
  let view: EditorView;

  let statusMode = "NORMAL";
  let currentStyle = 0;
  let annotationMode: "clean" | "raw" = "clean";
  let rawAnnotations = false;
  let line = 1;

  // Trigger CM6 decoration rebuild when annotationMode changes
  $: annotationMode, view && view.dispatch({});
  let column = 1;
  let selectionInfo = "0 selected";

  const highlightStyles = [
    { name: "yellow", color: "#fabd2f" },
    { name: "green", color: "#b8bb26" },
    { name: "blue", color: "#83a598" },
    { name: "red", color: "#fb4934" },
    { name: "purple", color: "#d3869b" },
    { name: "orange", color: "#fe8019" }
  ];

  function cycleStyle(delta: number) {
    if (currentStyle === 0) {
      currentStyle = delta > 0 ? 1 : 6;
    } else {
      currentStyle = ((currentStyle - 1 + delta + 6) % 6) + 1;
    }
  }

  function setStyle(num: number) {
    if (num >= 1 && num <= 6) {
      currentStyle = num;
    }
  }

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
    const fmt = (d: Date) => d.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).replace(/,/g, "");
    const t0 = fmt(new Date("2026-04-06T10:00:00"));
    const t1 = fmt(new Date("2026-04-06T10:00:01"));
    const t2 = fmt(new Date("2026-04-06T10:00:02"));
    const t3 = fmt(new Date("2026-04-06T10:00:03"));
    const t4 = fmt(new Date("2026-04-06T10:00:04"));
    const t5 = fmt(new Date("2026-04-06T10:00:05"));
    const bt = '`';
    return `# The Quick Brown Fox

The quick brown fox jumps over the ${bt}lazy${bt}<!-- yellow, ${t0}: "" --> dog. It was an unremarkable morning in the valley, the kind where mist clings to the hedgerows and the air smells faintly of damp earth and pine.

## The Fox

The fox was neither ${bt}quick${bt}<!-- green, ${t1}: "Check spelling" --> nor particularly brown — more of a ${bt}tawny${bt}<!-- orange, ${t2}: "Too informal" --> amber, with a white-tipped tail that flickered like a candle in the undergrowth. She had been awake since before dawn, padding silently along the ridge above the farm.

- She was **bold** by nature
- She was *cautious* by experience
- She was, above all, ${bt}hungry${bt}<!-- red, ${t3}: "" -->

## The Dog

The dog, for his part, was not lazy in any meaningful sense. He was simply ${bt}old${bt}<!-- blue, ${t4}: "Consider 'elderly'" -->. His name was Jasper, and he had been guarding the same gate for eleven years. He watched the fox with one open eye and decided, as he always did, that the effort was not worth it.

> "Some battles," Jasper seemed to say, "are won by not fighting them."

## The Valley

The valley stretched south toward the river, flanked by two long ridges of ${bt}limestone${bt}<!-- purple, ${t5}: "Geological fact" -->. Farmers had worked this land for generations, leaving behind dry-stone walls, sunken lanes, and the occasional rusted harrow half-buried in a hedgerow.

### Flora

The hedgerows were thick with **hawthorn** and **blackthorn**, their branches still bare in the early spring. Beneath them, the first *celandines* had opened — small, sharp yellow stars against the dark soil.

### Fauna

Besides the fox and the dog, the valley was home to:

1. A pair of **buzzards** that nested on the eastern ridge
2. Several dozen **rabbits** in the lower field
3. One extremely territorial **robin** near the barn door

## Conclusion

By mid-morning the mist had lifted. The fox was gone. Jasper had fallen back asleep. The buzzards turned slow circles overhead, and the valley went about its quiet business, indifferent and unhurried, as it always had.
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

    { tag: tags.comment, color: gruvbox.comment },
    { tag: tags.lineComment, color: gruvbox.comment },
    { tag: tags.blockComment, color: gruvbox.comment },
    { tag: tags.docComment, color: gruvbox.comment },

    { tag: tags.meta, color: gruvbox.orange },
    { tag: tags.processingInstruction, color: gruvbox.orange },

    { tag: tags.monospace, color: "inherit" }
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

        // Annotation classes override inline-code color — defined after so they win
        ...Object.fromEntries(
          highlightStyles.map(s => [
            `.cm-inline-code.cm-annotation-${s.name}, .cm-annotation-${s.name}`,
            { color: `${contrastColor(s.color)} !important`, backgroundColor: `${s.color} !important`, border: "none" }
          ])
        ),

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

  const dblClickBehavior = EditorView.domEventHandlers({
    dblclick(event, view) {
      if (annotationMode !== "clean") return false;
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos === null) return false;
      const docText = view.state.doc.toString();
      annotationPattern.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = annotationPattern.exec(docText)) !== null) {
        const spanStart = m.index;
        const wordStart = spanStart + 1;
        const wordEnd   = wordStart + m[1].length;
        if (pos >= wordStart && pos <= wordEnd) {
          editingSpan = editingSpan === spanStart ? null : spanStart;
          view.dispatch({});
          return true;
        }
      }
      return false;
    }
  });

  function wrapSelectionOrWord(view: EditorView, style: number = 0) {
    const state = view.state;
    const range = state.selection.main;

  const makeInsert = (text: string): string => {
      if (style === 0) return `\`${text}\``;
      const now = new Date();
      const ts = now.toLocaleString(undefined, {
        year: "numeric", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
      }).replace(/,/g, "");
      const colorName = highlightStyles[style - 1].name;
      return `\`${text}\`<!-- ${colorName}, ${ts}: "" -->`;
    };

    if (!range.empty) {
      const selected = state.doc.sliceString(range.from, range.to);
      const insert = makeInsert(selected);
      // Place cursor one char past the span so the annotation collapses immediately
      const anchor = range.from + insert.length + (style > 0 ? 1 : 0);
      view.dispatch({
        changes: { from: range.from, to: range.to, insert },
        selection: { anchor: Math.min(anchor, view.state.doc.length) }
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
    const insert = makeInsert(word);
    // Place cursor one char past the span so the annotation collapses immediately
    const anchor = from + insert.length + (style > 0 ? 1 : 0);

    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: Math.min(anchor, view.state.doc.length) }
    });

    updateStatusFromView(view);
    return true;
  }

  // Annotation hide/reveal decorator
  // - When cursor is outside a span: backticks and comment are hidden, word gets colored bg
  // - When cursor is inside a span: full raw text is shown for editing

  const annotationPattern = /`([^`]+)`<!--\s*(\w+),\s*([^:]+?):\s*"([^"]*)"\s*-->/g;
  const styleColorMap: Record<string, string> = Object.fromEntries(
    highlightStyles.map(s => [s.name, s.color])
  );

  // Returns theme bg or fg based on which has better contrast against the annotation color
  function contrastColor(hex: string): string {
    const toLinear = (c: number) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    const luminance = (h: string) => {
      const r = toLinear(parseInt(h.slice(1, 3), 16) / 255);
      const g = toLinear(parseInt(h.slice(3, 5), 16) / 255);
      const b = toLinear(parseInt(h.slice(5, 7), 16) / 255);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrast = (L1: number, L2: number) =>
      (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const Lbg  = luminance(gruvbox.bg);
    const Lfg  = luminance(gruvbox.fg);
    const Lann = luminance(hex);
    return contrast(Lann, Lbg) >= contrast(Lann, Lfg) ? gruvbox.bg : gruvbox.fg;
  }

  // Tracks which annotation span is currently in edit mode (by spanStart position)
  let editingSpan: number | null = null;

  // StateField that computes a floating tooltip when cursor is on an annotation (clean mode)
  const annotationTooltipField = StateField.define<readonly Tooltip[]>({
    create: () => [],
    update(tooltips, tr) {
      if (annotationMode !== "clean") return [];
      const cursor = tr.state.selection.main.head;
      const docText = tr.state.doc.toString();
      annotationPattern.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = annotationPattern.exec(docText)) !== null) {
        const spanStart = m.index;
        const wordStart = spanStart + 1;
        const wordEnd   = wordStart + m[1].length;
        const spanEnd   = spanStart + m[0].length;
        if (cursor >= wordStart && cursor <= wordEnd) {
          const colorName = m[2];
          const timestamp = m[3] || "";
          const comment   = m[4] || "";
          const color = styleColorMap[colorName] ?? gruvbox.fgMuted;
          return [{
            pos: wordStart,
            above: true,
            strictSide: true,
            arrow: false,
            create() {
              const dom = document.createElement("div");
              dom.className = "cm-annotation-bubble";
              dom.style.cssText = `
                background: ${gruvbox.bgAlt};
                border: 1px solid ${gruvbox.border};
                border-left: 3px solid ${color};
                border-radius: 4px;
                padding: 4px 10px;
                font-size: 11px;
                color: ${gruvbox.fg};
                line-height: 1.6;
                white-space: nowrap;
                pointer-events: none;
              `;
              const meta = document.createElement("div");
              meta.style.color = gruvbox.fgMuted;
              meta.textContent = `${colorName}  ${timestamp}`;
              dom.appendChild(meta);
              if (comment) {
                const note = document.createElement("div");
                note.textContent = comment;
                dom.appendChild(note);
              } else {
                const hint = document.createElement("div");
                hint.style.color = gruvbox.fgMuted;
                hint.textContent = "Enter to add note";
                dom.appendChild(hint);
              }
              return { dom };
            }
          }];
        }
      }
      return [];
    },
    provide: f => showTooltip.computeN([f], state => state.field(f))
  });

  class TooltipWidget extends WidgetType {
    color: string;
    comment: string;
    colorName: string;
    timestamp: string;

    constructor(color: string, colorName: string, timestamp: string, comment: string) {
      super();
      this.color = color;
      this.colorName = colorName;
      this.timestamp = timestamp;
      this.comment = comment;
    }

    toDOM() {
      const wrap = document.createElement("span");
      wrap.className = "cm-annotation-tooltip";
      wrap.style.cssText = `
        position: absolute;
        bottom: calc(100% + 4px);
        left: 0;
        background: ${gruvbox.bgAlt};
        border: 1px solid ${gruvbox.border};
        border-left: 3px solid ${this.color};
        border-radius: 4px;
        padding: 4px 8px;
        font-size: 11px;
        color: ${gruvbox.fg};
        white-space: nowrap;
        pointer-events: none;
        z-index: 100;
        line-height: 1.6;
      `;
      const meta = document.createElement("div");
      meta.style.color = gruvbox.fgMuted;
      meta.textContent = `${this.colorName}  ${this.timestamp}`;
      wrap.appendChild(meta);
      if (this.comment) {
        const note = document.createElement("div");
        note.textContent = this.comment;
        wrap.appendChild(note);
      } else {
        const hint = document.createElement("div");
        hint.style.color = gruvbox.fgMuted;
        hint.style.fontStyle = "italic";
        hint.textContent = "Enter to add note";
        wrap.appendChild(hint);
      }
      return wrap;
    }

    ignoreEvent() { return true; }
  }

  class EditWidget extends WidgetType {
    color: string;
    comment: string;
    spanStart: number;
    spanEnd: number;
    editorView: EditorView;

    constructor(color: string, comment: string, spanStart: number, spanEnd: number, v: EditorView) {
      super();
      this.color = color;
      this.comment = comment;
      this.spanStart = spanStart;
      this.spanEnd = spanEnd;
      this.editorView = v;
    }

    toDOM() {
      const wrap = document.createElement("span");
      wrap.style.cssText = `
        display: inline-flex; align-items: center;
        background: ${this.color}22; border-radius: 3px;
        padding: 0 4px; margin: 0 1px;
      `;
      const input = document.createElement("input");
      input.type = "text";
      input.value = this.comment;
      input.placeholder = "add note…";
      input.style.cssText = `
        background: transparent; border: none; outline: none;
        color: ${gruvbox.fg}; font-family: inherit; font-size: inherit;
        width: ${Math.max((this.comment.length || 8), 8)}ch; min-width: 8ch;
      `;
      const save = () => {
        editingSpan = null;
        const doc = this.editorView.state.doc;
        const full = doc.sliceString(this.spanStart, this.spanEnd);
        const updated = full.replace(/"[^"]*"(\s*-->)$/, `"${input.value}"$1`);
        this.editorView.dispatch({
          changes: { from: this.spanStart, to: this.spanEnd, insert: updated }
        });
        this.editorView.focus();
      };
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); save(); }
        e.stopPropagation();
      });
      input.addEventListener("input", () => {
        input.style.width = Math.max(input.value.length, 8) + "ch";
      });
      input.addEventListener("blur", save);
      wrap.appendChild(input);
      setTimeout(() => input.focus(), 0);
      return wrap;
    }

    ignoreEvent() { return false; }
  }

  class EmptyWidget extends WidgetType {
    bg: string;
    constructor(bg = "transparent") { super(); this.bg = bg; }
    toDOM() {
      const s = document.createElement("span");
      s.style.cssText = `display:inline-block;width:0;overflow:hidden;background:${this.bg}`;
      return s;
    }
    ignoreEvent() { return false; }
  }

  function buildHighlightDecorator(): Extension {
    // Build per-color CSS classes in the theme so specificity beats syntax highlighting
    const colorTheme = EditorView.theme(
      Object.fromEntries([
        ...highlightStyles.map(s => [
          `.cm-annotation-${s.name}`,
          { backgroundColor: s.color, color: contrastColor(s.color), borderRadius: "3px", padding: "0 2px" }
        ])
      ])
    );

    const plugin = ViewPlugin.fromClass(
      class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
          this.decorations = this.buildDecorations(view);
        }

        update(update: ViewUpdate) {
          if (update.docChanged || update.viewportChanged || update.selectionSet || update.transactions.length > 0) {
            this.decorations = this.buildDecorations(update.view);
          }
        }

        buildDecorations(view: EditorView): DecorationSet {
          const builder = new RangeSetBuilder<Decoration>();
          const cursor = view.state.selection.main.head;

          for (const { from, to } of view.visibleRanges) {
            const text = view.state.doc.sliceString(from, to);
            annotationPattern.lastIndex = 0;
            let match: RegExpExecArray | null;
            while ((match = annotationPattern.exec(text)) !== null) {
              const colorName = match[2];
              const timestamp = match[3] || "";
              const comment   = match[4] || "";
              const color = styleColorMap[colorName];
              if (!color) continue;

              const spanStart = from + match.index;
              const spanEnd   = spanStart + match[0].length;
              const wordStart = spanStart + 1;
              const wordEnd   = wordStart + match[1].length;

              const cursorInside = cursor >= spanStart && cursor <= spanEnd;
              const isEditing = editingSpan === spanStart;

              if (annotationMode === "raw") {
                // Raw mode: reveal full text when cursor inside
                if (cursorInside) {
                  builder.add(spanStart, spanEnd, Decoration.mark({
                    attributes: { style: `background-color: ${color}30; border-radius: 3px;` }
                  }));
                } else {
                  builder.add(spanStart, wordStart,
                    Decoration.replace({ widget: new EmptyWidget(color), inclusive: false }));
                  builder.add(wordStart, wordEnd, Decoration.mark({
                    class: `cm-annotation-${colorName}`
                  }));
                  builder.add(wordEnd, spanEnd,
                    Decoration.replace({ widget: new EmptyWidget() }));
                }
                continue;
              }

              // Clean mode: hide backticks/comment, tooltip on hover, edit on Enter
              // Hide opening backtick with color-matched background so cursor blends in
              builder.add(spanStart, wordStart,
                Decoration.replace({ widget: new EmptyWidget(color), inclusive: false }));
              builder.add(wordStart, wordEnd, Decoration.mark({
                class: `cm-annotation-${colorName}`
              }));

              if (isEditing) {
                // Edit mode: inline input widget
                builder.add(wordEnd, spanEnd, Decoration.replace({
                  widget: new EditWidget(color, comment, spanStart, spanEnd, view)
                }));
              } else if (cursorInside) {
                // Tooltip shown via StateField — just hide the comment tail
                builder.add(wordEnd, spanEnd,
                  Decoration.replace({ widget: new EmptyWidget() }));
              } else {
                // Hidden: just hide the rest
                builder.add(wordEnd, spanEnd,
                  Decoration.replace({ widget: new EmptyWidget() }));
              }
            }
          }
          return builder.finish();
        }
      },
      { decorations: (v) => v.decorations }
    );

    // Plain code decorator: yellow for `word` spans not overlapping any annotation
    const plainPattern = /`([^`\n]+)`/g;
    const plainPlugin = ViewPlugin.fromClass(
      class {
        decorations: DecorationSet;
        constructor(v: EditorView) { this.decorations = this.build(v); }
        update(u: ViewUpdate) {
          if (u.docChanged || u.viewportChanged || u.selectionSet)
            this.decorations = this.build(u.view);
        }
        build(view: EditorView): DecorationSet {
          const builder = new RangeSetBuilder<Decoration>();
          for (const { from, to } of view.visibleRanges) {
            const text = view.state.doc.sliceString(from, to);

            // Collect annotation ranges to exclude
            const annotationRanges: Array<[number, number]> = [];
            annotationPattern.lastIndex = 0;
            let am: RegExpExecArray | null;
            while ((am = annotationPattern.exec(text)) !== null) {
              annotationRanges.push([am.index, am.index + am[0].length]);
            }

            plainPattern.lastIndex = 0;
            let m: RegExpExecArray | null;
            while ((m = plainPattern.exec(text)) !== null) {
              const start = m.index;
              const end = start + m[0].length;
              // Skip if this span overlaps any annotation range
              const overlaps = annotationRanges.some(([as, ae]) => start < ae && end > as);
              if (overlaps) continue;
              builder.add(from + start, from + end, Decoration.mark({ class: "cm-plain-code" }));
            }
          }
          return builder.finish();
        }
      },
      { decorations: (v) => v.decorations }
    );

    const plainTheme = EditorView.theme({
      ".cm-plain-code": {
        color: `${gruvbox.yellow} !important`,
        backgroundColor: gruvbox.bgSoft,
        border: `1px solid ${gruvbox.border}`,
        borderRadius: "4px",
        padding: "0 0.25rem",
      }
    });

    // AtomicRanges: make hidden annotation parts skip as one unit
    const atomicPlugin = ViewPlugin.fromClass(class {
      ranges: DecorationSet;
      constructor(view: EditorView) { this.ranges = this.build(view); }
      update(u: ViewUpdate) {
        if (u.docChanged || u.viewportChanged) this.ranges = this.build(u.view);
      }
      build(view: EditorView): DecorationSet {
        const builder = new RangeSetBuilder<Decoration>();
        for (const { from, to } of view.visibleRanges) {
          const text = view.state.doc.sliceString(from, to);
          annotationPattern.lastIndex = 0;
          let m: RegExpExecArray | null;
          while ((m = annotationPattern.exec(text)) !== null) {
            const spanStart = from + m.index;
            const wordStart = spanStart + 1;
            const wordEnd   = wordStart + m[1].length;
            const spanEnd   = spanStart + m[0].length;
            builder.add(spanStart, wordStart, Decoration.replace({}));
            builder.add(wordEnd, spanEnd, Decoration.replace({}));
          }
        }
        return builder.finish();
      }
    }, { provide: p => EditorView.atomicRanges.of(v => v.plugin(p)?.ranges ?? RangeSet.empty) });

    // Transaction filter: snap cursor past hidden annotation ranges (clean mode only)
    const snapFilter = EditorState.transactionFilter.of(tr => {
      if (!tr.selection || annotationMode !== "clean") return tr;
      const docText = tr.newDoc.toString();
      const cursor = tr.newSelection.main.head;
      const prevCursor = tr.startState.selection.main.head;
      const movingRight = cursor >= prevCursor;

      annotationPattern.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = annotationPattern.exec(docText)) !== null) {
        const spanStart = m.index;
        const wordStart = spanStart + 1;
        const wordEnd   = wordStart + m[1].length;
        const spanEnd   = spanStart + m[0].length;

        // Cursor on hidden opening backtick — skip it
        if (cursor === spanStart) {
          const target = movingRight ? wordStart : Math.max(0, spanStart - 1);
          return [tr, { selection: { anchor: target } }];
        }
        // Cursor inside hidden closing backtick+comment — skip to boundary
        if (cursor > wordEnd && cursor < spanEnd) {
          return [tr, { selection: { anchor: movingRight ? spanEnd : wordEnd } }];
        }
        // Cursor landed exactly on wordEnd (closing backtick) — skip past comment
        if (cursor === wordEnd && movingRight) {
          return [tr, { selection: { anchor: spanEnd } }];
        }
      }
      return tr;
    });

    return [colorTheme, plugin, plainTheme, plainPlugin, atomicPlugin, snapFilter];
  }

  // Alt keybindings for style selection (normal mode only)
  function isInsertMode(view: EditorView): boolean {
    return !!(getCM(view) as any)?.state?.vim?.insertMode;
  }

  const styleKeymap = keymap.of([]);

  // Status bar reactive values
  $: styleLabel = currentStyle === 0
    ? "Style: -"
    : `Style: ${currentStyle}/6 (${highlightStyles[currentStyle - 1].name})`;

  $: styleColor = currentStyle === 0
    ? gruvbox.fgMuted
    : highlightStyles[currentStyle - 1].color;


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
      dblClickBehavior,
      EditorView.lineWrapping,
      lineNumbers(),
      foldGutter(),
      drawSelection(),
      history(),
      indentOnInput(),
      bracketMatching(),
      highlightActiveLineGutter(),
      syntaxHighlighting(gruvboxHighlight),
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
      styleKeymap,
      markdown({ base: markdownLanguage }),
      statusPlugin,
      buildHighlightDecorator(),
      annotationTooltipField,
      EditorView.theme({
        ".cm-tooltip": { background: "transparent", border: "none" },
        ".cm-annotation-bubble": { display: "block" }
      }),
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

    // Allow h/l to cross line boundaries
    Vim.defineAction("move-left-wrap", () => {
      const pos = view.state.selection.main.head;
      if (pos > 0) {
        view.dispatch({ selection: { anchor: pos - 1 } });
      }
    });
    Vim.defineAction("move-right-wrap", () => {
      const pos = view.state.selection.main.head;
      if (pos < view.state.doc.length) {
        view.dispatch({ selection: { anchor: pos + 1 } });
      }
    });
    Vim.mapCommand("h", "action", "move-left-wrap",  {}, { context: "normal" });
    Vim.mapCommand("l", "action", "move-right-wrap", {}, { context: "normal" });
    Vim.mapCommand("<Left>",  "action", "move-left-wrap",  {}, { context: "normal" });
    Vim.mapCommand("<Right>", "action", "move-right-wrap", {}, { context: "normal" });

    Vim.defineAction("wrap-inline-code", () => {
      if (statusMode !== "NORMAL" && statusMode !== "VISUAL") return;

      wrapSelectionOrWord(view, currentStyle);

      const cm = getCM(view) as any;
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

    // Helper: if cursor is on an annotation, change its color; otherwise change currentStyle
    const applyStyleAction = (styleFn: () => void, targetStyle?: number) => {
      const cursor = view.state.selection.main.head;
      const docText = view.state.doc.toString();
      annotationPattern.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = annotationPattern.exec(docText)) !== null) {
        const spanStart = m.index;
        const spanEnd   = spanStart + m[0].length;
        if (cursor >= spanStart && cursor <= spanEnd) {
          // Determine new color name
          const currentColorName = m[2];
          const currentIdx = highlightStyles.findIndex(s => s.name === currentColorName);
          let newIdx: number;
          if (targetStyle !== undefined) {
            newIdx = targetStyle - 1; // setStyle uses 1-based
          } else {
            // cycleStyle — figure out delta from which action called us
            newIdx = currentIdx; // will be overridden below
          }
          const newColorName = highlightStyles[newIdx]?.name;
          if (!newColorName) return;
          const updated = m[0].replace(/^`([^`]+)`<!--\s*\w+,/, `\`$1\`<!-- ${newColorName},`);
          view.dispatch({ changes: { from: spanStart, to: spanEnd, insert: updated } });
          return;
        }
      }
      // Not on an annotation — change currentStyle
      styleFn();
    };

    const applyCycleAction = (delta: number) => {
      const cursor = view.state.selection.main.head;
      const docText = view.state.doc.toString();
      annotationPattern.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = annotationPattern.exec(docText)) !== null) {
        const spanStart = m.index;
        const spanEnd   = spanStart + m[0].length;
        if (cursor >= spanStart && cursor <= spanEnd) {
          const currentColorName = m[2];
          const currentIdx = highlightStyles.findIndex(s => s.name === currentColorName);
          const newIdx = ((currentIdx + delta) + highlightStyles.length) % highlightStyles.length;
          const newColorName = highlightStyles[newIdx].name;
          const updated = m[0].replace(/^`([^`]+)`<!--\s*\w+,/, `\`$1\`<!-- ${newColorName},`);
          view.dispatch({ changes: { from: spanStart, to: spanEnd, insert: updated } });
          return;
        }
      }
      cycleStyle(delta);
    };

    // Style keybindings via Vim so they are intercepted before browser/terminal
    Vim.defineAction("style-set-1",  () => applyStyleAction(() => setStyle(1), 1));
    Vim.defineAction("style-set-6",  () => applyStyleAction(() => setStyle(6), 6));
    Vim.defineAction("style-prev",   () => applyCycleAction(-1));
    Vim.defineAction("style-next",   () => applyCycleAction(+1));

    Vim.mapCommand("<A-h>", "action", "style-set-1",  {}, { context: "normal" });
    Vim.mapCommand("<A-l>", "action", "style-set-6",  {}, { context: "normal" });
    Vim.mapCommand("<A-j>", "action", "style-prev",   {}, { context: "normal" });
    Vim.mapCommand("<A-k>", "action", "style-next",   {}, { context: "normal" });

    // Enter on an annotation span → toggle edit mode for its note
    Vim.defineAction("annotation-edit", () => {
      const cursor = view.state.selection.main.head;
      const docText = view.state.doc.toString();
      annotationPattern.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = annotationPattern.exec(docText)) !== null) {
        const spanStart = m.index;
        const spanEnd   = spanStart + m[0].length;
        if (cursor >= spanStart && cursor <= spanEnd) {
          editingSpan = editingSpan === spanStart ? null : spanStart;
          // Force decoration rebuild
          view.dispatch({});
          return;
        }
      }
    });
    Vim.mapCommand("<CR>", "action", "annotation-edit", {}, { context: "normal" });

    // j/k use display lines (gj/gk behavior) for wrapped text
    Vim.defineAction("display-line-down", () => {
      const cm = getCM(view) as any;
      Vim.handleKey(cm, "g", "normal");
      Vim.handleKey(cm, "j", "normal");
    });
    Vim.defineAction("display-line-up", () => {
      const cm = getCM(view) as any;
      Vim.handleKey(cm, "g", "normal");
      Vim.handleKey(cm, "k", "normal");
    });
    Vim.mapCommand("j", "action", "display-line-down", {}, { context: "normal" });
    Vim.mapCommand("k", "action", "display-line-up",   {}, { context: "normal" });

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
      <span class="segment style" style="color: {styleColor}">{styleLabel}</span>
    </div>

    <div class="status-right">
      <label class="segment checkbox-segment">
        <input type="checkbox" bind:checked={rawAnnotations} on:change={() => { annotationMode = rawAnnotations ? "raw" : "clean"; }} />
        Raw annotations
      </label>
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

  .checkbox-segment {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    user-select: none;
  }

  .checkbox-segment input[type="checkbox"] {
    accent-color: var(--orange);
    cursor: pointer;
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