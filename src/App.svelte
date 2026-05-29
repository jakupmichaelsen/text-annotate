<script lang="ts">
  import { onMount } from "svelte";
  import { EditorState, Prec, type Extension } from "@codemirror/state";
  import {
    EditorView, keymap, lineNumbers, drawSelection, runScopeHandlers,
    highlightActiveLineGutter, ViewPlugin, Decoration,
    GutterMarker, lineNumberMarkers,
    WidgetType, showTooltip, type Tooltip,
    type DecorationSet, type ViewUpdate
  } from "@codemirror/view";
  import { EditorSelection, RangeSet, StateEffect, StateField, type Range, type Text, type Transaction, type TransactionSpec } from "@codemirror/state";
  import {
    defaultKeymap, history, historyKeymap, undo, redo,
    cursorLineStart, cursorLineEnd,
    cursorCharLeft, cursorCharRight,
    selectAll,
    selectCharLeft, selectCharRight,
    selectLineStart, selectLineEnd
  } from "@codemirror/commands";
  import { searchKeymap } from "@codemirror/search";
  import { RangeSetBuilder } from "@codemirror/state";
  import {
    indentOnInput, bracketMatching,
    syntaxHighlighting, HighlightStyle
  } from "@codemirror/language";
  import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
  import { tags } from "@lezer/highlight";
  import * as pdfjsLib from "pdfjs-dist";
  import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
  import {
    annotationPattern,
    annotationWithTitle,
    blockquoteMetaPattern,
    summaryVisibleText
  } from "./lib/annotations";
  import { createNavigationCommands } from "./lib/navigation";
  import { helpSections } from "./lib/shortcuts";

  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

  let editorEl: HTMLDivElement;
  let view: EditorView;
  let fileInput: HTMLInputElement;
  let padLeft = 40;
  let padRight = 40;
  let padTop = 16;
  let padBottom = 64;
  let editorViewportHeight = 0;
  let lineHeight = 1.6;
  let fontSize = 14;
  let paragraphSpacing = 0;
  let showHelp = false;
  let pdfModalOpen = false;
  let pdfDraftText = "";
  let pdfPreviewUrl = "";
  let pdfFileName = "";
  let pdfIsParsing = false;
  let pdfParseError = "";
  let activeSaveHandle: any = null;
  let activeSaveName = "";
  let pendingAutosaveText: string | null = null;
  let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  let autosaveWriting = false;
  let audioUrl = "";
  let audioFileName = "";
  let audioElement: HTMLAudioElement | null = null;
  let audioCurrentTime = 0;
  let audioDuration = 0;
  let audioPlaying = false;
  let audioLoaded = false;
  let audioRateIndex = 0;
  const audioRates = [1, 1.5, 2];
  const audioDbName = "textAnnotate-state";
  const audioStoreName = "audio";
  const mediaExtensions = [".mp3", ".wav", ".m4a", ".ogg", ".oga", ".webm", ".aac", ".flac", ".mp4", ".mov", ".mkv"];
  let loadedFileType = "Markdown";
  $: pdfFrameSrc = pdfPreviewUrl ? `${pdfPreviewUrl}#zoom=75` : "";
  $: if (audioElement) audioElement.playbackRate = audioRates[audioRateIndex];
  $: audioRateText = audioRateIndex === 0 ? "x1" : audioRateIndex === 1 ? "x1½" : "x2";

  let currentStyle = 0;
  let annotationMode: "clean" | "raw" | "all" = "clean";
  let blockquoteAlign: "left" | "center" | "right" = "left";
  let blockquoteBgWidth = 100;
  let blockquoteActive = false;
  let editorMode: "normal" | "insert" = "normal";
  let line = 1;
  let column = 1;
  let selectionInfo = "0 selected";
  let wordCountInfo = "0 words";
  type SummaryAnnotationContext = { before: string; text: string; after: string };
  type SummaryAnnotationItem = { type: "annotation"; id: string; colorName: string; title: string; color: string; text: string; context: SummaryAnnotationContext; comment: string; timestamp: string; line: number; from: number; to: number; spanStart: number };
  type SummaryItem =
    | SummaryAnnotationItem
    | { type: "blockquote"; id: string; text: string; line: number; from: number; to: number };
  type SummarySection =
    | { kind: "item"; id: string; item: SummaryItem }
    | { kind: "group"; id: string; label: string; count: number; color: string; itemType: SummaryItem["type"]; items: SummaryItem[] };
  let summaryItems: SummaryItem[] = [];
  let summarySections: SummarySection[] = [];
  let expandedSummaryCategories: Record<string, boolean> = {};
  let summaryCollapsed = true;
  let summaryFullscreen = false;
  let summarySidebarWidth = 320;
  let editingSummaryTitleKey: string | null = null;
  let summaryTitleDraft = "";
  let resizingSummarySidebar = false;
  let finishSummaryResize: (() => void) | null = null;
  const summarySidebarMinWidth = 240;
  const summarySidebarMaxWidth = 720;
  $: editorModeLabel = editorMode === "insert" ? "EDIT" : "ANNOTATE";
  $: summaryFontSize = Math.round((11 + ((summarySidebarWidth - summarySidebarMinWidth) / 110)) * 10) / 10;
  $: clampedSummaryFontSize = Math.max(11, Math.min(15, summaryFontSize));
  $: summaryMetaFontSize = Math.max(9, clampedSummaryFontSize - 2);
  $: summaryTimestampFontSize = Math.max(8, clampedSummaryFontSize - 3);
  $: activeSummaryFontSize = summaryFullscreen ? fontSize : clampedSummaryFontSize;
  $: activeSummaryMetaFontSize = summaryFullscreen ? Math.max(9, fontSize - 4) : summaryMetaFontSize;
  $: activeSummaryTimestampFontSize = summaryFullscreen ? Math.max(8, fontSize - 5) : summaryTimestampFontSize;
  function clearAudioTarget() {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    audioUrl = "";
    audioFileName = "";
    audioCurrentTime = 0;
    audioDuration = 0;
    audioPlaying = false;
    audioLoaded = false;
    if (audioElement) {
      audioElement.pause();
      audioElement.removeAttribute("src");
      audioElement.load();
    }
  }

  function helpShortcutGroupTitle(title: string) {
    return title;
  }

  function helpShortcutLabel(label: string) {
    return label;
  }

  function helpShortcutDescription(description: string) {
    return description;
  }

  function openAudioDb() {
    return new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(audioDbName, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(audioStoreName);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function persistAudioFile(file: File) {
    try {
      const db = await openAudioDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(audioStoreName, "readwrite");
        tx.objectStore(audioStoreName).put(file, "current");
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    } catch (error) {
      console.error(error);
    }
  }

  async function restoreAudioFile() {
    try {
      const db = await openAudioDb();
      const file = await new Promise<File | undefined>((resolve, reject) => {
        const tx = db.transaction(audioStoreName, "readonly");
        const request = tx.objectStore(audioStoreName).get("current");
        request.onsuccess = () => resolve(request.result as File | undefined);
        request.onerror = () => reject(request.error);
      });
      db.close();
      if (file) await loadAudioFile(file);
    } catch (error) {
      console.error(error);
    }
  }

  async function loadAudioFile(file: File) {
    clearAudioTarget();
    audioUrl = URL.createObjectURL(file);
    audioFileName = file.name;
    loadedFileType = file.name.split(".").pop()?.toUpperCase() || "MP3";
    if (audioElement) {
      audioElement.src = audioUrl;
      audioElement.playbackRate = audioRates[audioRateIndex];
      audioElement.load();
    }
    void persistAudioFile(file);
  }

  function toggleAudioPlayback() {
    if (!audioElement || !audioLoaded) return;
    if (audioElement.paused) void audioElement.play();
    else audioElement.pause();
  }

  function cycleAudioRate() {
    audioRateIndex = (audioRateIndex + 1) % audioRates.length;
    if (!audioElement) return;
    audioElement.playbackRate = audioRates[audioRateIndex];
  }

  function audioRateLabel() {
    return audioRates[audioRateIndex] === 1
      ? "x1"
      : audioRates[audioRateIndex] === 1.5
        ? "x1½"
        : "x2";
  }

  function playAudioIfNeeded() {
    if (!audioElement || !audioLoaded || !audioElement.paused) return;
    void audioElement.play();
  }

  function seekAudio(deltaSeconds: number) {
    if (!audioElement || !audioLoaded) return;
    const nextTime = Math.min(Math.max(audioElement.currentTime + deltaSeconds, 0), audioDuration || audioElement.duration || Infinity);
    audioElement.currentTime = nextTime;
    audioCurrentTime = nextTime;
  }

  function jumpAudioTo(seconds: number) {
    if (!audioElement) return;
    const nextTime = Math.min(Math.max(seconds, 0), audioDuration || audioElement.duration || Infinity);
    audioElement.currentTime = nextTime;
    audioCurrentTime = nextTime;
  }

  function seekAudioAndPlay(deltaSeconds: number) {
    seekAudio(deltaSeconds);
    playAudioIfNeeded();
  }

  function jumpAudioToAndPlay(seconds: number) {
    jumpAudioTo(seconds);
    playAudioIfNeeded();
  }

  function isTextEntryTarget(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    if (target instanceof HTMLTextAreaElement) return true;
    if (!(target instanceof HTMLInputElement)) return false;
    return !["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"].includes(target.type);
  }

  function isFormControlTarget(target: EventTarget | null) {
    return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
  }

  function isEditorEventTarget(target: EventTarget | null) {
    return target instanceof Node && !!view?.dom.contains(target);
  }

  function isModeShortcut(event: KeyboardEvent) {
    return !event.ctrlKey && !event.metaKey && !event.altKey && (event.key === "Escape" || event.key === "F1" || event.key === "F2");
  }

  function isAudioShortcut(event: KeyboardEvent) {
    return event.altKey && !event.ctrlKey && !event.metaKey &&
      (event.key === " " || event.key === "ArrowLeft" || event.key === "Left" || event.key === "ArrowRight" || event.key === "Right");
  }

  function isAudioRateShortcut(event: KeyboardEvent) {
    return event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "r";
  }

  function isAppShortcutCandidate(event: KeyboardEvent) {
    if (event.metaKey) return false;
    if (isModeShortcut(event) || isAudioShortcut(event) || isAudioRateShortcut(event)) return true;
    if (event.ctrlKey && !event.altKey && (event.key === "z" || event.key === "y" || event.key === "Z")) return true;
    if (editorMode !== "normal" || event.altKey) return false;

    if (event.ctrlKey) {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === "ArrowDown") return true;
      return ["h", "j", "k", "l", "w", "s", "a", "d"].includes(event.key.toLowerCase());
    }

    return event.key === " " ||
      event.key === "Enter" ||
      event.key === "?" ||
      event.key === "ArrowLeft" ||
      event.key === "ArrowRight" ||
      event.key === "ArrowUp" ||
      event.key === "ArrowDown" ||
      "hjklwasdHJKLWASDxeqnNuU".includes(event.key);
  }

  function shouldDeferWindowShortcut(event: KeyboardEvent) {
    if (isTextEntryTarget(event.target)) return true;
    if (isFormControlTarget(event.target) && !isModeShortcut(event) && !isAudioShortcut(event) && !isAudioRateShortcut(event)) return true;
    return (event.key === " " || event.key === "Enter") &&
      event.target instanceof HTMLElement &&
      !!event.target.closest("button, a[href], [role='button']");
  }

  function handleAudioKeydown(event: KeyboardEvent) {
    if (event.defaultPrevented) return;
    if (!isAudioShortcut(event)) return;
    if (isTextEntryTarget(event.target)) return;

    event.preventDefault();
    event.stopPropagation();

    if (!audioElement || !audioLoaded) return;
    if (event.key === " ") {
      toggleAudioPlayback();
      return;
    }
    seekAudio(event.key === "ArrowLeft" || event.key === "Left" ? -10 : 10);
  }

  function handleWindowKeydown(event: KeyboardEvent) {
    if (event.defaultPrevented || isEditorEventTarget(event.target) || shouldDeferWindowShortcut(event)) return;
    handleAudioKeydown(event);
    if (event.defaultPrevented || !view || !isAppShortcutCandidate(event)) return;
    if (!runScopeHandlers(view, event, "editor")) return;
    event.preventDefault();
    event.stopPropagation();
    requestAnimationFrame(() => view?.focus());
  }

  function formatAudioTime(seconds: number) {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const whole = Math.floor(seconds);
    const mins = Math.floor(whole / 60);
    const secs = whole % 60;
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    const secText = String(secs).padStart(2, "0");
    if (hours > 0) return `${hours}:${String(remMins).padStart(2, "0")}:${secText}`;
    return `${mins}:${secText}`;
  }

  function replaceDocument(text: string, preserveLineBreaks = false) {
    if (!view) return;
    const insert = preserveLineBreaks ? text.replace(/\r\n?/g, "\n").trim() : sentenceLineBreaks(text);
    const initialCursor = firstVisibleDocumentPosition(insert);
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert },
      selection: { anchor: initialCursor },
      effects: EditorView.scrollIntoView(initialCursor, { y: "start", yMargin: 0 })
    });
    view.focus();
  }

  function firstVisibleDocumentPosition(text: string) {
    const lines = text.split("\n");
    let offset = 0;
    for (const line of lines) {
      if (line.trim() && !isSrtTimestampLine(line)) return offset;
      offset += line.length + 1;
    }
    return 0;
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
    const files = Array.from(input.files ?? []);
    input.value = "";
    if (!files.length) return;
    clearActiveSaveTarget();
    const audioFile = files.find(isMediaFile);
    const srtFile = files.find(file => file.name.toLowerCase().endsWith(".srt"));
    if (audioFile) await loadAudioFile(audioFile);
    if (srtFile) {
      loadedFileType = "SRT";
      replaceDocument(formatSrtTranscript(await srtFile.text()), true);
      return;
    }

    const file = files.find(file => !isMediaFile(file));
    if (!file) return;

    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      loadedFileType = "PDF";
      await openPdfModal(file);
      return;
    }

    if (file.name.toLowerCase().endsWith(".docx")) {
      loadedFileType = "DOCX";
      const buffer = await file.arrayBuffer();
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ arrayBuffer: buffer });
      replaceDocument(stripEmptyLines(result.value));
      return;
    }

    loadedFileType = file.name.split(".").pop()?.toUpperCase() || "TEXT";
    replaceDocument(stripEmptyLines(await file.text()));
  }

  function isMediaFile(file: File) {
    const name = file.name.toLowerCase();
    return mediaExtensions.some(extension => name.endsWith(extension));
  }

  function formatSrtTranscript(text: string) {
    const cues = text
      .replace(/^\uFEFF/, "")
      .replace(/\r\n?/g, "\n")
      .split(/\n{2,}/)
      .map(formatSrtCue)
      .filter(Boolean);

    return cues.join("\n");
  }

  function formatSrtCue(block: string) {
    const lines = block
      .split("\n")
      .map(line => line.trim())
      .filter(Boolean);
    if (!lines.length) return "";

    if (/^\d+$/.test(lines[0])) lines.shift();

    const timeIndex = lines.findIndex(line => /-->/i.test(line));
    if (timeIndex < 0) return "";

    const timeMatch = /^(\S+)\s*-->\s*(\S+)(?:\s+.*)?$/.exec(lines[timeIndex]);
    if (!timeMatch) return "";

    const start = normalizeSrtTimestamp(timeMatch[1]);
    const end = normalizeSrtTimestamp(timeMatch[2]);
    const cueText = lines
      .slice(timeIndex + 1)
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!cueText) return "";
    return `[${start} --> ${end}]\n${cueText}`;
  }

  function normalizeSrtTimestamp(timestamp: string) {
    return timestamp.trim().replace(",", ".");
  }

  function stripEmptyLines(text: string) {
    return text
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map(line => line.trimEnd())
      .filter(line => line.trim().length > 0)
      .join("\n");
  }

  function updateEditorViewportHeight() {
    editorViewportHeight = editorEl?.clientHeight ?? 0;
  }

  function clearActiveSaveTarget() {
    activeSaveHandle = null;
    activeSaveName = "";
    pendingAutosaveText = null;
    if (autosaveTimer) {
      clearTimeout(autosaveTimer);
      autosaveTimer = null;
    }
  }

  async function saveDocument() {
    if (!view) return;
    const suggestedName = activeSaveName || "annotations.md";
    const text = view.state.doc.toString();
    const picker = (window as any).showSaveFilePicker;

    if (picker) {
      try {
        activeSaveHandle = await picker({
          suggestedName,
          types: [{ description: "Markdown", accept: { "text/markdown": [".md"] } }]
        });
        activeSaveName = activeSaveHandle.name || suggestedName;
        await writeTextToHandle(activeSaveHandle, text);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) console.error(error);
      }
      return;
    }

    const fallbackName = prompt("Save filename", suggestedName);
    if (fallbackName) downloadText(fallbackName, text, "text/markdown;charset=utf-8");
  }

  function scheduleFileAutosave(text: string) {
    if (!activeSaveHandle) return;
    pendingAutosaveText = text;
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      autosaveTimer = null;
      void flushFileAutosave();
    }, 800);
  }

  async function flushFileAutosave() {
    if (!activeSaveHandle || pendingAutosaveText === null) return;
    if (autosaveWriting) {
      scheduleFileAutosave(pendingAutosaveText);
      return;
    }

    const text = pendingAutosaveText;
    pendingAutosaveText = null;
    autosaveWriting = true;
    try {
      await writeTextToHandle(activeSaveHandle, text);
    } catch (error) {
      console.error(error);
    } finally {
      autosaveWriting = false;
      if (pendingAutosaveText !== null) void flushFileAutosave();
    }
  }

  async function writeTextToHandle(handle: any, text: string) {
    const writable = await handle.createWritable();
    await writable.write(text);
    await writable.close();
  }

  async function exportCleanHtml() {
    if (!view) return;
    const suggestedName = `${stripExtension(activeSaveName || "annotations")}.html`;
    const html = cleanHtmlDocument(view.state.doc.toString());
    const picker = (window as any).showSaveFilePicker;

    if (picker) {
      try {
        const handle = await picker({
          suggestedName,
          types: [{ description: "HTML", accept: { "text/html": [".html"] } }]
        });
        await writeTextToHandle(handle, html);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) console.error(error);
      }
      return;
    }

    const fallbackName = prompt("Export filename", suggestedName);
    if (fallbackName) downloadText(fallbackName, html, "text/html;charset=utf-8");
  }

  function stripExtension(name: string) {
    return name.replace(/\.[^.]+$/, "") || "annotations";
  }

  function downloadText(filename: string, text: string, type: string) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
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
      const rows: { y: number; items: { text: string; x: number; width: number }[] }[] = [];

      for (const item of content.items) {
        if (!("str" in item)) continue;
        const text = item.str.replace(/\s+/g, " ");
        if (!text) continue;
        const x = Array.isArray(item.transform) ? item.transform[4] : 0;
        const y = Array.isArray(item.transform) ? item.transform[5] : 0;
        const width = typeof item.width === "number" ? item.width : 0;
        const row = rows.find(candidate => Math.abs(candidate.y - y) <= 3);

        if (row) {
          row.items.push({ text, x, width });
        } else {
          rows.push({ y, items: [{ text, x, width }] });
        }
      }

      const lines = rows
        .sort((a, b) => b.y - a.y)
        .map(row => buildPdfLine(row.items.sort((a, b) => a.x - b.x)))
        .filter(line => line && !/^Side\s+\d+\s+af\s+\d+$/i.test(line));

      pages.push(fixParagraphs(lines.join("\n")));
    }

    return pages.join("\n\n").replace(/[ \t]+\n/g, "\n").trim();
  }

  function buildPdfLine(items: { text: string; x: number; width: number }[]) {
    let line = "";
    let lastEnd: number | null = null;

    for (const item of items) {
      const isSpace = !item.text.trim();

      if (isSpace) {
        if (line && !line.endsWith(" ")) line += " ";
        lastEnd = item.x + item.width;
        continue;
      }

      const text = item.text.trim();
      if (lastEnd !== null && line && !line.endsWith(" ")) {
        const gap = item.x - lastEnd;
        const averageCharWidth = item.width / Math.max(text.length, 1);
        const spaceThreshold = Math.max(1.5, Math.min(4, averageCharWidth * 0.45));

        if (gap > spaceThreshold) line += " ";
      }

      line += text;
      lastEnd = item.x + item.width;
    }

    return cleanPdfLine(line);
  }

  function cleanPdfLine(line: string) {
    return line
      .replace(/\s+/g, " ")
      .replace(/\s+([.,;:!?])/g, "$1")
      .replace(/([([{“‘])\s+/g, "$1")
      .replace(/\s+([)\]}”’])/g, "$1")
      .replace(/(\d)\s*([–-])\s*(\d)/g, "$1$2$3")
      .replace(/([A-Za-zÆØÅæøå])\s+-\s+([A-Za-zÆØÅæøå])/g, "$1-$2")
      .trim();
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
    const selection = view?.state.selection;
    editorMode = mode;
    if (view) {
      view.dispatch(selection ? { selection } : {});  // trigger keymap/decoration rebuild
      // In normal mode, show a block cursor via a theme class on the editor dom
      view.dom.classList.toggle("mode-insert", mode === "insert");
      view.dom.classList.toggle("mode-normal", mode === "normal");
      requestAnimationFrame(() => view?.focus());
    }
  }

  $: if (view) {
    view.dom.classList.toggle("mode-insert", editorMode === "insert");
    view.dom.classList.toggle("mode-normal", editorMode === "normal");
    view.dom.style.setProperty("--paragraph-spacing", `${paragraphSpacing}em`);
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
      view?.requestMeasure();
      view?.scrollDOM.dispatchEvent(new Event("scroll"));
    });
  }

  // Trigger CM6 decoration rebuild when annotationMode changes
  $: annotationMode, view && view.dispatch({});

  const highlightStyles = [
    { name: "green",   color: "#b8bb26" },
    { name: "red",     color: "#fb4934" },
    { name: "steel",   color: "#83a598" },
    { name: "orange",  color: "#fe8019" },
    { name: "periwinkle", color: "#8370d0" },
    { name: "sand",    color: "#d8bd7f" },
    { name: "mint",    color: "#6fc6a4" },
    { name: "denim",   color: "#3f5f9f" },
    { name: "yellow",  color: "#fabd2f" },
    { name: "indigo",  color: "#4f46e5" },
    { name: "brown",   color: "#8f6f3f" },
    { name: "slate",   color: "#586e75" },
    { name: "sky",     color: "#57a0d5" },
    { name: "rosewood", color: "#8f3f4d" },
    { name: "purple",  color: "#d3869b" }
  ];
  function cycleStyle(delta: number) {
    currentStyle = cycleStyleNumber(currentStyle, delta);
  }

  function cycleStyleNumber(style: number, delta: number, includePlain = true) {
    if (includePlain) {
      const styleCount = highlightStyles.length + 1;
      return ((style + delta) + styleCount) % styleCount;
    }

    const styleCount = highlightStyles.length;
    const colorStyle = Math.max(1, style);
    return (((colorStyle - 1 + delta) + styleCount) % styleCount) + 1;
  }

  function styleName(style: number) {
    return style === 0 ? "" : highlightStyles[style - 1]?.name ?? "";
  }

  function styleColor(style: number) {
    return style === 0 ? gruvbox.orange : highlightStyles[style - 1]?.color ?? gruvbox.fg;
  }

  function styleNumberForName(name: string) {
    const index = highlightStyles.findIndex(s => s.name === name);
    return index < 0 ? 1 : index + 1;
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

The dog, for his part, was not lazy in any meaningful sense. He was simply ${bt}old${bt}<!-- steel, ${t4}: "Consider 'elderly'" -->. His name was Jasper, and he had been guarding the same gate for eleven years. He watched the fox with one open eye and decided, as he always did, that the effort was not worth it.

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
      ".cm-scroller": { overflow: "auto", fontFamily: '"Noto Sans Mono", "JetBrains Mono", "Fira Code", ui-monospace, monospace', lineHeight: "1.75" },
      ".cm-content": { textAlign: "left", padding: "1rem 1.25rem 4rem", minHeight: "100%", caretColor: gruvbox.cursor, whiteSpace: "pre-wrap", wordBreak: "break-word" },
      ".cm-line": { textAlign: "left" },
      "&.cm-focused .cm-cursor": { borderLeftColor: gruvbox.cursor },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: `${gruvbox.orange} !important`, color: gruvbox.bg, opacity: '50%' },
      ".cm-gutters": { backgroundColor: gruvbox.bgHard, color: gruvbox.gutterText, borderRight: "none" },
      ".cm-activeLine": { backgroundColor: "transparent" },
      ".cm-activeLineGutter": { color: gruvbox.yellow },
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
        paddingRight: "0.35em",
        backgroundColor: "#4a3520",
        marginBottom: "2px",
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
    const totalWords = countWords(v.state.doc.toString());
    const selectedWords = sel.empty ? 0 : countWords(v.state.doc.sliceString(sel.from, sel.to));
    wordCountInfo = sel.empty ? `${totalWords} words` : `${totalWords} words (${selectedWords} selected)`;
    updateSummaryFromView(v);
    setCurrentBlockquoteFromView(v);
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

  const srtPattern = /\[\s*([0-9:.]+)\s*-->\s*([0-9:.]+)\s*\]/g;
  const styleColorMap: Record<string, string> = Object.fromEntries(highlightStyles.map(s => [s.name, s.color]));
  let editingSpan: number | null = null;
  type BlockquoteAlign = "left" | "center" | "right";

  function countWords(text: string) {
    const visibleText = text
      .replace(/`([^`]+)`<!--\s*\w+,\s*.+?:\s*"[^"]*"\s*-->/g, "$1")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/`([^`\n]+)`/g, "$1");
    return visibleText.match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
  }

  type WordRange = { from: number; to: number };
  const wordCorePattern = /[\p{L}\p{N}_-]/u;

  function isWordCoreChar(ch: string | undefined): boolean {
    return !!ch && wordCorePattern.test(ch);
  }

  function isWordApostrophe(ch: string | undefined): boolean {
    return ch === "'" || ch === "\u2019";
  }

  function isSelectableWordChar(text: string, index: number): boolean {
    const ch = text[index];
    if (isWordCoreChar(ch)) return true;
    return isWordApostrophe(ch) && isWordCoreChar(text[index - 1]) && isWordCoreChar(text[index + 1]);
  }

  function wordRangeAt(text: string, pos: number): WordRange | null {
    const safePos = Math.max(0, Math.min(pos, text.length));
    let start = safePos;
    let end = safePos;
    while (start > 0 && isSelectableWordChar(text, start - 1)) start -= 1;
    while (end < text.length && isSelectableWordChar(text, end)) end += 1;
    return start === end ? null : { from: start, to: end };
  }

  function wordBoundary(text: string, pos: number, forward: boolean): number {
    let next = Math.max(0, Math.min(pos, text.length));

    if (forward) {
      if (next < text.length && isSelectableWordChar(text, next)) {
        while (next < text.length && isSelectableWordChar(text, next)) next += 1;
      }
      while (next < text.length && !isSelectableWordChar(text, next)) next += 1;
      return next;
    }

    if (next > 0 && isSelectableWordChar(text, next - 1)) {
      while (next > 0 && isSelectableWordChar(text, next - 1)) next -= 1;
      return next;
    }
    while (next > 0 && !isSelectableWordChar(text, next - 1)) next -= 1;
    while (next > 0 && isSelectableWordChar(text, next - 1)) next -= 1;
    return next;
  }

  function cleanHtmlDocument(markdownText: string) {
    const body = renderCleanHtmlBody(markdownText);
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(stripExtension(activeSaveName || "Annotated document"))}</title>
  <style>
    body {
      margin: 0;
      background: ${gruvbox.bg};
      color: ${gruvbox.fg};
      font-family: "Noto Sans Mono", "JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      line-height: ${lineHeight};
      font-size: ${fontSize}px;
    }
    main {
      box-sizing: border-box;
      max-width: 960px;
      min-height: 100vh;
      margin: 0 auto;
      padding: ${padTop}px ${padRight}px ${padBottom}px ${padLeft}px;
      white-space: normal;
    }
    p { margin: 0 0 ${1 + paragraphSpacing}em; }
    h1, h2, h3, h4, h5, h6 { color: ${gruvbox.yellow}; margin: 1.25rem 0 0.75rem; line-height: 1.25; }
    code { color: ${gruvbox.yellow}; background: ${gruvbox.bgSoft}; border: 1px solid ${gruvbox.border}; border-radius: 4px; padding: 0 0.25rem; }
    .annotation-token {
      border-radius: 3px;
      padding: 0 0.25rem;
      border: 1px solid rgba(0, 0, 0, 0.18);
      display: inline-block;
    }
    .annotation-timestamp {
      display: inline-flex;
      align-items: center;
      margin-left: 0.2rem;
      padding: 0 0.35rem;
      border-radius: 999px;
      background: rgba(80, 73, 69, 0.9);
      border: 1px solid ${gruvbox.border};
      color: ${gruvbox.fgMuted};
      font-size: 10px;
      line-height: 1.4;
      white-space: nowrap;
      vertical-align: middle;
      box-shadow: 0 1px 0 rgba(0, 0, 0, 0.15);
    }
    blockquote {
      border-left: 3px solid ${gruvbox.orange};
      padding: 0.25rem 0.35rem 0.25rem 0.75rem;
      margin-top: 0;
      margin-bottom: 0.25rem;
      background: #4a3520;
      color: ${gruvbox.yellow};
    }
  </style>
