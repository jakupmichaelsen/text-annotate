<script lang="ts">
  import { onMount } from "svelte";
  import { EditorState, type Extension } from "@codemirror/state";
  import {
    EditorView, keymap, lineNumbers, drawSelection,
    highlightActiveLineGutter, ViewPlugin, Decoration,
    WidgetType, showTooltip, type Tooltip,
    type DecorationSet, type ViewUpdate
  } from "@codemirror/view";
  import { EditorSelection, RangeSet, StateField } from "@codemirror/state";
  import {
    defaultKeymap, history, historyKeymap, undo, redo,
    cursorLineUp, cursorLineDown, cursorLineStart, cursorLineEnd,
    cursorCharLeft, cursorCharRight, cursorGroupForward, cursorGroupBackward,
    selectAll
  } from "@codemirror/commands";
  import { searchKeymap } from "@codemirror/search";
  import { RangeSetBuilder } from "@codemirror/state";
  import {
    indentOnInput, bracketMatching, foldGutter,
    syntaxHighlighting, HighlightStyle
  } from "@codemirror/language";
  import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
  import { tags } from "@lezer/highlight";

  let editorEl: HTMLDivElement;
  let view: EditorView;
  let padLeft = 40;
  let padRight = 40;
  let padTop = 16;
  let padBottom = 64;

  let currentStyle = 0;
  let annotationMode: "clean" | "raw" | "all" = "clean";
  let line = 1;
  let column = 1;
  let selectionInfo = "0 selected";

  $: if (view) {
    const el = view.dom.querySelector<HTMLElement>(".cm-content");
    if (el) {
      el.style.paddingLeft   = `${padLeft}px`;
      el.style.paddingRight  = `${padRight}px`;
      el.style.paddingTop    = `${padTop}px`;
      el.style.paddingBottom = `${padBottom}px`;
    }
  }

  // Trigger CM6 decoration rebuild when annotationMode changes
  $: annotationMode, view && view.dispatch({});

  const highlightStyles = [
    { name: "yellow",  color: "#fabd2f" },
    { name: "green",   color: "#b8bb26" },
    { name: "blue",    color: "#83a598" },
    { name: "red",     color: "#fb4934" },
    { name: "purple",  color: "#d3869b" },
    { name: "orange",  color: "#fe8019" }
  ];

  function cycleStyle(delta: number) {
    currentStyle = ((currentStyle + delta) + 7) % 7;
  }

  const gruvbox = {
    bg: "#282828", bgSoft: "#32302f", bgHard: "#1d2021",
    bgAlt: "#3c3836", border: "#504945", fg: "#ebdbb2",
    fgMuted: "#a89984", yellow: "#fabd2f", green: "#b8bb26",
    blue: "#83a598", aqua: "#8ec07c", orange: "#fe8019",
    red: "#fb4934", purple: "#d3869b", selection: "#665c54",
    activeLine: "#3c3836aa", gutterText: "#7c6f64",
    cursor: "#fe8019", comment: "#928374"
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
    { tag: [tags.atom, tags.bool, tags.null], color: gruvbox.purple },
    { tag: [tags.number, tags.integer, tags.float], color: gruvbox.purple },
    { tag: [tags.string, tags.special(tags.string)], color: gruvbox.green },
    { tag: tags.regexp, color: gruvbox.aqua },
    { tag: tags.escape, color: gruvbox.orange },
    { tag: [tags.variableName, tags.name], color: gruvbox.fg },
    { tag: tags.function(tags.variableName), color: gruvbox.green },
    { tag: [tags.className, tags.typeName], color: gruvbox.yellow },
    { tag: [tags.operator, tags.compareOperator, tags.logicOperator], color: gruvbox.red },
    { tag: [tags.punctuation, tags.separator, tags.bracket], color: gruvbox.fgMuted },
    { tag: tags.comment, color: gruvbox.comment },
    { tag: tags.meta, color: gruvbox.orange },
    { tag: tags.monospace, color: "inherit" }
  ]);

  function buildGruvboxTheme(): Extension {
    return EditorView.theme({
      "&": { height: "100%", color: gruvbox.fg, backgroundColor: gruvbox.bg },
      ".cm-scroller": { overflow: "auto", fontFamily: '"JetBrains Mono", "Fira Code", monospace', lineHeight: "1.6" },
      ".cm-content": { textAlign: "left", padding: "1rem 1.25rem 4rem", minHeight: "100%", caretColor: gruvbox.cursor, whiteSpace: "pre-wrap", wordBreak: "break-word" },
      ".cm-line": { textAlign: "left" },
      "&.cm-focused .cm-cursor": { borderLeftColor: gruvbox.cursor },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: gruvbox.selection, opacity: 0.5 },
      ".cm-gutters": { backgroundColor: gruvbox.bgHard, color: gruvbox.gutterText, borderRight: `1px solid ${gruvbox.border}` },
      ".cm-activeLine": { backgroundColor: gruvbox.activeLine },
      ".cm-activeLineGutter": { backgroundColor: gruvbox.bgAlt, color: gruvbox.yellow },
      ".cm-foldGutter .cm-gutterElement": { color: gruvbox.fgMuted },
      ".cm-panels": { backgroundColor: gruvbox.bgSoft, color: gruvbox.fg },
      ".cm-searchMatch": { backgroundColor: "#665c54", outline: `1px solid ${gruvbox.yellow}` },
      ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "#7c6f64" },
      ".cm-matchingBracket, .cm-nonmatchingBracket": { backgroundColor: gruvbox.bgAlt, outline: `1px solid ${gruvbox.blue}` },
      ...Object.fromEntries(highlightStyles.map(s => [
        `.cm-annotation-${s.name}`,
        { color: `${contrastColor(s.color)} !important`, backgroundColor: `${s.color} !important`, border: "none" }
      ])),
      ".cm-formatting-code": { color: gruvbox.orange },
      ".cm-formatting-code-block": { color: gruvbox.orange },
      ".cm-formatting": { color: gruvbox.fgMuted }
    }, { dark: true });
  }

  function updateStatusFromView(v: EditorView) {
    const sel = v.state.selection.main;
    const pos = sel.head;
    const lineInfo = v.state.doc.lineAt(pos);
    line = lineInfo.number;
    column = pos - lineInfo.from + 1;
    selectionInfo = `${Math.abs(sel.to - sel.from)} selected`;
  }

  // Returns theme bg or fg based on which has better contrast against the annotation color
  function contrastColor(hex: string): string {
    const toLinear = (c: number) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    const luminance = (h: string) => {
      const r = toLinear(parseInt(h.slice(1, 3), 16) / 255);
      const g = toLinear(parseInt(h.slice(3, 5), 16) / 255);
      const b = toLinear(parseInt(h.slice(5, 7), 16) / 255);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrast = (L1: number, L2: number) => (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const Lann = luminance(hex);
    return contrast(Lann, luminance(gruvbox.bg)) >= contrast(Lann, luminance(gruvbox.fg)) ? gruvbox.bg : gruvbox.fg;
  }

  const annotationPattern = /`([^`]+)`<!--\s*(\w+),\s*(.+?):\s*"([^"]*)"\s*-->/g;
  const styleColorMap: Record<string, string> = Object.fromEntries(highlightStyles.map(s => [s.name, s.color]));
  let editingSpan: number | null = null;

  // Annotation tooltip StateField
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
            pos: wordStart, above: true, strictSide: true, arrow: false,
            create() {
              const dom = document.createElement("div");
              dom.className = "cm-annotation-bubble";
              dom.style.cssText = `background:${gruvbox.bgAlt};border:1px solid ${gruvbox.border};border-left:3px solid ${color};border-radius:4px;padding:4px 10px;font-size:11px;color:${gruvbox.fg};line-height:1.6;white-space:nowrap;pointer-events:none;`;
              const meta = document.createElement("div");
              meta.style.color = gruvbox.fgMuted;
              meta.textContent = `${colorName}  ${timestamp}`;
              dom.appendChild(meta);
              const line2 = document.createElement("div");
              line2.textContent = comment || "Enter to add note";
              if (!comment) line2.style.color = gruvbox.fgMuted;
              dom.appendChild(line2);
              return { dom };
            }
          }];
        }
      }
      return [];
    },
    provide: f => showTooltip.computeN([f], state => state.field(f))
  });

  class EditWidget extends WidgetType {
    private color: string;
    private comment: string;
    private spanStart: number;
    private spanEnd: number;
    private editorView: EditorView;

    constructor(color: string, comment: string, spanStart: number, spanEnd: number, editorView: EditorView) {
      super();
      this.color = color;
      this.comment = comment;
      this.spanStart = spanStart;
      this.spanEnd = spanEnd;
      this.editorView = editorView;
    }

    toDOM() {
      const wrap = document.createElement("span");
      wrap.style.cssText = `display:inline-flex;align-items:center;background:${this.color}22;border-radius:3px;padding:0 4px;margin:0 1px;`;
      const input = document.createElement("input");
      input.type = "text";
      input.value = this.comment;
      input.placeholder = "add note…";
      input.style.cssText = `background:transparent;border:none;outline:none;color:${gruvbox.fg};font-family:inherit;font-size:inherit;width:${Math.max(this.comment.length || 8, 8)}ch;min-width:8ch;`;
      const save = () => {
        editingSpan = null;
        const full = this.editorView.state.doc.sliceString(this.spanStart, this.spanEnd);
        const updated = full.replace(/"[^"]*"(\s*-->)$/, `"${input.value}"$1`);
        this.editorView.dispatch({ changes: { from: this.spanStart, to: this.spanEnd, insert: updated } });
        this.editorView.focus();
      };
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); save(); }
        e.stopPropagation();
      });
      input.addEventListener("input", () => { input.style.width = Math.max(input.value.length, 8) + "ch"; });
      input.addEventListener("blur", save);
      wrap.appendChild(input);
      setTimeout(() => input.focus(), 0);
      return wrap;
    }
    ignoreEvent() { return false; }
  }

  class EmptyWidget extends WidgetType {
    private bg: string;
    constructor(bg = "transparent") { super(); this.bg = bg; }
    toDOM() {
      const s = document.createElement("span");
      s.style.cssText = `display:inline-block;width:0;overflow:hidden;background:${this.bg}`;
      return s;
    }
    ignoreEvent() { return false; }
  }

  function buildHighlightDecorator(): Extension {
    const colorTheme = EditorView.theme(Object.fromEntries(
      highlightStyles.map(s => [`.cm-annotation-${s.name}`, { backgroundColor: s.color, color: contrastColor(s.color), borderRadius: "3px", padding: "0 2px" }])
    ));

    const plugin = ViewPlugin.fromClass(class {
      decorations: DecorationSet;
      constructor(v: EditorView) { this.decorations = this.build(v); }
      update(u: ViewUpdate) {
        if (u.docChanged || u.viewportChanged || u.selectionSet || u.transactions.length > 0)
          this.decorations = this.build(u.view);
      }
      build(v: EditorView): DecorationSet {
        const builder = new RangeSetBuilder<Decoration>();
        const cursor = v.state.selection.main.head;
        const mode = annotationMode;
        for (const { from, to } of v.visibleRanges) {
          const text = v.state.doc.sliceString(from, to);
          annotationPattern.lastIndex = 0;
          let match: RegExpExecArray | null;
          while ((match = annotationPattern.exec(text)) !== null) {
            const colorName = match[2];
            const comment   = match[4] || "";
            const color = styleColorMap[colorName];
            if (!color) continue;
            const spanStart = from + match.index;
            const spanEnd   = spanStart + match[0].length;
            const wordStart = spanStart + 1;
            const wordEnd   = wordStart + match[1].length;
            const cursorInside = cursor >= spanStart && cursor <= spanEnd;
            const isEditing = editingSpan === spanStart;

            if (mode === "raw" || mode === "all") {
              if (mode === "all" || cursorInside) {
                builder.add(spanStart, spanEnd, Decoration.mark({ attributes: { style: `background-color:${color}30;border-radius:3px;` } }));
              } else {
                builder.add(spanStart, wordStart, Decoration.replace({ widget: new EmptyWidget(color), inclusive: false }));
                builder.add(wordStart, wordEnd, Decoration.mark({ class: `cm-annotation-${colorName}` }));
                builder.add(wordEnd, spanEnd, Decoration.replace({ widget: new EmptyWidget() }));
              }
              continue;
            }
            builder.add(spanStart, wordStart, Decoration.replace({ widget: new EmptyWidget(color), inclusive: false }));
            builder.add(wordStart, wordEnd, Decoration.mark({ class: `cm-annotation-${colorName}` }));
            if (isEditing) {
              builder.add(wordEnd, spanEnd, Decoration.replace({ widget: new EditWidget(color, comment, spanStart, spanEnd, v) }));
            } else {
              builder.add(wordEnd, spanEnd, Decoration.replace({ widget: new EmptyWidget() }));
            }
          }
        }
        return builder.finish();
      }
    }, { decorations: v => v.decorations });

    const plainPattern = /`([^`\n]+)`/g;
    const plainPlugin = ViewPlugin.fromClass(class {
      decorations: DecorationSet;
      constructor(v: EditorView) { this.decorations = this.build(v); }
      update(u: ViewUpdate) {
        if (u.docChanged || u.viewportChanged || u.selectionSet) this.decorations = this.build(u.view);
      }
      build(v: EditorView): DecorationSet {
        const builder = new RangeSetBuilder<Decoration>();
        for (const { from, to } of v.visibleRanges) {
          const text = v.state.doc.sliceString(from, to);
          const annotationRanges: Array<[number, number]> = [];
          annotationPattern.lastIndex = 0;
          let am: RegExpExecArray | null;
          while ((am = annotationPattern.exec(text)) !== null)
            annotationRanges.push([am.index, am.index + am[0].length]);
          plainPattern.lastIndex = 0;
          let m: RegExpExecArray | null;
          while ((m = plainPattern.exec(text)) !== null) {
            const start = m.index, end = start + m[0].length;
            if (annotationRanges.some(([as, ae]) => start < ae && end > as)) continue;
            builder.add(from + start, from + end, Decoration.mark({ class: "cm-plain-code" }));
          }
        }
        return builder.finish();
      }
    }, { decorations: v => v.decorations });

    const plainTheme = EditorView.theme({
      ".cm-plain-code": { color: `${gruvbox.yellow} !important`, backgroundColor: gruvbox.bgSoft, border: `1px solid ${gruvbox.border}`, borderRadius: "4px", padding: "0 0.25rem" }
    });

    const atomicPlugin = ViewPlugin.fromClass(class {
      ranges: DecorationSet;
      constructor(v: EditorView) { this.ranges = this.build(v); }
      update(u: ViewUpdate) { if (u.docChanged || u.viewportChanged) this.ranges = this.build(u.view); }
      build(v: EditorView): DecorationSet {
        const builder = new RangeSetBuilder<Decoration>();
        for (const { from, to } of v.visibleRanges) {
          const text = v.state.doc.sliceString(from, to);
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
        if (cursor === spanStart) return [tr, { selection: { anchor: movingRight ? wordStart : Math.max(0, spanStart - 1) } }];
        if (cursor > wordEnd && cursor < spanEnd) return [tr, { selection: { anchor: movingRight ? spanEnd : wordEnd } }];
        if (cursor === wordEnd && movingRight) return [tr, { selection: { anchor: spanEnd } }];
      }
      return tr;
    });

    return [colorTheme, plugin, plainTheme, plainPlugin, atomicPlugin, snapFilter];
  }

  function wrapSelectionOrWord(v: EditorView, style: number = 0) {
    const state = v.state;
    const range = state.selection.main;
    const makeInsert = (text: string): string => {
      if (style === 0) return `\`${text}\``;
      const now = new Date();
      const ts = now.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).replace(/,/g, "");
      return `\`${text}\`<!-- ${highlightStyles[style - 1].name}, ${ts}: "" -->`;
    };
    if (!range.empty) {
      const insert = makeInsert(state.doc.sliceString(range.from, range.to));
      v.dispatch({ changes: { from: range.from, to: range.to, insert }, selection: { anchor: Math.min(range.from + insert.length + (style > 0 ? 1 : 0), v.state.doc.length) } });
      return true;
    }
    const pos = range.from;
    const lineInfo = state.doc.lineAt(pos);
    const lineText = lineInfo.text;
    const offset = pos - lineInfo.from;
    const isWordChar = (ch: string) => /[A-Za-z0-9_-]/.test(ch);
    let start = offset, end = offset;
    while (start > 0 && isWordChar(lineText[start - 1])) start--;
    while (end < lineText.length && isWordChar(lineText[end])) end++;
    if (start === end) return true;
    const from = lineInfo.from + start, to = lineInfo.from + end;
    const insert = makeInsert(state.doc.sliceString(from, to));
    v.dispatch({ changes: { from, to, insert }, selection: { anchor: Math.min(from + insert.length + (style > 0 ? 1 : 0), v.state.doc.length) } });
    return true;
  }

  function cycleAnnotationColor(v: EditorView, delta: number) {
    const cursor = v.state.selection.main.head;
    const docText = v.state.doc.toString();
    annotationPattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = annotationPattern.exec(docText)) !== null) {
      const spanStart = m.index, spanEnd = spanStart + m[0].length;
      if (cursor >= spanStart && cursor <= spanEnd) {
        const currentIdx = highlightStyles.findIndex(s => s.name === m![2]);
        const newIdx = ((currentIdx + delta) + highlightStyles.length) % highlightStyles.length;
        const updated = m[0].replace(/^`([^`]+)`<!--\s*\w+,/, `\`$1\`<!-- ${highlightStyles[newIdx].name},`);
        v.dispatch({ changes: { from: spanStart, to: spanEnd, insert: updated } });
        return true;
      }
    }
    return false;
  }

  function removeAnnotation(v: EditorView) {
    const cursor = v.state.selection.main.head;
    const docText = v.state.doc.toString();
    annotationPattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = annotationPattern.exec(docText)) !== null) {
      const spanStart = m.index, spanEnd = spanStart + m[0].length;
      if (cursor >= spanStart && cursor <= spanEnd) {
        v.dispatch({ changes: { from: spanStart, to: spanEnd, insert: m[1] }, selection: { anchor: spanStart } });
        return true;
      }
    }
    const plainPattern = /`([^`\n]+)`/g;
    let pm: RegExpExecArray | null;
    while ((pm = plainPattern.exec(docText)) !== null) {
      const spanStart = pm.index, spanEnd = spanStart + pm[0].length;
      if (cursor >= spanStart && cursor <= spanEnd) {
        v.dispatch({ changes: { from: spanStart, to: spanEnd, insert: pm[1] }, selection: { anchor: spanStart } });
        return true;
      }
    }
    return false;
  }

  function toggleAnnotationEdit(v: EditorView) {
    const cursor = v.state.selection.main.head;
    const docText = v.state.doc.toString();
    annotationPattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = annotationPattern.exec(docText)) !== null) {
      const spanStart = m.index, spanEnd = spanStart + m[0].length;
      if (cursor >= spanStart && cursor <= spanEnd) {
        editingSpan = editingSpan === spanStart ? null : spanStart;
        v.dispatch({});
        return true;
      }
    }
    return false;
  }

  // Status bar reactive values
  $: styleLabel = currentStyle === 0
    ? "Style: plain"
    : `Style: ${currentStyle}/6 (${highlightStyles[currentStyle - 1].name})`;
  $: styleColor = currentStyle === 0 ? gruvbox.fg : highlightStyles[currentStyle - 1].color;

  const statusPlugin = ViewPlugin.fromClass(class {
    constructor(v: EditorView) { updateStatusFromView(v); }
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet || u.focusChanged || u.viewportChanged)
        updateStatusFromView(u.view);
    }
  });

  const dblClickBehavior = EditorView.domEventHandlers({
    dblclick(event, v) {
      if (annotationMode !== "clean") return false;
      const pos = v.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos === null) return false;
      const docText = v.state.doc.toString();
      annotationPattern.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = annotationPattern.exec(docText)) !== null) {
        const spanStart = m.index;
        const wordStart = spanStart + 1;
        const wordEnd   = wordStart + m[1].length;
        if (pos >= wordStart && pos <= wordEnd) {
          editingSpan = editingSpan === spanStart ? null : spanStart;
          v.dispatch({});
          return true;
        }
      }
      return false;
    }
  });

  // Custom keymap — all app-specific bindings
  function buildKeymap() {
    return keymap.of([
      // Navigation
      { key: "ArrowLeft",  run: v => { cursorCharLeft(v);      return true; } },
      { key: "ArrowRight", run: v => { cursorCharRight(v);     return true; } },
      { key: "ArrowUp",    run: v => { cursorLineUp(v);        return true; } },
      { key: "ArrowDown",  run: v => { cursorLineDown(v);      return true; } },
      { key: "h", run: v => { cursorCharLeft(v);               return true; } },
      { key: "l", run: v => { cursorCharRight(v);              return true; } },
      { key: "j", run: v => { const r = v.state.selection.main; const n = v.moveByGroup(r, true);  v.dispatch({ selection: { anchor: n.head } }); return true; } },
      { key: "k", run: v => { const r = v.state.selection.main; const n = v.moveByGroup(r, false); v.dispatch({ selection: { anchor: n.head } }); return true; } },
      { key: "w", run: v => { cursorLineUp(v);                 return true; } },
      { key: "s", run: v => { cursorLineDown(v);               return true; } },
      { key: "a", run: v => { cursorLineStart(v);              return true; } },
      { key: "d", run: v => { cursorLineEnd(v);                return true; } },
      // Annotation actions
      { key: "Space",  run: v => wrapSelectionOrWord(v, currentStyle) },
      { key: "Enter",  run: v => toggleAnnotationEdit(v) },
      { key: "x",      run: v => removeAnnotation(v) },
      // Style cycling — on annotation changes its color, otherwise changes currentStyle
      { key: "q", run: v => { if (!cycleAnnotationColor(v, -1)) cycleStyle(-1); return true; } },
      { key: "e", run: v => { if (!cycleAnnotationColor(v, +1)) cycleStyle(+1); return true; } },
      { key: "n", run: v => { if (!cycleAnnotationColor(v, +1)) cycleStyle(+1); return true; } },
      { key: "N", run: v => { if (!cycleAnnotationColor(v, -1)) cycleStyle(-1); return true; } },
      // Undo/redo
      { key: "u",      run: v => undo(v) },
      { key: "U",      run: v => redo(v) },
      { key: "Ctrl-z", run: v => undo(v) },
      { key: "Ctrl-y", run: v => redo(v) },
      { key: "Ctrl-Z", run: v => redo(v) },
    ]);
  }

  function baseExtensions(): Extension[] {
    return [
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
      buildKeymap(),
      keymap.of([...historyKeymap, ...searchKeymap]),
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

  onMount(() => {
    view = new EditorView({
      state: EditorState.create({
        doc: starterDoc(),
        extensions: [...baseExtensions()]
      }),
      parent: editorEl
    });

    view.focus();
    updateStatusFromView(view);

    return () => { view?.destroy(); };
  });
</script>

<div
  class="app"
  style={`
    --bg: ${gruvbox.bg}; --bg-soft: ${gruvbox.bgSoft}; --bg-hard: ${gruvbox.bgHard};
    --bg-alt: ${gruvbox.bgAlt}; --border: ${gruvbox.border}; --fg: ${gruvbox.fg};
    --fg-muted: ${gruvbox.fgMuted}; --yellow: ${gruvbox.yellow}; --green: ${gruvbox.green};
    --blue: ${gruvbox.blue}; --orange: ${gruvbox.orange}; --selection: ${gruvbox.selection};
  `}
>
  <div class="toolbar">
    <div class="title">Markdown Annotation Tool</div>
  </div>

  <div class="main">
    <div class="sidebar">
      <div class="sidebar-section">
        <div class="sidebar-label">Padding</div>
        <div class="slider-row"><span class="slider-lbl">L</span><input type="range" min="0" max="400" step="4" bind:value={padLeft}   class="slider" /><span class="slider-val">{padLeft}</span></div>
        <div class="slider-row"><span class="slider-lbl">R</span><input type="range" min="0" max="400" step="4" bind:value={padRight}  class="slider" /><span class="slider-val">{padRight}</span></div>
        <div class="slider-row"><span class="slider-lbl">T</span><input type="range" min="0" max="400" step="4" bind:value={padTop}    class="slider" /><span class="slider-val">{padTop}</span></div>
        <div class="slider-row"><span class="slider-lbl">B</span><input type="range" min="0" max="400" step="4" bind:value={padBottom} class="slider" /><span class="slider-val">{padBottom}</span></div>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-label">Display</div>
        <label class="sidebar-toggle">
          <input type="radio" name="annotationMode" value="clean"
            checked={annotationMode === "clean"}
            on:change={() => { annotationMode = "clean"; view?.dispatch({}); }} />
          Clean
        </label>
        <label class="sidebar-toggle">
          <input type="radio" name="annotationMode" value="raw"
            checked={annotationMode === "raw"}
            on:change={() => { annotationMode = "raw"; view?.dispatch({}); }} />
          Raw (current)
        </label>
        <label class="sidebar-toggle">
          <input type="radio" name="annotationMode" value="all"
            checked={annotationMode === "all"}
            on:change={() => { annotationMode = "all"; view?.dispatch({}); }} />
          Raw (all)
        </label>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-label">Keys</div>
        <div class="keybinds">
          <div class="kb-group">
            <span class="kb-key">h l</span><span class="kb-desc">char left / right</span>
            <span class="kb-key">j k</span><span class="kb-desc">word forward / back</span>
            <span class="kb-key">w s</span><span class="kb-desc">line up / down</span>
            <span class="kb-key">a d</span><span class="kb-desc">line start / end</span>
          </div>
          <div class="kb-group">
            <span class="kb-key">Space</span><span class="kb-desc">wrap word / selection</span>
            <span class="kb-key">q e</span><span class="kb-desc">style prev / next</span>
            <span class="kb-key">n N</span><span class="kb-desc">style next / prev</span>
            <span class="kb-key">Enter</span><span class="kb-desc">edit annotation note</span>
            <span class="kb-key">x</span><span class="kb-desc">remove annotation</span>
          </div>
          <div class="kb-group">
            <span class="kb-key">u U</span><span class="kb-desc">undo / redo</span>
            <span class="kb-key">Ctrl+Z/Y</span><span class="kb-desc">undo / redo</span>
          </div>
        </div>
      </div>
    </div>

    <div class="editor" bind:this={editorEl}></div>
  </div>

  <div class="statusbar">
    <div class="status-left">
      <span class="segment">{selectionInfo}</span>
      <span class="segment style" style="color: {styleColor}">{styleLabel}</span>
    </div>
    <div class="status-right">
      <span class="segment">Ln {line}</span>
      <span class="segment">Col {column}</span>
      <span class="segment syntax">Markdown</span>
    </div>
  </div>
</div>

<style>
  :global(html, body, #app) { margin: 0; height: 100%; }
  :global(body) { background: var(--bg); font-family: "JetBrains Mono", "Fira Code", monospace; }

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
    min-height: 36px;
    padding: 0 12px;
    background: var(--bg-hard);
    border-bottom: 1px solid var(--border);
  }

  .title {
    font-size: 14px;
    font-weight: 600;
    color: var(--fg);
  }

  .main {
    display: grid;
    grid-template-columns: 200px 1fr;
    min-height: 0;
  }

  .sidebar {
    background: var(--bg-hard);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    font-size: 12px;
  }

  .sidebar-section {
    padding: 12px;
    border-bottom: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .sidebar-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--fg-muted);
    font-weight: 600;
  }

  .sidebar-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    user-select: none;
    color: var(--fg);
  }

  .sidebar-toggle input[type="checkbox"],
  .sidebar-toggle input[type="radio"] {
    accent-color: var(--orange);
    cursor: pointer;
  }

  .keybinds { display: flex; flex-direction: column; gap: 10px; }

  .kb-group {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2px 8px;
    align-items: baseline;
  }

  .kb-key { color: var(--yellow); white-space: nowrap; font-size: 11px; }
  .kb-desc { color: var(--fg-muted); font-size: 11px; }

  .toolbar-btn {
    background: var(--bg-alt);
    border: 1px solid var(--border);
    color: var(--fg);
    font-family: inherit;
    font-size: 12px;
    padding: 3px 10px;
    border-radius: 3px;
    cursor: pointer;
  }
  .slider {
    flex: 1;
    accent-color: #7c6f64;
    cursor: pointer;
    min-width: 0;
    opacity: 0.4;
  }
  .slider:hover {
    opacity: 0.7;
  }

  .slider-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .slider-lbl {
    color: var(--fg-muted);
    font-size: 11px;
    width: 10px;
    flex-shrink: 0;
  }

  .slider-val {
    color: var(--fg-muted);
    font-size: 11px;
    width: 24px;
    text-align: right;
    flex-shrink: 0;
  }

  .editor { min-height: 0; height: 100%; overflow: hidden; }
  :global(.editor .cm-editor) { width: 100%; height: 100%; }
  :global(.cm-editor.cm-focused) { outline: none; }

  .statusbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    min-height: 24px;
    padding: 0 10px;
    background: var(--bg-hard);
    border-top: 1px solid var(--border);
    color: var(--fg-muted);
    font-size: 12px;
  }

  .status-left, .status-right { display: flex; align-items: center; }

  .segment {
    padding: 0 8px;
    border-right: 1px solid var(--border);
    white-space: nowrap;
  }
  .segment:last-child { border-right: none; }
  .status-right .segment:first-child { border-left: 1px solid var(--border); }
  .syntax { color: var(--yellow); }
</style>
