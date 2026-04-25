<script lang="ts">
  import { onMount } from "svelte";
  import { EditorState, type Extension } from "@codemirror/state";
  import {
    EditorView, keymap, lineNumbers, drawSelection,
    highlightActiveLineGutter, ViewPlugin, Decoration,
    WidgetType, showTooltip, type Tooltip,
    type DecorationSet, type ViewUpdate
  } from "@codemirror/view";
  import { EditorSelection, RangeSet, StateField, type Range, type SelectionRange } from "@codemirror/state";
  import {
    defaultKeymap, history, historyKeymap, undo, redo,
    cursorLineUp, cursorLineDown, cursorLineStart, cursorLineEnd,
    cursorCharLeft, cursorCharRight, cursorGroupForward, cursorGroupBackward,
    selectAll,
    selectCharLeft, selectCharRight,
    selectLineUp, selectLineDown,
    selectLineStart, selectLineEnd,
    selectGroupForward, selectGroupBackward
  } from "@codemirror/commands";
  import { searchKeymap } from "@codemirror/search";
  import { RangeSetBuilder } from "@codemirror/state";
  import {
    indentOnInput, bracketMatching, foldGutter,
    syntaxHighlighting, HighlightStyle
  } from "@codemirror/language";
  import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
  import { tags } from "@lezer/highlight";
  import * as pdfjsLib from "pdfjs-dist";
  import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

  let editorEl: HTMLDivElement;
  let view: EditorView;
  let fileInput: HTMLInputElement;
  let padLeft = 40;
  let padRight = 40;
  let padTop = 16;
  let padBottom = 64;
  let lineHeight = 1.6;
  let fontSize = 14;
  let showHelp = false;
  let pdfModalOpen = false;
  let pdfDraftText = "";
  let pdfPreviewUrl = "";
  let pdfFileName = "";
  let pdfIsParsing = false;
  let pdfParseError = "";
  $: pdfFrameSrc = pdfPreviewUrl ? `${pdfPreviewUrl}#zoom=75` : "";

  let currentStyle = 0;
  let annotationMode: "clean" | "raw" | "all" = "clean";
  let blockquoteAlign: "left" | "center" | "right" = "left";
  let blockquoteBgWidth = 100;
  let editorMode: "normal" | "insert" = "normal";
  let line = 1;
  let column = 1;
  let selectionInfo = "0 selected";
  $: editorModeLabel = editorMode === "insert" ? "EDIT" : "ANNOTATE";

  function replaceDocument(text: string) {
    if (!view) return;
    const insert = sentenceLineBreaks(text);
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert },
      selection: { anchor: 0 }
    });
    view.focus();
  }

  function sentenceLineBreaks(text: string) {
    const shouldSkipBlock = (block: string) =>
      /^(#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s)/.test(block.trim());

    return text
      .replace(/\r\n?/g, "\n")
      .split(/\n{2,}/)
      .map(block => {
        if (shouldSkipBlock(block)) return block.trim();
        return block
          .replace(/\s*\n\s*/g, " ")
          .replace(/([.!?]["'”’)]?)(\s+)(?=[A-ZÆØÅ0-9"“‘])/g, "$1\n")
          .trim();
      })
      .join("\n\n");
  }

  async function loadFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      await openPdfModal(file);
      return;
    }

    if (file.name.toLowerCase().endsWith(".docx")) {
      const buffer = await file.arrayBuffer();
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ arrayBuffer: buffer });
      replaceDocument(result.value);
      return;
    }

    replaceDocument(await file.text());
  }

  async function openPdfModal(file: File) {
    if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
    pdfPreviewUrl = URL.createObjectURL(file);
    pdfFileName = file.name;
    pdfDraftText = "";
    pdfParseError = "";
    pdfIsParsing = true;
    pdfModalOpen = true;

    try {
      pdfDraftText = await extractPdfText(file);
      if (!pdfDraftText.trim()) {
        pdfParseError = "No selectable text was found. This PDF may be scanned, so paste or type corrected text here before loading.";
      }
    } catch (error) {
      pdfParseError = error instanceof Error ? error.message : "Could not parse this PDF.";
      pdfDraftText = "";
    } finally {
      pdfIsParsing = false;
    }
  }

  async function extractPdfText(file: File) {
    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    const pages: string[] = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const lines: string[] = [];
      let currentLine = "";
      let lastY: number | null = null;

      for (const item of content.items) {
        if (!("str" in item)) continue;
        const text = item.str.trim();
        if (!text) continue;
        const y = Array.isArray(item.transform) ? item.transform[5] : null;
        if (lastY !== null && y !== null && Math.abs(y - lastY) > 5) {
          if (currentLine.trim()) lines.push(currentLine.trim());
          currentLine = text;
        } else {
          currentLine += currentLine ? ` ${text}` : text;
        }
        lastY = y;
      }

      if (currentLine.trim()) lines.push(currentLine.trim());
      pages.push(fixParagraphs(lines.join("\n")));
    }

    return pages.join("\n\n").replace(/[ \t]+\n/g, "\n").trim();
  }

  function fixParagraphs(text: string) {
    const lines = text
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map(line => line.replace(/[ \t]+/g, " ").trim());

    const blocks: string[] = [];
    let paragraph = "";

    const flush = () => {
      if (paragraph.trim()) blocks.push(paragraph.trim());
      paragraph = "";
    };

    const isListItem = (line: string) => /^(\d+[.)]|[-*•])\s+/.test(line);
    const isSectionHeadingStart = (line: string) =>
      /^(summary on text|analytical essay|taking your starting point)/i.test(line);
    const isHeading = (line: string) =>
      line.length <= 90 &&
      !/[.!?:;]["'”’)]?$/.test(line) &&
      (
        /^assignment\s+\d+/i.test(line) ||
        /^#+\s+/.test(line) ||
        /^[A-Z0-9ÆØÅ][A-Za-z0-9ÆØÅæøå ,'"“”‘’()/-]+$/.test(line)
      );
    const isHyphenated = (line: string) => /[A-Za-z]-$/.test(line);
    const endsSentence = (line: string) => /[.!?]["'”’)]?$/.test(line);
    const startsLowercase = (line: string) => /^[a-zæøå]/.test(line);
    const startsParagraph = (line: string) =>
      /^(the writer|later\b|in the text\b|the primary receivers\b|taking my\b|to begin with\b|however\b|above all\b|in conclusion\b)/i.test(line);
    const nextNonEmpty = (from: number) => {
      for (let i = from; i < lines.length; i += 1) {
        if (lines[i]) return lines[i];
      }
      return "";
    };

    for (let index = 0; index < lines.length; index += 1) {
      let line = lines[index];
      if (!line) {
        const next = nextNonEmpty(index + 1);
        if (paragraph && next && !startsLowercase(next) && endsSentence(paragraph) && startsParagraph(next)) flush();
        continue;
      }

      if (isSectionHeadingStart(line)) {
        flush();
        const headingParts = [line];
        while (index + 1 < lines.length) {
          const next = lines[index + 1];
          if (!next) break;
          if (isSectionHeadingStart(next) || isListItem(next)) break;
          if (headingParts.join(" ").length > 90 && /[.!?]["'”’)]?$/.test(next)) break;
          if (/^(the|in|to begin|however|above all|in conclusion|later|overall)\b/i.test(next)) break;
          headingParts.push(next);
          index += 1;
          if (/[.!?]["'”’)]?$/.test(next)) break;
        }
        blocks.push(headingParts.join(" "));
        continue;
      }

      if (isListItem(line) || isHeading(line)) {
        flush();
        blocks.push(line);
        continue;
      }

      if (!paragraph) {
        if (startsLowercase(line) && blocks.length) {
          blocks[blocks.length - 1] += ` ${line}`;
          continue;
        }
        paragraph = line;
        continue;
      }

      if (isHyphenated(paragraph)) {
        paragraph = paragraph.slice(0, -1) + line;
      } else {
        paragraph += ` ${line}`;
      }
    }

    flush();
    return blocks.join("\n\n");
  }

  function loadPdfDraft() {
    replaceDocument(pdfDraftText);
    closePdfModal();
  }

  function closePdfModal() {
    pdfModalOpen = false;
    pdfDraftText = "";
    pdfFileName = "";
    pdfParseError = "";
    pdfIsParsing = false;
    if (pdfPreviewUrl) {
      URL.revokeObjectURL(pdfPreviewUrl);
      pdfPreviewUrl = "";
    }
  }

  function setMode(mode: "normal" | "insert") {
    editorMode = mode;
    if (view) {
      view.dispatch({});  // trigger keymap/decoration rebuild
      // In normal mode, show a block cursor via a theme class on the editor dom
      view.dom.classList.toggle("mode-insert", mode === "insert");
      view.dom.classList.toggle("mode-normal", mode === "normal");
    }
  }

  $: if (view) {
    view.dom.classList.toggle("mode-insert", editorMode === "insert");
    view.dom.classList.toggle("mode-normal", editorMode === "normal");
    const content = view.dom.querySelector<HTMLElement>(".cm-content");
    if (content) {
      content.style.paddingLeft   = `${padLeft}px`;
      content.style.paddingRight  = `${padRight}px`;
      content.style.paddingTop    = `${padTop}px`;
      content.style.paddingBottom = `${padBottom}px`;
    }
    const scroller = view.dom.querySelector<HTMLElement>(".cm-scroller");
    if (scroller) {
      scroller.style.lineHeight = `${lineHeight}`;
      scroller.style.fontSize   = `${fontSize}px`;
    }
    requestAnimationFrame(() => {
      view?.scrollDOM.dispatchEvent(new Event("scroll"));
    });
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
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: `${gruvbox.orange} !important`, color: gruvbox.bg, opacity: '50%' },
      ".cm-gutters": { backgroundColor: gruvbox.bgHard, color: gruvbox.gutterText, borderRight: `1px solid ${gruvbox.border}` },
      ".cm-activeLine": { backgroundColor: "transparent" },
      ".cm-activeLineGutter": { color: gruvbox.yellow },
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
      ".cm-formatting": { color: gruvbox.fgMuted },
      ".cm-blockquote-line": {
        borderLeft: `3px solid ${gruvbox.orange}`,
        paddingLeft: "0.75em",
        backgroundColor: "#4a3520",
        marginBottom: "2px",
        fontStyle: "italic",
        color: gruvbox.yellow
      }
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
      if (u.docChanged)
        localStorage.setItem("cm6-buffer", u.state.doc.toString());
    }
  });

  const blockquoteLinePlugin = ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    constructor(v: EditorView) { this.decorations = this.build(v); }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) this.decorations = this.build(u.view);
    }
    build(v: EditorView): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>();
      for (const { from, to } of v.visibleRanges) {
        let pos = from;
        while (pos <= to) {
          const line = v.state.doc.lineAt(pos);
          if (line.text.startsWith(">")) {
            builder.add(line.from, line.from, Decoration.line({ class: "cm-blockquote-line" }));
          }
          pos = line.to + 1;
        }
      }
      return builder.finish();
    }
  }, { decorations: v => v.decorations });

  const columnGuidePlugin = ViewPlugin.fromClass(class {
    marker: HTMLDivElement;
    view: EditorView;
    scheduled = false;

    constructor(view: EditorView) {
      this.view = view;
      this.marker = document.createElement("div");
      this.marker.className = "cm-column-guide";
      view.scrollDOM.appendChild(this.marker);
      this.updateMarker();
      view.scrollDOM.addEventListener("scroll", this.updateMarker);
    }

    update(u: ViewUpdate) {
      if (u.selectionSet || u.geometryChanged || u.viewportChanged || u.docChanged || u.transactions.length) {
        this.updateMarker();
      }
    }

    updateMarker = () => {
      if (this.scheduled) return;
      this.scheduled = true;
      this.view.requestMeasure({
        read: view => {
          if (!view.hasFocus || !view.state.selection.main.empty) return null;
          const coords = view.coordsAtPos(view.state.selection.main.head);
          if (!coords) return null;
          const scroller = view.scrollDOM;
          const scrollerRect = scroller.getBoundingClientRect();
          return {
            left: coords.left - scrollerRect.left + scroller.scrollLeft,
            top: scroller.scrollTop,
            height: scroller.clientHeight
          };
        },
        write: data => {
          this.scheduled = false;
          if (!data) {
            this.marker.style.display = "none";
            return;
          }
          this.marker.style.display = "block";
          this.marker.style.left = `${data.left}px`;
          this.marker.style.top = `${data.top}px`;
          this.marker.style.height = `${data.height}px`;
        }
      });
    }

    destroy() {
      this.view.scrollDOM.removeEventListener("scroll", this.updateMarker);
      this.marker.remove();
    }
  });

  const visualLinePlugin = ViewPlugin.fromClass(class {
    marker: HTMLDivElement;
    view: EditorView;
    scheduled = false;

    constructor(view: EditorView) {
      this.view = view;
      this.marker = document.createElement("div");
      this.marker.className = "cm-visual-line-marker";
      view.scrollDOM.appendChild(this.marker);
      this.updateMarker();
      view.scrollDOM.addEventListener("scroll", this.updateMarker);
    }

    update(update: ViewUpdate) {
      if (update.selectionSet || update.geometryChanged || update.viewportChanged || update.docChanged) {
        this.updateMarker();
      }
    }

    updateMarker = () => {
      if (this.scheduled) return;
      this.scheduled = true;
      this.view.requestMeasure({
        read: view => {
          if (!view.hasFocus) return null;
          const coords = view.coordsAtPos(view.state.selection.main.head);
          if (!coords) return null;
          const scroller = view.scrollDOM;
          const scrollerRect = scroller.getBoundingClientRect();
          const lineHeight = parseFloat(getComputedStyle(view.contentDOM).lineHeight) || 18;
          return {
            top: coords.top - scrollerRect.top + scroller.scrollTop,
            left: scroller.scrollLeft,
            width: scroller.clientWidth,
            height: lineHeight,
            isEdit: editorMode === "insert"
          };
        },
        write: data => {
          this.scheduled = false;
          if (!data) {
            this.marker.style.display = "none";
            return;
          }
          this.marker.classList.toggle("is-edit", data.isEdit);
          this.marker.style.display = "block";
          this.marker.style.top = `${data.top}px`;
          this.marker.style.left = `${data.left}px`;
          this.marker.style.width = `${data.width}px`;
          this.marker.style.height = `${data.height}px`;
        }
      });
    };

    destroy() {
      this.view.scrollDOM.removeEventListener("scroll", this.updateMarker);
      this.marker.remove();
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

  function moveByWordCount(v: EditorView, forward: boolean, count: number, extend = false) {
    const selection = v.state.selection.main;
    let range: SelectionRange = EditorSelection.cursor(selection.head);

    for (let i = 0; i < count; i += 1) {
      range = v.moveByGroup(range, forward);
    }

    v.dispatch({
      selection: { anchor: extend ? selection.anchor : range.head, head: range.head }
    });
    return true;
  }

  function paragraphBoundary(v: EditorView, direction: "start" | "end", extend = false) {
    const { doc, selection } = v.state;
    const current = selection.main;
    let line = doc.lineAt(current.head);

    if (direction === "start") {
      while (line.number > 1 && !line.text.trim()) line = doc.line(line.number - 1);
      while (line.number > 1 && doc.line(line.number - 1).text.trim()) line = doc.line(line.number - 1);
      if (current.head === line.from && line.number > 1) {
        line = doc.line(line.number - 1);
        while (line.number > 1 && !line.text.trim()) line = doc.line(line.number - 1);
        while (line.number > 1 && doc.line(line.number - 1).text.trim()) line = doc.line(line.number - 1);
      }
      v.dispatch({ selection: { anchor: extend ? current.anchor : line.from, head: line.from } });
      return true;
    }

    while (line.number < doc.lines && !line.text.trim()) line = doc.line(line.number + 1);
    while (line.number < doc.lines && doc.line(line.number + 1).text.trim()) line = doc.line(line.number + 1);
    if (current.head === line.to && line.number < doc.lines) {
      line = doc.line(line.number + 1);
      while (line.number < doc.lines && !line.text.trim()) line = doc.line(line.number + 1);
      while (line.number < doc.lines && doc.line(line.number + 1).text.trim()) line = doc.line(line.number + 1);
    }
    v.dispatch({ selection: { anchor: extend ? current.anchor : line.to, head: line.to } });
    return true;
  }

  // Custom keymap — all app-specific bindings
  function buildKeymap() {
    const normal = (fn: (v: EditorView) => boolean) =>
      (v: EditorView) => editorMode === "normal" ? fn(v) : false;

    return keymap.of([
      // Always: Escape returns to normal
      { key: "Escape", run: v => { setMode("normal"); return true; } },
      // Always: F2 enters edit
      { key: "F2", run: v => { setMode("insert"); return true; } },
      { key: "F1", run: () => { showHelp = !showHelp; return true; } },

      // Normal-mode only: Navigation
      { key: "ArrowLeft",        run: normal(v => { cursorCharLeft(v);  return true; }) },
      { key: "ArrowRight",       run: normal(v => { cursorCharRight(v); return true; }) },
      { key: "ArrowUp",          run: normal(v => { cursorLineUp(v);    return true; }) },
      { key: "ArrowDown",        run: normal(v => { cursorLineDown(v);  return true; }) },
      { key: "Shift-ArrowLeft",  run: normal(v => { selectCharLeft(v);  return true; }) },
      { key: "Shift-ArrowRight", run: normal(v => { selectCharRight(v); return true; }) },
      { key: "Shift-ArrowUp",    run: normal(v => { selectLineUp(v);    return true; }) },
      { key: "Shift-ArrowDown",  run: normal(v => { selectLineDown(v);  return true; }) },
      { key: "Ctrl-ArrowLeft",        run: normal(v => { cursorGroupBackward(v); return true; }) },
      { key: "Ctrl-ArrowRight",       run: normal(v => { cursorGroupForward(v);  return true; }) },
      { key: "Ctrl-ArrowUp",          run: normal(v => paragraphBoundary(v, "start")) },
      { key: "Ctrl-ArrowDown",        run: normal(v => paragraphBoundary(v, "end")) },
      { key: "Shift-Ctrl-ArrowLeft",  run: normal(v => { selectGroupBackward(v); return true; }) },
      { key: "Shift-Ctrl-ArrowRight", run: normal(v => { selectGroupForward(v);  return true; }) },
      { key: "Shift-Ctrl-ArrowUp",    run: normal(v => paragraphBoundary(v, "start", true)) },
      { key: "Shift-Ctrl-ArrowDown",  run: normal(v => paragraphBoundary(v, "end", true)) },
      { key: "h", run: normal(v => { cursorCharLeft(v);  return true; }) },
      { key: "j", run: normal(v => { cursorLineDown(v);  return true; }) },
      { key: "k", run: normal(v => { cursorLineUp(v);    return true; }) },
      { key: "l", run: normal(v => { cursorCharRight(v); return true; }) },
      { key: "Ctrl-h", run: normal(v => { cursorGroupBackward(v); return true; }) },
      { key: "Ctrl-j", run: normal(v => paragraphBoundary(v, "end")) },
      { key: "Ctrl-k", run: normal(v => paragraphBoundary(v, "start")) },
      { key: "Ctrl-l", run: normal(v => { cursorGroupForward(v);  return true; }) },
      { key: "w", run: normal(v => { cursorLineUp(v);        return true; }) },
      { key: "s", run: normal(v => { cursorLineDown(v);      return true; }) },
      { key: "a", run: normal(v => { cursorGroupBackward(v); return true; }) },
      { key: "d", run: normal(v => { cursorGroupForward(v);  return true; }) },
      { key: "Ctrl-w", run: normal(v => paragraphBoundary(v, "start")) },
      { key: "Ctrl-s", run: normal(v => paragraphBoundary(v, "end")) },
      { key: "Ctrl-a", run: normal(v => moveByWordCount(v, false, 5)) },
      { key: "Ctrl-d", run: normal(v => moveByWordCount(v, true, 5)) },
      // Shift variants extend selection
      { key: "H", run: normal(v => { selectCharLeft(v);  return true; }) },
      { key: "J", run: normal(v => { selectLineDown(v);  return true; }) },
      { key: "K", run: normal(v => { selectLineUp(v);    return true; }) },
      { key: "L", run: normal(v => { selectCharRight(v); return true; }) },
      { key: "Shift-Ctrl-h", run: normal(v => { selectGroupBackward(v); return true; }) },
      { key: "Shift-Ctrl-j", run: normal(v => paragraphBoundary(v, "end", true)) },
      { key: "Shift-Ctrl-k", run: normal(v => paragraphBoundary(v, "start", true)) },
      { key: "Shift-Ctrl-l", run: normal(v => { selectGroupForward(v); return true; }) },
      { key: "W", run: normal(v => { selectLineUp(v);        return true; }) },
      { key: "S", run: normal(v => { selectLineDown(v);      return true; }) },
      { key: "A", run: normal(v => { selectGroupBackward(v); return true; }) },
      { key: "D", run: normal(v => { selectGroupForward(v);  return true; }) },
      { key: "Shift-Ctrl-w", run: normal(v => paragraphBoundary(v, "start", true)) },
      { key: "Shift-Ctrl-s", run: normal(v => paragraphBoundary(v, "end", true)) },
      { key: "Shift-Ctrl-a", run: normal(v => moveByWordCount(v, false, 5, true)) },
      { key: "Shift-Ctrl-d", run: normal(v => moveByWordCount(v, true, 5, true)) },
      // Normal-mode only: Annotation actions
      { key: "Space",  run: normal(v => wrapSelectionOrWord(v, currentStyle)) },
      { key: "Enter",  run: normal(v => toggleAnnotationEdit(v)) },
      { key: "x",      run: normal(v => removeAnnotation(v)) },
      { key: "q",      run: normal(v => { if (!cycleAnnotationColor(v, -1)) cycleStyle(-1); return true; }) },
      { key: "e",      run: normal(v => { if (!cycleAnnotationColor(v, +1)) cycleStyle(+1); return true; }) },
      { key: "n",      run: normal(v => { if (!cycleAnnotationColor(v, +1)) cycleStyle(+1); return true; }) },
      { key: "N",      run: normal(v => { if (!cycleAnnotationColor(v, -1)) cycleStyle(-1); return true; }) },
      // Undo/redo (both modes)
      { key: "u",      run: normal(v => undo(v)) },
      { key: "U",      run: normal(v => redo(v)) },
      { key: "Ctrl-z", run: v => undo(v) },
      { key: "Ctrl-y", run: v => redo(v) },
      { key: "Ctrl-Z", run: v => redo(v) },
      { key: "?",      run: normal(() => { showHelp = !showHelp; return true; }) },
      {
        any: (_view, event) =>
          editorMode === "normal" &&
          event.key.length === 1 &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey
      },
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
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
      markdown({ base: markdownLanguage }),
      statusPlugin,
      blockquoteLinePlugin,
      columnGuidePlugin,
      visualLinePlugin,
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
        doc: localStorage.getItem("cm6-buffer") ?? starterDoc(),
        extensions: [...baseExtensions()]
      }),
      parent: editorEl
    });

    view.dom.classList.add("mode-normal");
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
    --active-line-annotate: #4a3520aa;
    --active-line-edit: #2f4a3aaa;
    --active-gutter-annotate: #4a3520;
    --active-gutter-edit: #2f4a3a;
  `}
>
  <div class="toolbar">
    <div class="title">Markdown Annotation Tool</div>
    <span class="subtitle">paste or load .txt, .md, .docx, .pdf</span>
    <button class="toolbar-btn help-btn" on:click={() => showHelp = !showHelp} title="Keyboard shortcuts (?)">?</button>
  </div>

  <div class="main">
    <div class="sidebar">
      <div class="sidebar-section">
        <input type="file" style="display:none" bind:this={fileInput} on:change={loadFile} />
        <button class="sidebar-label load-btn" on:click={() => fileInput.click()}>Load file...</button>
      </div>

      <div class="sidebar-section">
        <label class="mode-switch" aria-label="Switch between Annotate and Edit mode">
          <span class:active={editorMode === "normal"}>Annotate</span>
          <input
            type="checkbox"
            checked={editorMode === "insert"}
            on:change={e => setMode((e.target as HTMLInputElement).checked ? "insert" : "normal")}
          />
          <span class="mode-track" aria-hidden="true">
            <span class="mode-thumb"></span>
          </span>
          <span class:active={editorMode === "insert"}>Edit</span>
        </label>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-label">Layout</div>
        <div class="slider-row"><span class="slider-lbl">L</span><input type="range" min="0" max="400" step="4" bind:value={padLeft}   class="slider" /><span class="slider-val">{padLeft}</span></div>
        <div class="slider-row"><span class="slider-lbl">R</span><input type="range" min="0" max="400" step="4" bind:value={padRight}  class="slider" /><span class="slider-val">{padRight}</span></div>
        <div class="slider-row"><span class="slider-lbl">T</span><input type="range" min="0" max="400" step="4" bind:value={padTop}    class="slider" /><span class="slider-val">{padTop}</span></div>
        <div class="slider-row"><span class="slider-lbl">B</span><input type="range" min="0" max="400" step="4" bind:value={padBottom} class="slider" /><span class="slider-val">{padBottom}</span></div>
        <div class="slider-row"><span class="slider-lbl">LH</span><input type="range" min="1" max="3" step="0.05" bind:value={lineHeight} class="slider" /><span class="slider-val">{lineHeight.toFixed(2)}</span></div>
        <div class="slider-row"><span class="slider-lbl">FS</span><input type="range" min="10" max="28" step="1" bind:value={fontSize} class="slider" /><span class="slider-val">{fontSize}</span></div>
        <div class="slider-row">
          <span class="slider-lbl">A</span>
          <input type="range" min="0" max="2" step="1" class="slider"
            value={blockquoteAlign === "left" ? 0 : blockquoteAlign === "center" ? 1 : 2}
            on:input={e => { blockquoteAlign = ["left", "center", "right"][+(e.target as HTMLInputElement).value] as any; }} />
          <span class="slider-val">{blockquoteAlign[0].toUpperCase()}</span>
        </div>
        <div class="slider-row">
          <span class="slider-lbl">BG</span>
          <input type="range" min="10" max="100" step="5" class="slider" bind:value={blockquoteBgWidth} />
          <span class="slider-val">{blockquoteBgWidth}</span>
        </div>
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

    </div>

    <svelte:element this={"style"}>{`.cm-blockquote-line { width: ${blockquoteBgWidth}% !important; ${blockquoteAlign === "center" ? "margin-left: auto; margin-right: auto;" : blockquoteAlign === "right" ? "margin-left: auto; margin-right: 0;" : "margin-left: 0; margin-right: auto;"} }`}</svelte:element>
    <div class="editor" bind:this={editorEl}></div>
  </div>

  <div class="statusbar">
    <div class="status-left">
      <span class="segment mode" style="color: {editorMode === 'insert' ? gruvbox.green : gruvbox.orange}">{editorModeLabel}</span>
      <span class="segment">{selectionInfo}</span>
      <span class="segment style" style="color: {styleColor}">{styleLabel}</span>
    </div>
    <div class="status-right">
      <span class="segment">Ln {line}</span>
      <span class="segment">Col {column}</span>
      <span class="segment syntax">Markdown</span>
    </div>
  </div>

  {#if showHelp}
    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
    <div class="help-overlay" on:click|self={() => showHelp = false}>
      <div class="help-panel">
        <div class="help-header">
          <span class="help-title">Keyboard Shortcuts</span>
          <button class="help-close" on:click={() => showHelp = false}>✕</button>
        </div>
        <div class="keybinds">
          <div class="kb-section-label">Navigation</div>
          <div class="kb-group">
            <span class="kb-key">h j k l</span><span class="kb-desc">left / down / up / right</span>
            <span class="kb-key">← ↓ ↑ →</span><span class="kb-desc">left / down / up / right</span>
            <span class="kb-key">w s</span><span class="kb-desc">line up / down</span>
            <span class="kb-key">a d</span><span class="kb-desc">word left / right</span>
            <span class="kb-key">Ctrl+h/l</span><span class="kb-desc">word left / right</span>
            <span class="kb-key">Ctrl+k/j</span><span class="kb-desc">paragraph start / end</span>
            <span class="kb-key">Ctrl+w/s</span><span class="kb-desc">paragraph start / end</span>
            <span class="kb-key">Ctrl+↑/↓</span><span class="kb-desc">paragraph start / end</span>
            <span class="kb-key">Ctrl+a/d</span><span class="kb-desc">jump 5 words left / right</span>
          </div>
          <div class="kb-section-label">Selection</div>
          <div class="kb-group">
            <span class="kb-key">⇧hjkl</span><span class="kb-desc">select by char / line</span>
            <span class="kb-key">⇧Arrows</span><span class="kb-desc">select by char / line</span>
            <span class="kb-key">⇧w ⇧s</span><span class="kb-desc">select by line</span>
            <span class="kb-key">⇧a ⇧d</span><span class="kb-desc">select by word</span>
            <span class="kb-key">Ctrl+⇧h/l</span><span class="kb-desc">select by word</span>
            <span class="kb-key">Ctrl+⇧k/j</span><span class="kb-desc">select to paragraph start / end</span>
            <span class="kb-key">Ctrl+⇧w/s</span><span class="kb-desc">select to paragraph start / end</span>
            <span class="kb-key">Ctrl+⇧↑/↓</span><span class="kb-desc">select to paragraph start / end</span>
            <span class="kb-key">Ctrl+Shift+a/d</span><span class="kb-desc">select 5 words left / right</span>
          </div>
          <div class="kb-section-label">Annotations</div>
          <div class="kb-group">
            <span class="kb-key">Space</span><span class="kb-desc">wrap word / selection</span>
            <span class="kb-key">q e</span><span class="kb-desc">style prev / next</span>
            <span class="kb-key">n N</span><span class="kb-desc">style next / prev</span>
            <span class="kb-key">Enter</span><span class="kb-desc">edit annotation note</span>
            <span class="kb-key">x</span><span class="kb-desc">remove annotation</span>
          </div>
          <div class="kb-section-label">History</div>
          <div class="kb-group">
            <span class="kb-key">u U</span><span class="kb-desc">undo / redo</span>
            <span class="kb-key">Ctrl+Z/Y</span><span class="kb-desc">undo / redo</span>
          </div>
          <div class="kb-section-label">Other</div>
          <div class="kb-group">
            <span class="kb-key">F2</span><span class="kb-desc">enter Edit mode</span>
            <span class="kb-key">Esc</span><span class="kb-desc">return to Annotate mode</span>
            <span class="kb-key">F1 / ?</span><span class="kb-desc">toggle this help</span>
          </div>
        </div>
      </div>
    </div>
  {/if}

  {#if pdfModalOpen}
    <div class="pdf-modal-overlay">
      <div class="pdf-modal" role="dialog" aria-modal="true" aria-label="Review PDF text">
        <div class="pdf-modal-header">
          <div>
            <div class="pdf-modal-title">Review PDF text</div>
            <div class="pdf-modal-file">{pdfFileName}</div>
            <div class="pdf-modal-help">Correct the extracted text on the right, then load it into the editor.</div>
          </div>
          <button class="toolbar-btn" on:click={closePdfModal}>Close</button>
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
              bind:value={pdfDraftText}
              disabled={pdfIsParsing}
              aria-label="Extracted PDF text"
            ></textarea>
          </div>
        </div>

        <div class="pdf-modal-footer">
          <span>{pdfIsParsing ? "Extracting text..." : `${pdfDraftText.length} characters`}</span>
          <button class="toolbar-btn load-confirm-btn" on:click={loadPdfDraft} disabled={pdfIsParsing}>Load text</button>
        </div>
      </div>
    </div>
  {/if}
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
    justify-content: space-between;
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

  .subtitle {
    font-size: 11px;
    font-weight: 400;
    color: var(--fg-muted);
    margin-left: auto;
    margin-right: 10px;
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

  .sidebar-toggle input[type="radio"] {
    accent-color: var(--orange);
    cursor: pointer;
  }

  .mode-switch {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    cursor: pointer;
    user-select: none;
    color: var(--fg-muted);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .mode-switch input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .mode-switch span.active {
    color: var(--fg);
  }

  .mode-track {
    position: relative;
    width: 42px;
    height: 22px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--bg-alt);
    flex: 0 0 auto;
  }

  .mode-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--orange);
    transition: transform 120ms ease;
  }

  .mode-switch input:checked + .mode-track .mode-thumb {
    transform: translateX(20px);
  }

  .load-btn {
    background: none;
    border: none;
    padding: 0;
    font-family: inherit;
    cursor: pointer;
    text-align: left;
  }

  .load-btn:hover {
    color: var(--yellow);
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

  .help-btn {
    font-size: 14px;
    font-weight: 700;
    width: 26px;
    height: 26px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    color: var(--fg-muted);
    border-color: var(--border);
  }
  .help-btn:hover { color: var(--yellow); border-color: var(--yellow); }

  .help-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .help-panel {
    background: var(--bg-hard);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 20px 24px;
    min-width: 340px;
    max-width: 480px;
    width: 100%;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  }

  .help-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }

  .help-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--fg);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .help-close {
    background: none;
    border: none;
    color: var(--fg-muted);
    font-size: 14px;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 3px;
    font-family: inherit;
  }
  .help-close:hover { color: var(--fg); background: var(--bg-alt); }

  .pdf-modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 120;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    box-sizing: border-box;
    background: rgba(0, 0, 0, 0.65);
  }

  .pdf-modal {
    width: min(1180px, 100%);
    height: min(820px, 94vh);
    min-height: 420px;
    display: flex;
    flex-direction: column;
    background: var(--bg-hard);
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
    box-shadow: 0 14px 48px rgba(0, 0, 0, 0.55);
  }

  .pdf-modal-header,
  .pdf-modal-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
  }

  .pdf-modal-footer {
    border-top: 1px solid var(--border);
    border-bottom: none;
    color: var(--fg-muted);
    font-size: 11px;
  }

  .pdf-modal-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--fg);
  }

  .pdf-modal-file {
    margin-top: 2px;
    color: var(--fg-muted);
    font-size: 11px;
  }

  .pdf-modal-help {
    margin-top: 4px;
    color: var(--fg-muted);
    font-size: 11px;
  }

  .pdf-error {
    padding: 8px 12px;
    color: var(--yellow);
    background: #4a3520;
    border-bottom: 1px solid var(--border);
    font-size: 11px;
  }

  .pdf-modal-body {
    min-height: 0;
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0;
  }

  .pdf-pane {
    min-width: 0;
    min-height: 0;
    border-right: 1px solid var(--border);
    background: var(--bg);
  }

  .pdf-pane:last-child {
    border-right: none;
  }

  .pdf-frame,
  .pdf-textarea {
    width: 100%;
    height: 100%;
    border: none;
    display: block;
    box-sizing: border-box;
  }

  .pdf-frame {
    background: #ffffff;
  }

  .pdf-textarea {
    resize: none;
    padding: 12px;
    background: var(--bg);
    color: var(--fg);
    font-family: inherit;
    font-size: 11px;
    line-height: 1.45;
    outline: none;
  }

  .pdf-textarea:disabled {
    color: var(--fg-muted);
  }

  .load-confirm-btn:disabled {
    opacity: 0.5;
    cursor: wait;
  }

  .kb-section-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--fg-muted);
    font-weight: 600;
    margin-top: 12px;
    margin-bottom: 4px;
  }
  .kb-section-label:first-child { margin-top: 0; }
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
    width: 14px;
    flex-shrink: 0;
  }

  .slider-val {
    color: var(--fg-muted);
    font-size: 11px;
    width: 30px;
    text-align: right;
    flex-shrink: 0;
  }

  .editor { min-height: 0; height: 100%; overflow: hidden; }
  :global(.editor .cm-editor) { width: 100%; height: 100%; }
  :global(.cm-editor.cm-focused) { outline: none; }
  :global(.cm-scroller) { position: relative; }
  :global(.cm-visual-line-marker) {
    position: absolute;
    z-index: 0;
    pointer-events: none;
    background: var(--active-line-annotate);
  }
  :global(.cm-visual-line-marker.is-edit) {
    background: var(--active-line-edit);
  }
  :global(.cm-column-guide) {
    position: absolute;
    z-index: 2;
    width: 0;
    border-left: 1px solid var(--border);
    opacity: 0.8;
    pointer-events: none;
  }
  :global(.mode-normal .cm-activeLineGutter) {
    background: var(--active-gutter-annotate) !important;
  }
  :global(.mode-insert .cm-activeLineGutter) {
    background: var(--active-gutter-edit) !important;
  }
  :global(.cm-content),
  :global(.cm-gutters) {
    position: relative;
    z-index: 1;
  }
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
  .mode { color: var(--orange); font-weight: 600; }

  @media (max-width: 760px) {
    .pdf-modal-overlay {
      padding: 8px;
    }

    .pdf-modal {
      height: 96vh;
      min-height: 0;
    }

    .pdf-modal-body {
      grid-template-columns: 1fr;
      grid-template-rows: minmax(180px, 42%) 1fr;
    }

    .pdf-pane {
      border-right: none;
      border-bottom: 1px solid var(--border);
    }

    .pdf-pane:last-child {
      border-bottom: none;
    }
  }
</style>
