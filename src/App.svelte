<script lang="ts">
  import { onMount, tick } from "svelte";
  import { Compartment, EditorState, Prec, type Extension } from "@codemirror/state";
  import {
    EditorView, keymap, lineNumbers, drawSelection, runScopeHandlers,
    highlightActiveLineGutter, ViewPlugin, Decoration,
    GutterMarker, lineNumberMarkers,
    WidgetType, showTooltip, type Tooltip,
    type DecorationSet, type ViewUpdate
  } from "@codemirror/view";
  import { EditorSelection, RangeSet, StateEffect, StateField, type Range, type Transaction, type TransactionSpec } from "@codemirror/state";
  import {
    defaultKeymap, history, historyKeymap, undo, redo,
    cursorLineStart, cursorLineEnd,
    cursorCharLeft, cursorCharRight,
    selectCharLeft, selectCharRight,
    selectLineStart, selectLineEnd
  } from "@codemirror/commands";
  import { searchKeymap } from "@codemirror/search";
  import { RangeSetBuilder } from "@codemirror/state";
  import {
    indentOnInput, bracketMatching,
    syntaxHighlighting
  } from "@codemirror/language";
  import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
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
  import {
    buildEditorTheme,
    buildHighlightStyle,
    contrastColor,
    getTheme,
    gruvbox,
    highlightStyles as baseHighlightStyles,
    type ThemeMode,
    type ThemePalette
  } from "./lib/theme";
  import {
    documentHasSrtTimestamps,
    formatSrtTimestampLabel,
    formatSrtTranscript,
    isSrtTimestampLine,
    parseTimestampToSeconds,
    srtLineExitPosition,
    srtPattern,
    srtTimestampForTranscriptLine
  } from "./lib/srt";
  import PdfReviewModal from "./lib/PdfReviewModal.svelte";

  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

  const unifiedPreferencesStorageKey = "textAnnotate-preferences";
  const layoutStorageKey = "cm6-layout-settings";
  const appSettingsStorageKey = "textAnnotate-settings";
  const openAiApiKeyStorageKey = "textAnnotate-openai-api-key";
  const themeStorageKey = "cm6-theme";
  const fontFamilyOptions = [
    { name: "ADega Serif", css: '"ADega Serif", serif' },
    { name: "Alte Haas Grotesk", css: '"Alte Haas Grotesk", sans-serif' },
    { name: "Amelia Serif", css: '"Amelia Serif", serif' },
    { name: "Borgen", css: '"Borgen", sans-serif' },
    { name: "Bowman", css: '"Bowman", fantasy' },
    { name: "Calling Code", css: '"Calling Code", monospace' },
    { name: "Caviar Dreams", css: '"Caviar Dreams", sans-serif' },
    { name: "Cherry Monospace", css: '"Cherry Monospace", monospace' },
    { name: "Coolvetica", css: '"Coolvetica", sans-serif' },
    { name: "DEC Terminal Modern", css: '"DEC Terminal Modern", monospace' },
    { name: "Erika Type", css: '"Erika Type", serif' },
    { name: "F25 Bank Printer", css: '"F25 Bank Printer", monospace' },
    { name: "Flexi IBM VGA False", css: '"Flexi IBM VGA False", monospace' },
    { name: "Geo Sans Light", css: '"Geo Sans Light", sans-serif' },
    { name: "KG Holocene", css: '"KG Holocene", fantasy' },
    { name: "Louis George Cafe", css: '"Louis George Cafe", sans-serif' },
    { name: "Monomod", css: '"Monomod", monospace' },
    { name: "Monterchi Serif", css: '"Monterchi Serif", serif' },
    { name: "Neuton", css: '"Neuton", serif' },
    { name: "Nouveau IBM", css: '"Nouveau IBM", monospace' },
    { name: "Old Newspaper Types", css: '"Old Newspaper Types", serif' },
    { name: "Paradroid Mono", css: '"Paradroid Mono", monospace' },
    { name: "Quicksand", css: '"Quicksand", sans-serif' },
    { name: "Remingtoned Type", css: '"Remingtoned Type", monospace' },
    { name: "Semi Coder", css: '"Semi Coder", monospace' },
    { name: "Simply Mono", css: '"Simply Mono", monospace' },
    { name: "String Literal", css: '"String Literal", monospace' },
    { name: "String Variable", css: '"String Variable", monospace' },
    { name: "Times Sans Serif", css: '"Times Sans Serif", sans-serif' },
    { name: "Tox Typewriter", css: '"Tox Typewriter", monospace' },
    { name: "Traveling Typewriter", css: '"Traveling Typewriter", monospace' },
    { name: "TT Interphases Pro", css: '"TT Interphases Pro", sans-serif' },
    { name: "TT Interphases Pro Mono", css: '"TT Interphases Pro Mono", monospace' },
    { name: "Typori", css: '"Typori", sans-serif' }
  ] as const;
  const defaultFontFamilyName = "Calling Code";

  let editorEl: HTMLDivElement;
  let view: EditorView;
  let fileInput: HTMLInputElement;
  const initialLayoutSettings = loadLayoutSettings();
  let padLeft = initialLayoutSettings.padLeft ?? 40;
  let padRight = initialLayoutSettings.padRight ?? 40;
  let padTop = initialLayoutSettings.padTop ?? 16;
  let padBottom = initialLayoutSettings.padBottom ?? 64;
  let editorViewportHeight = 0;
  let lineHeight = initialLayoutSettings.lineHeight ?? 1.6;
  let fontSize = initialLayoutSettings.fontSize ?? 14;
  let paragraphSpacing = initialLayoutSettings.paragraphSpacing ?? 0;
  let currentLineHighlightStyle: "fill" | "underline" | "borders" = initialLayoutSettings.currentLineHighlightStyle ?? "fill";
  let currentLineHighlightOpacity = initialLayoutSettings.currentLineHighlightOpacity ?? 0.34;
  let columnGuideThickness = initialLayoutSettings.columnGuideThickness ?? 1;
  let columnStride = initialLayoutSettings.columnStride ?? 40;
  let layoutFontFamilyName = initialLayoutSettings.fontFamilyName ?? defaultFontFamilyName;
  let randomizeFontOnLoad = initialLayoutSettings.randomizeFontOnLoad ?? false;
  let showHelp = false;
  let settingsOpen = false;
  let settingsPersistenceReady = false;
  let settingsButtonEl: HTMLButtonElement | null = null;
  let settingsPopoverEl: HTMLDivElement | null = null;
  type SettingsTab = "markup" | "layout" | "transcribe";
  type AnnotationMode = "clean" | "raw" | "all";
  type AppSettings = {
    annotationMode: AnnotationMode;
    settingsTab: SettingsTab;
    rememberOpenAiApiKey: boolean;
    transcriptionModel: string;
    transcriptionPrompt: string;
  };
  const initialAppSettings = loadAppSettings();
  let settingsTab: SettingsTab = initialAppSettings.settingsTab;
  let divideImportSentences = initialLayoutSettings.divideImportSentences ?? true;
  let pdfModalOpen = false;
  let pdfDraftText = "";
  let pdfSourceLines: string[] = [];
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
  let audioSourceFile: File | null = null;
  let audioRateIndex = 0;
  const audioRates = [1, 1.5, 2];
  const mediaSeekSeconds = 10;
  const manualPauseRewindSeconds = 3;
  type TtsSegment = { text: string; from: number; to: number };
  let ttsAvailable = false;
  let ttsSpeaking = false;
  let ttsPaused = false;
  let ttsSegments: TtsSegment[] = [];
  let ttsIndex = 0;
  let ttsRunId = 0;
  let ttsStatus = "";
  let ttsSpeakTimer: ReturnType<typeof setTimeout> | null = null;
  let ttsUtterance: SpeechSynthesisUtterance | null = null;
  const audioDbName = "textAnnotate-state";
  const audioStoreName = "audio";
  const mediaExtensions = [".mp3", ".wav", ".m4a", ".ogg", ".oga", ".webm", ".aac", ".flac", ".mp4", ".mov", ".mkv"];
  let openAiApiKey = "";
  let rememberOpenAiApiKey = initialAppSettings.rememberOpenAiApiKey;
  let transcriptionModel = initialAppSettings.transcriptionModel;
  let transcriptionPrompt = initialAppSettings.transcriptionPrompt;
  let transcriptionBusy = false;
  let transcriptionStatus = "";
  let transcriptionError = "";
  let themeMode = loadThemeMode();
  let loadedFileType = "Markdown";
  $: if (audioElement) audioElement.playbackRate = audioRates[audioRateIndex];
  $: audioRateText = audioRateLabel();
  $: showTtsWidget = ttsAvailable && !audioUrl && loadedFileType !== "SRT";
  $: ttsProgressText = ttsStatus || (ttsSegments.length ? `${Math.min(ttsIndex + 1, ttsSegments.length)}/${ttsSegments.length}` : "ready");

  let currentStyle = 0;
  type AnnotationStyle = { name: string; color: string; colorName?: string; custom?: boolean };
  type AnnotationVariant = "fill" | "box" | "underline" | "rail" | "bars";
  const annotationVariants: AnnotationVariant[] = ["fill", "box", "underline", "rail", "bars"];
  const namedStyleColors = [
    { name: "steel", color: "#83a598" },
    { name: "orange", color: "#fe8019" },
    { name: "periwinkle", color: "#8370d0" },
    { name: "sand", color: "#d8bd7f" },
    { name: "mint", color: "#6fc6a4" },
    { name: "denim", color: "#3f5f9f" },
    { name: "yellow", color: "#fabd2f" },
    { name: "indigo", color: "#4f46e5" },
    { name: "brown", color: "#8f6f3f" },
    { name: "slate", color: "#586e75" },
    { name: "sky", color: "#57a0d5" },
    { name: "rosewood", color: "#8f3f4d" },
    { name: "purple", color: "#d3869b" }
  ];
  let currentAnnotationVariant: AnnotationVariant = "fill";
  let variantPickerOpen = false;
  let addStyleModalOpen = false;
  let newStyleColorName = "steel";
  let newStyleName = newStyleColorName;
  let annotationMode: AnnotationMode = initialAppSettings.annotationMode;
  let blockquoteAlign: "left" | "center" | "right" = "left";
  let blockquoteBgWidth = 100;
  let blockquoteActive = false;
  let blockquoteEditReturnAnchor: number | null = null;
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
  type ReorderDragState = { kind: "summary"; id: string } | null;
  type ReorderDropTarget = { kind: "summary"; id: string; after: boolean } | null;
  let summaryItems: SummaryItem[] = [];
  let summarySections: SummarySection[] = [];
  let summaryCategoryOrder: string[] = [];
  let expandedSummaryCategories: Record<string, boolean> = {};
  $: orderedSummarySections = orderSummarySections(summarySections, summaryCategoryOrder);
  $: summaryGroupIds = orderedSummarySections.filter(section => section.kind === "group").map(section => section.id);
  $: summaryAnnotationGroupIds = orderedSummarySections
    .filter(section => section.kind === "group" && section.itemType === "annotation")
    .map(section => section.id);
  $: summaryAllGroupsExpanded = summaryGroupIds.length > 0 && summaryGroupIds.every(id => expandedSummaryCategories[id]);
  let reorderDragState: ReorderDragState = null;
  let reorderDropTarget: ReorderDropTarget = null;
  let summaryCollapsed = true;
  let summaryFullscreen = false;
  let summarySidebarWidth = 320;
  let editingSummaryTitleKey: string | null = null;
  let summaryTitleDraft = "";
  let editingStyleTitleName: string | null = null;
  let styleTitleDraft = "";
  let styleTitleInput: HTMLInputElement | null = null;
  let editingStyleKeyName: string | null = null;
  let styleKeyDraft = "";
  let styleKeyInput: HTMLInputElement | null = null;
  let resizingSummarySidebar = false;
  let finishSummaryResize: (() => void) | null = null;
  let finishRightPaddingDrag: (() => void) | null = null;
  const summarySidebarMinWidth = 240;
  const summarySidebarMaxWidth = 720;
  const customStylesStorageKey = "cm6-custom-styles";
  const styleTitlesStorageKey = "cm6-style-titles";
  const styleKeysStorageKey = "cm6-style-keys";
  const defaultStyleKeyOrder = ["1", "2", "3"];
  const reservedStyleKeys = new Set(["h", "j", "k", "l", "w", "a", "s", "d", "c", "q", "e", "n", "u", "x", "?", " "]);
  let customStyles = loadCustomStyles();
  let styleTitles = loadStyleTitles();
  let styleKeys = loadStyleKeys();
  const themeCompartment = new Compartment();
  $: activeTheme = getTheme(themeMode);
  $: activeThemeName = themeMode === "nord" ? "Nord" : "Gruvbox";
  $: highlightStyles = currentHighlightStyles(activeTheme);
  $: layoutFontFamilyCss = fontFamilyCssForName(layoutFontFamilyName);
  $: if (settingsPersistenceReady) {
    padLeft;
    padRight;
    padTop;
    padBottom;
    lineHeight;
    fontSize;
    paragraphSpacing;
    layoutFontFamilyName;
    randomizeFontOnLoad;
    currentLineHighlightStyle;
    currentLineHighlightOpacity;
    columnGuideThickness;
    columnStride;
    divideImportSentences;
    persistLayoutSettings();
  }
  $: if (settingsPersistenceReady) {
    annotationMode;
    settingsTab;
    rememberOpenAiApiKey;
    transcriptionModel;
    transcriptionPrompt;
    persistAppSettings();
  }
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
    audioSourceFile = null;
    resetTtsState();
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
    audioSourceFile = file;
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
    else pauseAudioFromUser();
  }

  function pauseAudioFromUser() {
    if (!audioElement || !audioLoaded || audioElement.paused) return;
    audioElement.pause();
    seekAudio(-manualPauseRewindSeconds);
  }

  function toggleMediaPlayback() {
    if (audioUrl) toggleAudioPlayback();
    else toggleTtsPlayback();
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

  function speechSynth() {
    return typeof window === "undefined" ? null : window.speechSynthesis;
  }

  function refreshTtsVoices() {
    const voices = speechSynth()?.getVoices() ?? [];
    if (voices.length && ttsStatus === "no voice") ttsStatus = "";
    return voices;
  }

  function preferredTtsVoice(voices: SpeechSynthesisVoice[]) {
    const isEnglish = (voice: SpeechSynthesisVoice) => voice.lang.toLowerCase().startsWith("en");
    return voices.find(voice => voice.localService && isEnglish(voice)) ??
      voices.find(isEnglish) ??
      voices.find(voice => voice.default) ??
      voices.find(voice => voice.localService) ??
      null;
  }

  function resetTtsState() {
    ttsRunId += 1;
    if (ttsSpeakTimer) {
      clearTimeout(ttsSpeakTimer);
      ttsSpeakTimer = null;
    }
    speechSynth()?.cancel();
    ttsUtterance = null;
    ttsSpeaking = false;
    ttsPaused = false;
    ttsSegments = [];
    ttsIndex = 0;
    ttsStatus = "";
  }

  function cleanTtsLine(text: string) {
    return summaryVisibleText(text
      .replace(/^\s*#{1,6}\s+/, "")
      .replace(/^\s*[-*+]\s+/, "")
      .replace(/^\s*\d+[.)]\s+/, ""))
      .trim();
  }

  function splitTtsText(text: string) {
    const pieces = text.match(/[^.!?]+[.!?]*/g) ?? [text];
    const chunks: string[] = [];
    let current = "";
    for (const piece of pieces.map(part => part.trim()).filter(Boolean)) {
      if (current && `${current} ${piece}`.length > 240) {
        chunks.push(current);
        current = piece;
      } else {
        current = current ? `${current} ${piece}` : piece;
      }
    }
    if (current) chunks.push(current);
    return chunks.length ? chunks : [text];
  }

  function buildTtsSegments() {
    if (!view) return { segments: [] as TtsSegment[], startIndex: 0 };
    const state = view.state;
    const selection = state.selection.main;
    const doc = state.doc;
    const segments: TtsSegment[] = [];

    const addLineSegments = (from: number, to: number, lineText: string) => {
      const cleaned = cleanTtsLine(lineText);
      if (!cleaned) return;
      for (const chunk of splitTtsText(cleaned)) segments.push({ text: chunk, from, to });
    };

    if (!selection.empty) {
      addLineSegments(selection.from, selection.to, state.sliceDoc(selection.from, selection.to));
      return { segments, startIndex: 0 };
    }

    for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber += 1) {
      const lineInfo = doc.line(lineNumber);
      if (isSrtTimestampLine(lineInfo.text)) continue;
      addLineSegments(lineInfo.from, lineInfo.to, lineInfo.text);
    }

    const head = selection.head;
    const foundIndex = segments.findIndex(segment => segment.to >= head);
    const startIndex = foundIndex < 0 ? Math.max(0, segments.length - 1) : foundIndex;
    return { segments, startIndex };
  }

  function prepareTtsSegments() {
    const result = buildTtsSegments();
    ttsSegments = result.segments;
    ttsIndex = result.startIndex;
    ttsStatus = ttsSegments.length ? "" : "no text";
    return ttsSegments.length > 0;
  }

  function speakTtsSegment(index: number, useBrowserDefaultVoice = false) {
    const synth = speechSynth();
    const segment = ttsSegments[index];
    const Utterance = typeof window === "undefined" ? null : window.SpeechSynthesisUtterance;
    if (!synth || !Utterance) {
      ttsStatus = "unavailable";
      return;
    }
    if (!segment) return;

    ttsRunId += 1;
    const runId = ttsRunId;
    if (ttsSpeakTimer) {
      clearTimeout(ttsSpeakTimer);
      ttsSpeakTimer = null;
    }
    const replacingSpeech = synth.speaking || synth.pending || !!ttsUtterance;
    if (replacingSpeech) synth.cancel();

    const voices = refreshTtsVoices();
    if (!voices.length) {
      ttsUtterance = null;
      ttsSpeaking = false;
      ttsPaused = false;
      ttsStatus = "no voice";
      return;
    }

    const utterance = new Utterance(segment.text);
    const voice = useBrowserDefaultVoice ? null : preferredTtsVoice(voices);
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang ?? "en-US";
    utterance.rate = audioRates[audioRateIndex];
    utterance.onstart = () => {
      if (runId !== ttsRunId) return;
      ttsStatus = "";
      ttsSpeaking = true;
      ttsPaused = false;
    };
    utterance.onend = () => {
      if (runId !== ttsRunId) return;
      if (ttsIndex < ttsSegments.length - 1) {
        ttsIndex += 1;
        speakTtsSegment(ttsIndex);
        return;
      }
      ttsUtterance = null;
      ttsSpeaking = false;
      ttsPaused = false;
      ttsStatus = "";
    };
    utterance.onerror = event => {
      if (runId !== ttsRunId) return;
      ttsUtterance = null;
      ttsSpeaking = false;
      ttsPaused = false;
      if (!useBrowserDefaultVoice && utterance.voice) {
        ttsStatus = "retrying";
        speakTtsSegment(index, true);
        return;
      }
      ttsStatus = event.error === "interrupted" || event.error === "canceled" ? "" : event.error;
      if (ttsStatus) console.warn("TTS failed", event.error);
    };

    ttsUtterance = utterance;
    ttsIndex = index;
    ttsSpeaking = true;
    ttsPaused = false;
    ttsStatus = "queued";
    const startSpeaking = () => {
      if (runId !== ttsRunId) return;
      ttsSpeakTimer = null;
      const currentSynth = speechSynth();
      if (!currentSynth) {
        ttsStatus = "unavailable";
        ttsSpeaking = false;
        return;
      }
      currentSynth.resume();
      currentSynth.speak(utterance);
      setTimeout(() => {
        if (runId !== ttsRunId || ttsUtterance !== utterance || currentSynth.speaking || currentSynth.pending) return;
        ttsSpeaking = false;
        ttsPaused = false;
        ttsStatus = "no voice";
      }, 1200);
    };

    if (replacingSpeech) ttsSpeakTimer = setTimeout(startSpeaking, 80);
    else startSpeaking();
  }

  function toggleTtsPlayback() {
    if (!showTtsWidget) return;
    const synth = speechSynth();
    if (!synth) return;

    if (ttsSpeaking && !ttsPaused) {
      synth.pause();
      ttsPaused = true;
      return;
    }
    if (ttsSpeaking && ttsPaused) {
      synth.resume();
      ttsPaused = false;
      return;
    }
    if (!prepareTtsSegments()) return;
    speakTtsSegment(ttsIndex);
  }

  function stepTts(delta: number) {
    if (!showTtsWidget) return;
    if ((!ttsSpeaking && !ttsPaused) || !ttsSegments.length) {
      if (!prepareTtsSegments()) return;
    }
    const nextIndex = Math.min(Math.max(ttsIndex + delta, 0), ttsSegments.length - 1);
    speakTtsSegment(nextIndex);
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
    if (!event.ctrlKey && (styleNumberForKey(event.key) !== null || event.key === "Tab")) return true;

    if (event.ctrlKey) {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === "ArrowDown") return true;
      return ["h", "j", "k", "l", "w", "s", "d"].includes(event.key.toLowerCase());
    }

    return event.key === " " ||
      event.key === "Tab" ||
      event.key === "Enter" ||
      event.key === "?" ||
      event.key === "ArrowLeft" ||
      event.key === "ArrowRight" ||
      event.key === "ArrowUp" ||
      event.key === "ArrowDown" ||
      "hjklwasdcHJKLWASDCfxeqnNuU".includes(event.key);
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

    if (event.key === " ") {
      toggleMediaPlayback();
      return;
    }
    if (!audioElement || !audioLoaded) {
      stepTts(event.key === "ArrowLeft" || event.key === "Left" ? -1 : 1);
      return;
    }
    seekAudio(event.key === "ArrowLeft" || event.key === "Left" ? -mediaSeekSeconds : mediaSeekSeconds);
  }

  function handleWindowKeydownCapture(event: KeyboardEvent) {
    if (
      event.defaultPrevented ||
      !view ||
      editorMode !== "normal" ||
      !isEditorEventTarget(event.target) ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      (event.key !== "c" && event.key !== "C")
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    moveCursorByColumnStride(view, event.key === "C" ? -1 : 1);
  }

  function handleWindowKeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && settingsOpen) {
      settingsOpen = false;
      event.preventDefault();
      event.stopPropagation();
      view?.focus();
      return;
    }
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
    applyDocumentLoadFontPreference();
    const normalized = text.replace(/\r\n?/g, "\n").trim();
    const insert = preserveLineBreaks || !divideImportSentences ? normalized : sentenceLineBreaks(normalized);
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

  function stripEmptyLines(text: string) {
    return text
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map(line => line.trimEnd())
      .filter(line => line.trim().length > 0)
      .join("\n");
  }

  function loadOpenAiApiKey() {
    if (typeof localStorage === "undefined") return "";
    return localStorage.getItem(openAiApiKeyStorageKey) ?? "";
  }

  function objectFromStorage(key: string): Record<string, unknown> | null {
    if (typeof localStorage === "undefined") return null;
    const stored = localStorage.getItem(key);
    if (!stored) return null;

    try {
      const parsed = JSON.parse(stored);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
    } catch {
      return null;
    }
  }

  function unifiedPreferenceSection(name: "layout" | "app"): Record<string, unknown> | null {
    const preferences = objectFromStorage(unifiedPreferencesStorageKey);
    const section = preferences?.[name];
    return section && typeof section === "object" && !Array.isArray(section) ? section as Record<string, unknown> : null;
  }

  function loadThemeMode(): ThemeMode {
    const stored = typeof localStorage === "undefined" ? null : localStorage.getItem(themeStorageKey);
    if (stored === "gruvbox" || stored === "nord") return stored;
    const preferences = objectFromStorage(unifiedPreferencesStorageKey);
    const mode = preferences?.themeMode;
    return mode === "gruvbox" || mode === "nord" ? mode : "nord";
  }

  function loadAppSettings(): AppSettings {
    const defaults: AppSettings = {
      annotationMode: "clean",
      settingsTab: "markup",
      rememberOpenAiApiKey: false,
      transcriptionModel: "whisper-1",
      transcriptionPrompt: ""
    };
    const settings = objectFromStorage(appSettingsStorageKey) ?? unifiedPreferenceSection("app");
    if (!settings) return defaults;

    return {
      annotationMode: settings.annotationMode === "raw" || settings.annotationMode === "all" ? settings.annotationMode : "clean",
      settingsTab: settings.settingsTab === "layout" || settings.settingsTab === "transcribe" ? settings.settingsTab : "markup",
      rememberOpenAiApiKey: typeof settings.rememberOpenAiApiKey === "boolean" ? settings.rememberOpenAiApiKey : false,
      transcriptionModel: typeof settings.transcriptionModel === "string" && settings.transcriptionModel.trim()
        ? settings.transcriptionModel
        : "whisper-1",
      transcriptionPrompt: typeof settings.transcriptionPrompt === "string" ? settings.transcriptionPrompt : ""
    };
  }

  type LayoutSettings = {
    padLeft: number;
    padRight: number;
    padTop: number;
    padBottom: number;
    lineHeight: number;
    fontSize: number;
    paragraphSpacing: number;
    fontFamilyName: string;
    randomizeFontOnLoad: boolean;
    currentLineHighlightStyle: "fill" | "underline" | "borders";
    currentLineHighlightOpacity: number;
    columnGuideThickness: number;
    columnStride: number;
    divideImportSentences: boolean;
  };

  function normalizeLayoutFontFamilyName(value: string) {
    const normalized = value.trim();
    return fontFamilyOptions.some(option => option.name === normalized) ? normalized : defaultFontFamilyName;
  }

  function fontFamilyCssForName(name: string) {
    return fontFamilyOptions.find(option => option.name === name)?.css
      ?? fontFamilyOptions.find(option => option.name === defaultFontFamilyName)?.css
      ?? "monospace";
  }

  function fontFamilyIndex(name: string) {
    const index = fontFamilyOptions.findIndex(option => option.name === name);
    return index >= 0 ? index : fontFamilyOptions.findIndex(option => option.name === defaultFontFamilyName);
  }

  function rotateLayoutFontFamily() {
    const nextIndex = (fontFamilyIndex(layoutFontFamilyName) + 1) % fontFamilyOptions.length;
    layoutFontFamilyName = fontFamilyOptions[nextIndex].name;
  }

  function randomizeLayoutFontFamily() {
    if (fontFamilyOptions.length <= 1) return;
    const currentIndex = fontFamilyIndex(layoutFontFamilyName);
    let nextIndex = Math.floor(Math.random() * fontFamilyOptions.length);
    if (nextIndex === currentIndex) nextIndex = (nextIndex + 1) % fontFamilyOptions.length;
    layoutFontFamilyName = fontFamilyOptions[nextIndex].name;
  }

  function applyDocumentLoadFontPreference() {
    if (randomizeFontOnLoad) randomizeLayoutFontFamily();
  }

  function loadLayoutSettings(): Partial<LayoutSettings> {
    const settings = objectFromStorage(layoutStorageKey) ?? unifiedPreferenceSection("layout");
    if (!settings) return {};

    const numberOr = (key: string, fallback: number, min: number, max: number) => {
      const value = typeof settings[key] === "number" ? settings[key] : Number(settings[key]);
      return Number.isFinite(value) ? clampNumber(value, min, max) : fallback;
    };

    const style = settings.currentLineHighlightStyle;
    const currentLineHighlightStyle =
      style === "fill" || style === "underline" || style === "borders" ? style : undefined;
    const fontFamilyName = typeof settings.fontFamilyName === "string"
      ? normalizeLayoutFontFamilyName(settings.fontFamilyName)
      : undefined;

    return {
      padLeft: numberOr("padLeft", 40, 0, 400),
      padRight: numberOr("padRight", 40, 0, 400),
      padTop: numberOr("padTop", 16, 0, 400),
      padBottom: numberOr("padBottom", 64, 0, 9999),
      lineHeight: Math.round(numberOr("lineHeight", 1.6, 1, 3) * 100) / 100,
      fontSize: Math.round(numberOr("fontSize", 14, 10, 28)),
      paragraphSpacing: Math.round(numberOr("paragraphSpacing", 0, 0, 2) * 100) / 100,
      fontFamilyName,
      randomizeFontOnLoad: typeof settings.randomizeFontOnLoad === "boolean" ? settings.randomizeFontOnLoad : undefined,
      currentLineHighlightStyle,
      currentLineHighlightOpacity: Math.round(numberOr("currentLineHighlightOpacity", 0.34, 0.08, 0.7) * 100) / 100,
      columnGuideThickness: Math.round(numberOr("columnGuideThickness", 1, 1, 6)),
      columnStride: Math.round(numberOr("columnStride", 40, 4, 120)),
      divideImportSentences: typeof settings.divideImportSentences === "boolean" ? settings.divideImportSentences : undefined
    };
  }

  function persistLayoutSettings() {
    if (typeof localStorage === "undefined") return;
    const payload: LayoutSettings = {
      padLeft,
      padRight,
      padTop,
      padBottom,
      lineHeight,
      fontSize,
      paragraphSpacing,
      fontFamilyName: layoutFontFamilyName,
      randomizeFontOnLoad,
      currentLineHighlightStyle,
      currentLineHighlightOpacity,
      columnGuideThickness,
      columnStride,
      divideImportSentences
    };
    localStorage.setItem(layoutStorageKey, JSON.stringify(payload));
  }

  function persistAppSettings() {
    if (typeof localStorage === "undefined") return;
    const payload: AppSettings = {
      annotationMode,
      settingsTab,
      rememberOpenAiApiKey,
      transcriptionModel,
      transcriptionPrompt
    };
    localStorage.setItem(appSettingsStorageKey, JSON.stringify(payload));
  }

  function applyLayoutSettings(settings: Partial<LayoutSettings>) {
    padLeft = settings.padLeft ?? padLeft;
    padRight = settings.padRight ?? padRight;
    padTop = settings.padTop ?? padTop;
    padBottom = settings.padBottom ?? padBottom;
    lineHeight = settings.lineHeight ?? lineHeight;
    fontSize = settings.fontSize ?? fontSize;
    paragraphSpacing = settings.paragraphSpacing ?? paragraphSpacing;
    layoutFontFamilyName = settings.fontFamilyName ?? layoutFontFamilyName;
    randomizeFontOnLoad = settings.randomizeFontOnLoad ?? randomizeFontOnLoad;
    currentLineHighlightStyle = settings.currentLineHighlightStyle ?? currentLineHighlightStyle;
    currentLineHighlightOpacity = settings.currentLineHighlightOpacity ?? currentLineHighlightOpacity;
    columnGuideThickness = settings.columnGuideThickness ?? columnGuideThickness;
    columnStride = settings.columnStride ?? columnStride;
    divideImportSentences = settings.divideImportSentences ?? divideImportSentences;
  }

  function applyAppSettings(settings: AppSettings) {
    annotationMode = settings.annotationMode;
    settingsTab = settings.settingsTab;
    rememberOpenAiApiKey = settings.rememberOpenAiApiKey;
    transcriptionModel = settings.transcriptionModel;
    transcriptionPrompt = settings.transcriptionPrompt;
  }

  function restorePersistedSettings() {
    applyLayoutSettings(loadLayoutSettings());
    applyAppSettings(loadAppSettings());
    themeMode = loadThemeMode();
  }

  function buildThemeExtensions(theme: ThemePalette): Extension[] {
    return [
      syntaxHighlighting(buildHighlightStyle(theme)),
      buildHighlightDecorator(theme),
      buildEditorTheme(theme)
    ];
  }

  function reconfigureTheme(nextMode: ThemeMode) {
    themeMode = nextMode;
    if (typeof localStorage !== "undefined") localStorage.setItem(themeStorageKey, nextMode);
    view?.dispatch({ effects: themeCompartment.reconfigure(buildThemeExtensions(getTheme(nextMode))) });
  }

  function toggleThemeMode() {
    reconfigureTheme(themeMode === "nord" ? "gruvbox" : "nord");
  }

  function persistOpenAiApiKey() {
    if (typeof localStorage === "undefined") return;
    if (rememberOpenAiApiKey && openAiApiKey.trim()) {
      localStorage.setItem(openAiApiKeyStorageKey, openAiApiKey.trim());
    } else {
      localStorage.removeItem(openAiApiKeyStorageKey);
    }
  }

  function handleOpenAiKeyInput(event: Event) {
    openAiApiKey = (event.target as HTMLInputElement).value;
    persistOpenAiApiKey();
  }

  function toggleRememberOpenAiKey(event: Event) {
    rememberOpenAiApiKey = (event.target as HTMLInputElement).checked;
    persistOpenAiApiKey();
  }

  async function transcribeLoadedAudio() {
    transcriptionError = "";
    transcriptionStatus = "";
    if (!audioSourceFile) {
      transcriptionError = "Load an audio or video file first.";
      return;
    }

    let apiKey = openAiApiKey.trim();
    if (!apiKey) {
      const enteredKey = prompt("OpenAI API key");
      apiKey = enteredKey?.trim() ?? "";
      if (!apiKey) {
        transcriptionError = "OpenAI API key is required for transcription.";
        return;
      }
      openAiApiKey = apiKey;
      persistOpenAiApiKey();
    }

    transcriptionBusy = true;
    transcriptionStatus = `Uploading ${audioFileName || "media"}...`;

    try {
      const formData = new FormData();
      formData.append("file", audioSourceFile, audioSourceFile.name);
      formData.append("model", transcriptionModel);
      if (transcriptionPrompt.trim()) formData.append("prompt", transcriptionPrompt.trim());
      if (transcriptionModel === "whisper-1") {
        formData.append("response_format", "verbose_json");
        formData.append("timestamp_granularities[]", "segment");
      } else {
        formData.append("response_format", "text");
      }

      const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData
      });
      const contentType = response.headers.get("content-type") ?? "";
      const payload = contentType.includes("application/json") ? await response.json() : await response.text();
      if (!response.ok) throw new Error(openAiErrorMessage(payload, response.status));

      const transcript = transcriptionPayloadToText(payload);
      if (!transcript.trim()) throw new Error("The transcription completed, but no text was returned.");
      loadedFileType = transcriptionModel === "whisper-1" && transcript.includes("-->") ? "SRT" : "TRANSCRIPT";
      replaceDocument(transcript, loadedFileType === "SRT");
      transcriptionStatus = `Loaded transcript from ${audioFileName || "media"}.`;
      persistOpenAiApiKey();
    } catch (error) {
      transcriptionError = error instanceof Error ? error.message : "Transcription failed.";
      transcriptionStatus = "";
    } finally {
      transcriptionBusy = false;
    }
  }

  function transcriptionPayloadToText(payload: unknown) {
    if (typeof payload === "string") return stripEmptyLines(payload);
    if (!payload || typeof payload !== "object") return "";

    const data = payload as { text?: string; segments?: { start?: number; end?: number; text?: string }[] };
    if (Array.isArray(data.segments) && data.segments.length) {
      return data.segments
        .map(segment => {
          const text = (segment.text ?? "").replace(/\s+/g, " ").trim();
          if (!text) return "";
          return `[${formatSrtTime(segment.start ?? 0)} --> ${formatSrtTime(segment.end ?? segment.start ?? 0)}]\n${text}`;
        })
        .filter(Boolean)
        .join("\n");
    }

    return stripEmptyLines(data.text ?? "");
  }

  function formatSrtTime(seconds: number) {
    const value = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
    const totalMs = Math.round(value * 1000);
    const hours = Math.floor(totalMs / 3_600_000);
    const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
    const wholeSeconds = Math.floor((totalMs % 60_000) / 1000);
    const milliseconds = totalMs % 1000;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
  }

  function openAiErrorMessage(payload: unknown, status: number) {
    if (payload && typeof payload === "object" && "error" in payload) {
      const error = (payload as { error?: { message?: string } }).error;
      if (error?.message) return error.message;
    }
    if (typeof payload === "string" && payload.trim()) return payload.trim();
    return `OpenAI transcription request failed (${status}).`;
  }

  function clampNumber(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
  }

  function adjustLayoutValue(kind: "lineHeight" | "fontSize" | "paragraphSpacing", delta: number) {
    if (kind === "lineHeight") {
      lineHeight = Math.round(clampNumber(lineHeight + delta * 0.15, 1, 3) * 100) / 100;
    } else if (kind === "fontSize") {
      fontSize = Math.round(clampNumber(fontSize + delta, 10, 28));
    } else {
      paragraphSpacing = Math.round(clampNumber(paragraphSpacing + delta * 0.15, 0, 2) * 100) / 100;
    }
  }

  function setRightPaddingFromClientX(clientX: number) {
    if (!editorEl) return;
    const rect = editorEl.getBoundingClientRect();
    const maxPadding = Math.max(0, Math.min(720, rect.width - 120));
    padRight = Math.round(clampNumber(rect.right - clientX, 0, maxPadding));
  }

  function startRightPaddingDrag(event: PointerEvent) {
    event.preventDefault();
    event.stopPropagation();
    finishRightPaddingDrag?.();
    setRightPaddingFromClientX(event.clientX);

    const move = (moveEvent: PointerEvent) => setRightPaddingFromClientX(moveEvent.clientX);
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      finishRightPaddingDrag = null;
    };

    finishRightPaddingDrag = finish;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
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

  async function exportSummaryHtml() {
    const suggestedName = `${stripExtension(activeSaveName || "annotations")}-summary.html`;
    const html = buildSummaryExportHtml();
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

    const fallbackName = prompt("Export summary filename", suggestedName);
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
    pdfSourceLines = [];
    pdfParseError = "";
    pdfIsParsing = true;
    pdfModalOpen = true;

    try {
      const extractedPdf = await extractPdfText(file);
      pdfDraftText = extractedPdf.text;
      pdfSourceLines = extractedPdf.lines;
      if (!pdfDraftText.trim()) {
        pdfParseError = "No selectable text was found. This PDF may be scanned, so paste or type corrected text here before loading.";
      }
    } catch (error) {
      pdfParseError = error instanceof Error ? error.message : "Could not parse this PDF.";
      pdfDraftText = "";
      pdfSourceLines = [];
    } finally {
      pdfIsParsing = false;
    }
  }

  async function extractPdfText(file: File) {
    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    const pages: string[] = [];
    const sourceLines: string[] = [];

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

      sourceLines.push(...lines);
      pages.push(fixParagraphs(lines.join("\n")));
    }

    return {
      text: pages.join("\n\n").replace(/[ \t]+\n/g, "\n").trim(),
      lines: sourceLines
    };
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

  function loadPdfDraft(text = pdfDraftText) {
    replaceDocument(text);
    closePdfModal();
  }

  function closePdfModal() {
    pdfModalOpen = false;
    pdfDraftText = "";
    pdfSourceLines = [];
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
    if (mode === "normal") blockquoteEditReturnAnchor = null;
    if (view) {
      view.dispatch(selection ? { selection } : {});  // trigger keymap/decoration rebuild
      applyEditorModeClasses(view);
      requestAnimationFrame(() => view?.focus());
    }
  }

  function applyEditorModeClasses(v = view) {
    if (!v) return;
    v.dom.classList.toggle("mode-insert", editorMode === "insert");
    v.dom.classList.toggle("mode-normal", editorMode === "normal");
  }

  $: if (view) {
    applyEditorModeClasses(view);
    view.dom.style.setProperty("--paragraph-spacing", `${paragraphSpacing}em`);
    const content = view.dom.querySelector<HTMLElement>(".cm-content");
    if (content) {
      content.style.paddingLeft   = `${padLeft}px`;
      content.style.paddingRight  = `${padRight}px`;
      content.style.paddingTop    = `${padTop}px`;
      content.style.paddingBottom = `${padBottom}px`;
      content.style.fontFamily    = layoutFontFamilyCss;
    }
    const scroller = view.dom.querySelector<HTMLElement>(".cm-scroller");
    if (scroller) {
      scroller.style.lineHeight = `${lineHeight}`;
      scroller.style.fontSize   = `${fontSize}px`;
      scroller.style.fontFamily = layoutFontFamilyCss;
    }
    requestAnimationFrame(() => {
      view?.requestMeasure();
      view?.scrollDOM.dispatchEvent(new Event("scroll"));
    });
  }

  // Trigger CM6 decoration rebuild when annotationMode changes
  $: annotationMode, view && view.dispatch({});

  function cycleStyle(delta: number) {
    currentStyle = cycleStyleNumber(currentStyle || 1, delta, false);
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

  function currentHighlightStyles(theme = activeTheme): AnnotationStyle[] {
    return [
      ...baseHighlightStyles.map(style => style.name === "callout" ? { ...style, color: theme.fg, colorName: style.name } : { ...style, colorName: style.name }),
      ...customStyles
    ];
  }

  function styleColor(style: number) {
    return style === 0 ? activeTheme.orange : annotationColorForStyle(highlightStyles[style - 1]?.name ?? "");
  }

  function styleNumberForName(name: string) {
    const index = highlightStyles.findIndex(s => s.name === name);
    return index < 0 ? 1 : index + 1;
  }

  function styleKeyForName(name: string) {
    return styleKeys[name] || defaultStyleKeyForName(name);
  }

  function styleNumberForKey(key: string) {
    const normalized = normalizeStyleKey(key);
    if (!normalized) return null;
    if (normalized === "0") return 0;
    const index = highlightStyles.findIndex(style => styleKeyForName(style.name) === normalized);
    return index < 0 ? null : index + 1;
  }

  function normalizeStyleKey(key: string) {
    if (key.length !== 1 || /\s/.test(key)) return "";
    const normalized = key.toLowerCase();
    return normalized === "0" || !reservedStyleKeys.has(normalized) ? normalized : "";
  }

  function defaultStyleKeyForName(name: string) {
    const index = highlightStyles.findIndex(style => style.name === name);
    const key = index < 0 ? "" : defaultStyleKeyOrder[index] ?? "";
    return reservedStyleKeys.has(key) ? "" : key;
  }

  function defaultStyleTitle(name: string) {
    return name === "callout" ? "callout" : name;
  }

  function styleDisplayTitle(name: string) {
    return styleTitles[name] || defaultStyleTitle(name);
  }

  function normalizeAnnotationVariant(value: string | undefined): AnnotationVariant {
    return annotationVariants.includes(value as AnnotationVariant) ? value as AnnotationVariant : "fill";
  }

  function annotationStyleParts(token: string) {
    const [style = "", variant = "fill"] = token.trim().toLowerCase().split(/\s+/, 2);
    return { style, variant: normalizeAnnotationVariant(variant) };
  }

  function annotationStyleToken(style: string, variant = currentAnnotationVariant) {
    return `${style} ${normalizeAnnotationVariant(variant)}`;
  }

  function annotationColorForStyle(name: string, theme = activeTheme) {
    if (name === "callout") return theme.fg;
    return highlightStyles.find(style => style.name === name)?.color ?? theme.yellow;
  }

  function annotationTextColorForStyle(name: string, color: string, theme = activeTheme) {
    return name === "callout" ? theme.bg : contrastColor(color, theme.bg, theme.fg);
  }

  function annotationMarkCss(styleName: string, variant: AnnotationVariant, color: string, theme = activeTheme) {
    const textColor = annotationTextColorForStyle(styleName, color, theme);
    const softFill = `color-mix(in srgb, ${color} 16%, transparent)`;
    const base = `border-radius:3px;padding:0 2px;`;
    if (variant === "fill") return `${base}background-color:${color};color:${textColor};`;
    if (variant === "box") return `${base}background-color:${softFill};color:${theme.fg};border:1px solid ${color};`;
    if (variant === "underline") return `${base}color:${theme.fg};border-bottom:2px solid ${color};`;
    if (variant === "rail") return `${base}color:${theme.fg};border-top:1px solid ${color};border-bottom:1px solid ${color};`;
    return `${base}color:${theme.fg};border-left:2px solid ${color};border-right:2px solid ${color};`;
  }

  function setAnnotationVariant(v: EditorView, variant: AnnotationVariant) {
    currentAnnotationVariant = variant;
    const cursor = v.state.selection.main.head;
    const docText = v.state.doc.toString();
    annotationPattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = annotationPattern.exec(docText)) !== null) {
      const spanStart = m.index, spanEnd = spanStart + m[0].length;
      if (cursor >= spanStart && cursor <= spanEnd) {
        const { style } = annotationStyleParts(m[2]);
        const updated = m[0].replace(/^`([^`]+)`<!--\s*\w+(?:\s+\w+)?,/, `\`$1\`<!-- ${annotationStyleToken(style, variant)},`);
        v.dispatch({ changes: { from: spanStart, to: spanEnd, insert: updated } });
        return true;
      }
    }
    return false;
  }

  function cycleAnnotationVariant(v: EditorView | null, delta: number) {
    if (v) {
      const cursor = v.state.selection.main.head;
      const docText = v.state.doc.toString();
      annotationPattern.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = annotationPattern.exec(docText)) !== null) {
        const spanStart = m.index, spanEnd = spanStart + m[0].length;
        if (cursor >= spanStart && cursor <= spanEnd) {
          const { variant } = annotationStyleParts(m[2]);
          const index = annotationVariants.indexOf(variant);
          const next = annotationVariants[(index + delta + annotationVariants.length) % annotationVariants.length];
          return setAnnotationVariant(v, next);
        }
      }
    }

    const index = annotationVariants.indexOf(currentAnnotationVariant);
    currentAnnotationVariant = annotationVariants[(index + delta + annotationVariants.length) % annotationVariants.length];
    return true;
  }

  function chooseAnnotationVariant(variant: AnnotationVariant) {
    if (view) setAnnotationVariant(view, variant);
    else currentAnnotationVariant = variant;
    variantPickerOpen = false;
    view?.focus();
  }

  function annotationVariantLabel(variant: AnnotationVariant) {
    if (variant === "underline") return "under";
    return variant;
  }

  function handleVariantPickerKey(v: EditorView, event: KeyboardEvent) {
    if (!variantPickerOpen) return false;
    if (event.key === "ArrowDown" || event.key === "j" || event.key === "s") {
      cycleAnnotationVariant(v, 1);
      return true;
    }
    if (event.key === "ArrowUp" || event.key === "k" || event.key === "w") {
      cycleAnnotationVariant(v, -1);
      return true;
    }
    if (event.key === "Escape" || event.key === "Enter" || event.key === " " || event.key === "4") {
      variantPickerOpen = false;
      return true;
    }
    return true;
  }

  function customStyleTitle(name: string) {
    return styleTitles[name] || "";
  }

  function normalizeStyleTitle(title: string) {
    return title.trim().replace(/\s+/g, " ").replace(/"/g, "'").replace(/[<>]/g, "").replace(/--+/g, "-");
  }

  function normalizeCustomStyleName(value: string) {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24);
  }

  function namedStyleColor(name: string) {
    return namedStyleColors.find(color => color.name === name)?.color ?? namedStyleColors[0].color;
  }

  function normalizeNamedStyleColor(value: string) {
    const normalized = normalizeCustomStyleName(value);
    return namedStyleColors.some(color => color.name === normalized) ? normalized : namedStyleColors[0].name;
  }

  function isBuiltInStyleName(name: string) {
    return baseHighlightStyles.some(style => style.name === name);
  }

  function uniqueCustomStyleName(name: string) {
    const fallback = normalizeNamedStyleColor(newStyleColorName);
    const base = normalizeCustomStyleName(name) || fallback;
    const used = new Set([
      ...baseHighlightStyles.map(style => style.name),
      ...customStyles.map(style => style.name)
    ]);
    if (!used.has(base)) return base;
    for (let index = 2; index < 100; index += 1) {
      const candidate = `${base}-${index}`;
      if (!used.has(candidate)) return candidate;
    }
    return `${base}-${Date.now().toString(36)}`;
  }

  function loadCustomStyles(): AnnotationStyle[] {
    const stored = typeof localStorage === "undefined" ? null : localStorage.getItem(customStylesStorageKey);
    if (!stored) return [];

    try {
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) return [];
      const used = new Set(baseHighlightStyles.map(style => style.name));
      return parsed
        .map((entry): AnnotationStyle | null => {
          if (!entry || typeof entry !== "object") return null;
          const rawName = (entry as { name?: unknown }).name;
          const name = normalizeCustomStyleName(typeof rawName === "string" ? rawName : "");
          const rawColorName = (entry as { colorName?: unknown }).colorName;
          const colorName = normalizeNamedStyleColor(typeof rawColorName === "string" ? rawColorName : "");
          if (!name || used.has(name)) return null;
          used.add(name);
          return { name, colorName, color: namedStyleColor(colorName), custom: true };
        })
        .filter((entry): entry is AnnotationStyle => entry !== null);
    } catch {
      return [];
    }
  }

  function persistCustomStyles(styles: AnnotationStyle[]) {
    customStyles = styles;
    if (typeof localStorage === "undefined") return;
    if (styles.length) {
      localStorage.setItem(customStylesStorageKey, JSON.stringify(styles.map(({ name, colorName }) => ({ name, colorName }))));
    } else {
      localStorage.removeItem(customStylesStorageKey);
    }
  }

  function handleNewStyleColorName(event: Event) {
    const colorName = normalizeNamedStyleColor((event.target as HTMLSelectElement).value);
    newStyleColorName = colorName;
    newStyleName = colorName;
  }

  function addCustomStyle() {
    const name = uniqueCustomStyleName(newStyleName);
    const colorName = normalizeNamedStyleColor(newStyleColorName);
    const nextStyle = { name, colorName, color: namedStyleColor(colorName), custom: true };
    persistCustomStyles([...customStyles, nextStyle]);
    currentStyle = baseHighlightStyles.length + customStyles.length;
    newStyleColorName = "steel";
    newStyleName = newStyleColorName;
    addStyleModalOpen = false;
    view?.focus();
  }

  function removeCustomStyle(name: string) {
    if (isBuiltInStyleName(name)) return;
    const index = highlightStyles.findIndex(style => style.name === name);
    const nextCustomStyles = customStyles.filter(style => style.name !== name);
    persistCustomStyles(nextCustomStyles);
    const nextTitles = { ...styleTitles };
    delete nextTitles[name];
    persistStyleTitles(nextTitles);
    const nextKeys = { ...styleKeys };
    delete nextKeys[name];
    persistStyleKeys(nextKeys);
    if (currentStyle === index + 1) {
      currentStyle = Math.min(index, highlightStyles.length - 2);
      if (currentStyle < 0) currentStyle = 0;
    } else if (currentStyle > index + 1) {
      currentStyle -= 1;
    }
    view?.dispatch({});
  }

  function loadStyleTitles() {
    const stored = typeof localStorage === "undefined" ? null : localStorage.getItem(styleTitlesStorageKey);
    if (!stored) return {};

    try {
      const parsed = JSON.parse(stored);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      return Object.fromEntries(
        Object.entries(parsed)
          .filter((entry): entry is [string, string] =>
            typeof entry[0] === "string" &&
            highlightStyles.some(style => style.name === entry[0]) &&
            typeof entry[1] === "string" &&
            entry[1].trim().length > 0
          )
          .map(([name, title]) => [name, normalizeStyleTitle(title)])
          .filter(([name, title]) => title.length > 0 && title.toLowerCase() !== defaultStyleTitle(name).toLowerCase())
      );
    } catch {
      return {};
    }
  }

  function loadStyleKeys() {
    const stored = typeof localStorage === "undefined" ? null : localStorage.getItem(styleKeysStorageKey);
    if (!stored) return {};

    try {
      const parsed = JSON.parse(stored);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      const used = new Set<string>();
      return Object.fromEntries(
        Object.entries(parsed)
          .filter((entry): entry is [string, string] =>
            typeof entry[0] === "string" &&
            highlightStyles.some(style => style.name === entry[0]) &&
            typeof entry[1] === "string"
          )
          .map(([name, key]) => [name, normalizeStyleKey(key)])
          .filter(([, key]) => {
            if (!key || used.has(key)) return false;
            used.add(key);
            return true;
          })
      );
    } catch {
      return {};
    }
  }

  function persistStyleTitles(titles: Record<string, string>) {
    styleTitles = titles;
    if (typeof localStorage === "undefined") return;
    if (Object.keys(titles).length) {
      localStorage.setItem(styleTitlesStorageKey, JSON.stringify(titles));
    } else {
      localStorage.removeItem(styleTitlesStorageKey);
    }
  }

  function persistStyleKeys(keys: Record<string, string>) {
    styleKeys = keys;
    if (typeof localStorage === "undefined") return;
    if (Object.keys(keys).length) {
      localStorage.setItem(styleKeysStorageKey, JSON.stringify(keys));
    } else {
      localStorage.removeItem(styleKeysStorageKey);
    }
  }

  function persistStyleTitle(name: string, title: string) {
    const normalized = normalizeStyleTitle(title);
    const nextTitles = { ...styleTitles };
    if (!normalized || normalized.toLowerCase() === defaultStyleTitle(name).toLowerCase()) {
      delete nextTitles[name];
    } else {
      nextTitles[name] = normalized;
    }
    persistStyleTitles(nextTitles);
  }

  function startStyleTitleEdit(event: MouseEvent, name: string) {
    event.preventDefault();
    event.stopPropagation();
    editingStyleTitleName = name;
    styleTitleDraft = styleDisplayTitle(name);
    void focusStyleTitleInput();
  }

  async function focusStyleTitleInput() {
    await tick();
    focusInputAtEnd(styleTitleInput);
  }

  function focusInputAtEnd(input: HTMLInputElement | null) {
    if (!input) return;
    input.focus();
    const end = input.value.length;
    input.setSelectionRange(end, end);
  }

  function saveStyleTitle() {
    if (!editingStyleTitleName) return;
    const name = editingStyleTitleName;
    editingStyleTitleName = null;
    persistStyleTitle(name, styleTitleDraft);
  }

  function startStyleKeyEdit(event: MouseEvent, name: string) {
    event.preventDefault();
    event.stopPropagation();
    editingStyleKeyName = name;
    styleKeyDraft = styleKeyForName(name);
    void focusStyleKeyInput();
  }

  async function focusStyleKeyInput() {
    await tick();
    focusInputAtEnd(styleKeyInput);
  }

  function saveStyleKey() {
    if (!editingStyleKeyName) return;
    const name = editingStyleKeyName;
    editingStyleKeyName = null;
    persistStyleKey(name, styleKeyDraft);
  }

  function persistStyleKey(name: string, key: string) {
    const normalized = normalizeStyleKey(key) || defaultStyleKeyForName(name);
    const oldKey = styleKeyForName(name);
    if (!normalized) return;

    const nextKeys = { ...styleKeys };
    const otherStyle = highlightStyles.find(style =>
      style.name !== name && styleKeyForName(style.name) === normalized
    );
    if (otherStyle && oldKey) {
      nextKeys[otherStyle.name] = oldKey;
    }
    nextKeys[name] = normalized;
    persistStyleKeys(nextKeys);
  }

  function cancelStyleKeyEdit() {
    editingStyleKeyName = null;
  }

  function handleStyleKeyKeydown(event: KeyboardEvent) {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      saveStyleKey();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancelStyleKeyEdit();
      return;
    }
    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      styleKeyDraft = "";
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const key = normalizeStyleKey(event.key);
      if (!key) return;
      event.preventDefault();
      styleKeyDraft = key;
      saveStyleKey();
    }
  }

  function cancelStyleTitleEdit() {
    editingStyleTitleName = null;
  }

  function handleStyleTitleKeydown(event: KeyboardEvent) {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      saveStyleTitle();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelStyleTitleEdit();
    }
  }

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