</head>
<body>
  <main>
${body}
  </main>
</body>
</html>
`;
  }

  function renderCleanHtmlBody(markdownText: string) {
    const blocks: string[] = [];
    let paragraph: string[] = [];

    const flushParagraph = () => {
      if (!paragraph.length) return;
      blocks.push(`    <p>${renderInlineHtml(paragraph.join(" "))}</p>`);
      paragraph = [];
    };

    for (const rawLine of markdownText.replace(/\r\n?/g, "\n").split("\n")) {
      const lineText = rawLine.trim();
      if (!lineText) {
        flushParagraph();
        continue;
      }

      const heading = /^(#{1,6})\s+(.+)$/.exec(lineText);
      if (heading) {
        flushParagraph();
        const level = heading[1].length;
        blocks.push(`    <h${level}>${renderInlineHtml(heading[2])}</h${level}>`);
        continue;
      }

      if (lineText.startsWith(">")) {
        flushParagraph();
        const meta = parseBlockquoteMeta(lineText);
        const quoteText = lineText
          .replace(blockquoteMetaPattern, "")
          .replace(/^>\s?/, "")
          .trim();
        blocks.push(`    <blockquote style="${escapeHtml(blockquoteStyle(meta))}">${renderInlineHtml(quoteText)}</blockquote>`);
        continue;
      }

      paragraph.push(lineText);
    }

    flushParagraph();
    return blocks.join("\n");
  }

  function renderInlineHtml(text: string) {
    const pattern = /`([^`]+)`<!--\s*(\w+),\s*(.+?):\s*"([^"]*)"(?:,\s*title:\s*"([^"]*)")?\s*-->/g;
    let html = "";
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      html += renderPlainInlineHtml(text.slice(lastIndex, match.index));
      const color = styleColorMap[match[2]] || gruvbox.yellow;
      html += `<span class="annotation-token" style="background:${escapeHtml(color)};color:${escapeHtml(contrastColor(color))};">${escapeHtml(match[1])}</span>`;
      html += `<span class="annotation-timestamp" title="${escapeHtml(match[3])}">${escapeHtml(match[3])}</span>`;
      lastIndex = match.index + match[0].length;
    }

    html += renderPlainInlineHtml(text.slice(lastIndex));
    return html;
  }

  function renderPlainInlineHtml(text: string) {
    const withoutComments = text.replace(/<!--[\s\S]*?-->/g, "");
    const escaped = escapeHtml(withoutComments);
    return escaped.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  }

  function summaryAnnotationTitle(item: SummaryAnnotationItem) {
    return item.title || item.colorName.toUpperCase();
  }

  function annotationTitleKey(item: SummaryAnnotationItem) {
    return item.title.trim() || item.colorName;
  }

  function isSummaryAnnotationItem(item: SummaryItem): item is SummaryAnnotationItem {
    return item.type === "annotation";
  }

  function sentenceBoundaryStart(text: string, pos: number) {
    for (let index = Math.max(0, pos - 1); index >= 0; index -= 1) {
      if (!/[.!?]/.test(text[index])) continue;
      if (index + 1 < text.length && !/\s/.test(text[index + 1])) continue;
      let start = index + 1;
      while (start < text.length && /\s/.test(text[start])) start += 1;
      return start;
    }
    return 0;
  }

  function sentenceBoundaryEnd(text: string, pos: number) {
    for (let index = Math.max(0, pos); index < text.length; index += 1) {
      if (!/[.!?]/.test(text[index])) continue;
      if (index + 1 < text.length && !/\s/.test(text[index + 1])) continue;
      return index + 1;
    }
    return text.length;
  }

  function annotationSentenceContext(docText: string, spanStart: number, spanEnd: number): SummaryAnnotationContext {
    const startMarker = "[[TEXTANNOTATE_SUMMARY_START]]";
    const endMarker = "[[TEXTANNOTATE_SUMMARY_END]]";
    const windowStart = Math.max(0, spanStart - 1200);
    const windowEnd = Math.min(docText.length, spanEnd + 1200);
    const relativeStart = spanStart - windowStart;
    const relativeEnd = spanEnd - windowStart;
    const windowText = docText.slice(windowStart, windowEnd);
    const withMarkers =
      summaryVisibleText(windowText.slice(0, relativeStart)) +
      startMarker +
      summaryVisibleText(windowText.slice(relativeStart, relativeEnd)) +
      endMarker +
      summaryVisibleText(windowText.slice(relativeEnd));
    const markerStart = withMarkers.indexOf(startMarker);
    const markerEnd = withMarkers.indexOf(endMarker);
    if (markerStart < 0 || markerEnd < markerStart) {
      const fallback = summaryVisibleText(docText.slice(spanStart, spanEnd)).trim();
      return { before: "", text: fallback, after: "" };
    }

    const cleanText = withMarkers.replace(startMarker, "").replace(endMarker, "");
    const annotationStart = markerStart;
    const annotationEnd = markerEnd - startMarker.length;
    const sentenceStart = sentenceBoundaryStart(cleanText, annotationStart);
    const sentenceEnd = sentenceBoundaryEnd(cleanText, annotationEnd);
    const rawSentence = cleanText.slice(sentenceStart, sentenceEnd);
    const leadingSpaces = rawSentence.match(/^\s*/)?.[0].length ?? 0;
    const sentence = rawSentence.trim();
    const contextStart = Math.max(0, annotationStart - sentenceStart - leadingSpaces);
    const contextEnd = Math.max(contextStart, Math.min(sentence.length, annotationEnd - sentenceStart - leadingSpaces));
    const text = sentence.slice(contextStart, contextEnd).trim() || summaryVisibleText(docText.slice(spanStart, spanEnd)).trim();

    if (!sentence) return { before: "", text, after: "" };
    return {
      before: sentence.slice(0, contextStart),
      text,
      after: sentence.slice(contextEnd)
    };
  }

  function updateSummaryFromView(v: EditorView) {
    const doc = v.state.doc;
    const docText = doc.toString();
    const items: SummaryItem[] = [];

    annotationPattern.lastIndex = 0;
    let annotation: RegExpExecArray | null;
    while ((annotation = annotationPattern.exec(docText)) !== null) {
      const spanStart = annotation.index;
      const wordStart = spanStart + 1;
      const wordEnd = wordStart + annotation[1].length;
      const colorName = annotation[2];
      items.push({
        type: "annotation",
        id: `annotation-${spanStart}`,
        colorName,
        title: annotation[5]?.trim() ?? "",
        color: styleColorMap[colorName] ?? gruvbox.fgMuted,
        text: annotation[1],
        context: annotationSentenceContext(docText, spanStart, spanStart + annotation[0].length),
        timestamp: annotation[3],
        comment: annotation[4],
        line: doc.lineAt(spanStart).number,
        from: wordStart,
        to: wordEnd,
        spanStart
      });
    }

    items.push(...blockquoteSummaryItems(docText, doc));
    const sortedItems = items.sort((a, b) => {
      if (a.type !== b.type) return a.type === "blockquote" ? -1 : 1;
      return a.from - b.from;
    });
    summaryItems = sortedItems;
    summarySections = buildSummarySections(sortedItems);
  }

  function buildSummarySections(items: SummaryItem[]) {
    const grouped = new Map<string, { label: string; color: string; itemType: SummaryItem["type"]; items: SummaryItem[] }>();
    const order: string[] = [];

    for (const item of items) {
      const key = item.type === "blockquote" ? "blockquote:notes" : `annotation:${annotationTitleKey(item)}`;
      if (!grouped.has(key)) {
        order.push(key);
        grouped.set(key, {
          label: item.type === "blockquote" ? "Notes" : summaryAnnotationTitle(item),
          color: item.type === "blockquote" ? gruvbox.yellow : item.color,
          itemType: item.type,
          items: []
        });
      }
      grouped.get(key)!.items.push(item);
    }

    return order.map((key): SummarySection => {
      const group = grouped.get(key)!;
      if (group.items.length === 1) return { kind: "item", id: group.items[0].id, item: group.items[0] };
      return {
        kind: "group",
        id: key,
        label: group.label,
        count: group.items.length,
        color: group.color,
        itemType: group.itemType,
        items: group.items
      };
    });
  }

  function toggleSummaryCategory(id: string) {
    expandedSummaryCategories = {
      ...expandedSummaryCategories,
      [id]: !expandedSummaryCategories[id]
    };
  }

  function clampSummarySidebarWidth(width: number) {
    return Math.max(summarySidebarMinWidth, Math.min(summarySidebarMaxWidth, Math.round(width)));
  }

  function toggleSummaryCollapsed() {
    if (!summaryCollapsed && summaryFullscreen) {
      summaryFullscreen = false;
    }
    summaryCollapsed = !summaryCollapsed;
  }

  function toggleSummaryFullscreen() {
    finishSummaryResize?.();
    summaryFullscreen = !summaryFullscreen;
    if (summaryFullscreen) {
      summaryCollapsed = false;
    }
  }

  function startSummaryResize(event: PointerEvent) {
    if (summaryCollapsed || summaryFullscreen) return;
    event.preventDefault();
    event.stopPropagation();
    finishSummaryResize?.();

    resizingSummarySidebar = true;
    const startX = event.clientX;
    const startWidth = summarySidebarWidth;
    const move = (moveEvent: PointerEvent) => {
      summarySidebarWidth = clampSummarySidebarWidth(startWidth + (startX - moveEvent.clientX));
    };
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      resizingSummarySidebar = false;
      finishSummaryResize = null;
    };

    finishSummaryResize = finish;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }

  function handleSummaryResizeKeydown(event: KeyboardEvent) {
    if (summaryCollapsed || summaryFullscreen) return;
    const step = event.shiftKey ? 40 : 16;
    if (event.key === "ArrowLeft") {
      summarySidebarWidth = clampSummarySidebarWidth(summarySidebarWidth + step);
    } else if (event.key === "ArrowRight") {
      summarySidebarWidth = clampSummarySidebarWidth(summarySidebarWidth - step);
    } else if (event.key === "Home") {
      summarySidebarWidth = summarySidebarMinWidth;
    } else if (event.key === "End") {
      summarySidebarWidth = summarySidebarMaxWidth;
    } else {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  }

  function summaryTimestamp(timestamp: string) {
    return timestamp
      .replace(/\s+\d{4}(?=\s+\d{2}:\d{2})/, "")
      .replace(/\s+\d{4}$/, "")
      .replace(/(\d{2}:\d{2}):\d{2}$/, "$1");
  }

  function blockquoteSummaryItems(docText: string, doc: Text) {
    const items: SummaryItem[] = [];
    const lines = docText.split("\n");
    let offset = 0;
    let active: { from: number; to: number; line: number; parts: string[] } | null = null;

    const flush = () => {
      if (!active) return;
      const text = active.parts.join(" ").replace(/\s+/g, " ").trim();
      if (text) {
        items.push({
          type: "blockquote",
          id: `blockquote-${active.from}`,
          text,
          line: active.line,
          from: active.from,
          to: active.to
        });
      }
      active = null;
    };

    lines.forEach((rawLine, index) => {
      const lineStart = offset;
      const lineEnd = lineStart + rawLine.length;
      const trimmed = rawLine.trimStart();
      const isQuote = trimmed.startsWith(">");

      if (isQuote) {
        const quoteText = trimmed
          .replace(blockquoteMetaPattern, "")
          .replace(/^>\s?/, "")
          .trim();
        if (!active) active = { from: lineStart, to: lineEnd, line: index + 1, parts: [] };
        active.to = lineEnd;
        if (quoteText) active.parts.push(quoteText);
      } else {
        flush();
      }

      offset = lineEnd + 1;
    });

    flush();
    return items;
  }

  function jumpToSummaryItem(item: SummaryItem) {
    if (!view) return;
    flashSummaryTarget(item);
    view.dispatch({
      selection: { anchor: item.from, head: item.to },
      effects: EditorView.scrollIntoView(item.from, { y: "center" })
    });
    view.focus();
  }

  function handleSummaryItemKeydown(event: KeyboardEvent, item: SummaryItem) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    jumpToSummaryItem(item);
  }

  function handleSummaryGroupKeydown(event: KeyboardEvent, section: Extract<SummarySection, { kind: "group" }>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    toggleSummaryCategory(section.id);
  }

  function summaryAnnotationItems(items: SummaryItem[]) {
    return items.filter(isSummaryAnnotationItem);
  }

  function startSummaryTitleEdit(event: MouseEvent, key: string, item: SummaryAnnotationItem) {
    event.preventDefault();
    event.stopPropagation();
    editingSummaryTitleKey = key;
    summaryTitleDraft = item.title || item.colorName;
  }

  function startSummaryGroupTitleEdit(event: MouseEvent, section: Extract<SummarySection, { kind: "group" }>) {
    event.preventDefault();
    event.stopPropagation();
    const firstAnnotation = summaryAnnotationItems(section.items)[0];
    if (!firstAnnotation) return;
    editingSummaryTitleKey = section.id;
    summaryTitleDraft = firstAnnotation.title || firstAnnotation.colorName;
  }

  function annotationMatchAt(docText: string, spanStart: number) {
    annotationPattern.lastIndex = spanStart;
    const match = annotationPattern.exec(docText);
    annotationPattern.lastIndex = 0;
    return match?.index === spanStart ? match : null;
  }

  function saveSummaryTitle(items: SummaryAnnotationItem[]) {
    if (!editingSummaryTitleKey) return;
    if (!view || items.length === 0) {
      editingSummaryTitleKey = null;
      return;
    }

    const docText = view.state.doc.toString();
    const changes = items
      .map(item => {
        const match = annotationMatchAt(docText, item.spanStart);
        if (!match) return null;
        return {
          from: item.spanStart,
          to: item.spanStart + match[0].length,
          insert: annotationWithTitle(match, summaryTitleDraft)
        };
      })
      .filter((change): change is { from: number; to: number; insert: string } => !!change)
      .sort((a, b) => a.from - b.from);

    editingSummaryTitleKey = null;
    if (changes.length) {
      view.dispatch({ changes });
    }
  }

  function cancelSummaryTitleEdit() {
    editingSummaryTitleKey = null;
  }

  function handleSummaryTitleKeydown(event: KeyboardEvent, items: SummaryAnnotationItem[]) {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      saveSummaryTitle(items);
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelSummaryTitleEdit();
    }
  }

  function editSummaryAnnotationComment(event: MouseEvent, item: SummaryAnnotationItem) {
    event.stopPropagation();
    if (!view) return;
    editingSpan = item.spanStart;
    flashSummaryTarget(item);
    view.dispatch({
      selection: { anchor: item.from, head: item.to },
      effects: EditorView.scrollIntoView(item.from, { y: "center" })
    });
    view.focus();
  }

  function flashSummaryTarget(item: SummaryItem) {
    if (!view) return;
    const from = Math.min(item.from, item.to);
    const to = Math.max(item.from, item.to);
    view.dispatch({ effects: summaryJumpFlashEffect.of({ from, to }) });
    window.setTimeout(() => view?.dispatch({ effects: summaryJumpFlashClearEffect.of(null) }), 850);
  }

  function escapeHtml(text: string) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function clampBlockquoteWidth(width: number) {
    return Math.max(0, Math.min(100, Math.round(width)));
  }

  function parseBlockquoteMeta(lineText: string) {
    const match = blockquoteMetaPattern.exec(lineText);
    blockquoteMetaPattern.lastIndex = 0;
    if (!match) return { align: "left" as BlockquoteAlign, width: 100, hasComment: false, commentStart: -1, commentEnd: -1 };
    return {
      align: match[1].toLowerCase() as BlockquoteAlign,
      width: clampBlockquoteWidth(+match[2]),
      hasComment: true,
      commentStart: match.index,
      commentEnd: match.index + match[0].length
    };
  }

  function blockquoteComment(align: BlockquoteAlign, width: number) {
    return `<!-- align:${align} width:${clampBlockquoteWidth(width)} -->`;
  }

  function blockquoteStyle(meta: { align: BlockquoteAlign; width: number }) {
    const alignStyles = meta.align === "center"
      ? "margin-left: auto; margin-right: auto;"
      : meta.align === "right"
        ? "margin-left: auto; margin-right: 0;"
        : "margin-left: 0; margin-right: auto;";
    return `display: block; box-sizing: border-box; width: ${meta.width}% !important; ${alignStyles}`;
  }

  function setCurrentBlockquoteFromView(v: EditorView) {
    const lineInfo = v.state.doc.lineAt(v.state.selection.main.head);
    if (!lineInfo.text.startsWith(">")) {
      blockquoteActive = false;
      return;
    }

    const meta = parseBlockquoteMeta(lineInfo.text);
    blockquoteActive = true;
    blockquoteAlign = meta.align;
    blockquoteBgWidth = meta.width;
  }

  function updateCurrentBlockquote(v: EditorView, next: Partial<{ align: BlockquoteAlign; width: number }>) {
    const line = v.state.doc.lineAt(v.state.selection.main.head);
    if (!line.text.startsWith(">")) return false;

    const meta = parseBlockquoteMeta(line.text);
    const align = next.align ?? meta.align;
    const width = clampBlockquoteWidth(next.width ?? meta.width);
    const comment = blockquoteComment(align, width);
    if (meta.hasComment) {
      v.dispatch({
        changes: { from: line.from + meta.commentStart, to: line.from + meta.commentEnd, insert: comment }
      });
    } else {
      const insert = line.text.length ? `${line.text} ${comment}` : comment;
      v.dispatch({ changes: { from: line.from, to: line.to, insert } });
    }
    blockquoteAlign = align;
    blockquoteBgWidth = width;
    blockquoteActive = true;
    return true;
  }

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

  class SrtTimestampWidget extends WidgetType {
    label: string;
    startSeconds: number | null;
    constructor(label: string, startSeconds: number | null) {
      super();
      this.label = label;
      this.startSeconds = startSeconds;
    }
    toDOM() {
      const span = document.createElement("span");
      span.className = "cm-srt-timestamp";
      span.textContent = this.label;
      span.title = this.label;
      span.style.cursor = "pointer";
      const seek = (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        if (this.startSeconds === null) return;
        jumpAudioToAndPlay(this.startSeconds);
      };
      span.addEventListener("mousedown", seek);
      return span;
    }
    ignoreEvent() { return false; }
  }

  class SrtGutterMarker extends GutterMarker {
    elementClass: string;
    label: string;
    startSeconds: number | null;
    constructor(elementClass: string, label = "", startSeconds: number | null = null) {
      super();
      this.elementClass = elementClass;
      this.label = label;
      this.startSeconds = startSeconds;
    }
    eq(other: GutterMarker) {
      return other instanceof SrtGutterMarker &&
        other.elementClass === this.elementClass &&
        other.label === this.label &&
        other.startSeconds === this.startSeconds;
    }
    toDOM() {
      const span = document.createElement("span");
      span.className = "cm-srt-gutter-label";
      span.textContent = this.label;
      if (this.startSeconds !== null) {
        span.title = this.label;
        span.addEventListener("mousedown", event => {
          event.preventDefault();
          event.stopPropagation();
          jumpAudioToAndPlay(this.startSeconds!);
        });
      }
      return span;
    }
  }

  const srtSourceGutterMarker = new SrtGutterMarker("cm-srt-gutter-source");

  function buildSrtGutterMarkers(state: EditorState) {
    const builder = new RangeSetBuilder<GutterMarker>();

    for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
      const line = state.doc.line(lineNumber);
      if (isSrtTimestampLine(line.text)) {
        builder.add(line.from, line.from, srtSourceGutterMarker);
        continue;
      }

      const timestamp = srtTimestampForTranscriptLine(state, lineNumber);
      if (timestamp && line.text.trim()) {
        builder.add(line.from, line.from, new SrtGutterMarker("cm-srt-gutter-transcript", timestamp.label, timestamp.startSeconds));
      }
    }

    return builder.finish();
  }

  const srtGutterMarkerField = StateField.define<RangeSet<GutterMarker>>({
    create: state => buildSrtGutterMarkers(state),
    update: (markers, tr) => tr.docChanged ? buildSrtGutterMarkers(tr.state) : markers,
    provide: field => lineNumberMarkers.from(field)
  });

  function formatSrtTimestampLabel(matchText: string) {
    const parsed = /^\[\s*([0-9:.]+)\s*-->\s*([0-9:.]+)\s*\]$/.exec(matchText.trim());
    if (!parsed) return matchText;
    const start = shortenTimestamp(parsed[1]);
    const end = shortenTimestamp(parsed[2]);
    return `${start} → ${end}`;
  }

  function shortenTimestamp(timestamp: string) {
    const cleaned = timestamp.trim().replace(",", ".");
    const parts = cleaned.split(":");
    if (parts.length >= 3) {
      const minutes = parts[parts.length - 2];
      const seconds = parts[parts.length - 1].slice(0, 2);
      return `${minutes}:${seconds}`;
    }
    if (parts.length === 2) return `${parts[0]}:${parts[1].slice(0, 2)}`;
    return cleaned;
  }

  function parseTimestampToSeconds(timestamp: string) {
    const cleaned = timestamp.trim().replace(",", ".");
    const parts = cleaned.split(":");
    if (parts.length === 3) {
      const hours = +parts[0];
      const minutes = +parts[1];
      const seconds = +parts[2];
      return hours * 3600 + minutes * 60 + seconds;
    }
    if (parts.length === 2) {
      const minutes = +parts[0];
      const seconds = +parts[1];
      return minutes * 60 + seconds;
    }
    const numeric = Number(cleaned);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function isSrtTimestampLine(text: string) {
    return /^\[\s*[0-9:.]+\s*-->\s*[0-9:.]+\s*\]$/.test(text.trim());
  }

  function documentHasSrtTimestamps(state: EditorState) {
    return /^\[\s*[0-9:.]+\s*-->\s*[0-9:.]+\s*\]$/m.test(state.doc.toString());
  }

  function srtTimestampForTranscriptLine(state: EditorState, lineNumber: number) {
    if (lineNumber <= 1 || lineNumber > state.doc.lines) return null;
    const previousLine = state.doc.line(lineNumber - 1);
    if (!isSrtTimestampLine(previousLine.text)) return null;
    srtPattern.lastIndex = 0;
    const match = srtPattern.exec(previousLine.text);
    if (!match) return null;
    return {
      label: formatSrtTimestampLabel(match[0]),
      startSeconds: parseTimestampToSeconds(match[1])
    };
  }

  function formatEditorLineNumber(lineNumber: number, state: EditorState) {
    const hasSrt = documentHasSrtTimestamps(state);
    if (lineNumber > state.doc.lines) return hasSrt ? "00:00 → 00:00" : String(lineNumber);
    const line = state.doc.line(lineNumber);
    if (isSrtTimestampLine(line.text)) return "";
    const timestamp = srtTimestampForTranscriptLine(state, lineNumber);
    if (timestamp) return timestamp.label;
    return String(lineNumber);
  }

  function srtLineExitPosition(doc: Text, lineNumber: number, direction: "left" | "right") {
    if (direction === "right") {
      for (let number = lineNumber + 1; number <= doc.lines; number += 1) {
        const line = doc.line(number);
        if (line.text.trim() && !isSrtTimestampLine(line.text)) return line.from;
      }
      return doc.length;
    }

    for (let number = lineNumber - 1; number >= 1; number -= 1) {
      const line = doc.line(number);
      if (line.text.trim() && !isSrtTimestampLine(line.text)) return line.to;
    }
    return 0;
  }

  function snapSelectionAroundProtectedRange(
    tr: Transaction,
    range: { from: number; to: number; leftExit: number; rightExit: number }
  ): readonly TransactionSpec[] | null {
    const selection = tr.newSelection.main;
    const cursor = selection.head;
    if (cursor < range.from || cursor > range.to) return null;

    const movingRight = cursor >= tr.startState.selection.main.head;
    const target = movingRight ? range.rightExit : range.leftExit;
    if (target === cursor) return null;

    return [tr, {
      selection: selection.empty ? EditorSelection.cursor(target) : EditorSelection.range(selection.anchor, target)
    }];
  }

  function isCursorOnSrtTimestampLine(v: EditorView) {
    const lineText = v.state.doc.lineAt(v.state.selection.main.head).text;
    srtPattern.lastIndex = 0;
    return srtPattern.test(lineText);
  }

  function jumpFromCurrentTimestampLine(v: EditorView) {
    const lineText = v.state.doc.lineAt(v.state.selection.main.head).text;
    srtPattern.lastIndex = 0;
    const match = srtPattern.exec(lineText);
    if (!match) return false;
    const startSeconds = parseTimestampToSeconds(match[1]);
    if (startSeconds === null) return false;
    jumpAudioToAndPlay(startSeconds);
    return true;
  }

  function associatedSrtStartSeconds(v: EditorView) {
    let line = v.state.doc.lineAt(v.state.selection.main.head);

    for (let i = 0; i < 50; i += 1) {
      srtPattern.lastIndex = 0;
      const match = srtPattern.exec(line.text);
      if (match) return parseTimestampToSeconds(match[1]);
      if (line.number <= 1) break;
      line = v.state.doc.line(line.number - 1);
    }

    return null;
  }

  function toggleAssociatedSrtPlayback(v: EditorView) {
    const startSeconds = associatedSrtStartSeconds(v);
    if (startSeconds === null) return false;
    if (!audioElement || !audioLoaded) return true;

    jumpAudioTo(startSeconds);
    if (audioElement.paused) void audioElement.play();
    return true;
  }

  function handleEnterInAnnotationMode(v: EditorView) {
    if (toggleAnnotationEdit(v)) return true;
    toggleAssociatedSrtPlayback(v);
    return true;
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

    const srtPlugin = ViewPlugin.fromClass(class {
      decorations: DecorationSet;
      constructor(v: EditorView) { this.decorations = this.build(v); }
      update(u: ViewUpdate) {
        if (u.docChanged || u.viewportChanged || u.selectionSet) this.decorations = this.build(u.view);
      }
      build(v: EditorView): DecorationSet {
        const builder = new RangeSetBuilder<Decoration>();
        let lastLineNumber = 0;
        for (const { from, to } of v.visibleRanges) {
          let line = v.state.doc.lineAt(from);
          if (line.number <= lastLineNumber && lastLineNumber < v.state.doc.lines) line = v.state.doc.line(lastLineNumber + 1);

          while (line.from <= to && line.number <= v.state.doc.lines) {
            const timestampLine = isSrtTimestampLine(line.text);
            if (timestampLine) {
              builder.add(line.from, line.from, Decoration.line({ class: "cm-srt-timestamp-line" }));
            } else {
              const timestamp = srtTimestampForTranscriptLine(v.state, line.number);
              if (timestamp && line.text.trim()) {
                builder.add(line.from, line.from, Decoration.line({ class: "cm-srt-transcript-line" }));
              }
            }

            srtPattern.lastIndex = 0;
            let match: RegExpExecArray | null;
            while ((match = srtPattern.exec(line.text)) !== null) {
              const start = line.from + match.index;
              const end = start + match[0].length;
              const label = formatSrtTimestampLabel(match[0]);
              const startSeconds = parseTimestampToSeconds(match[1]);
              if (timestampLine) continue;
              builder.add(start, end, Decoration.replace({ widget: new SrtTimestampWidget(label, startSeconds), inclusive: true }));
            }

            lastLineNumber = line.number;
            if (line.number >= v.state.doc.lines) break;
            line = v.state.doc.line(line.number + 1);
          }
        }
        return builder.finish();
      }
    }, { decorations: v => v.decorations });

    const snapFilter = EditorState.transactionFilter.of(tr => {
      if (!tr.selection || annotationMode !== "clean") return tr;
      const docText = tr.newDoc.toString();
      annotationPattern.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = annotationPattern.exec(docText)) !== null) {
        const spanStart = m.index;
        const wordStart = spanStart + 1;
        const wordEnd   = wordStart + m[1].length;
        const spanEnd   = spanStart + m[0].length;
        const beforeWord = snapSelectionAroundProtectedRange(tr, {
          from: spanStart,
          to: wordStart - 1,
          leftExit: Math.max(0, spanStart - 1),
          rightExit: wordStart
        });
        if (beforeWord) return beforeWord;

        const afterWord = snapSelectionAroundProtectedRange(tr, {
          from: wordEnd,
          to: spanEnd,
          leftExit: wordEnd,
          rightExit: spanEnd
        });
        if (afterWord) return afterWord;
      }
      return tr;
    });

    const srtSnapFilter = EditorState.transactionFilter.of(tr => {
      if (!tr.selection) return tr;
      const docText = tr.newDoc.toString();
      srtPattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = srtPattern.exec(docText)) !== null) {
        const spanStart = match.index;
        const spanEnd = spanStart + match[0].length;
        const line = tr.newDoc.lineAt(spanStart);
        const timestampLine = isSrtTimestampLine(line.text);
        const snapped = snapSelectionAroundProtectedRange(tr, {
          from: timestampLine ? line.from : spanStart,
          to: timestampLine ? line.to : spanEnd,
          leftExit: timestampLine ? srtLineExitPosition(tr.newDoc, line.number, "left") : Math.max(0, spanStart - 1),
          rightExit: timestampLine ? srtLineExitPosition(tr.newDoc, line.number, "right") : spanEnd
        });
        if (snapped) return snapped;
      }
      return tr;
    });

    return [colorTheme, plugin, plainTheme, plainPlugin, atomicPlugin, srtPlugin, snapFilter, srtSnapFilter];
  }

  function wrapSelectionOrWord(v: EditorView, style: number = 0) {
    const state = v.state;
    const range = state.selection.main;
    const makeInsert = (text: string): string => {
      if (style === 0) return `\`${text}\``;
      const now = new Date();
      const ts = now.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).replace(/,/g, "");
      const name = styleName(style);
      return `\`${text}\`<!-- ${name}, ${ts}: "" -->`;
    };
    if (!range.empty) {
      const insert = makeInsert(state.doc.sliceString(range.from, range.to));
      v.dispatch({ changes: { from: range.from, to: range.to, insert }, selection: { anchor: Math.min(range.from + insert.length + (style > 0 ? 1 : 0), v.state.doc.length) } });
      return true;
    }
    const docText = state.doc.toString();
    const wordRange = wordRangeAt(docText, range.from);
    if (!wordRange) return true;
    const { from, to } = wordRange;
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
        const newStyle = cycleStyleNumber(styleNumberForName(m[2]), delta, false);
        const newName = styleName(newStyle);
        const updated = m[0].replace(/^`([^`]+)`<!--\s*\w+,/, `\`$1\`<!-- ${newName},`);
        currentStyle = newStyle;
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
    : `Style: ${currentStyle}/${highlightStyles.length} (${styleName(currentStyle)})`;
  $: currentStyleColor = styleColor(currentStyle);

  const statusPlugin = ViewPlugin.fromClass(class {
    constructor(v: EditorView) { updateStatusFromView(v); }
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet || u.focusChanged || u.viewportChanged)
        updateStatusFromView(u.view);
      if (u.docChanged) {
        const text = u.state.doc.toString();
        localStorage.setItem("cm6-buffer", text);
        scheduleFileAutosave(text);
      }
    }
  });

  const summaryJumpFlashEffect = StateEffect.define<{ from: number; to: number }>();
  const summaryJumpFlashClearEffect = StateEffect.define<null>();
  const summaryJumpFlashField = StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(value, tr) {
      let decorations = value.map(tr.changes);
      for (const effect of tr.effects) {
        if (effect.is(summaryJumpFlashEffect)) {
          const { from, to } = effect.value;
          decorations = Decoration.set([
            Decoration.mark({ class: "cm-summary-jump-flash" }).range(from, Math.max(from + 1, to))
          ]);
        } else if (effect.is(summaryJumpFlashClearEffect)) {
          decorations = Decoration.none;
        }
      }
      return decorations;
    },
    provide: field => EditorView.decorations.from(field)
  });

  const blockquoteLinePlugin = ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    constructor(v: EditorView) { this.decorations = this.build(v); }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged || u.selectionSet || u.transactions.length > 0)
        this.decorations = this.build(u.view);
    }
    build(v: EditorView): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>();
      const currentLineStart = v.state.doc.lineAt(v.state.selection.main.head).from;
      for (const { from, to } of v.visibleRanges) {
        let pos = from;
        while (pos <= to) {
          const line = v.state.doc.lineAt(pos);
          if (line.text.startsWith(">")) {
            const meta = parseBlockquoteMeta(line.text);
            builder.add(line.from, line.from, Decoration.line({
              class: "cm-blockquote-line",
              attributes: { style: blockquoteStyle(meta) }
            }));
            const showMarkup = annotationMode === "all" || (annotationMode === "raw" && line.from === currentLineStart);
            if (meta.hasComment && !showMarkup) {
              builder.add(
                line.from + meta.commentStart,
                line.from + meta.commentEnd,
                Decoration.replace({ widget: new EmptyWidget(), inclusive: false })
              );
            }
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
      if (update.selectionSet || update.geometryChanged || update.viewportChanged || update.docChanged || update.focusChanged || update.transactions.length) {
        this.updateMarker();
      }
    }

    updateMarker = () => {
      if (this.scheduled) return;
      this.scheduled = true;
      this.view.requestMeasure({
        read: view => {
          const coords = view.coordsAtPos(view.state.selection.main.head);
          if (!coords) return null;
          const scroller = view.scrollDOM;
          const scrollerRect = scroller.getBoundingClientRect();
          const lineHeight = parseFloat(getComputedStyle(view.contentDOM).lineHeight) || 18;
          const cursorHeight = Math.max(1, coords.bottom - coords.top);
          return {
            top: coords.top - scrollerRect.top + scroller.scrollTop - ((lineHeight - cursorHeight) / 2),
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

  function cursorScrollMargin(v: EditorView) {
    const linePx = parseFloat(getComputedStyle(v.contentDOM).lineHeight) || fontSize * lineHeight;
    const viewportHeight = v.scrollDOM.clientHeight;
    if (viewportHeight <= 1) return 0;
    const preferred = Math.max(linePx * 4, Math.min(viewportHeight * 0.24, 140));
    return Math.min(Math.max(0, viewportHeight - 1), preferred);
  }

  function cursorScrollEffect(v: EditorView, head = v.state.selection.main.head) {
    return EditorView.scrollIntoView(head, { y: "nearest", yMargin: cursorScrollMargin(v) });
  }

  const navigation = createNavigationCommands({
    cursorScrollEffect,
    isSrtTimestampLine,
    wordBoundary
  });

  const dblClickBehavior = EditorView.domEventHandlers({
    dblclick(event, v) {
      const pos = v.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos === null) return false;
      const docText = v.state.doc.toString();
      if (annotationMode === "clean") {
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
      }
      const wordRange = wordRangeAt(docText, pos);
      if (!wordRange) return false;
      v.dispatch({ selection: EditorSelection.range(wordRange.from, wordRange.to) });
      return true;
    }
  });

  // Custom keymap — all app-specific bindings
  function buildKeymap() {
    const normal = (fn: (v: EditorView) => boolean) =>
      (v: EditorView) => editorMode === "normal" ? fn(v) : false;

    return Prec.high(keymap.of([
      // Always: Escape returns to normal
      { key: "Escape", run: v => { setMode("normal"); return true; } },
      // Always: F2 enters edit
      { key: "F2", run: v => { setMode("insert"); return true; } },
      { key: "F1", run: () => { showHelp = !showHelp; return true; } },

      // Normal-mode only: Navigation
      { key: "ArrowLeft",        run: normal(v => { cursorCharLeft(v);  return true; }) },
      { key: "ArrowRight",       run: normal(v => { cursorCharRight(v); return true; }) },
      { key: "ArrowUp",          run: normal(v => navigation.moveLineSkippingSrt(v, "up")) },
      { key: "ArrowDown",        run: normal(v => navigation.moveLineSkippingSrt(v, "down")) },
      { key: "Shift-ArrowLeft",  run: normal(v => { selectCharLeft(v);  return true; }) },
      { key: "Shift-ArrowRight", run: normal(v => { selectCharRight(v); return true; }) },
      { key: "Shift-ArrowUp",    run: normal(v => navigation.moveLineSkippingSrt(v, "up", true)) },
      { key: "Shift-ArrowDown",  run: normal(v => navigation.moveLineSkippingSrt(v, "down", true)) },
      { key: "Ctrl-ArrowLeft",        run: normal(v => navigation.moveByWordCount(v, false, 1)) },
      { key: "Ctrl-ArrowRight",       run: normal(v => navigation.moveByWordCount(v, true, 1)) },
      { key: "Ctrl-ArrowUp",          run: normal(v => navigation.paragraphBoundary(v, "start")) },
      { key: "Ctrl-ArrowDown",        run: normal(v => navigation.paragraphBoundary(v, "end")) },
      { key: "Shift-Ctrl-ArrowLeft",  run: normal(v => navigation.moveByWordCount(v, false, 1, true)) },
      { key: "Shift-Ctrl-ArrowRight", run: normal(v => navigation.moveByWordCount(v, true, 1, true)) },
      { key: "Shift-Ctrl-ArrowUp",    run: normal(v => navigation.paragraphBoundary(v, "start", true)) },
      { key: "Shift-Ctrl-ArrowDown",  run: normal(v => navigation.paragraphBoundary(v, "end", true)) },
      { key: "h", run: normal(v => { cursorCharLeft(v);  return true; }) },
      { key: "j", run: normal(v => navigation.moveLineSkippingSrt(v, "down")) },
      { key: "k", run: normal(v => navigation.moveLineSkippingSrt(v, "up")) },
      { key: "l", run: normal(v => { cursorCharRight(v); return true; }) },
      { key: "Ctrl-h", run: normal(v => navigation.moveByWordCount(v, false, 1)) },
      { key: "Ctrl-j", run: normal(v => navigation.paragraphBoundary(v, "end")) },
      { key: "Ctrl-k", run: normal(v => navigation.paragraphBoundary(v, "start")) },
      { key: "Ctrl-l", run: normal(v => navigation.moveByWordCount(v, true, 1)) },
      { key: "w", run: normal(v => navigation.moveLineSkippingSrt(v, "up")) },
      { key: "s", run: normal(v => navigation.moveLineSkippingSrt(v, "down")) },
      { key: "a", run: normal(v => navigation.moveByWordCount(v, false, 1)) },
      { key: "d", run: normal(v => navigation.moveByWordCount(v, true, 1)) },
      { key: "Ctrl-w", run: normal(v => navigation.paragraphBoundary(v, "start")) },
      { key: "Ctrl-s", run: normal(v => navigation.paragraphBoundary(v, "end")) },
      { key: "Ctrl-a", run: normal(v => navigation.moveByWordCount(v, false, 5)) },
      { key: "Ctrl-d", run: normal(v => navigation.moveByWordCount(v, true, 5)) },
      // Shift variants extend selection
      { key: "H", run: normal(v => { selectCharLeft(v);  return true; }) },
      { key: "J", run: normal(v => navigation.moveLineSkippingSrt(v, "down", true)) },
      { key: "K", run: normal(v => navigation.moveLineSkippingSrt(v, "up", true)) },
      { key: "L", run: normal(v => { selectCharRight(v); return true; }) },
      { key: "Shift-Ctrl-h", run: normal(v => navigation.moveByWordCount(v, false, 1, true)) },
      { key: "Shift-Ctrl-j", run: normal(v => navigation.paragraphBoundary(v, "end", true)) },
      { key: "Shift-Ctrl-k", run: normal(v => navigation.paragraphBoundary(v, "start", true)) },
      { key: "Shift-Ctrl-l", run: normal(v => navigation.moveByWordCount(v, true, 1, true)) },
      { key: "W", run: normal(v => navigation.moveLineSkippingSrt(v, "up", true)) },
      { key: "S", run: normal(v => navigation.moveLineSkippingSrt(v, "down", true)) },
      { key: "A", run: normal(v => navigation.moveByWordCount(v, false, 1, true)) },
      { key: "D", run: normal(v => navigation.moveByWordCount(v, true, 1, true)) },
      { key: "Shift-Ctrl-w", run: normal(v => navigation.paragraphBoundary(v, "start", true)) },
      { key: "Shift-Ctrl-s", run: normal(v => navigation.paragraphBoundary(v, "end", true)) },
      { key: "Shift-Ctrl-a", run: normal(v => navigation.moveByWordCount(v, false, 5, true)) },
      { key: "Shift-Ctrl-d", run: normal(v => navigation.moveByWordCount(v, true, 5, true)) },
      // Normal-mode only: Annotation actions
      { key: "Space",  run: normal(v => wrapSelectionOrWord(v, currentStyle)) },
      { key: "Enter",  run: normal(v => handleEnterInAnnotationMode(v)) },
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
      { key: "Alt-r", run: () => { cycleAudioRate(); return true; } },
      { key: "Alt-Space",  run: () => { toggleAudioPlayback(); return true; } },
      { key: "Alt-ArrowLeft",  run: () => { seekAudio(-10); return true; } },
      { key: "Alt-ArrowRight", run: () => { seekAudio(10); return true; } },
      {
        any: (_view, event) =>
          editorMode === "normal" &&
          event.key.length === 1 &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey
      },
    ]));
  }

  function baseExtensions(): Extension[] {
    return [
      dblClickBehavior,
      EditorView.lineWrapping,
      lineNumbers({
        formatNumber: formatEditorLineNumber,
        domEventHandlers: {
          mousedown: (v, line, event) => {
            const docLine = v.state.doc.lineAt(line.from);
            const timestamp = srtTimestampForTranscriptLine(v.state, docLine.number);
            if (!timestamp || timestamp.startSeconds === null) return false;
            event.preventDefault();
            event.stopPropagation();
            jumpAudioToAndPlay(timestamp.startSeconds);
            return true;
          }
        }
      }),
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
      summaryJumpFlashField,
      srtGutterMarkerField,
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
    const onWindowKeydown = (event: KeyboardEvent) => handleWindowKeydown(event);
    window.addEventListener("keydown", onWindowKeydown);
    const editorResizeObserver = new ResizeObserver(() => updateEditorViewportHeight());

    view = new EditorView({
      state: EditorState.create({
        doc: localStorage.getItem("cm6-buffer") ?? starterDoc(),
        extensions: [...baseExtensions()]
      }),
      parent: editorEl
    });

    view.dom.classList.add("mode-normal");
    view.focus();
    updateEditorViewportHeight();
    if (editorEl) editorResizeObserver.observe(editorEl);
    updateStatusFromView(view);
    void restoreAudioFile();

    return () => {
      window.removeEventListener("keydown", onWindowKeydown);
      finishSummaryResize?.();
      editorResizeObserver.disconnect();
      clearAudioTarget();
      view?.destroy();
    };
  });
</script>

<div
  class="app"
  style={`
    --bg: ${gruvbox.bg}; --bg-soft: ${gruvbox.bgSoft}; --bg-hard: ${gruvbox.bgHard};
    --bg-alt: ${gruvbox.bgAlt}; --border: ${gruvbox.border}; --fg: ${gruvbox.fg};
    --internal-border: transparent;
    --fg-muted: ${gruvbox.fgMuted}; --yellow: ${gruvbox.yellow}; --green: ${gruvbox.green};
    --blue: ${gruvbox.blue}; --orange: ${gruvbox.orange}; --selection: ${gruvbox.selection};
    --active-style-color: ${currentStyleColor};
    --active-line-annotate: color-mix(in srgb, var(--active-style-color) 34%, transparent);
    --active-line-edit: #2f4a3aaa;
    --active-gutter-annotate: color-mix(in srgb, var(--active-style-color) 58%, var(--bg-hard));
    --active-gutter-edit: #2f4a3a;
  `}
>
  <div class="toolbar">
    <div class="title">textAnnotate</div>
    <span class="subtitle">paste or load .srt, .txt, .md, .docx, .pdf</span>
    <button class="toolbar-btn help-btn" on:click={() => showHelp = !showHelp} title="Keyboard shortcuts (?)">?</button>
  </div>

  <div
    class="main"
    class:summary-collapsed={summaryCollapsed}
    class:summary-fullscreen={summaryFullscreen}
    style={`
      --summary-sidebar-width: ${summarySidebarWidth}px;
      --summary-font-size: ${activeSummaryFontSize}px;
      --summary-meta-font-size: ${activeSummaryMetaFontSize}px;
      --summary-timestamp-font-size: ${activeSummaryTimestampFontSize}px;
      --summary-content-pad-left: ${summaryFullscreen ? padLeft : 0}px;
      --summary-content-pad-right: ${summaryFullscreen ? padRight : 0}px;
      --summary-content-pad-top: ${summaryFullscreen ? padTop : 0}px;
      --summary-content-pad-bottom: ${summaryFullscreen ? padBottom : 0}px;
      --summary-line-height: ${summaryFullscreen ? lineHeight : 1.28};
      --summary-paragraph-spacing: ${summaryFullscreen ? paragraphSpacing : 0}em;
    `}
  >
    <div class="sidebar">
      <div class="sidebar-section">
        <input type="file" accept=".srt,.txt,.md,.docx,.pdf,.mp3,.wav,.m4a,.ogg,.oga,.webm,.aac,.flac,.mp4,.mov,.mkv" multiple style="display:none" bind:this={fileInput} on:change={loadFile} />
        <button class="sidebar-label load-btn" on:click={() => fileInput.click()}>LOAD FILE(S)...</button>
        <div class="file-actions">
          <button class="sidebar-label load-btn" on:click={saveDocument}>Save</button>
          <button class="sidebar-label load-btn" on:click={exportCleanHtml}>Export</button>
        </div>
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
        <div class="slider-row" data-tooltip="Left padding"><span class="slider-lbl">L</span><input type="range" min="0" max="400" step="4" bind:value={padLeft}   class="slider" aria-label="Left padding" /><span class="slider-val">{padLeft}</span></div>
        <div class="slider-row" data-tooltip="Right padding"><span class="slider-lbl">R</span><input type="range" min="0" max="400" step="4" bind:value={padRight}  class="slider" aria-label="Right padding" /><span class="slider-val">{padRight}</span></div>
        <div class="slider-row" data-tooltip="Top padding"><span class="slider-lbl">T</span><input type="range" min="0" max="400" step="4" bind:value={padTop}    class="slider" aria-label="Top padding" /><span class="slider-val">{padTop}</span></div>
        <div class="slider-row" data-tooltip="Bottom padding"><span class="slider-lbl">B</span><input type="range" min="0" max={Math.max(0, editorViewportHeight - 48)} step="4" bind:value={padBottom} class="slider" aria-label="Bottom padding" /><span class="slider-val">{padBottom}</span></div>
        <div class="slider-row" data-tooltip="Line height"><span class="slider-lbl">LH</span><input type="range" min="1" max="3" step="0.05" bind:value={lineHeight} class="slider" aria-label="Line height" /><span class="slider-val">{lineHeight.toFixed(2)}</span></div>
        <div class="slider-row" data-tooltip="Spacing after each line"><span class="slider-lbl">PS</span><input type="range" min="0" max="2" step="0.05" bind:value={paragraphSpacing} class="slider" aria-label="Paragraph spacing" /><span class="slider-val">{paragraphSpacing.toFixed(2)}</span></div>
        <div class="slider-row" data-tooltip="Font size"><span class="slider-lbl">FS</span><input type="range" min="10" max="28" step="1" bind:value={fontSize} class="slider" aria-label="Font size" /><span class="slider-val">{fontSize}</span></div>
        <div class="slider-row" data-tooltip="Notes alignment">
          <span class="slider-lbl">A</span>
          <input type="range" min="0" max="2" step="1" class="slider"
            aria-label="Notes alignment"
            disabled={!blockquoteActive}
            value={blockquoteAlign === "left" ? 0 : blockquoteAlign === "center" ? 1 : 2}
            on:input={e => {
              const align = ["left", "center", "right"][+(e.target as HTMLInputElement).value] as BlockquoteAlign;
              if (view) updateCurrentBlockquote(view, { align });
            }} />
          <span class="slider-val">{blockquoteAlign[0].toUpperCase()}</span>
        </div>
        <div class="slider-row" data-tooltip="Notes width">
          <span class="slider-lbl">BG</span>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            class="slider"
            aria-label="Notes width"
            disabled={!blockquoteActive}
            value={blockquoteBgWidth}
            on:input={e => {
              if (view) updateCurrentBlockquote(view, { width: +(e.target as HTMLInputElement).value });
            }}
          />
          <span class="slider-val">{blockquoteBgWidth}</span>
        </div>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-label">Display</div>
        <label class="sidebar-toggle">
          <input type="radio" name="annotationMode" value="clean"
            checked={annotationMode === "clean"}
            on:change={() => { annotationMode = "clean"; view?.dispatch({}); view?.focus(); }} />
          Clean
        </label>
        <label class="sidebar-toggle">
          <input type="radio" name="annotationMode" value="raw"
            checked={annotationMode === "raw"}
            on:change={() => { annotationMode = "raw"; view?.dispatch({}); view?.focus(); }} />
          Raw (current)
        </label>
        <label class="sidebar-toggle">
          <input type="radio" name="annotationMode" value="all"
            checked={annotationMode === "all"}
            on:change={() => { annotationMode = "all"; view?.dispatch({}); view?.focus(); }} />
          Raw (all)
        </label>
      </div>

    </div>

    <div class="editor" bind:this={editorEl}></div>

    <aside class="summary-sidebar" class:collapsed={summaryCollapsed} class:fullscreen={summaryFullscreen} class:resizing={resizingSummarySidebar} aria-label="Annotation summary">
      {#if !summaryCollapsed && !summaryFullscreen}
        <button
          class="summary-resize-handle"
          type="button"
          aria-label="Resize summary sidebar"
          title="Drag to resize summary"
          on:pointerdown={startSummaryResize}
          on:keydown={handleSummaryResizeKeydown}
        ></button>
      {/if}
      <div class="summary-header">
        {#if !summaryCollapsed}
          <div class="summary-title">Summary</div>
        {/if}
        <div class="summary-header-actions">
          {#if !summaryCollapsed}
            <button
              class="summary-icon-btn"
              type="button"
              title={summaryFullscreen ? "Exit summary fullscreen" : "Summary fullscreen"}
              aria-label={summaryFullscreen ? "Exit summary fullscreen" : "Summary fullscreen"}
              aria-pressed={summaryFullscreen}
              on:click={toggleSummaryFullscreen}
            >
              {summaryFullscreen ? "×" : "⛶"}
            </button>
          {/if}
          <button
            class="summary-icon-btn summary-collapse-btn"
            type="button"
            title={summaryCollapsed ? "Show summary" : "Hide summary"}
            aria-label={summaryCollapsed ? "Show summary" : "Hide summary"}
            on:click={toggleSummaryCollapsed}
          >
            {summaryCollapsed ? "‹" : "›"}
          </button>
        </div>
      </div>
      {#if summaryCollapsed}
        <div class="summary-collapsed-count">{summaryItems.length}</div>
      {:else}
      <div class="summary-list">
        {#if summaryItems.length === 0}
          <div class="summary-empty">No annotations</div>
        {:else}
          {#each summarySections as section (section.id)}
            {#if section.kind === "item"}
              <div
                class="summary-item"
                role="button"
                tabindex="0"
                on:click={() => jumpToSummaryItem(section.item)}
                on:keydown={event => handleSummaryItemKeydown(event, section.item)}
              >
                {#if section.item.type === "annotation"}
                  <span class="summary-swatch" style="background: {section.item.color}"></span>
                    <span class="summary-body">
                      <span class="summary-meta">
                      {#if editingSummaryTitleKey === section.item.id}
                        <input
                          class="summary-title-input"
                          bind:value={summaryTitleDraft}
                          aria-label="Annotation title"
                          autofocus
                          on:click={event => event.stopPropagation()}
                          on:focus={event => (event.target as HTMLInputElement).select()}
                          on:blur={() => saveSummaryTitle([section.item])}
                          on:keydown={event => handleSummaryTitleKeydown(event, [section.item])}
                        />
                      {:else}
                        <button
                          class="summary-title-action"
                          type="button"
                          on:click={event => startSummaryTitleEdit(event, section.item.id, section.item)}
                          on:keydown={event => event.stopPropagation()}
                        >
                          {summaryAnnotationTitle(section.item)}
                        </button>
                      {/if}
                      <span class="summary-heading-timestamp">{summaryTimestamp(section.item.timestamp)}</span>
                    </span>
                    <span class="summary-text summary-sentence">
                      <span>{section.item.context.before}</span><mark class="summary-context-hit" style="background: {section.item.color}; color: {contrastColor(section.item.color)}">{section.item.context.text}</mark><span>{section.item.context.after}</span>
                    </span>
                    {#if section.item.comment}
                      <button class="summary-comment-action has-comment" type="button" on:click={event => editSummaryAnnotationComment(event, section.item)} on:keydown={event => event.stopPropagation()}>
                        {section.item.comment}
                      </button>
                    {:else}
                      <button class="summary-comment-action" type="button" on:click={event => editSummaryAnnotationComment(event, section.item)} on:keydown={event => event.stopPropagation()}>
                        Add comment
                      </button>
                    {/if}
                  </span>
                {:else}
                  <span class="summary-note-mark">󰎞</span>
                  <span class="summary-body">
                    <span class="summary-meta">
                      <span>Notes</span>
                      <span>Ln {section.item.line}</span>
                    </span>
                    <span class="summary-text">{section.item.text}</span>
                  </span>
                {/if}
              </div>
            {:else}
              <div
                class="summary-group-header"
                class:open={expandedSummaryCategories[section.id]}
                role="button"
                tabindex="0"
                aria-expanded={!!expandedSummaryCategories[section.id]}
                on:click={() => toggleSummaryCategory(section.id)}
                on:keydown={event => handleSummaryGroupKeydown(event, section)}
              >
                {#if section.itemType === "blockquote"}
                  <span class="summary-note-mark">󰎞</span>
                {:else}
                  <span class="summary-swatch" style="background: {section.color}"></span>
                {/if}
                {#if section.itemType === "annotation" && editingSummaryTitleKey === section.id}
                  <input
                    class="summary-title-input summary-group-title-input"
                    bind:value={summaryTitleDraft}
                    aria-label="Annotation group title"
                    autofocus
                    on:click={event => event.stopPropagation()}
                    on:focus={event => (event.target as HTMLInputElement).select()}
                    on:blur={() => saveSummaryTitle(summaryAnnotationItems(section.items))}
                    on:keydown={event => handleSummaryTitleKeydown(event, summaryAnnotationItems(section.items))}
                  />
                {:else if section.itemType === "annotation"}
                  <button
                    class="summary-group-label summary-title-action"
                    type="button"
                    on:click={event => startSummaryGroupTitleEdit(event, section)}
                    on:keydown={event => event.stopPropagation()}
                  >
                    {section.label}
                  </button>
                {:else}
                  <span class="summary-group-label">{section.label}</span>
                {/if}
                <span class="summary-group-count">{section.count}</span>
                <span class="summary-group-chevron">›</span>
              </div>
              {#if expandedSummaryCategories[section.id]}
                {#each section.items as item (item.id)}
                  <div
                    class="summary-item summary-item-nested"
                    role="button"
                    tabindex="0"
                    on:click={() => jumpToSummaryItem(item)}
                    on:keydown={event => handleSummaryItemKeydown(event, item)}
                  >
                    {#if item.type === "annotation"}
                      <span class="summary-swatch" style="background: {item.color}"></span>
                      <span class="summary-body">
                        <span class="summary-meta">
                          {#if editingSummaryTitleKey === item.id}
                            <input
                              class="summary-title-input"
                              bind:value={summaryTitleDraft}
                              aria-label="Annotation title"
                              autofocus
                              on:click={event => event.stopPropagation()}
                              on:focus={event => (event.target as HTMLInputElement).select()}
                              on:blur={() => saveSummaryTitle([item])}
                              on:keydown={event => handleSummaryTitleKeydown(event, [item])}
                            />
                          {:else}
                            <button
                              class="summary-title-action"
                              type="button"
                              on:click={event => startSummaryTitleEdit(event, item.id, item)}
                              on:keydown={event => event.stopPropagation()}
                            >
                              {summaryAnnotationTitle(item)}
                            </button>
                          {/if}
                          <span class="summary-heading-timestamp">{summaryTimestamp(item.timestamp)}</span>
                        </span>
                        <span class="summary-text summary-sentence">
                          <span>{item.context.before}</span><mark class="summary-context-hit" style="background: {item.color}; color: {contrastColor(item.color)}">{item.context.text}</mark><span>{item.context.after}</span>
                        </span>
                        {#if item.comment}
                          <button class="summary-comment-action has-comment" type="button" on:click={event => editSummaryAnnotationComment(event, item)} on:keydown={event => event.stopPropagation()}>
                            {item.comment}
                          </button>
                        {:else}
                          <button class="summary-comment-action" type="button" on:click={event => editSummaryAnnotationComment(event, item)} on:keydown={event => event.stopPropagation()}>
                            Add comment
                          </button>
                        {/if}
                      </span>
                    {:else}
                      <span class="summary-note-mark">󰎞</span>
                      <span class="summary-body">
                        <span class="summary-meta">
                          <span>Notes</span>
                          <span>Ln {item.line}</span>
                        </span>
                        <span class="summary-text">{item.text}</span>
                      </span>
                    {/if}
                  </div>
                {/each}
              {/if}
            {/if}
          {/each}
        {/if}
      </div>
      {/if}
    </aside>
  </div>

  {#if !summaryFullscreen}
    <div class="statusbar">
      <div class="status-left">
        <span class="segment mode" style="color: {editorMode === 'insert' ? gruvbox.green : gruvbox.orange}">{editorModeLabel}</span>
        <span class="segment">{selectionInfo}</span>
        <span class="segment">{wordCountInfo}</span>
        <span class="segment style" style="color: {currentStyleColor}">{styleLabel}</span>
      </div>
      <div class="status-center">
        {#if audioUrl}
          <div class="audio-widget">
            <span class="audio-name">{audioFileName}</span>
            <span class="audio-sep">|</span>
            <button class="audio-glyph" type="button" on:click={() => seekAudioAndPlay(-10)} title="Back 10 seconds" aria-label="Back 10 seconds">&lt;&lt;</button>
            <button class="audio-glyph play" type="button" on:click={toggleAudioPlayback} title="Play / pause" aria-label="Play / pause">{audioPlaying ? "⏸" : "▶"}</button>
            <button class="audio-glyph" type="button" on:click={() => seekAudioAndPlay(10)} title="Forward 10 seconds" aria-label="Forward 10 seconds">&gt;&gt;</button>
            <span class="audio-sep">|</span>
            <button class="audio-rate-text" type="button" on:click={cycleAudioRate} aria-label="Playback speed" title="Playback speed">{audioRateText}</button>
            <span class="audio-sep">|</span>
            <span class="audio-time">{formatAudioTime(audioCurrentTime)} / {formatAudioTime(audioDuration)}</span>
          </div>
        {/if}
      </div>
      <div class="status-right">
        <span class="segment">Ln {line}</span>
        <span class="segment">Col {column}</span>
        <span class="segment syntax">{loadedFileType}</span>
      </div>
    </div>
  {/if}

  <audio
    bind:this={audioElement}
    src={audioUrl}
    style="display:none"
    on:loadedmetadata={() => {
      audioDuration = audioElement?.duration ?? 0;
      audioLoaded = true;
      if (audioElement) audioElement.playbackRate = audioRates[audioRateIndex];
    }}
    on:timeupdate={() => {
      audioCurrentTime = audioElement?.currentTime ?? 0;
    }}
    on:play={() => {
      audioPlaying = true;
    }}
    on:pause={() => {
      audioPlaying = false;
    }}
    on:ended={() => {
      audioPlaying = false;
    }}
  ></audio>

  {#if showHelp}
    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
    <div class="help-overlay" on:click|self={() => showHelp = false}>
      <div class="help-panel">
        <div class="help-header">
          <span class="help-title">Keyboard Shortcuts</span>
          <button class="help-close" on:click={() => showHelp = false}>✕</button>
        </div>
        <div class="keybinds">
          {#each helpSections as section}
            <section class="kb-section">
              <div class="kb-section-label">{helpShortcutGroupTitle(section.title)}</div>
              <div class="kb-group">
                {#each section.items as [keyLabel, description]}
                  <span class="kb-key">{helpShortcutLabel(keyLabel)}</span><span class="kb-desc">{helpShortcutDescription(description)}</span>
                {/each}
              </div>
            </section>
          {/each}
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