The quick brown fox jumps over the ${bt}lazy${bt}<!-- red fill, ${t0}: "" --> dog. It was an unremarkable morning in the valley, the kind where mist clings to the hedgerows and the air smells faintly of damp earth and pine.

## The Fox

The fox was neither ${bt}quick${bt}<!-- green underline, ${t1}: "Check spelling" --> nor particularly brown - more of a ${bt}tawny${bt}<!-- callout box, ${t2}: "Too informal" --> amber, with a white-tipped tail that flickered like a candle in the undergrowth. She had been awake since before dawn, padding silently along the ridge above the farm.

- She was **bold** by nature
- She was *cautious* by experience
- She was, above all, ${bt}hungry${bt}<!-- red bars, ${t3}: "" -->

## The Dog

The dog, for his part, was not lazy in any meaningful sense. He was simply ${bt}old${bt}<!-- green rail, ${t4}: "Consider 'elderly'" -->. His name was Jasper, and he had been guarding the same gate for eleven years. He watched the fox with one open eye and decided, as he always did, that the effort was not worth it.

> "Some battles," Jasper seemed to say, "are won by not fighting them."

## The Valley

The valley stretched south toward the river, flanked by two long ridges of ${bt}limestone${bt}<!-- callout fill, ${t5}: "Geological fact" -->. Farmers had worked this land for generations, leaving behind dry-stone walls, sunken lanes, and the occasional rusted harrow half-buried in a hedgerow.

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

  let editingSpan: number | null = null;
  type BlockquoteAlign = "left" | "center" | "right";

  function countWords(text: string) {
    const visibleText = text
      .replace(/`([^`]+)`<!--\s*\w+(?:\s+\w+)?,\s*.+?:\s*"[^"]*"\s*-->/g, "$1")
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

  function wordSelectionBoundary(text: string, pos: number, forward: boolean): number {
    let next = Math.max(0, Math.min(pos, text.length));

    if (forward) {
      const current = wordRangeAt(text, next);
      if (current && next < current.to) return current.to;
      while (next < text.length && !isSelectableWordChar(text, next)) next += 1;
      return wordRangeAt(text, next)?.to ?? next;
    }

    const current = wordRangeAt(text, next);
    if (current && next > current.from) return current.from;
    while (next > 0 && !isSelectableWordChar(text, next - 1)) next -= 1;
    return next > 0 ? wordRangeAt(text, next - 1)?.from ?? next : 0;
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
      font-family: ${layoutFontFamilyCss};
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

  function buildSummaryExportHtml() {
    const body = buildSummaryExportBody();
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(stripExtension(activeSaveName || "Annotation summary"))} summary</title>
  <style>
    body {
      margin: 0;
      background: ${gruvbox.bg};
      color: ${gruvbox.fg};
      font-family: ${layoutFontFamilyCss};
      line-height: 1.5;
      font-size: 14px;
    }
    main {
      box-sizing: border-box;
      max-width: 960px;
      min-height: 100vh;
      margin: 0 auto;
      padding: 32px 28px 64px;
    }
    h1 { color: ${gruvbox.yellow}; font-size: 20px; margin: 0 0 8px; }
    h2 { color: ${gruvbox.fg}; font-size: 14px; margin: 28px 0 10px; text-transform: uppercase; letter-spacing: 0.08em; }
    .summary-export-source { color: ${gruvbox.fgMuted}; margin: 0 0 24px; font-size: 12px; }
    .summary-export-entry { border-top: 1px solid ${gruvbox.border}; padding: 12px 0; }
    .summary-export-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .summary-export-swatch { width: 10px; height: 10px; border-radius: 2px; border: 1px solid rgba(0, 0, 0, 0.25); flex: 0 0 auto; }
    .summary-export-title { color: ${gruvbox.fg}; font-weight: 700; }
    .summary-export-meta { color: ${gruvbox.fgMuted}; font-size: 11px; }
    .summary-export-context { margin: 0; color: ${gruvbox.fgMuted}; }
    .summary-export-context mark { border-radius: 3px; padding: 0 2px; }
    .summary-export-comment { margin: 6px 0 0; color: ${gruvbox.yellow}; }
  </style>
</head>
<body>
  <main>
${body}
  </main>
</body>
</html>`;
  }

  function buildSummaryExportBody() {
    const blocks = [
      `    <h1>Summary</h1>`,
      `    <p class="summary-export-source">Source: ${escapeHtml(activeSaveName || "annotations.md")}</p>`
    ];

    for (const section of summarySections) {
      if (section.kind === "group") {
        blocks.push(`    <h2>${escapeHtml(section.label)} (${section.count})</h2>`);
        for (const item of section.items) blocks.push(buildSummaryExportEntry(item));
      } else {
        blocks.push(buildSummaryExportEntry(section.item));
      }
    }

    return blocks.join("\n");
  }

  function buildSummaryExportEntry(item: SummaryItem) {
    if (item.type === "blockquote") {
      return `    <article class="summary-export-entry">
      <div class="summary-export-head">
        <span class="summary-export-title">Notes</span>
        <span class="summary-export-meta">Ln ${item.line}</span>
      </div>
      <p class="summary-export-context">${escapeHtml(item.text)}</p>
    </article>`;
    }

    const comment = item.comment.trim();
    return `    <article class="summary-export-entry">
      <div class="summary-export-head">
        <span class="summary-export-swatch" style="background:${escapeHtml(item.color)}"></span>
        <span class="summary-export-title">${escapeHtml(summaryAnnotationTitle(item))}</span>
        <span class="summary-export-meta">Ln ${item.line}</span>
        <span class="summary-export-meta">${escapeHtml(summaryTimestamp(item.timestamp))}</span>
      </div>
      <p class="summary-export-context"><span>${escapeHtml(item.context.before)}</span><mark style="background:${escapeHtml(item.color)};color:${escapeHtml(contrastColor(item.color))}">${escapeHtml(item.context.text)}</mark><span>${escapeHtml(item.context.after)}</span></p>
      ${comment ? `<p class="summary-export-comment">${escapeHtml(comment)}</p>` : ""}
    </article>`;
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
    const pattern = /`([^`]+)`<!--\s*(\w+(?:\s+\w+)?),\s*(.+?):\s*"([^"]*)"(?:,\s*title:\s*"([^"]*)")?\s*-->/g;
    let html = "";
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      html += renderPlainInlineHtml(text.slice(lastIndex, match.index));
      const { style, variant } = annotationStyleParts(match[2]);
      const color = annotationColorForStyle(style);
      html += `<span class="annotation-token" style="${escapeHtml(annotationMarkCss(style, variant, color))}">${escapeHtml(match[1])}</span>`;
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
      const { style: colorName } = annotationStyleParts(annotation[2]);
      items.push({
        type: "annotation",
        id: `annotation-${spanStart}`,
        colorName,
        title: annotation[5]?.trim() ?? "",
        color: annotationColorForStyle(colorName),
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
    summaryCategoryOrder = reconcileSummaryCategoryOrder(summarySections, summaryCategoryOrder);
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

  function orderSummarySections(sections: SummarySection[], categoryOrder: string[]) {
    const annotationGroups = sections.filter(section => section.kind === "group" && section.itemType === "annotation");
    if (!annotationGroups.length || !categoryOrder.length) return sections;

    const groupLookup = new Map(annotationGroups.map(section => [section.id, section] as const));
    const orderedGroups: SummarySection[] = [];
    const seen = new Set<string>();

    for (const id of categoryOrder) {
      const section = groupLookup.get(id);
      if (!section) continue;
      orderedGroups.push(section);
      seen.add(id);
    }

    for (const section of annotationGroups) {
      if (!seen.has(section.id)) orderedGroups.push(section);
    }

    let groupIndex = 0;
    return sections.map(section => {
      if (section.kind !== "group" || section.itemType !== "annotation") return section;
      return orderedGroups[groupIndex++] ?? section;
    });
  }

  function reconcileSummaryCategoryOrder(sections: SummarySection[], currentOrder: string[]) {
    const groupIds = sections
      .filter(section => section.kind === "group" && section.itemType === "annotation")
      .map(section => section.id);
    if (!groupIds.length) return [];
    const nextOrder = currentOrder.filter(id => groupIds.includes(id));
    for (const id of groupIds) {
      if (!nextOrder.includes(id)) nextOrder.push(id);
    }
    return nextOrder;
  }

  function toggleSummaryCategory(id: string) {
    expandedSummaryCategories = {
      ...expandedSummaryCategories,
      [id]: !expandedSummaryCategories[id]
    };
  }

  function setAllSummaryCategories(expanded: boolean) {
    expandedSummaryCategories = Object.fromEntries(summaryGroupIds.map(id => [id, expanded]));
  }

  function toggleAllSummaryCategories() {
    setAllSummaryCategories(!summaryAllGroupsExpanded);
  }

  function moveArrayItem<T>(items: T[], fromIndex: number, toIndex: number) {
    if (fromIndex < 0 || fromIndex >= items.length) return items;
    if (toIndex < 0 || toIndex > items.length) return items;
    if (fromIndex === toIndex) return items;
    const next = [...items];
    const [item] = next.splice(fromIndex, 1);
    next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, item);
    return next;
  }

  function moveSummaryCategoryById(id: string, targetId: string, after: boolean) {
    const currentOrder = summaryCategoryOrder.length ? summaryCategoryOrder : summaryAnnotationGroupIds.slice();
    const fromIndex = currentOrder.indexOf(id);
    const targetIndex = currentOrder.indexOf(targetId);
    if (fromIndex < 0 || targetIndex < 0) return;
    const insertIndex = after ? targetIndex + 1 : targetIndex;
    summaryCategoryOrder = moveArrayItem(currentOrder, fromIndex, insertIndex);
  }

  function setSummaryReorderDragState(id: string, event: DragEvent) {
    reorderDragState = { kind: "summary", id };
    reorderDropTarget = null;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", id);
    }
  }

  function updateSummaryReorderDropTarget(id: string, event: DragEvent) {
    if (!reorderDragState || reorderDragState.id === id) return false;
    event.preventDefault();
    const currentTarget = event.currentTarget as HTMLElement | null;
    if (!currentTarget) return false;
    const rect = currentTarget.getBoundingClientRect();
    const after = event.clientY > rect.top + rect.height / 2;
    reorderDropTarget = { kind: "summary", id, after };
    return true;
  }

  function finishReorderDrag() {
    reorderDragState = null;
    reorderDropTarget = null;
  }

  function commitSummaryReorder(targetId: string, after: boolean) {
    if (!reorderDragState) return;
    moveSummaryCategoryById(reorderDragState.id, targetId, after);
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

  function enterBlockquoteEditMode(v: EditorView) {
    const selection = v.state.selection.main;
    const returnAnchor = selection.head;

    if (!selection.empty) {
      const from = Math.min(selection.from, selection.to);
      const to = Math.max(selection.from, selection.to);
      const beforeNeedsBreak = from > 0 && v.state.doc.sliceString(from - 1, from) !== "\n";
      const afterNeedsBreak = to < v.state.doc.length && v.state.doc.sliceString(to, to + 1) !== "\n";
      const selectedText = v.state.doc.sliceString(from, to).replace(/\r\n?/g, "\n");
      const quotedText = selectedText
        .split("\n")
        .map(line => line.startsWith(">") ? line : `> ${line}`)
        .join("\n");
      const prefix = beforeNeedsBreak ? "\n" : "";
      const suffix = afterNeedsBreak ? "\n" : "";
      const insert = `${prefix}${quotedText}${suffix}`;
      const cursor = from + prefix.length + quotedText.length;
      const tr = v.state.update({
        changes: { from, to, insert },
        selection: { anchor: cursor }
      });
      blockquoteEditReturnAnchor = tr.changes.mapPos(returnAnchor, 1);
      v.dispatch(tr);
      blockquoteActive = true;
      setMode("insert");
      return true;
    }

    const head = v.state.selection.main.head;
    const line = v.state.doc.lineAt(head);
    let cursor = head;
    blockquoteEditReturnAnchor = head;

    if (line.text.startsWith(">")) {
      const contentStart = line.from + (line.text.startsWith("> ") ? 2 : 1);
      cursor = Math.max(head, contentStart);
      v.dispatch({ selection: { anchor: cursor } });
    } else if (line.text.trim().length === 0) {
      cursor = line.from + 2;
      v.dispatch({
        changes: { from: line.from, to: line.to, insert: "> " },
        selection: { anchor: cursor }
      });
    } else {
      cursor = line.to + 3;
      v.dispatch({
        changes: { from: line.to, insert: "\n> " },
        selection: { anchor: cursor }
      });
    }

    blockquoteActive = true;
    setMode("insert");
    return true;
  }

  function finishBlockquoteEditMode(v: EditorView) {
    if (editorMode !== "insert" || blockquoteEditReturnAnchor === null) return false;
    const returnAnchor = Math.max(0, Math.min(blockquoteEditReturnAnchor, v.state.doc.length));
    blockquoteEditReturnAnchor = null;
    setMode("normal");
    v.dispatch({ selection: EditorSelection.cursor(returnAnchor) });
    return true;
  }

  function insertBlockquoteLineBreak(v: EditorView) {
    if (editorMode !== "insert" || blockquoteEditReturnAnchor === null) return false;
    const selection = v.state.selection.main;
    const from = Math.min(selection.from, selection.to);
    const to = Math.max(selection.from, selection.to);
    const line = v.state.doc.lineAt(from);
    const insert = line.text.startsWith(">") ? "\n> " : "\n";
    const cursor = from + insert.length;
    v.dispatch({
      changes: { from, to, insert },
      selection: { anchor: cursor }
    });
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
          const { style: colorName } = annotationStyleParts(m[2]);
          const timestamp = m[3] || "";
          const comment   = m[4] || "";
          const color = annotationColorForStyle(colorName);
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

  function formatEditorLineNumber(lineNumber: number, state: EditorState) {
    const hasSrt = documentHasSrtTimestamps(state);
    if (lineNumber > state.doc.lines) return hasSrt ? "00:00 → 00:00" : String(lineNumber);
    const line = state.doc.line(lineNumber);
    if (isSrtTimestampLine(line.text)) return "";
    const timestamp = srtTimestampForTranscriptLine(state, lineNumber);
    if (timestamp) return timestamp.label;
    return String(lineNumber);
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

  function moveCursorByColumnStride(v: EditorView, direction: 1 | -1) {
    return navigation.lineHorizontalToggle(v, direction);
  }

  function buildHighlightDecorator(theme = activeTheme): Extension {
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
            const { style: colorName, variant } = annotationStyleParts(match[2]);
            const comment   = match[4] || "";
            const color = annotationColorForStyle(colorName, theme);
            const spanStart = from + match.index;
            const spanEnd   = spanStart + match[0].length;
            const wordStart = spanStart + 1;
            const wordEnd   = wordStart + match[1].length;
            const cursorInside = cursor >= spanStart && cursor <= spanEnd;
            const isEditing = editingSpan === spanStart;

            if (mode === "raw" || mode === "all") {
              if (mode === "all" || cursorInside) {
                builder.add(spanStart, spanEnd, Decoration.mark({ attributes: { style: `background-color:color-mix(in srgb, ${color} 18%, transparent);border-radius:3px;` } }));
              } else {
                builder.add(spanStart, wordStart, Decoration.replace({ widget: new EmptyWidget(color), inclusive: false }));
                builder.add(wordStart, wordEnd, Decoration.mark({ attributes: { style: annotationMarkCss(colorName, variant, color, theme) } }));
                builder.add(wordEnd, spanEnd, Decoration.replace({ widget: new EmptyWidget() }));
              }
              continue;
            }
            builder.add(spanStart, wordStart, Decoration.replace({ widget: new EmptyWidget(color), inclusive: false }));
            builder.add(wordStart, wordEnd, Decoration.mark({ attributes: { style: annotationMarkCss(colorName, variant, color, theme) } }));
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
      ".cm-plain-code": { color: `${theme.yellow} !important`, backgroundColor: theme.plainCodeBg, border: `1px solid ${theme.border}`, borderRadius: "4px", padding: "0 0.25rem" }
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

    return [plugin, plainTheme, plainPlugin, atomicPlugin, srtPlugin, snapFilter, srtSnapFilter];
  }

  function wrapSelectionOrWord(v: EditorView, style: number = 0) {
    const state = v.state;
    const range = state.selection.main;
    const makeInsert = (text: string): string => {
      if (style === 0) return `\`${text}\``;
      const now = new Date();
      const ts = now.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).replace(/,/g, "");
      const name = styleName(style);
      const title = customStyleTitle(name);
      const titlePart = title ? `, title: "${title}"` : "";
      return `\`${text}\`<!-- ${annotationStyleToken(name)}, ${ts}: ""${titlePart} -->`;
    };
    if (!range.empty) {
      const selectedText = state.doc.sliceString(range.from, range.to);
      const insert = makeInsert(selectedText);
      v.dispatch({
        changes: { from: range.from, to: range.to, insert },
        selection: { anchor: range.from + 1 + selectedText.length }
      });
      return true;
    }
    const docText = state.doc.toString();
    const wordRange = wordRangeAt(docText, range.from);
    if (!wordRange) return true;
    const { from, to } = wordRange;
    const wordText = state.doc.sliceString(from, to);
    const insert = makeInsert(wordText);
    v.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + 1 + wordText.length }
    });
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
        const { style: oldStyle, variant } = annotationStyleParts(m[2]);
        const newStyle = cycleStyleNumber(styleNumberForName(oldStyle), delta, false);
        const newName = styleName(newStyle);
        const updated = m[0].replace(/^`([^`]+)`<!--\s*\w+(?:\s+\w+)?,/, `\`$1\`<!-- ${annotationStyleToken(newName, variant)},`);
        currentStyle = newStyle;
        v.dispatch({ changes: { from: spanStart, to: spanEnd, insert: updated } });
        return true;
      }
    }
    return false;
  }

  function setAnnotationColorOrStyle(v: EditorView, style: number) {
    const cursor = v.state.selection.main.head;
    const docText = v.state.doc.toString();
    annotationPattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = annotationPattern.exec(docText)) !== null) {
      const spanStart = m.index, spanEnd = spanStart + m[0].length;
      if (cursor >= spanStart && cursor <= spanEnd) {
        if (style === 0) {
          const updated = `\`${m[1]}\``;
          currentStyle = 0;
          v.dispatch({
            changes: { from: spanStart, to: spanEnd, insert: updated },
            selection: { anchor: spanStart + updated.length }
          });
          return true;
        }
        const newName = styleName(style);
        const { variant } = annotationStyleParts(m[2]);
        const updated = m[0].replace(/^`([^`]+)`<!--\s*\w+(?:\s+\w+)?,/, `\`$1\`<!-- ${annotationStyleToken(newName, variant)},`);
        currentStyle = style;
        v.dispatch({
          changes: { from: spanStart, to: spanEnd, insert: updated },
          selection: { anchor: spanStart + 1 + m[1].length }
        });
        return true;
      }
    }

    currentStyle = style;
    return true;
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
  $: annotationStatusLabel = currentStyle === 0
    ? "plain"
    : `${styleName(currentStyle)} ${currentAnnotationVariant}`;
  $: currentStyleColor = styleColor(currentStyle);

  const statusPlugin = ViewPlugin.fromClass(class {
    constructor(v: EditorView) { applyEditorModeClasses(v); updateStatusFromView(v); }
    update(u: ViewUpdate) {
      applyEditorModeClasses(u.view);
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

  function visualLineMeasureTarget(state: EditorState) {
    const head = state.selection.main.head;
    if (annotationMode !== "clean") return { pos: head, side: 1 };

    const docText = state.doc.toString();
    annotationPattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = annotationPattern.exec(docText)) !== null) {
      const spanStart = match.index;
      const spanEnd = spanStart + match[0].length;
      if (head < spanStart || head > spanEnd) continue;

      const wordStart = spanStart + 1;
      const wordEnd = wordStart + match[1].length;
      const pos = Math.max(wordStart, Math.min(head, wordEnd));
      return { pos, side: head >= wordEnd ? -1 : 1 };
    }

    return { pos: head, side: 1 };
  }

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
          const target = visualLineMeasureTarget(view.state);
          const coords = view.coordsAtPos(target.pos, target.side);
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
    wordBoundary,
    wordSelectionBoundary,
    getLineStride: () => columnStride
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

  const normalModeKeydownBehavior = EditorView.domEventHandlers({
    keydown(event, v) {
      if (editorMode !== "normal") return false;
      if (event.ctrlKey || event.metaKey || event.altKey) return false;
      if (event.key !== "c" && event.key !== "C") return false;

      event.preventDefault();
      return moveCursorByColumnStride(v, event.key === "C" ? -1 : 1);
    }
  });

  // Custom keymap — all app-specific bindings
  function buildKeymap() {
    const normal = (fn: (v: EditorView) => boolean) =>
      (v: EditorView) => editorMode === "normal" ? fn(v) : false;

    return Prec.high(keymap.of([
      { any: (v, event) => editorMode === "normal" && handleVariantPickerKey(v, event) },
      // Always: Escape returns to normal
      { key: "Escape", run: v => { setMode("normal"); return true; } },
      // Always: F2 enters edit
      { key: "F2", run: v => { setMode("insert"); return true; } },
      { key: "F1", run: () => { showHelp = !showHelp; return true; } },
      { key: "Enter", run: v => finishBlockquoteEditMode(v) },
      { key: "Shift-Enter", run: v => insertBlockquoteLineBreak(v) },
      { key: "Alt-Enter", run: v => insertBlockquoteLineBreak(v) },

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
      { key: "c", run: normal(v => moveCursorByColumnStride(v, 1)) },
      { key: "C", run: normal(v => moveCursorByColumnStride(v, -1)) },
      { key: "Ctrl-w", run: normal(v => navigation.paragraphBoundary(v, "start")) },
      { key: "Ctrl-s", run: normal(v => navigation.paragraphBoundary(v, "end")) },
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
      {
        any: (v, event) => {
          if (
            editorMode !== "normal" ||
            event.key.length !== 1 ||
            event.ctrlKey ||
            event.metaKey ||
            event.altKey
          ) return false;
          const style = styleNumberForKey(event.key);
          return style === null ? false : setAnnotationColorOrStyle(v, style);
        }
      },
      { key: "Space",  run: normal(v => wrapSelectionOrWord(v, currentStyle)) },
      { key: "Enter",  run: normal(v => handleEnterInAnnotationMode(v)) },
      { key: "x",      run: normal(v => removeAnnotation(v)) },
      { key: "Tab",    run: normal(v => cycleAnnotationVariant(v, +1)) },
      { key: "Shift-Tab", run: normal(v => cycleAnnotationVariant(v, -1)) },
      { key: "q",      run: normal(v => cycleAnnotationVariant(v, -1)) },
      { key: "e",      run: normal(v => cycleAnnotationVariant(v, +1)) },
      { key: "f",      run: normal(() => { toggleMediaPlayback(); return true; }) },
      { key: "n",      run: normal(v => enterBlockquoteEditMode(v)) },
      { key: "N",      run: normal(v => { if (!cycleAnnotationColor(v, -1)) cycleStyle(-1); return true; }) },
      // Undo/redo (both modes)
      { key: "u",      run: normal(v => undo(v)) },
      { key: "U",      run: normal(v => redo(v)) },
      { key: "Ctrl-z", run: v => undo(v) },
      { key: "Ctrl-y", run: v => redo(v) },
      { key: "Ctrl-Z", run: v => redo(v) },
      { key: "?",      run: normal(() => { showHelp = !showHelp; return true; }) },
      { key: "Alt-r", run: () => { cycleAudioRate(); return true; } },
      { key: "Alt-Space",  run: () => { toggleMediaPlayback(); return true; } },
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
      normalModeKeydownBehavior,
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
      buildKeymap(),
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
      markdown({ base: markdownLanguage }),
      statusPlugin,
      summaryJumpFlashField,
      srtGutterMarkerField,
      blockquoteLinePlugin,
      columnGuidePlugin,
      visualLinePlugin,
      annotationTooltipField,
      EditorView.theme({
        ".cm-tooltip": { background: "transparent", border: "none" },
        ".cm-annotation-bubble": { display: "block" }
      }),
      themeCompartment.of(buildThemeExtensions(activeTheme))
    ];
  }

  onMount(() => {
    settingsPersistenceReady = false;
    restorePersistedSettings();
    const onWindowKeydown = (event: KeyboardEvent) => handleWindowKeydown(event);
    const onWindowPointerDown = (event: PointerEvent) => {
      if (!settingsOpen) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (settingsPopoverEl?.contains(target) || settingsButtonEl?.contains(target)) return;
      settingsOpen = false;
    };
    window.addEventListener("keydown", handleWindowKeydownCapture, true);
    window.addEventListener("keydown", onWindowKeydown);
    window.addEventListener("pointerdown", onWindowPointerDown);
    ttsAvailable = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
    const synth = speechSynth();
    const onVoicesChanged = () => refreshTtsVoices();
    if (synth) {
      refreshTtsVoices();
      synth.addEventListener("voiceschanged", onVoicesChanged);
    }
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
    openAiApiKey = loadOpenAiApiKey();
    if (openAiApiKey) rememberOpenAiApiKey = true;
    settingsPersistenceReady = true;
    persistLayoutSettings();
    persistAppSettings();
    void restoreAudioFile();

    return () => {
      window.removeEventListener("keydown", handleWindowKeydownCapture, true);
      window.removeEventListener("keydown", onWindowKeydown);
      synth?.removeEventListener("voiceschanged", onVoicesChanged);
      resetTtsState();
      window.removeEventListener("pointerdown", onWindowPointerDown);
      finishSummaryResize?.();
      finishRightPaddingDrag?.();
      editorResizeObserver.disconnect();
      clearAudioTarget();
      view?.destroy();
    };
  });
</script>

<div
  class="app"
  class:active-line-fill={currentLineHighlightStyle === "fill"}
  class:active-line-underline={currentLineHighlightStyle === "underline"}
  class:active-line-borders={currentLineHighlightStyle === "borders"}
  style={`
    --bg: ${activeTheme.bg}; --bg-soft: ${activeTheme.bgSoft}; --bg-hard: ${activeTheme.bgHard};
    --bg-alt: ${activeTheme.bgAlt}; --border: ${activeTheme.border}; --fg: ${activeTheme.fg};
    --internal-border: transparent;
    --fg-muted: ${activeTheme.fgMuted}; --yellow: ${activeTheme.yellow}; --green: ${activeTheme.green};
    --blue: ${activeTheme.blue}; --orange: ${activeTheme.orange}; --selection: ${activeTheme.selection};
    --active-style-color: ${currentStyleColor};
    --active-line-opacity-percent: ${Math.round(currentLineHighlightOpacity * 100)}%;
    --active-line-annotate: color-mix(in srgb, var(--active-style-color) var(--active-line-opacity-percent), transparent);
    --active-line-edit: color-mix(in srgb, var(--green) var(--active-line-opacity-percent), transparent);
    --active-gutter-annotate: color-mix(in srgb, var(--active-style-color) 58%, var(--bg-hard));
    --active-gutter-edit: #2f4a3a;
    --column-guide-width: ${columnGuideThickness}px;
    --app-font-family: ${layoutFontFamilyCss};
  `}
>
  <div class="toolbar">
    <div class="title">textAnnotate</div>
    <span class="subtitle">paste or load .srt, .txt, .md, .docx, .pdf</span>
    <button
      class="toolbar-btn settings-btn"
      bind:this={settingsButtonEl}
      class:active={settingsOpen}
      on:click={() => settingsOpen = !settingsOpen}
      title="Settings"
      aria-label="Settings"
      aria-expanded={settingsOpen}
    >⚙</button>
    <button class="toolbar-btn help-btn" on:click={() => showHelp = !showHelp} title="Keyboard shortcuts (?)">?</button>
  </div>

  {#if settingsOpen}
    <div
      class="settings-popover"
      bind:this={settingsPopoverEl}
      role="dialog"
      tabindex="-1"
      aria-label="Settings"
      on:keydown={event => {
        if (event.key === "Escape") {
          event.preventDefault();
          settingsOpen = false;
          view?.focus();
        }
      }}
    >
      <div class="settings-tabs" role="tablist" aria-label="Settings sections">
        <button type="button" class:active={settingsTab === "markup"} on:click={() => settingsTab = "markup"}>Markup</button>
        <button type="button" class:active={settingsTab === "layout"} on:click={() => settingsTab = "layout"}>Layout</button>
        <button type="button" class:active={settingsTab === "transcribe"} on:click={() => settingsTab = "transcribe"}>Transcribe</button>
      </div>

      {#if settingsTab === "markup"}
        <div class="settings-panel">
          <section class="settings-section">
            <div class="settings-section-heading"><span class="settings-section-icon" aria-hidden="true">↵</span><span>Import</span></div>
            <label class="settings-toggle-row">
              <span class="settings-control-icon" aria-hidden="true">¶</span>
              <span>Divide imported sentences into lines</span>
              <input type="checkbox" bind:checked={divideImportSentences} />
            </label>
          </section>
          <section class="settings-section">
            <div class="settings-section-heading"><span class="settings-section-icon" aria-hidden="true">`</span><span>Markup Visibility</span></div>
            <div class="settings-radio-group" aria-label="Markup visibility">
              <label class="settings-choice-row">
                <span class="settings-control-icon" aria-hidden="true">✓</span>
                <span>Clean</span>
                <input type="radio" name="annotationMode" value="clean"
                  checked={annotationMode === "clean"}
                  on:change={() => { annotationMode = "clean"; view?.dispatch({}); view?.focus(); }} />
              </label>
              <label class="settings-choice-row">
                <span class="settings-control-icon" aria-hidden="true">•</span>
                <span>Raw (current)</span>
                <input type="radio" name="annotationMode" value="raw"
                  checked={annotationMode === "raw"}
                  on:change={() => { annotationMode = "raw"; view?.dispatch({}); view?.focus(); }} />
              </label>
              <label class="settings-choice-row">
                <span class="settings-control-icon" aria-hidden="true">≡</span>
                <span>Raw (all)</span>
                <input type="radio" name="annotationMode" value="all"
                  checked={annotationMode === "all"}
                  on:change={() => { annotationMode = "all"; view?.dispatch({}); view?.focus(); }} />
              </label>
            </div>
          </section>
        </div>
      {:else if settingsTab === "layout"}
        <div class="settings-panel">
          <section class="settings-section">
            <div class="settings-section-heading"><span class="settings-section-icon" aria-hidden="true">Aa</span><span>Typography</span></div>
            <div class="layout-stepper-grid">
              <div class="layout-stepper">
                <span class="layout-control-icon" aria-hidden="true">↕</span>
                <span class="layout-stepper-label">Line height</span>
                <span class="layout-stepper-value">{lineHeight.toFixed(2)}</span>
                <span class="layout-stepper-buttons">
                  <button type="button" on:click={() => adjustLayoutValue("lineHeight", -1)} aria-label="Decrease line height">−</button>
                  <button type="button" on:click={() => adjustLayoutValue("lineHeight", 1)} aria-label="Increase line height">+</button>
                </span>
              </div>
              <div class="layout-stepper">
                <span class="layout-control-icon" aria-hidden="true">T</span>
                <span class="layout-stepper-label">Font size</span>
                <span class="layout-stepper-value">{fontSize}px</span>
                <span class="layout-stepper-buttons">
                  <button type="button" on:click={() => adjustLayoutValue("fontSize", -1)} aria-label="Decrease font size">−</button>
                  <button type="button" on:click={() => adjustLayoutValue("fontSize", 1)} aria-label="Increase font size">+</button>
                </span>
              </div>
              <label class="settings-field layout-font-field">
                <span class="settings-field-label">Font face</span>
                <span class="layout-font-controls">
                  <select class="settings-input" bind:value={layoutFontFamilyName}>
                    {#each fontFamilyOptions as font}
                      <option value={font.name}>{font.name}</option>
                    {/each}
                  </select>
                  <button
                    class="settings-icon-button"
                    type="button"
                    aria-label={randomizeFontOnLoad ? "Disable random font on document load" : "Enable random font on document load"}
                    title={randomizeFontOnLoad ? "Random font on load: on" : "Random font on load: off"}
                    aria-pressed={randomizeFontOnLoad}
                    on:click={() => randomizeFontOnLoad = !randomizeFontOnLoad}
                  >⇄</button>
                  <button
                    class="settings-icon-button"
                    type="button"
                    aria-label="Use next font"
                    title="Use next font"
                    on:click={rotateLayoutFontFamily}
                  >↻</button>
                </span>
              </label>
              <div class="layout-stepper">
                <span class="layout-control-icon" aria-hidden="true">¶</span>
                <span class="layout-stepper-label">Paragraph spacing</span>
                <span class="layout-stepper-value">{paragraphSpacing.toFixed(2)}</span>
                <span class="layout-stepper-buttons">
                  <button type="button" on:click={() => adjustLayoutValue("paragraphSpacing", -1)} aria-label="Decrease paragraph spacing">−</button>
                  <button type="button" on:click={() => adjustLayoutValue("paragraphSpacing", 1)} aria-label="Increase paragraph spacing">+</button>
                </span>
              </div>
            </div>
          </section>
          <section class="settings-section">
            <div class="settings-section-heading"><span class="settings-section-icon" aria-hidden="true">▣</span><span>Editor Frame</span></div>
            <label class="settings-field">
              <span class="settings-field-label">Current line highlight</span>
              <select class="settings-input" bind:value={currentLineHighlightStyle}>
                <option value="fill">Fill</option>
                <option value="underline">Underline</option>
                <option value="borders">Top and bottom</option>
              </select>
            </label>
            <label class="settings-range-row">
              <span class="settings-control-icon" aria-hidden="true">%</span>
              <span class="settings-range-label">Highlight opacity</span>
              <input
                type="range"
                min="0.08"
                max="0.7"
                step="0.02"
                bind:value={currentLineHighlightOpacity}
                class="slider"
                aria-label="Current line highlight opacity"
              />
              <span class="settings-range-value">{Math.round(currentLineHighlightOpacity * 100)}%</span>
            </label>
            <label class="settings-range-row">
              <span class="settings-control-icon" aria-hidden="true">│</span>
              <span class="settings-range-label">Column guide</span>
              <input
                type="range"
                min="1"
                max="6"
                step="1"
                bind:value={columnGuideThickness}
                class="slider"
                aria-label="Column guide thickness"
              />
              <span class="settings-range-value">{columnGuideThickness}px</span>
            </label>
            <label class="settings-range-row">
              <span class="settings-control-icon" aria-hidden="true">↔</span>
              <span class="settings-range-label">Column stride</span>
              <input
                type="range"
                min="4"
                max="120"
                step="2"
                bind:value={columnStride}
                class="slider"
                aria-label="Column movement stride"
              />
              <span class="settings-range-value">{columnStride}</span>
            </label>
            <label class="settings-range-row">
              <span class="settings-control-icon" aria-hidden="true">L</span>
              <span class="settings-range-label">Left padding</span>
              <input type="range" min="0" max="400" step="4" bind:value={padLeft} class="slider" aria-label="Left padding" />
              <span class="settings-range-value">{padLeft}</span>
            </label>
            <label class="settings-range-row">
              <span class="settings-control-icon" aria-hidden="true">R</span>
              <span class="settings-range-label">Right padding</span>
              <input type="range" min="0" max="400" step="4" bind:value={padRight} class="slider" aria-label="Right padding" />
              <span class="settings-range-value">{padRight}</span>
            </label>
            <label class="settings-range-row">
              <span class="settings-control-icon" aria-hidden="true">T</span>
              <span class="settings-range-label">Top padding</span>
              <input type="range" min="0" max="400" step="4" bind:value={padTop} class="slider" aria-label="Top padding" />
              <span class="settings-range-value">{padTop}</span>
            </label>
            <label class="settings-range-row">
              <span class="settings-control-icon" aria-hidden="true">B</span>
              <span class="settings-range-label">Bottom padding</span>
              <input type="range" min="0" max={Math.max(0, editorViewportHeight - 48)} step="4" bind:value={padBottom} class="slider" aria-label="Bottom padding" />
              <span class="settings-range-value">{padBottom}</span>
            </label>
          </section>
          <section class="settings-section">
            <div class="settings-section-heading"><span class="settings-section-icon" aria-hidden="true">❝</span><span>Notes</span></div>
            <label class="settings-range-row">
              <span class="settings-control-icon" aria-hidden="true">A</span>
              <span class="settings-range-label">Alignment</span>
              <input
                type="range"
                min="0"
                max="2"
                step="1"
                class="slider"
                aria-label="Notes alignment"
                disabled={!blockquoteActive}
                value={blockquoteAlign === "left" ? 0 : blockquoteAlign === "center" ? 1 : 2}
                on:input={e => {
                  const align = ["left", "center", "right"][+(e.target as HTMLInputElement).value] as BlockquoteAlign;
                  if (view) updateCurrentBlockquote(view, { align });
                }}
              />
              <span class="settings-range-value">{blockquoteAlign[0].toUpperCase()}</span>
            </label>
            <label class="settings-range-row">
              <span class="settings-control-icon" aria-hidden="true">W</span>
              <span class="settings-range-label">Width</span>
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
              <span class="settings-range-value">{blockquoteBgWidth}</span>
            </label>
          </section>
        </div>
      {:else if settingsTab === "transcribe"}
        <div class="settings-panel">
          <section class="settings-section">
            <div class="settings-section-heading"><span class="settings-section-icon" aria-hidden="true">⎋</span><span>Connection</span></div>
            <label class="settings-field">
              <span class="settings-field-label">OpenAI API key</span>
              <input
                class="settings-input"
                type="password"
                autocomplete="off"
                placeholder="sk-..."
                value={openAiApiKey}
                on:input={handleOpenAiKeyInput}
              />
            </label>
            <label class="settings-toggle-row">
              <span class="settings-control-icon" aria-hidden="true">◎</span>
              <span>Remember key on this device</span>
              <input type="checkbox" checked={rememberOpenAiApiKey} on:change={toggleRememberOpenAiKey} />
            </label>
          </section>
          <section class="settings-section">
            <div class="settings-section-heading"><span class="settings-section-icon" aria-hidden="true">▣</span><span>Transcription</span></div>
            <label class="settings-field">
              <span class="settings-field-label">Model</span>
              <select class="settings-input" bind:value={transcriptionModel}>
                <option value="whisper-1">whisper-1 (timestamps)</option>
                <option value="gpt-4o-transcribe">gpt-4o-transcribe</option>
                <option value="gpt-4o-mini-transcribe">gpt-4o-mini-transcribe</option>
              </select>
            </label>
            <label class="settings-field">
              <span class="settings-field-label">Prompt</span>
              <textarea
                class="settings-input settings-textarea"
                rows="3"
                bind:value={transcriptionPrompt}
                placeholder="Names, terms, or context"
              ></textarea>
            </label>
            {#if transcriptionStatus}
              <div class="transcribe-status">{transcriptionStatus}</div>
            {/if}
            {#if transcriptionError}
              <div class="transcribe-error">{transcriptionError}</div>
            {/if}
          </section>
        </div>
      {/if}
    </div>
  {/if}

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
        {#if audioSourceFile}
          <button class="sidebar-label load-btn" on:click={transcribeLoadedAudio} disabled={transcriptionBusy}>
            {transcriptionBusy ? "Transcribing..." : "Transcribe"}
          </button>
        {/if}
        {#if transcriptionBusy || transcriptionStatus || transcriptionError}
          <div class="transcribe-inline-status" class:error={!!transcriptionError}>
            {transcriptionError || transcriptionStatus || "Transcribing..."}
          </div>
        {/if}
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
        <button class="sidebar-theme-toggle load-btn sidebar-label" type="button" on:click={toggleThemeMode} aria-label="Toggle theme">THEME: {activeThemeName}</button>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-label">Annotation styles</div>
        <div class="sidebar-hint">Tab / Shift+Tab: variation</div>
        <div class="style-list sidebar-style-list">
          {#each highlightStyles as style, index}
            <div
              class="style-row"
              class:active-style={currentStyle === index + 1}
              role="listitem"
            >
              <button
                class="style-swatch"
                class:variant-fill={currentStyle === index + 1 && currentAnnotationVariant === "fill"}
                class:variant-box={currentStyle === index + 1 && currentAnnotationVariant === "box"}
                class:variant-underline={currentStyle === index + 1 && currentAnnotationVariant === "underline"}
                class:variant-rail={currentStyle === index + 1 && currentAnnotationVariant === "rail"}
                class:variant-bars={currentStyle === index + 1 && currentAnnotationVariant === "bars"}
                style={`--swatch-color: ${style.color}; --swatch-text: ${annotationTextColorForStyle(style.name, style.color)}`}
                type="button"
                title={`Use ${styleDisplayTitle(style.name)}${currentStyle === index + 1 ? ` (${currentAnnotationVariant})` : ""}`}
                aria-label={`Use ${styleDisplayTitle(style.name)}${currentStyle === index + 1 ? `, ${currentAnnotationVariant} variant` : ""}`}
                on:click={() => { currentStyle = index + 1; view?.focus(); }}
              ></button>
              {#if editingStyleKeyName === style.name}
                <input
                  class="style-key-badge style-key-input"
                  bind:this={styleKeyInput}
                  bind:value={styleKeyDraft}
                  aria-label={`Shortcut key for ${styleDisplayTitle(style.name)}`}
                  on:click={event => event.stopPropagation()}
                  on:blur={saveStyleKey}
                  on:keydown={handleStyleKeyKeydown}
                />
              {:else}
                <button
                  class="style-key-badge style-key-action"
                  type="button"
                  title={`Edit shortcut key for ${styleDisplayTitle(style.name)}`}
                  on:click={event => startStyleKeyEdit(event, style.name)}
                  on:keydown={event => event.stopPropagation()}
                >
                  {styleKeyForName(style.name)}
                </button>
              {/if}
              <span class="style-separator" aria-hidden="true">:</span>
              {#if editingStyleTitleName === style.name}
                <input
                  class="style-name style-title-input"
                  bind:this={styleTitleInput}
                  bind:value={styleTitleDraft}
                  aria-label={`Title for ${style.name}`}
                  on:click={event => event.stopPropagation()}
                  on:focus={event => focusInputAtEnd(event.target as HTMLInputElement)}
                  on:blur={saveStyleTitle}
                  on:keydown={handleStyleTitleKeydown}
                />
              {:else}
                <button
                  class="style-name style-title-action"
                  type="button"
                  title={`Edit ${styleDisplayTitle(style.name)} title`}
                  on:click={event => startStyleTitleEdit(event, style.name)}
                  on:keydown={event => event.stopPropagation()}
                >
                  {styleDisplayTitle(style.name)}
                </button>
              {/if}
              <span
                class="style-variant-badge"
                class:visible={currentStyle === index + 1}
                title={currentStyle === index + 1 ? `Current variation: ${currentAnnotationVariant}` : undefined}
              >
                {currentStyle === index + 1 ? annotationVariantLabel(currentAnnotationVariant) : ""}
              </span>
              {#if style.custom}
                <button
                  class="style-remove-button"
                  type="button"
                  title={`Remove ${styleDisplayTitle(style.name)}`}
                  aria-label={`Remove ${styleDisplayTitle(style.name)}`}
                  on:click={event => { event.stopPropagation(); removeCustomStyle(style.name); }}
                >×</button>
              {/if}
            </div>
          {/each}
        </div>
        <button class="add-style-inline" type="button" on:click={() => addStyleModalOpen = true} aria-label="Add annotation style">+</button>
      </div>

    </div>

    <div class="editor" bind:this={editorEl} style={`--editor-right-padding: ${padRight}px;`}>
      <button
        class="right-padding-handle"
        type="button"
        aria-label="Drag right text border"
        title="Drag right text border"
        on:pointerdown={startRightPaddingDrag}
      ></button>
    </div>

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
            {#if summaryGroupIds.length > 0}
              <button
                class="summary-icon-btn"
                type="button"
                title={summaryAllGroupsExpanded ? "Collapse all groups" : "Expand all groups"}
                aria-label={summaryAllGroupsExpanded ? "Collapse all groups" : "Expand all groups"}
                aria-pressed={summaryAllGroupsExpanded}
                on:click={toggleAllSummaryCategories}
              >
                {summaryAllGroupsExpanded ? "−" : "+"}
              </button>
            {/if}
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
          {#if !summaryCollapsed}
            <button class="summary-export-btn" type="button" on:click={exportSummaryHtml}>EXPORT</button>
          {/if}
        </div>
      </div>
      {#if summaryCollapsed}
        <div class="summary-collapsed-count">{summaryItems.length}</div>
      {:else}
      <div class="summary-list">
        {#if summaryItems.length === 0}
          <div class="summary-empty">No annotations</div>
        {:else}
          {#each orderedSummarySections as section (section.id)}
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
                class:reorderable={section.itemType === "annotation"}
                class:drag-over={section.itemType === "annotation" && reorderDropTarget?.id === section.id}
                class:drop-after={section.itemType === "annotation" && reorderDropTarget?.id === section.id && reorderDropTarget.after}
                class:drop-before={section.itemType === "annotation" && reorderDropTarget?.id === section.id && !reorderDropTarget.after}
                role="button"
                tabindex="0"
                aria-expanded={!!expandedSummaryCategories[section.id]}
                on:click={() => toggleSummaryCategory(section.id)}
                on:dragover={event => section.itemType === "annotation" && updateSummaryReorderDropTarget(section.id, event)}
                on:drop={event => {
                  if (section.itemType === "annotation" && reorderDropTarget?.id === section.id) {
                    event.preventDefault();
                    commitSummaryReorder(section.id, reorderDropTarget.after);
                  }
                  finishReorderDrag();
                }}
                on:dragend={event => section.itemType === "annotation" && finishReorderDrag()}
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
                {#if section.itemType === "annotation"}
                  <button
                    class="reorder-handle"
                    type="button"
                    draggable="true"
                    aria-label={`Drag ${section.label} to reorder`}
                    title={`Drag ${section.label} to reorder`}
                    on:mousedown={event => event.stopPropagation()}
                    on:click={event => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    on:dragstart={event => setSummaryReorderDragState(section.id, event)}
                  >↕</button>
                {/if}
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
      <div class="status-cluster status-primary">
        <span class="status-mode" style="--mode-color: {editorMode === 'insert' ? activeTheme.green : activeTheme.orange}">{editorModeLabel}</span>
        <span class="status-annotation" style={`--swatch-color: ${currentStyleColor}; --swatch-text: ${annotationTextColorForStyle(styleName(currentStyle), currentStyleColor)}`}>
          <span
            class="status-swatch"
            class:variant-fill={currentAnnotationVariant === "fill"}
            class:variant-box={currentAnnotationVariant === "box"}
            class:variant-underline={currentAnnotationVariant === "underline"}
            class:variant-rail={currentAnnotationVariant === "rail"}
            class:variant-bars={currentAnnotationVariant === "bars"}
            aria-hidden="true"
          ></span>
          <span>{annotationStatusLabel}</span>
        </span>
      </div>
      <div class="status-center" class:empty={!audioUrl && !showTtsWidget}>
        {#if audioUrl}
          <div class="audio-widget">
            <span class="audio-name">{audioFileName}</span>
            <span class="audio-sep">|</span>
            <button class="audio-glyph" type="button" on:click={() => seekAudioAndPlay(-mediaSeekSeconds)} title={`Back ${mediaSeekSeconds} seconds`} aria-label={`Back ${mediaSeekSeconds} seconds`}>&lt;&lt;</button>
            <button class="audio-glyph play" type="button" on:click={toggleMediaPlayback} title="Play / pause" aria-label="Play / pause">{audioPlaying ? "⏸" : "▶"}</button>
            <button class="audio-glyph" type="button" on:click={() => seekAudioAndPlay(mediaSeekSeconds)} title={`Forward ${mediaSeekSeconds} seconds`} aria-label={`Forward ${mediaSeekSeconds} seconds`}>&gt;&gt;</button>
            <span class="audio-sep">|</span>
            <button class="audio-rate-text" type="button" on:click={cycleAudioRate} aria-label="Playback speed" title="Playback speed">{audioRateText}</button>
            <span class="audio-sep">|</span>
            <span class="audio-time">{formatAudioTime(audioCurrentTime)} / {formatAudioTime(audioDuration)}</span>
          </div>
        {:else if showTtsWidget}
          <div class="audio-widget">
            <span class="audio-name">TTS</span>
            <span class="audio-sep">|</span>
            <button class="audio-glyph" type="button" on:click={() => stepTts(-1)} title="Previous spoken chunk" aria-label="Previous spoken chunk">&lt;&lt;</button>
            <button class="audio-glyph play" type="button" on:click={toggleTtsPlayback} title="Play / pause TTS" aria-label="Play / pause TTS">{ttsSpeaking && !ttsPaused ? "⏸" : "▶"}</button>
            <button class="audio-glyph" type="button" on:click={() => stepTts(1)} title="Next spoken chunk" aria-label="Next spoken chunk">&gt;&gt;</button>
            <span class="audio-sep">|</span>
            <button class="audio-rate-text" type="button" on:click={cycleAudioRate} aria-label="TTS speed" title="TTS speed">{audioRateText}</button>
            <span class="audio-sep">|</span>
            <span class="audio-time">{ttsProgressText}</span>
          </div>
        {/if}
      </div>
      <div class="status-cluster status-meta">
        <span class="status-item">{selectionInfo}</span>
        <span class="status-item">{wordCountInfo}</span>
        <span class="status-item">Ln {line}</span>
        <span class="status-item">Col {column}</span>
        <span class="status-file">{loadedFileType}</span>
      </div>
    </div>
  {/if}

  {#if addStyleModalOpen}
    <div class="style-modal-overlay" role="presentation">
      <div
        class="style-modal"
        role="dialog"
        tabindex="-1"
        aria-label="Add annotation style"
        on:keydown={event => {
          if (event.key === "Escape") {
            event.preventDefault();
            addStyleModalOpen = false;
          }
        }}
      >
        <div class="style-modal-header">
          <div>Add style</div>
          <button type="button" on:click={() => addStyleModalOpen = false} aria-label="Close add style dialog">×</button>
        </div>
        <label class="style-modal-field">
          <span>Color</span>
          <select
            class="style-modal-select"
            bind:value={newStyleColorName}
            aria-label="New annotation style color"
            on:change={handleNewStyleColorName}
          >
            {#each namedStyleColors as color}
              <option value={color.name}>{color.name}</option>
            {/each}
          </select>
        </label>
        <div class="style-modal-colors" role="listbox" aria-label="Named colors">
          {#each namedStyleColors as color}
            <button
              class="style-modal-color"
              class:active={newStyleColorName === color.name}
              type="button"
              style={`--swatch-color: ${color.color}`}
              on:click={() => { newStyleColorName = color.name; newStyleName = color.name; }}
            >
              <span aria-hidden="true"></span>
              <span>{color.name}</span>
            </button>
          {/each}
        </div>
        <label class="style-modal-field">
          <span>Name</span>
          <input
            class="style-modal-input"
            bind:value={newStyleName}
            aria-label="New annotation style name"
            on:keydown={event => {
              event.stopPropagation();
              if (event.key === "Enter") {
                event.preventDefault();
                addCustomStyle();
              } else if (event.key === "Escape") {
                event.preventDefault();
                addStyleModalOpen = false;
              }
            }}
          />
        </label>
        <div class="style-modal-actions">
          <button type="button" on:click={() => addStyleModalOpen = false}>Cancel</button>
          <button type="button" class="primary" on:click={addCustomStyle}>Add</button>
        </div>
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
    <PdfReviewModal
      {pdfPreviewUrl}
      {pdfFileName}
      {pdfParseError}
      bind:pdfDraftText
      {pdfSourceLines}
      {pdfIsParsing}
      {closePdfModal}
      {loadPdfDraft}
    />
  {/if}
</div>
