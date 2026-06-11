<script lang="ts">
  import { onMount, tick } from "svelte";
  import { Compartment, EditorState, type Extension } from "@codemirror/state";
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
    selectLineStart, selectLineEnd
  } from "@codemirror/commands";
  import { searchKeymap } from "@codemirror/search";
  import { RangeSetBuilder } from "@codemirror/state";
  import {
    indentOnInput, bracketMatching,
    syntaxHighlighting
  } from "@codemirror/language";
  import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
  import JSZip from "jszip";
  import * as pdfjsLib from "pdfjs-dist";
  import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
  import {
    annotationPattern,
    annotationWithTitle,
    summaryVisibleText
  } from "./lib/annotations";
  import { createNavigationCommands } from "./lib/navigation";
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
    parseSrtTimestampLine,
    parseTimestampToSeconds,
    srtLineExitPosition,
    srtPattern,
    srtTimestampForTranscriptLine
  } from "./lib/srt";
  import {
    buildEditorKeymap,
    customShortcutDefinitions,
    isAudioShortcut,
    isAppShortcutCandidate,
    isModeShortcut,
    keyboardHelpSections,
    normalizeStyleKey,
    normalizeShortcutBinding,
    reservedStyleKeys,
    shortcutBindingFromEvent,
    type CustomShortcutAction
  } from "./lib/keyboard";
  import PdfReviewModal from "./lib/PdfReviewModal.svelte";

  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

  const unifiedPreferencesStorageKey = "textAnnotate-preferences";
  const layoutStorageKey = "cm6-layout-settings";
  const appSettingsStorageKey = "textAnnotate-settings";
  const notesStorageKey = "textAnnotate-notes";
  const notesOpenStorageKey = "textAnnotate-notes-open";
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
  const defaultFontFavorites: string[] = [];

  let editorEl: HTMLDivElement;
  let view: EditorView;
  let fileInput: HTMLInputElement;
  const initialLayoutSettings = loadLayoutSettings();
  let padLeft = initialLayoutSettings.padLeft ?? 40;
  let padRight = initialLayoutSettings.padRight ?? 40;
  let padTop = initialLayoutSettings.padTop ?? 16;
  let padBottom = initialLayoutSettings.padBottom ?? 64;
  let editorViewportHeight = 0;
  let cursorScrollMarginTopLines = initialLayoutSettings.cursorScrollMarginTopLines ?? initialLayoutSettings.cursorScrollMarginLines ?? 4;
  let cursorScrollMarginBottomLines = initialLayoutSettings.cursorScrollMarginBottomLines ?? initialLayoutSettings.cursorScrollMarginLines ?? 4;
  let lineHeight = initialLayoutSettings.lineHeight ?? 1.6;
  let fontSize = initialLayoutSettings.fontSize ?? 14;
  let paragraphSpacing = initialLayoutSettings.paragraphSpacing ?? 0;
  let currentLineHighlightStyle: "fill" | "underline" | "borders" = initialLayoutSettings.currentLineHighlightStyle ?? "fill";
  let currentLineHighlightOpacity = initialLayoutSettings.currentLineHighlightOpacity ?? 0.34;
  let columnGuideThickness = initialLayoutSettings.columnGuideThickness ?? 1;
  let columnStride = initialLayoutSettings.columnStride ?? 40;
  let wordNavigation = initialLayoutSettings.wordNavigation ?? initialLayoutSettings.arrowWordNavigation ?? false;
  let wasdNavigation = initialLayoutSettings.wasdNavigation ?? initialLayoutSettings.wasdWordNavigation ?? false;
  let hjklNavigation = initialLayoutSettings.hjklNavigation ?? initialLayoutSettings.hjklWordNavigation ?? false;
  let layoutFontFamilyName = initialLayoutSettings.fontFamilyName ?? defaultFontFamilyName;
  let layoutFontFavorites = initialLayoutSettings.fontFavorites ?? defaultFontFavorites;
  let randomizeFontOnLoad = initialLayoutSettings.randomizeFontOnLoad ?? false;
  let rotateFontOnLoad = initialLayoutSettings.rotateFontOnLoad ?? false;
  let showHelp = false;
  let settingsOpen = false;
  let settingsPersistenceReady = false;
  let settingsButtonEl: HTMLButtonElement | null = null;
  let settingsPopoverEl: HTMLDivElement | null = null;
  type SettingsTab = "layout" | "shortcuts" | "import";
  type AnnotationMode = "clean" | "raw" | "all" | "sticky" | "superscript" | "subscript";
  type AppSettings = {
    annotationMode: AnnotationMode;
    settingsTab: SettingsTab;
    rememberOpenAiApiKey: boolean;
    transcriptionModel: string;
    transcriptionPrompt: string;
  };
  const initialAppSettings = loadAppSettings();
  let settingsTab: SettingsTab = initialAppSettings.settingsTab;
  type ImportLineMode = "original" | "sentences" | "reflow";
  let importLineMode: ImportLineMode = initialLayoutSettings.importLineMode ?? (initialLayoutSettings.divideImportSentences === false ? "original" : "sentences");
  const annotationCommentOpen = "<" + "!--";
  const annotationStylePrefixPattern = new RegExp("^`([^`]+)`" + annotationCommentOpen + "\\s*\\w+(?:\\s+\\w+)?,");
  let pdfModalOpen = false;
  let pdfDraftText = "";
  let pdfSourceLines: string[] = [];
  let pdfDocumentMapPages: DocumentMapPagePreview[] = [];
  let pdfPreviewUrl = "";
  let pdfFileName = "";
  let pdfIsParsing = false;
  let pdfParseError = "";
  let sessionNotes = loadSessionNotes();
  let sidebarNotesOpen = loadSidebarNotesOpen();
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
  let audioRateIndex = 2;
  const audioRates = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
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
  let loadedFileName = "Untitled";
  let customShortcuts = initialLayoutSettings.customShortcuts ?? {};
  let shortcutEditAction: CustomShortcutAction | null = null;
  let shortcutEditDraft = "";
  let shortcutEditError = "";
  $: if (audioElement) audioElement.playbackRate = audioRates[audioRateIndex];
  $: audioRateText = audioRateLabel(audioRateIndex);
  $: showTtsWidget = ttsAvailable && !audioUrl && loadedFileType !== "SRT";
  $: ttsProgressText = ttsStatus || (ttsSegments.length ? `${Math.min(ttsIndex + 1, ttsSegments.length)}/${ttsSegments.length}` : "ready");

  let currentStyle = 0;
  type AnnotationStyle = { name: string; color: string; colorName?: string };
  type AnnotationVariant = "fill" | "box" | "underline" | "rail" | "bars";
  const annotationVariants: AnnotationVariant[] = ["fill", "box", "underline", "rail", "bars"];
  type AnnotationPreview = { from: number; to: number; style: number; variant: AnnotationVariant };
  const namedStyleColors = [
    { name: "red", color: "#fb4934" },
    { name: "green", color: "#b8bb26" },
    { name: "callout", color: "currentColor" },
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
  let annotationPreview: AnnotationPreview | null = null;
  let variantPickerOpen = false;
  let addStyleModalOpen = false;
  let newStyleColorName = "steel";
  let newStyleName = newStyleColorName;
  let newStyleKeyDraft = "";
  let newStyleKeyError = "";
  let annotationMode: AnnotationMode = initialAppSettings.annotationMode;
  let blockquoteAlign = initialLayoutSettings.blockquoteAlign ?? 0;
  let blockquoteBgWidth = 100;
  let blockquoteEditReturnAnchor: number | null = null;
  let editorMode: "normal" | "insert" = "normal";
  let stickySelectionActive = false;
  let shiftSelectionActive = false;
  type VisualLineSelectionState = { anchorFrom: number; anchorTo: number; headFrom: number; headTo: number };
  let visualLineSelectionState: VisualLineSelectionState | null = null;
  let line = 1;
  let column = 1;
  let selectionInfo = "0 selected";
  let wordCountInfo = "0 words";
  type SummaryAnnotationContext = { before: string; text: string; after: string };
  type SummaryAnnotationItem = { type: "annotation"; id: string; colorName: string; title: string; color: string; text: string; context: SummaryAnnotationContext; comment: string; timestamp: string; line: number; from: number; to: number; spanStart: number };
  type SummaryItem =
    | SummaryAnnotationItem
    | { type: "blockquote"; id: string; text: string; line: number; from: number; to: number };
  type DocumentMapLine = {
    line: number;
    from: number;
    blank: boolean;
    width: number;
    indent: number;
    top: number;
    height: number;
  };
  type DocumentMapPagePreview = {
    kind: "pdf" | "docx";
    page: number;
    width: number;
    height: number;
    dataUrl?: string;
    html?: string;
  };
  type SummarySection =
    | { kind: "item"; id: string; item: SummaryItem }
    | { kind: "group"; id: string; label: string; count: number; color: string; itemType: SummaryItem["type"]; items: SummaryItem[] };
  type ReorderDragState = { kind: "summary"; id: string } | null;
  type ReorderDropTarget = { kind: "summary"; id: string; after: boolean } | null;
  let summaryItems: SummaryItem[] = [];
  let summarySections: SummarySection[] = [];
  let summaryCategoryOrder: string[] = [];
  let expandedSummaryCategories: Record<string, boolean> = {};
  let documentMapLines: DocumentMapLine[] = [];
  let documentMapLineCount = 0;
  let documentMapTotalHeight = 0;
  let documentMapViewportTop = 0;
  let documentMapViewportHeight = 0;
  let documentMapCurrentLine = 1;
  let sourceDocumentMapLines: string[] = [];
  let documentMapPages: DocumentMapPagePreview[] = [];
  let documentPreviewOpen = false;
  let documentPreviewZoom = 0.42;
  let documentPreviewButtonEl: HTMLButtonElement | null = null;
  let documentPreviewPopoverEl: HTMLDivElement | null = null;
  $: orderedSummarySections = orderSummarySections(summarySections, summaryCategoryOrder);
  $: summaryGroupIds = orderedSummarySections.filter(section => section.kind === "group").map(section => section.id);
  $: summaryAnnotationGroupIds = orderedSummarySections
    .filter(section => section.kind === "group" && section.itemType === "annotation")
    .map(section => section.id);
  $: summaryAllGroupsExpanded = summaryGroupIds.length > 0 && summaryGroupIds.every(id => expandedSummaryCategories[id]);
  $: documentPreviewZoomLabel = `${Math.round(documentPreviewZoom * 100)}%`;
  let reorderDragState: ReorderDragState = null;
  let reorderDropTarget: ReorderDropTarget = null;
  let summaryCollapsed = true;
  let leftSidebarCollapsed = false;
  let summaryFullscreen = false;
  let summarySidebarWidth = 320;
  let editingSummaryTitleKey: string | null = null;
  let summaryTitleDraft = "";
  let editingStyleTitleName: string | null = null;
  let styleTitleDraft = "";
  let styleTitleInput: HTMLInputElement | null = null;
  let editingStyleKeyName: string | null = null;
  let styleKeyDraft = "";
  let styleKeyError = "";
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
    cursorScrollMarginTopLines;
    cursorScrollMarginBottomLines;
    lineHeight;
    fontSize;
    paragraphSpacing;
    layoutFontFamilyName;
    layoutFontFavorites;
    randomizeFontOnLoad;
    rotateFontOnLoad;
    currentLineHighlightStyle;
    currentLineHighlightOpacity;
    columnGuideThickness;
    columnStride;
    wordNavigation;
    wasdNavigation;
    hjklNavigation;
    customShortcuts;
    blockquoteAlign;
    blockquoteBgWidth;
    importLineMode;
    persistLayoutSettings();
    view?.dispatch({});
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
  $: scrollBorderEstimatedLinePx = Math.max(1, fontSize * lineHeight);
  $: scrollBorderLineLimit = editorViewportHeight > 1 ? Math.max(0, Math.floor((editorViewportHeight - 1) / scrollBorderEstimatedLinePx)) : 16;
  $: scrollBorderTopEffectiveLines = Math.min(cursorScrollMarginTopLines, scrollBorderLineLimit);
  $: scrollBorderBottomEffectiveLines = Math.min(cursorScrollMarginBottomLines, scrollBorderLineLimit);
  $: scrollBorderTopViewportPercent = editorViewportHeight > 1 ? Math.round(Math.min(editorViewportHeight - 1, scrollBorderTopEffectiveLines * scrollBorderEstimatedLinePx) / editorViewportHeight * 100) : 0;
  $: scrollBorderBottomViewportPercent = editorViewportHeight > 1 ? Math.round(Math.min(editorViewportHeight - 1, scrollBorderBottomEffectiveLines * scrollBorderEstimatedLinePx) / editorViewportHeight * 100) : 0;
  $: if (editorViewportHeight > 1 && cursorScrollMarginTopLines > scrollBorderLineLimit) cursorScrollMarginTopLines = scrollBorderLineLimit;
  $: if (editorViewportHeight > 1 && cursorScrollMarginBottomLines > scrollBorderLineLimit) cursorScrollMarginBottomLines = scrollBorderLineLimit;
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

  async function clearPersistedAudioFile() {
    try {
      const db = await openAudioDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(audioStoreName, "readwrite");
        tx.objectStore(audioStoreName).delete("current");
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
    loadedFileName = file.name;
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
    if (audioElement) audioElement.playbackRate = audioRates[audioRateIndex];
    if (ttsUtterance) ttsUtterance.rate = audioRates[audioRateIndex];
  }

  function audioRateLabel(index = audioRateIndex) {
    const rate = audioRates[index] ?? 1;
    return `x${Number.isInteger(rate) ? rate.toFixed(0) : rate.toFixed(2)}`;
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

  function seekMediaTransport(direction: 1 | -1, seconds = mediaSeekSeconds) {
    if (!audioElement || !audioLoaded) {
      stepTts(direction);
      return;
    }
    seekAudio(direction * seconds);
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

  function waitForTtsVoices(timeoutMs = 1800) {
    const synth = speechSynth();
    if (!synth) return Promise.resolve([] as SpeechSynthesisVoice[]);
    const existingVoices = synth.getVoices();
    if (existingVoices.length) return Promise.resolve(existingVoices);

    ttsStatus = "loading voice";
    return new Promise<SpeechSynthesisVoice[]>(resolve => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        synth.removeEventListener("voiceschanged", finish);
        resolve(synth.getVoices());
      };

      timer = setTimeout(finish, timeoutMs);
      synth.addEventListener("voiceschanged", finish);
    });
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
    void startTtsSegment(index, ttsRunId, useBrowserDefaultVoice);
  }

  async function startTtsSegment(index: number, runId: number, useBrowserDefaultVoice = false) {
    const synth = speechSynth();
    const segment = ttsSegments[index];
    const Utterance = typeof window === "undefined" ? null : window.SpeechSynthesisUtterance;
    if (!synth || !Utterance) {
      ttsStatus = "unavailable";
      return;
    }
    if (!segment) return;

    if (ttsSpeakTimer) {
      clearTimeout(ttsSpeakTimer);
      ttsSpeakTimer = null;
    }
    synth.cancel();

    ttsUtterance = null;
    ttsIndex = index;
    ttsSpeaking = false;
    ttsPaused = false;
    ttsStatus = "queued";

    const voices = await waitForTtsVoices();
    if (runId !== ttsRunId) return;
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
      if (index < ttsSegments.length - 1) {
        ttsIndex = index + 1;
        void startTtsSegment(ttsIndex, runId);
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
        void startTtsSegment(index, runId, true);
        return;
      }
      ttsStatus = event.error === "interrupted" || event.error === "canceled" ? "" : event.error;
      if (ttsStatus) console.warn("TTS failed", event.error);
    };

    ttsUtterance = utterance;
    ttsIndex = index;
    ttsSpeaking = false;
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

    ttsSpeakTimer = setTimeout(startSpeaking, 0);
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

  function shouldDeferWindowShortcut(event: KeyboardEvent) {
    if (isTextEntryTarget(event.target)) return true;
    if (isFormControlTarget(event.target) && !isModeShortcut(event) && !isAudioShortcut(event)) return true;
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

    handleMediaShortcut(event.key);
  }

  function handleMediaShortcut(key: string) {
    const normalized = key.toLowerCase();
    if (key === " ") {
      toggleMediaPlayback();
      return;
    }

    const direction =
      key === "ArrowLeft" ||
      key === "Left" ||
      normalized === "mediarewind" ||
      normalized === "mediatrackprevious"
        ? -1
        : 1;
    seekMediaTransport(direction, mediaSeekSeconds);
  }

  function handleWindowKeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && documentPreviewOpen) {
      documentPreviewOpen = false;
      event.preventDefault();
      event.stopPropagation();
      documentPreviewButtonEl?.focus();
      return;
    }
    if (event.key === "Escape" && settingsOpen) {
      settingsOpen = false;
      event.preventDefault();
      event.stopPropagation();
      view?.focus();
      return;
    }
    if (event.defaultPrevented || isEditorEventTarget(event.target) || shouldDeferWindowShortcut(event)) return;
    handleAudioKeydown(event);
    if (event.defaultPrevented || !view) return;

    const isPrintableNormalKey =
      editorMode === "normal" &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      event.key.length === 1;

    if (isPrintableNormalKey) {
      runScopeHandlers(view, event, "editor");
      event.preventDefault();
      event.stopPropagation();
      requestAnimationFrame(() => view?.focus());
      return;
    }

    if (!isAppShortcutCandidate(event, styleNumberForKey)) return;
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

  function replaceDocument(
    text: string,
    preserveLineBreaks = false,
    sourceLines: string[] = [],
    pagePreviews: DocumentMapPagePreview[] = []
  ) {
    if (!view) return;
    sourceDocumentMapLines = sourceLines;
    documentMapPages = pagePreviews;
    applyDocumentLoadFontPreference();
    const normalized = text.replace(/\r\n?/g, "\n").trim();
    const insert = importTextForEditor(normalized, preserveLineBreaks);
    const initialCursor = firstVisibleDocumentPosition(insert);
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert },
      selection: { anchor: initialCursor },
      effects: EditorView.scrollIntoView(initialCursor, { y: "start", yMargin: 0 })
    });
    removeBlockquoteMetaMarkup(view);
    view.focus();
  }

  function importTextForEditor(text: string, preserveLineBreaks = false) {
    if (preserveLineBreaks || importLineMode === "original") return text;
    if (importLineMode === "reflow") return reflowImportedText(text);
    return sentenceLineBreaks(text);
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

  function reflowImportedText(text: string) {
    const columns = importReflowColumns();
    return text
      .replace(/\r\n?/g, "\n")
      .split(/\n{2,}/)
      .map(block => wrapTextBlock(block.replace(/\s*\n\s*/g, " ").replace(/[ \t]+/g, " ").trim(), columns))
      .filter(Boolean)
      .join("\n\n");
  }

  function importReflowColumns() {
    const editorWidth = editorEl?.clientWidth || 760;
    const availableWidth = Math.max(120, editorWidth - padLeft - padRight);
    const charWidth = measureImportReflowCharWidth();
    return Math.max(20, Math.min(140, Math.floor(availableWidth / charWidth)));
  }

  function measureImportReflowCharWidth() {
    const content = view?.dom.querySelector<HTMLElement>(".cm-content");
    if (!content) return view?.defaultCharacterWidth || fontSize * 0.58 || 8;

    const sample = "The quick brown fox jumps over the lazy dog. Students write naturally, with commas, spaces, and varied words.";
    const computed = getComputedStyle(content);
    const probe = document.createElement("span");
    probe.textContent = sample;
    probe.style.cssText = [
      "position:absolute",
      "visibility:hidden",
      "pointer-events:none",
      "white-space:pre",
      "inset:auto",
      "width:auto",
      "height:auto",
      "padding:0",
      "margin:0",
      "border:0"
    ].join(";");
    probe.style.font = computed.font;
    probe.style.letterSpacing = computed.letterSpacing;
    content.appendChild(probe);
    const width = probe.getBoundingClientRect().width;
    probe.remove();
    return width > 0 ? width / sample.length : view?.defaultCharacterWidth || fontSize * 0.58 || 8;
  }

  function wrapTextBlock(block: string, columns: number) {
    if (!block) return "";
    const words = block.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      if (!line) {
        line = word;
        continue;
      }
      if (`${line} ${word}`.length > columns) {
        lines.push(line);
        line = word;
      } else {
        line += ` ${word}`;
      }
    }
    if (line) lines.push(line);
    return lines.join("\n");
  }

  async function loadFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = "";
    if (!files.length) return;
    clearActiveSaveTarget();
    const audioFile = files.find(isMediaFile);
    const documentFiles = files.filter(file => !isMediaFile(file));
    if (audioFile) await loadAudioFile(audioFile);
    else if (documentFiles.length) {
      clearAudioTarget();
      await clearPersistedAudioFile();
    }
    if (!documentFiles.length) return;

    if (documentFiles.length === 1 && isPdfFile(documentFiles[0])) {
      loadedFileName = documentFiles[0].name;
      loadedFileType = "PDF";
      await openPdfModal(documentFiles[0]);
      return;
    }

    const documents = await Promise.all(documentFiles.map(documentTextFromFile));
    const multiple = documents.length > 1;
    loadedFileName = multiple ? documentFiles.map(file => file.name).join(", ") : documentFiles[0]?.name ?? "Untitled";
    const combined = documents
      .map(document => multiple ? `# ${document.file.name}\n\n${document.text}` : document.text)
      .join("\n\n");
    const sourceLines = documents.flatMap((document, index) => {
      const lines = document.sourceLines.length ? document.sourceLines : sourceLinesFromText(document.text);
      return multiple
        ? [document.file.name, "", ...lines, ...(index < documents.length - 1 ? [""] : [])]
        : lines;
    });
    loadedFileType = multiple ? "MULTI" : documents[0]?.type ?? "TEXT";
    const pagePreviews = !multiple ? documents[0]?.pagePreviews ?? [] : [];
    replaceDocument(combined, documents.some(document => document.preserveLineBreaks), sourceLines, pagePreviews);
  }

  async function documentTextFromFile(file: File) {
    if (file.name.toLowerCase().endsWith(".srt")) {
      const text = formatSrtTranscript(await file.text());
      return { file, type: "SRT", text, sourceLines: sourceLinesFromText(text), preserveLineBreaks: true };
    }
    if (isPdfFile(file)) {
      const extracted = await extractPdfText(file);
      return { file, type: "PDF", text: extracted.text || "", sourceLines: extracted.lines, preserveLineBreaks: false };
    }
    if (file.name.toLowerCase().endsWith(".docx")) {
      const buffer = await file.arrayBuffer();
      const [mammoth, pagePreviews] = await Promise.all([
        import("mammoth"),
        renderDocxDocumentMapPages(buffer)
      ]);
      const result = await mammoth.extractRawText({ arrayBuffer: buffer });
      return {
        file,
        type: "DOCX",
        text: stripEmptyLines(result.value),
        sourceLines: sourceLinesFromText(result.value),
        preserveLineBreaks: false,
        pagePreviews
      };
    }
    if (isOdtFile(file)) {
      const extracted = await extractOdtText(file);
      return { file, type: "ODT", text: extracted.text, sourceLines: extracted.sourceLines, preserveLineBreaks: false };
    }
    const text = await file.text();
    return {
      file,
      type: file.name.split(".").pop()?.toUpperCase() || "TEXT",
      text: stripEmptyLines(text),
      sourceLines: sourceLinesFromText(text),
      preserveLineBreaks: false
    };
  }

  function isPdfFile(file: File) {
    return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  }

  function isOdtFile(file: File) {
    return file.type === "application/vnd.oasis.opendocument.text" || file.name.toLowerCase().endsWith(".odt");
  }

  async function extractOdtText(file: File) {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const contentFile = zip.file("content.xml");
    if (!contentFile) throw new Error("ODT file is missing content.xml.");

    const xml = await contentFile.async("string");
    const document = new DOMParser().parseFromString(xml, "application/xml");
    if (document.getElementsByTagName("parsererror").length) {
      throw new Error("Could not parse ODT document text.");
    }

    const textRoot =
      Array.from(document.getElementsByTagNameNS("*", "text"))[0] ??
      document.documentElement;
    const blocks: string[] = [];

    function textFromNode(node: Node): string {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
      if (node.nodeType !== Node.ELEMENT_NODE) return "";

      const element = node as Element;
      if (element.localName === "s") {
        const count = Number(element.getAttribute("text:c") ?? element.getAttribute("c") ?? "1");
        return " ".repeat(Number.isFinite(count) && count > 0 ? count : 1);
      }
      if (element.localName === "tab") return "\t";
      if (element.localName === "line-break") return "\n";

      return Array.from(element.childNodes).map(textFromNode).join("");
    }

    function collectBlocks(node: Node) {
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const element = node as Element;
      if (element.localName === "p" || element.localName === "h") {
        const text = textFromNode(element).replace(/[ \t]+\n/g, "\n").trim();
        if (text) blocks.push(text);
        return;
      }
      for (const child of Array.from(element.childNodes)) collectBlocks(child);
    }

    collectBlocks(textRoot);
    const rawText = blocks.join("\n\n");
    return {
      text: stripEmptyLines(rawText),
      sourceLines: sourceLinesFromText(rawText)
    };
  }

  function sourceLinesFromText(text: string) {
    return text.replace(/\r\n?/g, "\n").split("\n");
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

  function loadSessionNotes() {
    if (typeof localStorage === "undefined") return "";
    return localStorage.getItem(notesStorageKey) ?? "";
  }

  function loadSidebarNotesOpen() {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(notesOpenStorageKey) === "true";
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

  function normalizeSettingsTab(value: unknown): SettingsTab {
    if (value === "layout" || value === "shortcuts" || value === "import") return value;
    if (value === "annotation" || value === "editor") return "layout";
    if (value === "markup") return "layout";
    if (value === "hotkeys") return "shortcuts";
    if (value === "transcribe") return "import";
    return "layout";
  }

  function loadAppSettings(): AppSettings {
    const defaults: AppSettings = {
      annotationMode: "clean",
      settingsTab: "layout",
      rememberOpenAiApiKey: false,
      transcriptionModel: "whisper-1",
      transcriptionPrompt: ""
    };
    const settings = objectFromStorage(appSettingsStorageKey) ?? unifiedPreferenceSection("app");
    if (!settings) return defaults;

    return {
      annotationMode:
        settings.annotationMode === "raw" ||
        settings.annotationMode === "all" ||
        settings.annotationMode === "sticky" ||
        settings.annotationMode === "superscript" ||
        settings.annotationMode === "subscript"
          ? settings.annotationMode
          : "clean",
      settingsTab: normalizeSettingsTab(settings.settingsTab),
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
    cursorScrollMarginLines?: number;
    cursorScrollMarginTopLines: number;
    cursorScrollMarginBottomLines: number;
    lineHeight: number;
    fontSize: number;
    paragraphSpacing: number;
    fontFamilyName: string;
    randomizeFontOnLoad: boolean;
    rotateFontOnLoad: boolean;
    currentLineHighlightStyle: "fill" | "underline" | "borders";
    currentLineHighlightOpacity: number;
    columnGuideThickness: number;
    columnStride: number;
    wordNavigation: boolean;
    wasdNavigation: boolean;
    hjklNavigation: boolean;
    arrowWordNavigation: boolean;
    wasdWordNavigation: boolean;
    hjklWordNavigation: boolean;
    fontFavorites: string[];
    customShortcuts: Record<CustomShortcutAction, string>;
    blockquoteAlign: number;
    blockquoteBgWidth: number;
    importLineMode: ImportLineMode;
    divideImportSentences: boolean;
  };

  function normalizeLayoutFontFamilyName(value: string) {
    const normalized = value.trim();
    return fontFamilyOptions.some(option => option.name === normalized) ? normalized : defaultFontFamilyName;
  }

  function normalizeFontFavorites(value: unknown) {
    if (!Array.isArray(value)) return defaultFontFavorites.slice();
    const seen = new Set<string>();
    const favorites = value
      .filter((item): item is string => typeof item === "string")
      .map(name => normalizeLayoutFontFamilyName(name))
      .filter(name => {
        if (seen.has(name)) return false;
        seen.add(name);
        return true;
      });
    return favorites.length ? favorites : defaultFontFavorites.slice();
  }

  function preferredFontFamilyNames() {
    const favorites = layoutFontFavorites.filter(name => fontFamilyOptions.some(option => option.name === name));
    return favorites.length ? favorites : fontFamilyOptions.map(option => option.name);
  }

  function defaultCustomShortcutBindings() {
    return Object.fromEntries(customShortcutDefinitions.map(definition => [definition.action, definition.defaultValue])) as Record<CustomShortcutAction, string>;
  }

  function normalizeCustomShortcuts(value: unknown) {
    const defaults = defaultCustomShortcutBindings();
    if (!value || typeof value !== "object" || Array.isArray(value)) return defaults;
    const parsed = value as Record<string, unknown>;
    return Object.fromEntries(customShortcutDefinitions.map(definition => {
      const raw = typeof parsed[definition.action] === "string" ? parsed[definition.action] as string : definition.defaultValue;
      const migrated = definition.action === "annotationPrevious" && raw === "["
        ? definition.defaultValue
        : definition.action === "annotationNext" && raw === "]"
          ? definition.defaultValue
          : normalizeShortcutBinding(raw) || definition.defaultValue;
      return [definition.action, migrated];
    })) as Record<CustomShortcutAction, string>;
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
    const pool = preferredFontFamilyNames();
    const currentIndex = pool.indexOf(layoutFontFamilyName);
    const nextIndex = (currentIndex + 1) % pool.length;
    layoutFontFamilyName = pool[nextIndex];
  }

  function randomizeLayoutFontFamily() {
    const pool = preferredFontFamilyNames();
    if (pool.length <= 1) return;
    const currentIndex = pool.indexOf(layoutFontFamilyName);
    let nextIndex = Math.floor(Math.random() * pool.length);
    if (nextIndex === currentIndex) nextIndex = (nextIndex + 1) % pool.length;
    layoutFontFamilyName = pool[nextIndex];
  }

  function applyDocumentLoadFontPreference() {
    if (randomizeFontOnLoad) randomizeLayoutFontFamily();
    else if (rotateFontOnLoad) rotateLayoutFontFamily();
  }

  function isFavoriteFont(name: string) {
    return layoutFontFavorites.includes(name);
  }

  function toggleFontFavorite(name: string) {
    const normalized = normalizeLayoutFontFamilyName(name);
    if (!normalized) return;
    const next = isFavoriteFont(normalized)
      ? layoutFontFavorites.filter(font => font !== normalized)
      : [...layoutFontFavorites, normalized];
    layoutFontFavorites = next.length ? next : defaultFontFavorites.slice();
  }

  function orderedFontFamilyOptions() {
    const favorites = layoutFontFavorites.filter(name => fontFamilyOptions.some(option => option.name === name));
    const nonFavorites = fontFamilyOptions.filter(option => !favorites.includes(option.name));
    return [...favorites.map(name => fontFamilyOptions.find(option => option.name === name)!), ...nonFavorites];
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
      cursorScrollMarginLines: Math.round(numberOr("cursorScrollMarginLines", 4, 0, 16)),
      cursorScrollMarginTopLines: Math.round(numberOr("cursorScrollMarginTopLines", numberOr("cursorScrollMarginLines", 4, 0, 16), 0, 16)),
      cursorScrollMarginBottomLines: Math.round(numberOr("cursorScrollMarginBottomLines", numberOr("cursorScrollMarginLines", 4, 0, 16), 0, 16)),
      lineHeight: Math.round(numberOr("lineHeight", 1.6, 1, 3) * 100) / 100,
      fontSize: Math.round(numberOr("fontSize", 14, 10, 28)),
      paragraphSpacing: Math.round(numberOr("paragraphSpacing", 0, 0, 2) * 100) / 100,
      fontFamilyName,
      randomizeFontOnLoad: typeof settings.randomizeFontOnLoad === "boolean" ? settings.randomizeFontOnLoad : undefined,
      rotateFontOnLoad: typeof settings.rotateFontOnLoad === "boolean" ? settings.rotateFontOnLoad : undefined,
      currentLineHighlightStyle,
      currentLineHighlightOpacity: Math.round(numberOr("currentLineHighlightOpacity", 0.34, 0.08, 0.7) * 100) / 100,
      columnGuideThickness: Math.round(numberOr("columnGuideThickness", 1, 1, 6)),
      columnStride: Math.round(numberOr("columnStride", 40, 4, 120)),
      wordNavigation:
        typeof settings.wordNavigation === "boolean"
          ? settings.wordNavigation
          : typeof settings.arrowWordNavigation === "boolean"
            ? settings.arrowWordNavigation
            : undefined,
      wasdNavigation:
        typeof settings.wasdNavigation === "boolean"
          ? settings.wasdNavigation
          : typeof settings.wasdWordNavigation === "boolean"
            ? settings.wasdWordNavigation
            : undefined,
      hjklNavigation:
        typeof settings.hjklNavigation === "boolean"
          ? settings.hjklNavigation
          : typeof settings.hjklWordNavigation === "boolean"
            ? settings.hjklWordNavigation
            : undefined,
      fontFavorites: normalizeFontFavorites(settings.fontFavorites),
      customShortcuts: normalizeCustomShortcuts(settings.customShortcuts),
      blockquoteAlign: Math.round(numberOr("blockquoteAlign", 0, 0, 100)),
      blockquoteBgWidth: Math.round(numberOr("blockquoteBgWidth", 100, 0, 100)),
      importLineMode: settings.importLineMode === "original" || settings.importLineMode === "sentences" || settings.importLineMode === "reflow"
        ? settings.importLineMode
        : undefined,
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
      cursorScrollMarginTopLines,
      cursorScrollMarginBottomLines,
      lineHeight,
      fontSize,
      paragraphSpacing,
      fontFamilyName: layoutFontFamilyName,
      randomizeFontOnLoad,
      rotateFontOnLoad,
      currentLineHighlightStyle,
      currentLineHighlightOpacity,
      columnGuideThickness,
      columnStride,
      wordNavigation,
      wasdNavigation,
      hjklNavigation,
      fontFavorites: layoutFontFavorites,
      customShortcuts,
      blockquoteAlign,
      blockquoteBgWidth,
      importLineMode,
      divideImportSentences: importLineMode !== "original"
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
    cursorScrollMarginTopLines = settings.cursorScrollMarginTopLines ?? settings.cursorScrollMarginLines ?? cursorScrollMarginTopLines;
    cursorScrollMarginBottomLines = settings.cursorScrollMarginBottomLines ?? settings.cursorScrollMarginLines ?? cursorScrollMarginBottomLines;
    lineHeight = settings.lineHeight ?? lineHeight;
    fontSize = settings.fontSize ?? fontSize;
    paragraphSpacing = settings.paragraphSpacing ?? paragraphSpacing;
    layoutFontFamilyName = settings.fontFamilyName ?? layoutFontFamilyName;
    randomizeFontOnLoad = settings.randomizeFontOnLoad ?? randomizeFontOnLoad;
    rotateFontOnLoad = settings.rotateFontOnLoad ?? rotateFontOnLoad;
    currentLineHighlightStyle = settings.currentLineHighlightStyle ?? currentLineHighlightStyle;
    currentLineHighlightOpacity = settings.currentLineHighlightOpacity ?? currentLineHighlightOpacity;
    columnGuideThickness = settings.columnGuideThickness ?? columnGuideThickness;
    columnStride = settings.columnStride ?? columnStride;
    wordNavigation = settings.wordNavigation ?? wordNavigation;
    wasdNavigation = settings.wasdNavigation ?? wasdNavigation;
    hjklNavigation = settings.hjklNavigation ?? hjklNavigation;
    layoutFontFavorites = settings.fontFavorites ?? layoutFontFavorites;
    customShortcuts = settings.customShortcuts ?? customShortcuts;
    blockquoteAlign = settings.blockquoteAlign ?? blockquoteAlign;
    blockquoteBgWidth = settings.blockquoteBgWidth ?? blockquoteBgWidth;
    importLineMode = settings.importLineMode ?? (settings.divideImportSentences === false ? "original" : importLineMode);
  }

  function applyAppSettings(settings: AppSettings) {
    annotationMode = settings.annotationMode;
    settingsTab = settings.settingsTab;
    rememberOpenAiApiKey = settings.rememberOpenAiApiKey;
    transcriptionModel = settings.transcriptionModel;
    transcriptionPrompt = settings.transcriptionPrompt;
  }

  function annotationModeUsesRawMarkup(mode = annotationMode) {
    return mode === "raw" || mode === "all";
  }

  function annotationModeUsesInlineComments(mode = annotationMode) {
    return mode === "sticky" || mode === "superscript" || mode === "subscript";
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

  function toggleSettings() {
    settingsOpen = !settingsOpen;
    return true;
  }

  function toggleDocumentPreview() {
    if (!documentMapPages.length && !documentMapLines.length) return false;
    documentPreviewOpen = !documentPreviewOpen;
    return true;
  }

  function closeDocumentPreview() {
    documentPreviewOpen = false;
    documentPreviewButtonEl?.focus();
  }

  function setDocumentPreviewZoom(nextZoom: number) {
    documentPreviewZoom = Math.max(0.12, Math.min(1.8, nextZoom));
  }

  function documentPreviewScale(page: DocumentMapPagePreview) {
    return Math.min(1.8, Math.max(0.12, documentPreviewZoom));
  }

  function fitDocumentPreview() {
    const widest = documentMapPages.reduce((max, page) => Math.max(max, page.width), 1);
    setDocumentPreviewZoom(Math.min(1, 460 / widest));
  }

  function handleDocumentPreviewWheel(event: WheelEvent) {
    if (!documentPreviewOpen) return;
    event.preventDefault();
    const step = event.deltaY < 0 ? 0.08 : -0.08;
    setDocumentPreviewZoom(documentPreviewZoom + step);
  }

  function shortcutBindingFor(action: CustomShortcutAction) {
    return normalizeShortcutBinding(customShortcuts[action] ?? defaultCustomShortcutBindings()[action]) || defaultCustomShortcutBindings()[action];
  }

  function startShortcutEdit(action: CustomShortcutAction) {
    shortcutEditAction = action;
    shortcutEditDraft = shortcutBindingFor(action);
    shortcutEditError = "";
  }

  function saveShortcutEdit() {
    if (!shortcutEditAction) return;
    const action = shortcutEditAction;
    const normalized = normalizeShortcutBinding(shortcutEditDraft) || defaultCustomShortcutBindings()[action];
    const conflict = customShortcutDefinitions.find(definition =>
      definition.action !== action && shortcutBindingFor(definition.action) === normalized
    );
    if (conflict) {
      shortcutEditError = `${conflict.label} already uses that shortcut.`;
      return;
    }
    customShortcuts = { ...customShortcuts, [action]: normalized };
    shortcutEditAction = null;
    shortcutEditError = "";
  }

  function cancelShortcutEdit() {
    shortcutEditAction = null;
    shortcutEditError = "";
  }

  function handleShortcutKeydown(event: KeyboardEvent) {
    event.stopPropagation();
    if (!shortcutEditAction) return;
    if (event.key === "Escape") {
      event.preventDefault();
      cancelShortcutEdit();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      saveShortcutEdit();
      return;
    }
    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      shortcutEditDraft = "";
      shortcutEditError = "";
      return;
    }
    if (event.key.length === 1 || event.key === "Tab" || event.key === "Spacebar" || event.key.startsWith("Arrow") || event.key === "F1" || event.key === "F2") {
      event.preventDefault();
      shortcutEditDraft = shortcutBindingFromEvent(event);
      shortcutEditError = "";
    }
  }

  function handleEscape() {
    if (settingsOpen) {
      settingsOpen = false;
      view?.focus();
      return true;
    }
    setMode("normal");
    return true;
  }

  function persistOpenAiApiKey() {
    if (typeof localStorage === "undefined") return;
    if (rememberOpenAiApiKey && openAiApiKey.trim()) {
      localStorage.setItem(openAiApiKeyStorageKey, openAiApiKey.trim());
    } else {
      localStorage.removeItem(openAiApiKeyStorageKey);
    }
  }

  function persistSessionNotes() {
    if (typeof localStorage === "undefined") return;
    const text = sessionNotes.trim();
    if (text) localStorage.setItem(notesStorageKey, sessionNotes);
    else localStorage.removeItem(notesStorageKey);
  }

  function handleSessionNotesInput(event: Event) {
    sessionNotes = (event.target as HTMLTextAreaElement).value;
    persistSessionNotes();
  }

  function toggleSidebarNotesOpen() {
    sidebarNotesOpen = !sidebarNotesOpen;
    if (typeof localStorage !== "undefined") localStorage.setItem(notesOpenStorageKey, String(sidebarNotesOpen));
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

  function adjustLayoutValue(
    kind:
      | "lineHeight"
      | "fontSize"
      | "paragraphSpacing"
      | "columnStride"
      | "currentLineHighlightOpacity"
      | "columnGuideThickness"
      | "padTop"
      | "padBottom"
      | "padLeft"
      | "padRight"
      | "cursorScrollMarginTopLines"
      | "cursorScrollMarginBottomLines"
      | "blockquoteAlign"
      | "blockquoteBgWidth",
    delta: number
  ) {
    if (kind === "lineHeight") {
      lineHeight = Math.round(clampNumber(lineHeight + delta * 0.15, 1, 3) * 100) / 100;
    } else if (kind === "fontSize") {
      fontSize = Math.round(clampNumber(fontSize + delta, 10, 28));
    } else if (kind === "paragraphSpacing") {
      paragraphSpacing = Math.round(clampNumber(paragraphSpacing + delta * 0.15, 0, 2) * 100) / 100;
    } else if (kind === "columnStride") {
      columnStride = Math.round(clampNumber(columnStride + delta * 2, 4, 120));
    } else if (kind === "currentLineHighlightOpacity") {
      currentLineHighlightOpacity = Math.round(clampNumber(currentLineHighlightOpacity + delta * 0.02, 0.08, 0.7) * 100) / 100;
    } else if (kind === "columnGuideThickness") {
      columnGuideThickness = Math.round(clampNumber(columnGuideThickness + delta, 1, 6));
    } else if (kind === "padTop") {
      padTop = Math.round(clampNumber(padTop + delta * 4, 0, 400));
    } else if (kind === "padBottom") {
      padBottom = Math.round(clampNumber(padBottom + delta * 4, 0, Math.max(0, editorViewportHeight - 48)));
    } else if (kind === "padLeft") {
      padLeft = Math.round(clampNumber(padLeft + delta * 4, 0, 400));
    } else if (kind === "padRight") {
      padRight = Math.round(clampNumber(padRight + delta * 4, 0, 400));
    } else if (kind === "cursorScrollMarginTopLines") {
      cursorScrollMarginTopLines = Math.round(clampNumber(cursorScrollMarginTopLines + delta, 0, scrollBorderLineLimit));
    } else if (kind === "cursorScrollMarginBottomLines") {
      cursorScrollMarginBottomLines = Math.round(clampNumber(cursorScrollMarginBottomLines + delta, 0, scrollBorderLineLimit));
    } else if (kind === "blockquoteAlign") {
      blockquoteAlign = Math.round(clampNumber(blockquoteAlign + delta, 0, 100));
    } else if (kind === "blockquoteBgWidth") {
      blockquoteBgWidth = Math.round(clampNumber(blockquoteBgWidth + delta, 0, 100));
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
    editorViewportHeight = view?.scrollDOM.clientHeight ?? editorEl?.clientHeight ?? 0;
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
    pdfDocumentMapPages = [];
    pdfParseError = "";
    pdfIsParsing = true;
    pdfModalOpen = true;

    try {
      const [extractedPdf, pagePreviews] = await Promise.all([
        extractPdfText(file),
        renderPdfDocumentMapPages(file)
      ]);
      pdfDraftText = extractedPdf.text;
      pdfSourceLines = extractedPdf.lines;
      pdfDocumentMapPages = pagePreviews;
      if (!pdfDraftText.trim()) {
        pdfParseError = "No selectable text was found. This PDF may be scanned, so paste or type corrected text here before loading.";
      }
    } catch (error) {
      pdfParseError = error instanceof Error ? error.message : "Could not parse this PDF.";
      pdfDraftText = "";
      pdfSourceLines = [];
      pdfDocumentMapPages = [];
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

  async function renderPdfDocumentMapPages(file: File): Promise<DocumentMapPagePreview[]> {
    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    const pages: DocumentMapPagePreview[] = [];

    try {
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const baseViewport = page.getViewport({ scale: 1 });
        const renderScale = 1.8;
        const viewport = page.getViewport({ scale: renderScale });
        const canvas = window.document.createElement("canvas");
        canvas.width = Math.max(1, Math.ceil(viewport.width));
        canvas.height = Math.max(1, Math.ceil(viewport.height));
        const canvasContext = canvas.getContext("2d");
        if (!canvasContext) continue;

        canvasContext.fillStyle = "#fff";
        canvasContext.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext, viewport }).promise;
        pages.push({
          kind: "pdf",
          page: pageNumber,
          width: baseViewport.width,
          height: baseViewport.height,
          dataUrl: canvas.toDataURL("image/png")
        });
      }
    } finally {
      await pdf.destroy();
    }

    return pages;
  }

  async function renderDocxDocumentMapPages(buffer: ArrayBuffer): Promise<DocumentMapPagePreview[]> {
    const host = window.document.createElement("div");
    const bodyContainer = window.document.createElement("div");
    const styleContainer = window.document.createElement("div");

    host.style.cssText = [
      "position:fixed",
      "left:-10000px",
      "top:0",
      "width:max-content",
      "height:auto",
      "opacity:0",
      "pointer-events:none",
      "z-index:-1"
    ].join(";");
    host.append(styleContainer, bodyContainer);
    window.document.body.appendChild(host);

    try {
      const { renderAsync: renderDocxAsync } = await import("docx-preview");
      await renderDocxAsync(buffer, bodyContainer, styleContainer, {
        breakPages: true,
        ignoreLastRenderedPageBreak: false,
        renderHeaders: true,
        renderFooters: true,
        useBase64URL: true
      });

      const pageElements = Array.from(
        bodyContainer.querySelectorAll<HTMLElement>(".docx-wrapper > section.docx, section.docx")
      );
      const pages = pageElements.length ? pageElements : [bodyContainer.querySelector<HTMLElement>(".docx")].filter(Boolean);
      const styleHtml = styleContainer.innerHTML;

      return pages.map((page, index) => {
        const rect = page.getBoundingClientRect();
        const width = rect.width || cssPixelValue(page.style.width) || 816;
        const height = rect.height || cssPixelValue(page.style.height) || 1056;
        return {
          kind: "docx",
          page: index + 1,
          width,
          height,
          html: `${styleHtml}${page.outerHTML}`
        };
      });
    } catch (error) {
      console.warn("Could not render DOCX document map.", error);
      return [];
    } finally {
      host.remove();
    }
  }

  function cssPixelValue(value: string) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
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
    replaceDocument(text, false, pdfSourceLines.length ? pdfSourceLines : sourceLinesFromText(text), pdfDocumentMapPages);
    closePdfModal();
  }

  function closePdfModal() {
    pdfModalOpen = false;
    pdfDraftText = "";
    pdfSourceLines = [];
    pdfDocumentMapPages = [];
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
    stickySelectionActive = false;
    shiftSelectionActive = false;
    visualLineSelectionState = null;
    if (mode === "normal") blockquoteEditReturnAnchor = null;
    if (view) {
      view.dispatch(selection ? { selection } : {});  // trigger keymap/decoration rebuild
      applyEditorModeClasses(view);
      requestAnimationFrame(() => view?.focus());
    }
  }

  function handleCustomShortcut(action: CustomShortcutAction, v: EditorView) {
    if (action === "stridePrevious") return moveCursorByColumnStride(v, -1);
    if (action === "strideNext") return moveCursorByColumnStride(v, 1);
    if (action === "annotationPrevious") return jumpToAdjacentAnnotation(v, -1);
    if (action === "annotationNext") return jumpToAdjacentAnnotation(v, 1);
    if (action === "variantPrevious") return cycleAnnotationVariant(v, -1);
    if (action === "variantNext") return cycleAnnotationVariant(v, +1);
    return false;
  }

  function jumpToAdjacentAnnotation(v: EditorView, direction: 1 | -1) {
    const annotations = summaryItems.filter(isSummaryAnnotationItem);
    if (!annotations.length) return false;
    const head = v.state.selection.main.head;
    const target =
      direction > 0
        ? annotations.find(item => item.spanStart > head) ?? annotations[0]
        : [...annotations].reverse().find(item => item.spanStart < head) ?? annotations[annotations.length - 1];
    jumpToSummaryItem(target);
    return true;
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

  function styleName(style: number) {
    return style === 0 ? "" : highlightStyles[style - 1]?.name ?? "";
  }

  function defaultAnnotationStyles(): AnnotationStyle[] {
    return baseHighlightStyles.map(style => ({
      name: style.name,
      colorName: style.name,
      color: namedStyleColor(style.name)
    }));
  }

  function currentHighlightStyles(theme = activeTheme): AnnotationStyle[] {
    return customStyles.map(style => ({
      ...style,
      color: namedStyleColor(style.colorName ?? style.name, theme)
    }));
  }

  function styleColor(style: number) {
    return style === 0 ? activeTheme.orange : annotationColorForStyle(highlightStyles[style - 1]?.name ?? "");
  }

  function styleNumberForName(name: string) {
    const index = highlightStyles.findIndex(s => s.name === name);
    return index < 0 ? 1 : index + 1;
  }

  function styleKeyForName(name: string) {
    if (Object.prototype.hasOwnProperty.call(styleKeys, name)) {
      return normalizeStyleKey(styleKeys[name] ?? "");
    }
    return defaultStyleKeyForName(name);
  }

  function styleNumberForKey(key: string) {
    const normalized = normalizeStyleKey(key);
    if (!normalized) return null;
    if (normalized === "0") return 0;
    const index = highlightStyles.findIndex(style => styleKeyForName(style.name) === normalized);
    return index < 0 ? null : index + 1;
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
    return highlightStyles.find(style => style.name === name)?.color ?? theme.yellow;
  }

  function annotationTextColorForStyle(name: string, color: string, theme = activeTheme) {
    return (name === "callout" || color === "currentColor") ? theme.bg : contrastColor(color, theme.bg, theme.fg);
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

  function annotationStyleForPreview(style: number) {
    return style === 0 ? "" : styleName(style);
  }

  function annotationVariantForPreview() {
    return annotationPreview?.variant ?? currentAnnotationVariant;
  }

  function setAnnotationPreview(v: EditorView, style = currentStyle, variant = currentAnnotationVariant) {
    const range = v.state.selection.main;
    if (range.empty) return false;
    annotationPreview = {
      from: Math.min(range.from, range.to),
      to: Math.max(range.from, range.to),
      style,
      variant
    };
    currentStyle = style;
    currentAnnotationVariant = variant;
    v.dispatch({});
    return true;
  }

  function annotationPreviewForCurrentSelection(v: EditorView) {
    const range = v.state.selection.main;
    if (range.empty) return null;
    if (currentStyle === 0 && !stickySelectionActive && !shiftSelectionActive && !visualLineSelectionState) return null;
    return {
      from: Math.min(range.from, range.to),
      to: Math.max(range.from, range.to),
      style: currentStyle,
      variant: currentAnnotationVariant
    };
  }

  function syncAnnotationPreviewForCurrentSelection(v: EditorView) {
    const next = annotationPreviewForCurrentSelection(v);
    if (!next) {
      if (!annotationPreview) return false;
      annotationPreview = null;
      v.dispatch({});
      return true;
    }
    const same = !!annotationPreview &&
      annotationPreview.from === next.from &&
      annotationPreview.to === next.to &&
      annotationPreview.style === next.style &&
      annotationPreview.variant === next.variant;
    if (same) return false;
    annotationPreview = next;
    v.dispatch({});
    return true;
  }

  function refreshAnnotationPreviewForSelection(v: EditorView) {
    if (!annotationPreview) return;
    const range = v.state.selection.main;
    if (
      range.empty ||
      annotationPreview.from !== Math.min(range.from, range.to) ||
      annotationPreview.to !== Math.max(range.from, range.to)
    ) {
      annotationPreview = null;
    }
  }

  function setAnnotationVariant(v: EditorView, variant: AnnotationVariant) {
    currentAnnotationVariant = variant;
    if (setAnnotationPreview(v, currentStyle, variant)) return true;
    const cursor = v.state.selection.main.head;
    const docText = v.state.doc.toString();
    annotationPattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = annotationPattern.exec(docText)) !== null) {
      const spanStart = m.index, spanEnd = spanStart + m[0].length;
      if (cursor >= spanStart && cursor <= spanEnd) {
        const { style } = annotationStyleParts(m[2]);
        const updated = replaceAnnotationStylePrefix(m[0], annotationStyleToken(style, variant));
        v.dispatch({ changes: { from: spanStart, to: spanEnd, insert: updated } });
        return true;
      }
    }
    return false;
  }

  function replaceAnnotationStylePrefix(markup: string, styleToken: string) {
    return markup.replace(annotationStylePrefixPattern, (_match, text) => `\`${text}\`${annotationCommentOpen} ${styleToken},`);
  }

  function cycleAnnotationVariant(v: EditorView | null, delta: number) {
    if (v) {
      const range = v.state.selection.main;
      if (!range.empty) {
        const current = annotationVariantForPreview();
        const index = annotationVariants.indexOf(current);
        const next = annotationVariants[(index + delta + annotationVariants.length) % annotationVariants.length];
        return setAnnotationPreview(v, currentStyle, next);
      }

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

  function namedStyleColor(name: string, theme = getTheme(themeMode)) {
    if (name === "orange") return theme.orange;
    if (name === "red") return theme.red;
    if (name === "green") return theme.green;
    if (name === "yellow") return theme.yellow;
    if (name === "purple") return theme.purple;
    if (name === "callout") return theme.fg;
    return namedStyleColors.find(color => color.name === name)?.color ?? namedStyleColors[0].color;
  }

  function normalizeNamedStyleColor(value: string) {
    const normalized = normalizeCustomStyleName(value);
    return namedStyleColors.some(color => color.name === normalized) ? normalized : namedStyleColors[0].name;
  }

  function uniqueCustomStyleName(name: string) {
    const fallback = normalizeNamedStyleColor(newStyleColorName);
    const base = normalizeCustomStyleName(name) || fallback;
    const used = new Set(customStyles.map(style => style.name));
    if (!used.has(base)) return base;
    for (let index = 2; index < 100; index += 1) {
      const candidate = `${base}-${index}`;
      if (!used.has(candidate)) return candidate;
    }
    return `${base}-${Date.now().toString(36)}`;
  }

  function normalizeStoredStyle(entry: unknown, used: Set<string>): AnnotationStyle | null {
    if (!entry || typeof entry !== "object") return null;
    const rawName = (entry as { name?: unknown }).name;
    const name = normalizeCustomStyleName(typeof rawName === "string" ? rawName : "");
    const rawColorName = (entry as { colorName?: unknown }).colorName;
    const colorName = normalizeNamedStyleColor(typeof rawColorName === "string" ? rawColorName : name);
    if (!name || used.has(name)) return null;
    used.add(name);
    return { name, colorName, color: namedStyleColor(colorName) };
  }

  function loadCustomStyles(): AnnotationStyle[] {
    const stored = typeof localStorage === "undefined" ? null : localStorage.getItem(customStylesStorageKey);
    if (!stored) return defaultAnnotationStyles();

    try {
      const parsed = JSON.parse(stored);
      const used = new Set<string>();
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && Array.isArray((parsed as { styles?: unknown }).styles)) {
        return (parsed as { styles: unknown[] }).styles
          .map(entry => normalizeStoredStyle(entry, used))
          .filter((entry): entry is AnnotationStyle => entry !== null);
      }
      if (!Array.isArray(parsed)) return defaultAnnotationStyles();
      const oldCustomStyles = parsed
        .map(entry => normalizeStoredStyle(entry, used))
        .filter((entry): entry is AnnotationStyle => entry !== null);
      const oldCustomNames = new Set(oldCustomStyles.map(style => style.name));
      return [
        ...defaultAnnotationStyles().filter(style => !oldCustomNames.has(style.name)),
        ...oldCustomStyles
      ];
    } catch {
      return defaultAnnotationStyles();
    }
  }

  function persistCustomStyles(styles: AnnotationStyle[]) {
    customStyles = styles;
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(customStylesStorageKey, JSON.stringify({
      version: 2,
      styles: styles.map(({ name, colorName }) => ({ name, colorName }))
    }));
  }

  function handleNewStyleColorName(event: Event) {
    const colorName = normalizeNamedStyleColor((event.target as HTMLSelectElement).value);
    newStyleColorName = colorName;
    newStyleName = colorName;
  }

  function openAddStyleModal() {
    newStyleKeyDraft = firstAvailableStyleKey();
    newStyleKeyError = "";
    addStyleModalOpen = true;
  }

  function addCustomStyle() {
    const name = uniqueCustomStyleName(newStyleName);
    const colorName = normalizeNamedStyleColor(newStyleColorName);
    const keyResult = captureStyleKey(newStyleKeyDraft);
    const key = keyResult.key || firstAvailableStyleKey();
    const nextStyle = { name, colorName, color: namedStyleColor(colorName) };
    const nextStyles = [...customStyles, nextStyle];
    persistCustomStyles(nextStyles);
    if (key) persistStyleKey(name, key);
    currentStyle = nextStyles.length;
    newStyleColorName = "steel";
    newStyleName = newStyleColorName;
    newStyleKeyDraft = "";
    newStyleKeyError = "";
    addStyleModalOpen = false;
    view?.dispatch({});
    view?.focus();
  }

  function removeCustomStyle(name: string) {
    const index = highlightStyles.findIndex(style => style.name === name);
    if (index < 0) return;
    const nextCustomStyles = customStyles.filter(style => style.name !== name);
    persistCustomStyles(nextCustomStyles);
    const nextTitles = { ...styleTitles };
    delete nextTitles[name];
    persistStyleTitles(nextTitles);
    const nextKeys = { ...styleKeys };
    delete nextKeys[name];
    persistStyleKeys(nextKeys);
    if (currentStyle === index + 1) {
      currentStyle = Math.min(index + 1, nextCustomStyles.length);
      if (currentStyle < 1) currentStyle = 0;
    } else if (currentStyle > index + 1) {
      currentStyle -= 1;
    }
    view?.dispatch({});
  }

  function knownStyleName(name: string) {
    return customStyles.some(style => style.name === name);
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
            knownStyleName(entry[0]) &&
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

  function loadStyleKeys(): Record<string, string | null> {
    const stored = typeof localStorage === "undefined" ? null : localStorage.getItem(styleKeysStorageKey);
    if (!stored) return {};

    try {
      const parsed = JSON.parse(stored);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      const used = new Set<string>();
      const result: Record<string, string | null> = {};
      for (const [name, key] of Object.entries(parsed)) {
        if (typeof name !== "string" || !knownStyleName(name)) continue;
        if (key === null) {
          result[name] = null;
          continue;
        }
        if (typeof key !== "string") continue;
        const normalized = normalizeStyleKey(key);
        if (!normalized || normalized === "0" || used.has(normalized)) continue;
        used.add(normalized);
        result[name] = normalized;
      }
      return result;
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

  function persistStyleKeys(keys: Record<string, string | null>) {
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
    styleKeyError = "";
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
    styleKeyError = "";
  }

  function persistStyleKey(name: string, key: string) {
    const nextKeys = { ...styleKeys };
    const hadStoredKey = Object.prototype.hasOwnProperty.call(styleKeys, name);
    const oldKey = hadStoredKey ? normalizeStyleKey(styleKeys[name] ?? "") : defaultStyleKeyForName(name);

    if (!key.trim()) {
      nextKeys[name] = null;
      persistStyleKeys(nextKeys);
      view?.dispatch({});
      return;
    }

    const captured = captureStyleKey(key, name);
    const normalized = captured.key;
    if (!normalized) return;

    const otherStyle = highlightStyles.find(style =>
      style.name !== name && styleKeyForName(style.name) === normalized
    );
    if (otherStyle && oldKey) {
      nextKeys[otherStyle.name] = oldKey;
    } else if (otherStyle) {
      const replacement = firstAvailableStyleKey(new Set([normalized]), name);
      if (replacement) nextKeys[otherStyle.name] = replacement;
    }
    nextKeys[name] = normalized;
    persistStyleKeys(nextKeys);
    view?.dispatch({});
  }

  function captureStyleKey(key: string, ignoreName = "") {
    if (key.length !== 1 || /\s/.test(key)) {
      return { key: "", error: "Press one letter or number." };
    }
    const normalized = key.toLowerCase();
    if (normalized === "0") {
      return { key: "", error: "0 is reserved for plain text." };
    }
    if (reservedStyleKeys.has(normalized)) {
      return { key: "", error: `${normalized} is reserved.` };
    }
    const conflict = highlightStyles.find(style =>
      style.name !== ignoreName && styleKeyForName(style.name) === normalized
    );
    return {
      key: normalized,
      error: conflict ? `Will swap with ${styleDisplayTitle(conflict.name)}.` : ""
    };
  }

  function firstAvailableStyleKey(excluded = new Set<string>(), ignoreName = "") {
    const used = new Set(
      highlightStyles
        .filter(style => style.name !== ignoreName)
        .map(style => styleKeyForName(style.name))
        .filter(Boolean)
    );
    for (const key of "123456789abcdefghijklmnopqrstuvwxyz") {
      const normalized = normalizeStyleKey(key);
      if (normalized && !excluded.has(normalized) && !used.has(normalized)) return normalized;
    }
    return "";
  }

  function handleNewStyleKeyKeydown(event: KeyboardEvent) {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      addCustomStyle();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      addStyleModalOpen = false;
      return;
    }
    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      newStyleKeyDraft = "";
      newStyleKeyError = "";
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const result = captureStyleKey(event.key);
      newStyleKeyError = result.error;
      if (result.key) newStyleKeyDraft = result.key;
    }
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
      styleKeyError = "";
      saveStyleKey();
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      if (!editingStyleKeyName) return;
      const result = captureStyleKey(event.key, editingStyleKeyName);
      styleKeyError = result.error;
      if (!result.key) return;
      styleKeyDraft = result.key;
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
    updateDocumentMapFromView(v);
  }

  let editingSpan: number | null = null;
  function countWords(text: string) {
    const visibleText = text
      .replace(/`([^`]+)`<!--\s*\w+(?:\s+\w+)?,\s*.+?:\s*"[^"]*"\s*-->/g, "$1")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/`([^`\n]+)`/g, "$1");
    return visibleText.match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
  }

  type WordRange = { from: number; to: number };
  const wordCorePattern = /[\p{L}\p{N}_-]/u;
  const endingPunctuationPattern = /[.,;:!?]/;

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

  function wordRangeAt(text: string, pos: number, includeTrailingPunctuation = false): WordRange | null {
    const safePos = Math.max(0, Math.min(pos, text.length));
    let start = safePos;
    let end = safePos;
    while (start > 0 && isSelectableWordChar(text, start - 1)) start -= 1;
    while (end < text.length && isSelectableWordChar(text, end)) end += 1;
    if (start === end) return null;
    if (includeTrailingPunctuation) {
      while (end < text.length && endingPunctuationPattern.test(text[end] ?? "")) end += 1;
    }
    return { from: start, to: end };
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
        <span class="summary-export-meta">${escapeHtml(item.timestamp)}</span>
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
        const quoteText = cleanBlockquoteLineText(lineText)
          .replace(/^>\s?/, "")
          .trim();
        blocks.push(`    <blockquote style="${escapeHtml(blockquoteStyle())}">${renderInlineHtml(quoteText)}</blockquote>`);
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

  function updateDocumentMapFromView(v: EditorView) {
    const doc = v.state.doc;
    const sourceLines = sourceDocumentMapLines.length
      ? sourceDocumentMapLines
      : Array.from({ length: doc.lines }, (_, index) => doc.line(index + 1).text);
    const lines: DocumentMapLine[] = [];
    let maxLength = 1;

    for (const line of sourceLines) {
      const visibleLength = line.replace(/\s+$/g, "").length;
      if (visibleLength > maxLength) maxLength = visibleLength;
    }

    let top = 0;
    for (let index = 0; index < sourceLines.length; index += 1) {
      const text = sourceLines[index] ?? "";
      const trimmed = text.trim();
      const blank = trimmed.length === 0;
      const visibleLength = text.replace(/\s+$/g, "").length;
      const indent = blank ? 0 : Math.min(24, text.match(/^\s*/)?.[0].length ?? 0);
      const width = blank ? 16 : Math.max(14, Math.min(100, 18 + (visibleLength / maxLength) * 82));
      const height = blank ? 7 : 4;
      const editorLine = doc.line(Math.max(1, Math.min(doc.lines, index + 1)));
      lines.push({ line: index + 1, from: editorLine.from, blank, width, indent, top, height });
      top += height + 1;
    }

    const ranges = v.visibleRanges.length ? v.visibleRanges : [{ from: 0, to: doc.length }];
    const firstVisibleLine = doc.lineAt(ranges[0].from).number;
    const lastVisibleLine = doc.lineAt(ranges[ranges.length - 1].to).number;
    const firstMapLine = Math.max(1, Math.min(lines.length, firstVisibleLine));
    const lastMapLine = Math.max(firstMapLine, Math.min(lines.length, lastVisibleLine));
    const viewportStart = lines[firstMapLine - 1]?.top ?? 0;
    const viewportEnd = (lines[lastMapLine - 1]?.top ?? viewportStart) + (lines[lastMapLine - 1]?.height ?? 0);

    documentMapLines = lines;
    documentMapLineCount = sourceLines.length;
    documentMapTotalHeight = top;
    documentMapViewportTop = viewportStart;
    documentMapViewportHeight = Math.max(lines[firstMapLine - 1]?.height ?? 0, viewportEnd - viewportStart);
    documentMapCurrentLine = Math.max(1, Math.min(lines.length, doc.lineAt(v.state.selection.main.head).number));
  }

  function jumpToDocumentLine(v: EditorView, lineNumber: number) {
    const doc = v.state.doc;
    const line = doc.line(Math.max(1, Math.min(doc.lines, lineNumber)));
    v.dispatch({
      selection: { anchor: line.from },
      effects: cursorScrollEffect(v, line.from)
    });
    v.focus();
    return true;
  }

  function jumpToDocumentPage(v: EditorView, pageNumber: number) {
    const doc = v.state.doc;
    const pageCount = Math.max(1, documentMapPages.length);
    const ratio = pageCount <= 1 ? 0 : (Math.max(1, pageNumber) - 1) / (pageCount - 1);
    const targetLine = Math.max(1, Math.min(doc.lines, Math.round(1 + ratio * (doc.lines - 1))));
    return jumpToDocumentLine(v, targetLine);
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
        const quoteText = cleanBlockquoteLineText(trimmed)
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

  function cleanBlockquoteLineText(lineText: string) {
    return lineText.replace(/<!--\s*align:(?:left|center|right)\s+width:\d{1,3}\s*-->/gi, "");
  }

  function removeBlockquoteMetaMarkup(v: EditorView) {
    const docText = v.state.doc.toString();
    const changes: { from: number; to: number; insert: string }[] = [];
    const pattern = /[ \t]*<!--\s*align:(?:left|center|right)\s+width:\d{1,3}\s*-->/gi;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(docText)) !== null) {
      const line = v.state.doc.lineAt(match.index);
      if (!line.text.startsWith(">")) continue;
      changes.push({ from: match.index, to: match.index + match[0].length, insert: "" });
    }
    if (changes.length) v.dispatch({ changes });
  }

  function blockquoteStyle() {
    const width = clampBlockquoteWidth(blockquoteBgWidth);
    const available = 100 - width;
    const left = Math.round((available * clampNumber(blockquoteAlign, 0, 100)) / 100);
    const right = available - left;
    return `display: block; box-sizing: border-box; width: ${width}% !important; margin-left: ${left}% !important; margin-right: ${right}% !important;`;
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
      setMode("insert");
      return true;
    }

    const head = v.state.selection.main.head;
    const line = v.state.doc.lineAt(head);
    let cursor = head;
    blockquoteEditReturnAnchor = head;

    if (line.text.startsWith(">")) {
      const cleaned = cleanBlockquoteLineText(line.text);
      const contentEnd = line.from + cleaned.length;
      cursor = Math.max(line.from + (line.text.startsWith("> ") ? 2 : 1), contentEnd);
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

    setMode("insert");
    return true;
  }

  function splitLineEndToBlockquote(v: EditorView) {
    const selection = v.state.selection.main;
    const head = selection.head;
    const line = v.state.doc.lineAt(head);
    const from = Math.min(selection.from, selection.to);
    const to = Math.max(selection.from, selection.to);
    const selectedText = selection.empty
      ? v.state.doc.sliceString(head, line.to)
      : v.state.doc.sliceString(from, to);
    const quotedText = selectedText.replace(/\r\n?/g, "\n")
      .split("\n")
      .map((text, index) => `${index === 0 ? text.trimStart() : text}`.replace(/^> ?/, ""))
      .map(text => `> ${text}`)
      .join("\n");
    const insert = `\n${quotedText || "> "}`;
    const changeFrom = selection.empty ? head : from;
    const changeTo = selection.empty ? line.to : to;
    const cursor = changeFrom + insert.length;

    blockquoteEditReturnAnchor = head;
    v.dispatch({
      changes: { from: changeFrom, to: changeTo, insert },
      selection: EditorSelection.cursor(cursor)
    });
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

  function exitBlockquoteEditForNavigation(v: EditorView) {
    if (editorMode !== "insert" || blockquoteEditReturnAnchor === null) return false;
    finishBlockquoteEditMode(v);
    return false;
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

  function insertBlockquoteLevel(v: EditorView) {
    if (editorMode !== "insert") return false;
    const selection = v.state.selection.main;
    if (!selection.empty) return false;
    const head = selection.head;
    const line = v.state.doc.lineAt(head);
    if (!line.text.startsWith(">")) return false;

    const match = /^(?:>\s*)+/.exec(line.text);
    const insertAt = line.from + (match?.[0].length ?? 0);
    v.dispatch({
      changes: { from: insertAt, insert: "> " },
      selection: { anchor: head + (insertAt <= head ? 2 : 0) }
    });
    return true;
  }

  // Annotation tooltip StateField
  const annotationTooltipField = StateField.define<readonly Tooltip[]>({
    create: () => [],
    update(tooltips, tr) {
      if (annotationModeUsesRawMarkup()) return [];
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
              dom.style.cssText = `background:${activeTheme.bgAlt};border:1px solid ${activeTheme.border};border-left:3px solid ${color};border-radius:4px;padding:4px 10px;font-size:11px;color:${activeTheme.fg};line-height:1.6;white-space:nowrap;pointer-events:none;`;
              const meta = document.createElement("div");
              meta.style.color = activeTheme.fgMuted;
              meta.textContent = `${colorName}  ${timestamp}`;
              dom.appendChild(meta);
              const line2 = document.createElement("div");
              line2.textContent = comment || "Enter to add note";
              line2.style.color = comment ? activeTheme.blockquoteFg : activeTheme.fgMuted;
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
      input.style.cssText = `background:transparent;border:none;outline:none;color:${activeTheme.blockquoteFg};font-family:inherit;font-size:inherit;width:${Math.max(this.comment.length || 8, 8)}ch;min-width:8ch;`;
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
    ignoreEvent() { return true; }
  }

  class AnnotationCommentWidget extends WidgetType {
    private comment: string;
    private color: string;
    private mode: "sticky" | "superscript" | "subscript";

    constructor(comment: string, color: string, mode: "sticky" | "superscript" | "subscript") {
      super();
      this.comment = comment;
      this.color = color;
      this.mode = mode;
    }

    toDOM() {
      const span = document.createElement("span");
      span.className = `cm-annotation-comment cm-annotation-comment-${this.mode}`;
      span.title = this.comment;
      span.textContent = this.comment;
      if (this.mode === "sticky") {
        span.style.cssText = `display:inline-block;vertical-align:baseline;margin-left:2px;color:${this.color};opacity:0.72;font-size:inherit;line-height:inherit;white-space:nowrap;pointer-events:none;`;
      } else if (this.mode === "superscript") {
        span.style.cssText = `display:inline-block;vertical-align:super;margin-left:2px;color:${this.color};opacity:0.72;font-size:0.72em;line-height:1;white-space:nowrap;pointer-events:none;`;
      } else {
        span.style.cssText = `display:inline-block;vertical-align:sub;margin-left:2px;color:${this.color};opacity:0.72;font-size:0.72em;line-height:1;white-space:nowrap;pointer-events:none;`;
      }
      return span;
    }

    ignoreEvent() { return true; }
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
    const timestamp = parseSrtTimestampLine(lineText);
    if (!timestamp) return false;
    jumpAudioToAndPlay(timestamp.startSeconds);
    return true;
  }

  function associatedSrtStartSeconds(v: EditorView) {
    let line = v.state.doc.lineAt(v.state.selection.main.head);

    for (let i = 0; i < 50; i += 1) {
      const timestamp = parseSrtTimestampLine(line.text);
      if (timestamp) return timestamp.startSeconds;
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
    if (v.state.doc.lineAt(v.state.selection.main.head).text.startsWith(">")) return enterBlockquoteEditMode(v);
    if (toggleAnnotationEdit(v)) return true;
    if (jumpFromCurrentTimestampLine(v)) return true;
    toggleAssociatedSrtPlayback(v);
    return true;
  }

  function moveCursorByColumnStride(v: EditorView, direction: 1 | -1) {
    const stride = Math.max(1, Math.round(columnStride));
    const selection = v.state.selection.main;
    const head = selection.head;
    const doc = v.state.doc;
    const line = doc.lineAt(head);
    const columnOffset = head - line.from;
    let target = line.from;

    if (direction > 0) {
      const nextColumn = columnOffset + stride;
      if (nextColumn <= line.length) target = line.from + nextColumn;
      else if (line.number < doc.lines) target = doc.line(line.number + 1).from;
      else target = line.to;
    } else {
      const nextColumn = columnOffset - stride;
      if (nextColumn >= 0) target = line.from + nextColumn;
      else if (line.number > 1) target = doc.line(line.number - 1).to;
      else target = line.from;
    }

    v.dispatch({
      selection: EditorSelection.cursor(target),
      effects: cursorScrollEffect(v, target)
    });
    return true;
  }

  function buildHighlightDecorator(theme = activeTheme): Extension {
    const previewPlugin = ViewPlugin.fromClass(class {
      decorations: DecorationSet;
      constructor(v: EditorView) { this.decorations = this.build(v); }
      update(u: ViewUpdate) {
        if (u.docChanged || u.viewportChanged || u.selectionSet || u.transactions.length > 0)
          this.decorations = this.build(u.view);
      }
      build(v: EditorView): DecorationSet {
        const preview = annotationPreview;
        if (!preview) return Decoration.none;
        const range = v.state.selection.main;
        if (
          range.empty ||
          preview.from !== Math.min(range.from, range.to) ||
          preview.to !== Math.max(range.from, range.to)
        ) return Decoration.none;

        const style = annotationStyleForPreview(preview.style);
        const color = preview.style === 0 ? theme.orange : annotationColorForStyle(style, theme);
        const css = preview.style === 0
          ? `background-color:color-mix(in srgb, ${color} 16%, transparent);color:${theme.fg};border-bottom:2px solid ${color};border-radius:3px;padding:0 2px;`
          : annotationMarkCss(style, preview.variant, color, theme);
        return Decoration.set([
          Decoration.mark({ attributes: { style: css }, inclusive: false }).range(preview.from, preview.to)
        ]);
      }
    }, { decorations: v => v.decorations });

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

            if (annotationModeUsesRawMarkup(mode)) {
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
            } else if (annotationModeUsesInlineComments(mode) && comment.trim()) {
              builder.add(wordEnd, spanEnd, Decoration.replace({
                widget: new AnnotationCommentWidget(comment, color, mode),
                inclusive: false
              }));
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
      if (!tr.selection || annotationModeUsesRawMarkup()) return tr;
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
          from: wordEnd + 1,
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

    return [plugin, previewPlugin, plainTheme, plainPlugin, atomicPlugin, srtPlugin, snapFilter, srtSnapFilter];
  }

  function wrapSelectionOrWord(v: EditorView, style: number = 0) {
    const state = v.state;
    const range = state.selection.main;
    const preview = annotationPreview &&
      !range.empty &&
      annotationPreview.from === Math.min(range.from, range.to) &&
      annotationPreview.to === Math.max(range.from, range.to)
        ? annotationPreview
        : null;
    const appliedStyle = preview?.style ?? style;
    const appliedVariant = preview?.variant ?? currentAnnotationVariant;
    const makeInsert = (text: string): string => {
      if (appliedStyle === 0) return `\`${text}\``;
      const now = new Date();
      const ts = now.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).replace(/,/g, "");
      const name = styleName(appliedStyle);
      const title = customStyleTitle(name);
      const titlePart = title ? `, title: "${title}"` : "";
      return `\`${text}\`<!-- ${annotationStyleToken(name, appliedVariant)}, ${ts}: ""${titlePart} -->`;
    };

    const trimAnnotationPunctuation = (from: number, to: number) => {
      const text = state.doc.sliceString(from, to);
      const leading = text.match(/^[\s\p{P}]+/u)?.[0].length ?? 0;
      const trailing = text.match(/[\s\p{P}]+$/u)?.[0].length ?? 0;
      const nextFrom = from + leading;
      const nextTo = Math.max(nextFrom, to - trailing);
      return { from: nextFrom, to: nextTo, text: state.doc.sliceString(nextFrom, nextTo) };
    };

    if (!range.empty) {
      const { from, to, text: selectedText } = trimAnnotationPunctuation(range.from, range.to);
      if (!selectedText) return true;
      const insert = makeInsert(selectedText);
      annotationPreview = null;
      currentStyle = appliedStyle;
      currentAnnotationVariant = appliedVariant;
      v.dispatch({
        changes: { from, to, insert },
        selection: { anchor: from + 1 + selectedText.length }
      });
      return true;
    }
    const docText = state.doc.toString();
    const wordRange = wordRangeAt(docText, range.from);
    if (!wordRange) return true;
    const { from, to, text: wordText } = trimAnnotationPunctuation(wordRange.from, wordRange.to);
    if (!wordText) return true;
    const insert = makeInsert(wordText);
    annotationPreview = null;
    currentStyle = appliedStyle;
    currentAnnotationVariant = appliedVariant;
    v.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + 1 + wordText.length }
    });
    return true;
  }

  function setAnnotationColorOrStyle(v: EditorView, style: number) {
    const cursor = v.state.selection.main.head;
    const docText = v.state.doc.toString();
    annotationPattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = annotationPattern.exec(docText)) !== null) {
      const spanStart = m.index, spanEnd = spanStart + m[0].length;
      if (cursor >= spanStart && cursor <= spanEnd) {
        const { variant } = annotationStyleParts(m[2]);
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
        const updated = replaceAnnotationStylePrefix(m[0], annotationStyleToken(newName, variant));
        currentStyle = style;
        currentAnnotationVariant = variant;
        v.dispatch({
          changes: { from: spanStart, to: spanEnd, insert: updated },
          selection: { anchor: spanStart + 1 + m[1].length }
        });
        return true;
      }
    }

    const variant = annotationVariants[0];
    currentAnnotationVariant = variant;
    if (setAnnotationPreview(v, style, variant)) return true;
    currentStyle = style;
    currentAnnotationVariant = variant;
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

  function deleteSelectionOrNextChar(v: EditorView) {
    const selection = v.state.selection.main;
    if (!selection.empty) {
      v.dispatch({
        changes: { from: selection.from, to: selection.to, insert: "" },
        selection: { anchor: selection.from }
      });
      return true;
    }

    const head = selection.head;
    if (head >= v.state.doc.length) return true;
    v.dispatch({
      changes: { from: head, to: head + 1, insert: "" },
      selection: { anchor: head }
    });
    return true;
  }

  function removeAnnotationOrDelete(v: EditorView) {
    return removeAnnotation(v) || deleteSelectionOrNextChar(v);
  }

  function deleteCurrentLine(v: EditorView) {
    const selection = v.state.selection.main;
    const line = v.state.doc.lineAt(selection.head);
    const from = line.from;
    const to = line.number < v.state.doc.lines ? v.state.doc.line(line.number + 1).from : line.to;
    v.dispatch({
      changes: { from, to, insert: "" },
      selection: { anchor: from }
    });
    return true;
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

  $: currentStyleColor = styleColor(currentStyle);
  $: if (view) {
    currentStyle;
    currentAnnotationVariant;
    stickySelectionActive;
    shiftSelectionActive;
    visualLineSelectionState;
    syncAnnotationPreviewForCurrentSelection(view);
  }

  const statusPlugin = ViewPlugin.fromClass(class {
    constructor(v: EditorView) { applyEditorModeClasses(v); updateStatusFromView(v); }
    update(u: ViewUpdate) {
      applyEditorModeClasses(u.view);
      if (u.docChanged) {
        annotationPreview = null;
        stickySelectionActive = false;
        shiftSelectionActive = false;
        visualLineSelectionState = null;
      }
      else if (u.selectionSet) {
        const range = u.state.selection.main;
        if (range.empty) shiftSelectionActive = false;
        if (!range.empty && (currentStyle > 0 || stickySelectionActive || shiftSelectionActive || visualLineSelectionState)) {
          annotationPreview = annotationPreviewForCurrentSelection(u.view);
        } else {
          refreshAnnotationPreviewForSelection(u.view);
        }
      }
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
            builder.add(line.from, line.from, Decoration.line({
              class: "cm-blockquote-line",
              attributes: { style: blockquoteStyle() }
            }));
            const showMarkup = annotationMode === "all" || (annotationMode === "raw" && line.from === currentLineStart);
            const comment = /<!--\s*align:(?:left|center|right)\s+width:\d{1,3}\s*-->/i.exec(line.text);
            if (comment && !showMarkup) builder.add(line.from + comment.index, line.from + comment.index + comment[0].length, Decoration.replace({ widget: new EmptyWidget(), inclusive: false }));
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
    if (annotationModeUsesRawMarkup()) return { pos: head, side: 1 };

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

  function scrollBorderPx(v: EditorView, lines: number) {
    const viewportHeight = v.scrollDOM.clientHeight;
    if (viewportHeight <= 1) return 0;
    return Math.min(Math.max(0, viewportHeight - 1), Math.max(0, lineHeightPx(v) * lines));
  }

  function scrollPositionIntoActiveViewport(v: EditorView, head = v.state.selection.main.head) {
    requestAnimationFrame(() => {
      const coords = v.coordsAtPos(Math.max(0, Math.min(v.state.doc.length, head)));
      if (!coords) return;
      const scroller = v.scrollDOM;
      const scrollerRect = scroller.getBoundingClientRect();
      const topBorder = scrollBorderPx(v, cursorScrollMarginTopLines);
      const bottomBorder = scrollBorderPx(v, cursorScrollMarginBottomLines);
      const activeTop = scrollerRect.top + topBorder;
      const activeBottom = scrollerRect.bottom - bottomBorder;
      if (coords.top < activeTop) scroller.scrollTop -= activeTop - coords.top;
      else if (coords.bottom > activeBottom) scroller.scrollTop += coords.bottom - activeBottom;
    });
  }

  function lineHeightPx(v: EditorView) {
    const style = getComputedStyle(v.contentDOM);
    const fontSizePx = Number.parseFloat(style.fontSize) || fontSize;
    const computedLineHeight = Number.parseFloat(style.lineHeight);
    return Number.isFinite(computedLineHeight) && computedLineHeight > 0
      ? computedLineHeight
      : fontSizePx * lineHeight;
  }

  function cursorScrollEffect(v: EditorView, head = v.state.selection.main.head) {
    scrollPositionIntoActiveViewport(v, head);
    return EditorView.scrollIntoView(head, { y: "nearest" });
  }

  function visualLineBlockAt(v: EditorView, pos: number) {
    const getter = (v as unknown as { visualLineAt?: (pos: number) => { from: number; to: number } }).visualLineAt;
    return typeof getter === "function" ? getter.call(v, pos) : v.lineBlockAt(pos);
  }

  function visualLineRangeAt(v: EditorView, pos: number) {
    const block = visualLineBlockAt(v, Math.max(0, Math.min(v.state.doc.length, pos)));
    return { from: block.from, to: block.to };
  }

  function visualLineSelectionRange(state: VisualLineSelectionState) {
    return {
      from: Math.min(state.anchorFrom, state.headFrom),
      to: Math.max(state.anchorTo, state.headTo)
    };
  }

  function adjacentVisualLineRange(v: EditorView, range: { from: number; to: number }, direction: "up" | "down") {
    const doc = v.state.doc;
    let pos = direction === "down" ? range.to + 1 : range.from - 1;
    for (let attempts = 0; attempts < 500 && pos >= 0 && pos <= doc.length; attempts += 1) {
      const next = visualLineRangeAt(v, pos);
      if (next.from === range.from && next.to === range.to) {
        pos += direction === "down" ? 1 : -1;
        continue;
      }
      const line = doc.lineAt(next.from);
      if (!isSrtTimestampLine(line.text)) return next;
      pos = direction === "down" ? next.to + 1 : next.from - 1;
    }
    return null;
  }

  function dispatchVisualLineSelection(v: EditorView, state: VisualLineSelectionState) {
    const range = visualLineSelectionRange(state);
    const head = state.headTo;
    v.dispatch({
      selection: EditorSelection.range(range.from, range.to),
      effects: cursorScrollEffect(v, head)
    });
  }

  function startVisualLineSelection(v: EditorView) {
    const range = visualLineRangeAt(v, v.state.selection.main.head);
    visualLineSelectionState = { anchorFrom: range.from, anchorTo: range.to, headFrom: range.from, headTo: range.to };
    stickySelectionActive = false;
    dispatchVisualLineSelection(v, visualLineSelectionState);
    return true;
  }

  function extendVisualLineSelection(v: EditorView, direction: "up" | "down") {
    if (!visualLineSelectionState) return startVisualLineSelection(v);
    const currentHead = { from: visualLineSelectionState.headFrom, to: visualLineSelectionState.headTo };
    const next = adjacentVisualLineRange(v, currentHead, direction);
    if (!next) return true;
    visualLineSelectionState = { ...visualLineSelectionState, headFrom: next.from, headTo: next.to };
    dispatchVisualLineSelection(v, visualLineSelectionState);
    return true;
  }

  function toggleStickySelection(v: EditorView) {
    stickySelectionActive = !stickySelectionActive;
    if (stickySelectionActive) visualLineSelectionState = null;
    v.dispatch({});
    return true;
  }

  function setShiftSelectionActive(active: boolean) {
    shiftSelectionActive = active;
  }

  function scrollCurrentLineIntoView(v: EditorView) {
    const head = v.state.selection.main.head;
    v.dispatch({ effects: cursorScrollEffect(v, head) });
    return true;
  }

  function moveCharWithinLine(v: EditorView, direction: 1 | -1, extend = false) {
    const selection = v.state.selection.main;
    const head = selection.head;
    const line = v.state.doc.lineAt(head);
    const target = direction > 0
      ? Math.min(line.to, head + 1)
      : Math.max(line.from, head - 1);
    if (target === head) return true;
    v.dispatch({
      selection: extend ? EditorSelection.range(selection.anchor, target) : EditorSelection.cursor(target),
      effects: cursorScrollEffect(v, target)
    });
    return true;
  }

  function cursorCharLeft(v: EditorView) { return moveCharWithinLine(v, -1); }
  function cursorCharRight(v: EditorView) { return moveCharWithinLine(v, 1); }
  function selectCharLeft(v: EditorView) { return moveCharWithinLine(v, -1, true); }
  function selectCharRight(v: EditorView) { return moveCharWithinLine(v, 1, true); }

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
      if (!annotationModeUsesRawMarkup()) {
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
      const wordRange = wordRangeAt(docText, pos, editorMode === "normal");
      if (!wordRange) return false;
      v.dispatch({ selection: EditorSelection.range(wordRange.from, wordRange.to) });
      return true;
    }
  });

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
      EditorState.allowMultipleSelections.of(true),
      history(),
      indentOnInput(),
      bracketMatching(),
      highlightActiveLineGutter(),
      buildEditorKeymap({
        getEditorMode: () => editorMode,
        useWordNavigation: () => wordNavigation,
        useWasdNavigation: () => wasdNavigation,
        useHjklNavigation: () => hjklNavigation,
        toggleWordNavigation: () => {
          wordNavigation = !wordNavigation;
          view?.dispatch({});
          return true;
        },
        getCustomShortcut: action => customShortcuts[action] ?? defaultCustomShortcutBindings()[action],
        handleCustomShortcut,
        handleVariantPickerKey,
        setAnnotationColorOrStyle,
        setMode: mode => { setMode(mode); return true; },
        handleEscape,
        toggleHelp: () => { showHelp = !showHelp; return true; },
        toggleSettings,
        finishBlockquoteEditMode,
        insertBlockquoteLineBreak,
        insertBlockquoteLevel,
        exitBlockquoteEditForNavigation,
        cursorCharLeft,
        cursorCharRight,
        selectCharLeft,
        selectCharRight,
        navigation,
        moveCursorByColumnStride,
        wrapSelectionOrWord,
        currentStyle: () => currentStyle,
        handleEnterInAnnotationMode,
        isStickySelectionActive: () => stickySelectionActive,
        toggleStickySelection,
        setShiftSelectionActive,
        isVisualLineSelectionActive: () => visualLineSelectionState !== null,
        startVisualLineSelection,
        extendVisualLineSelection,
        scrollCurrentLineIntoView,
        removeAnnotationOrDelete,
        deleteCurrentLine,
        cycleAnnotationVariant,
        toggleMediaPlayback,
        enterBlockquoteEditMode,
        splitLineEndToBlockquote,
        undo,
        redo,
        handleMediaShortcut,
        seekAudio,
        styleNumberForKey
      }),
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
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (settingsOpen) {
        if (!settingsPopoverEl?.contains(target) && !settingsButtonEl?.contains(target)) settingsOpen = false;
      }
      if (documentPreviewOpen) {
        if (!documentPreviewPopoverEl?.contains(target) && !documentPreviewButtonEl?.contains(target)) documentPreviewOpen = false;
      }
    };
    window.addEventListener("keydown", onWindowKeydown);
    window.addEventListener("pointerdown", onWindowPointerDown);
    const mediaSession = "mediaSession" in navigator ? navigator.mediaSession : null;
    const setMediaAction = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try {
        mediaSession?.setActionHandler(action, handler);
      } catch {
        // Some browsers expose Media Session but do not support every action.
      }
    };
    setMediaAction("seekbackward", details => seekMediaTransport(-1, details.seekOffset || mediaSeekSeconds));
    setMediaAction("seekforward", details => seekMediaTransport(1, details.seekOffset || mediaSeekSeconds));
    setMediaAction("previoustrack", () => seekMediaTransport(-1));
    setMediaAction("nexttrack", () => seekMediaTransport(1));
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
    removeBlockquoteMetaMarkup(view);
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
      window.removeEventListener("keydown", onWindowKeydown);
      synth?.removeEventListener("voiceschanged", onVoicesChanged);
      resetTtsState();
      window.removeEventListener("pointerdown", onWindowPointerDown);
      finishSummaryResize?.();
      finishRightPaddingDrag?.();
      editorResizeObserver.disconnect();
      setMediaAction("seekbackward", null);
      setMediaAction("seekforward", null);
      setMediaAction("previoustrack", null);
      setMediaAction("nexttrack", null);
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
    --comment-fg: ${activeTheme.blockquoteFg};
    --active-style-color: ${currentStyleColor};
    --active-line-opacity-percent: ${Math.round(currentLineHighlightOpacity * 100)}%;
    --active-line-annotate: color-mix(in srgb, var(--active-style-color) var(--active-line-opacity-percent), transparent);
    --active-line-edit: color-mix(in srgb, var(--green) var(--active-line-opacity-percent), transparent);
    --active-gutter-annotate: color-mix(in srgb, var(--active-style-color) 58%, var(--bg-hard));
    --active-gutter-edit: #2f4a3a;
    --column-guide-color: ${currentStyleColor};
    --column-guide-width: ${columnGuideThickness}px;
    --app-font-family: ${layoutFontFamilyCss};
  `}
>
  <div class="toolbar">
    <div class="title">textAnnotate</div>
    <span class="subtitle">.docx, .pdf, .odt, .srt, .txt, .md</span>
    <button class="toolbar-btn help-btn" on:click={() => showHelp = !showHelp} title="Keyboard shortcuts (?)">?</button>
  </div>

  {#if settingsOpen}
    <div
      class="settings-popover"
      bind:this={settingsPopoverEl}
      role="dialog"
      tabindex="-1"
      aria-label="Settings (Ctrl/Cmd+,)"
      on:keydown={event => {
        if (event.key === "Escape") {
          event.preventDefault();
          settingsOpen = false;
          view?.focus();
        }
      }}
    >
      <div class="settings-tabs" role="tablist" aria-label="Settings sections">
        <button type="button" class:active={settingsTab === "layout"} on:click={() => settingsTab = "layout"}>layout</button>
        <button type="button" class:active={settingsTab === "shortcuts"} on:click={() => settingsTab = "shortcuts"}>hotkeys</button>
        <button type="button" class:active={settingsTab === "import"} on:click={() => settingsTab = "import"}>import</button>
      </div>

      {#if settingsTab === "layout"}
        <div class="settings-panel">
          <section class="settings-section">
            <label class="settings-row">
              <span class="settings-row-label">markup visibility</span>
              <select class="settings-input settings-select settings-row-value" bind:value={annotationMode} aria-label="Markup visibility" on:change={() => { view?.dispatch({}); view?.focus(); }}>
                <option value="clean">Clean</option>
                <option value="raw">Raw (current)</option>
                <option value="all">Raw (all)</option>
                <option value="sticky">Sticky comments</option>
                <option value="superscript">Superscript comments</option>
                <option value="subscript">Subscript comments</option>
              </select>
            </label>
          </section>
          <section class="settings-section">
            <label class="settings-row layout-font-field">
              <span class="settings-row-label">font</span>
              <span class="settings-row-value layout-font-controls">
                <select class="settings-input settings-select" bind:value={layoutFontFamilyName} aria-label="Font">
                  {#each orderedFontFamilyOptions() as font}
                    <option value={font.name}>{font.name}</option>
                  {/each}
                </select>
                <button
                  class="settings-icon-button"
                  type="button"
                  aria-label={randomizeFontOnLoad ? "Disable random font on document load" : "Enable random font on document load"}
                  title={randomizeFontOnLoad ? "Random font on load: on" : "Random font on load: off"}
                  aria-pressed={randomizeFontOnLoad}
                  on:click={() => { randomizeFontOnLoad = !randomizeFontOnLoad; if (randomizeFontOnLoad) rotateFontOnLoad = false; }}
                >⇄</button>
                <button
                  class="settings-icon-button"
                  type="button"
                  aria-label={rotateFontOnLoad ? "Disable next font on document load" : "Enable next font on document load"}
                  title={rotateFontOnLoad ? "Next font on load: on" : "Next font on load: off"}
                  aria-pressed={rotateFontOnLoad}
                  on:click={() => { rotateFontOnLoad = !rotateFontOnLoad; if (rotateFontOnLoad) randomizeFontOnLoad = false; }}
                >↻</button>
                <button
                  class="settings-icon-button"
                  type="button"
                  aria-label={isFavoriteFont(layoutFontFamilyName) ? `Remove ${layoutFontFamilyName} from font favorites` : `Add ${layoutFontFamilyName} to font favorites`}
                  title={isFavoriteFont(layoutFontFamilyName) ? "Favorite font: on" : "Favorite font: off"}
                  aria-pressed={isFavoriteFont(layoutFontFamilyName)}
                  on:click={() => toggleFontFavorite(layoutFontFamilyName)}
                >★</button>
              </span>
            </label>
            {#if layoutFontFavorites.length}
              <div class="font-favorite-list" aria-label="Favorite fonts">
                {#each layoutFontFavorites as fontName}
                  <button
                    class="font-favorite-chip"
                    type="button"
                    class:active={layoutFontFamilyName === fontName}
                    title={`Use ${fontName}`}
                    aria-label={`Use ${fontName}`}
                    on:click={() => { layoutFontFamilyName = fontName; }}
                  >
                    <span aria-hidden="true">★</span>
                    <span>{fontName}</span>
                  </button>
                {/each}
              </div>
            {/if}
            <div class="settings-row-grid">
              <div class="settings-row">
                <span class="settings-row-label">line height</span>
                <span class="settings-row-value">{lineHeight.toFixed(2)}</span>
                <span class="settings-row-controls">
                  <button type="button" on:click={() => adjustLayoutValue("lineHeight", -1)} aria-label="Decrease line height">−</button>
                  <button type="button" on:click={() => adjustLayoutValue("lineHeight", 1)} aria-label="Increase line height">+</button>
                </span>
              </div>
              <div class="settings-row">
                <span class="settings-row-label">font size</span>
                <span class="settings-row-value">{fontSize}px</span>
                <span class="settings-row-controls">
                  <button type="button" on:click={() => adjustLayoutValue("fontSize", -1)} aria-label="Decrease font size">−</button>
                  <button type="button" on:click={() => adjustLayoutValue("fontSize", 1)} aria-label="Increase font size">+</button>
                </span>
              </div>
              <div class="settings-row">
                <span class="settings-row-label">paragraph spacing</span>
                <span class="settings-row-value">{paragraphSpacing.toFixed(2)}</span>
                <span class="settings-row-controls">
                  <button type="button" on:click={() => adjustLayoutValue("paragraphSpacing", -1)} aria-label="Decrease paragraph spacing">−</button>
                  <button type="button" on:click={() => adjustLayoutValue("paragraphSpacing", 1)} aria-label="Increase paragraph spacing">+</button>
                </span>
              </div>
            </div>
          </section>
          <section class="settings-section">
            <div class="settings-section-heading">editor</div>
            <label class="settings-row">
              <span class="settings-row-label">current line</span>
              <select class="settings-input settings-select settings-row-value" bind:value={currentLineHighlightStyle} aria-label="Current line highlight">
                <option value="fill">Fill</option>
                <option value="underline">Underline</option>
                <option value="borders">Top and bottom</option>
              </select>
            </label>
            <div class="settings-row-grid">
              <div class="settings-row">
                <span class="settings-row-label">highlight opacity</span>
                <span class="settings-row-value">{Math.round(currentLineHighlightOpacity * 100)}%</span>
                <span class="settings-row-controls">
                  <button type="button" on:click={() => adjustLayoutValue("currentLineHighlightOpacity", -1)} aria-label="Decrease highlight opacity">−</button>
                  <button type="button" on:click={() => adjustLayoutValue("currentLineHighlightOpacity", 1)} aria-label="Increase highlight opacity">+</button>
                </span>
              </div>
              <div class="settings-row">
                <span class="settings-row-label">column guide</span>
                <span class="settings-row-value">{columnGuideThickness}px</span>
                <span class="settings-row-controls">
                  <button type="button" on:click={() => adjustLayoutValue("columnGuideThickness", -1)} aria-label="Decrease column guide thickness">−</button>
                  <button type="button" on:click={() => adjustLayoutValue("columnGuideThickness", 1)} aria-label="Increase column guide thickness">+</button>
                </span>
              </div>
            </div>
          </section>
          <section class="settings-section">
            <div class="settings-section-heading">editor padding</div>
            <div class="settings-row-grid" aria-label="Editor padding">
              <div class="settings-row">
                <span class="settings-row-label">top</span>
                <span class="settings-row-value">{padTop}px</span>
                <span class="settings-row-controls">
                  <button type="button" on:click={() => adjustLayoutValue("padTop", -1)} aria-label="Decrease top padding">−</button>
                  <button type="button" on:click={() => adjustLayoutValue("padTop", 1)} aria-label="Increase top padding">+</button>
                </span>
              </div>
              <div class="settings-row">
                <span class="settings-row-label">right</span>
                <span class="settings-row-value">{padRight}px</span>
                <span class="settings-row-controls">
                  <button type="button" on:click={() => adjustLayoutValue("padRight", -1)} aria-label="Decrease right padding">−</button>
                  <button type="button" on:click={() => adjustLayoutValue("padRight", 1)} aria-label="Increase right padding">+</button>
                </span>
              </div>
              <div class="settings-row">
                <span class="settings-row-label">bottom</span>
                <span class="settings-row-value">{padBottom}px</span>
                <span class="settings-row-controls">
                  <button type="button" on:click={() => adjustLayoutValue("padBottom", -1)} aria-label="Decrease bottom padding">−</button>
                  <button type="button" on:click={() => adjustLayoutValue("padBottom", 1)} aria-label="Increase bottom padding">+</button>
                </span>
              </div>
              <div class="settings-row">
                <span class="settings-row-label">left</span>
                <span class="settings-row-value">{padLeft}px</span>
                <span class="settings-row-controls">
                  <button type="button" on:click={() => adjustLayoutValue("padLeft", -1)} aria-label="Decrease left padding">−</button>
                  <button type="button" on:click={() => adjustLayoutValue("padLeft", 1)} aria-label="Increase left padding">+</button>
                </span>
              </div>
            </div>
          </section>
          <section class="settings-section">
            <div class="settings-section-heading">scroll border</div>
            <div class="settings-row-grid">
              <div class="settings-row">
                <span class="settings-row-label">top</span>
                <span class="settings-row-value">{cursorScrollMarginTopLines} · {scrollBorderTopViewportPercent}%</span>
                <span class="settings-row-controls">
                  <button type="button" on:click={() => adjustLayoutValue("cursorScrollMarginTopLines", -1)} aria-label="Decrease top cursor scroll border">−</button>
                  <button type="button" on:click={() => adjustLayoutValue("cursorScrollMarginTopLines", 1)} aria-label="Increase top cursor scroll border">+</button>
                </span>
              </div>
              <div class="settings-row">
                <span class="settings-row-label">bottom</span>
                <span class="settings-row-value">{cursorScrollMarginBottomLines} · {scrollBorderBottomViewportPercent}%</span>
                <span class="settings-row-controls">
                  <button type="button" on:click={() => adjustLayoutValue("cursorScrollMarginBottomLines", -1)} aria-label="Decrease bottom cursor scroll border">−</button>
                  <button type="button" on:click={() => adjustLayoutValue("cursorScrollMarginBottomLines", 1)} aria-label="Increase bottom cursor scroll border">+</button>
                </span>
              </div>
            </div>
          </section>
          <section class="settings-section">
            <div class="settings-section-heading">notes</div>
            <div class="settings-row-grid">
              <div class="settings-row">
                <span class="settings-row-label">alignment</span>
                <span class="settings-row-value">{blockquoteAlign}</span>
                <span class="settings-row-controls">
                  <button type="button" on:click={() => adjustLayoutValue("blockquoteAlign", -1)} aria-label="Decrease notes alignment">−</button>
                  <button type="button" on:click={() => adjustLayoutValue("blockquoteAlign", 1)} aria-label="Increase notes alignment">+</button>
                </span>
              </div>
              <div class="settings-row">
                <span class="settings-row-label">width</span>
                <span class="settings-row-value">{blockquoteBgWidth}</span>
                <span class="settings-row-controls">
                  <button type="button" on:click={() => adjustLayoutValue("blockquoteBgWidth", -1)} aria-label="Decrease notes width">−</button>
                  <button type="button" on:click={() => adjustLayoutValue("blockquoteBgWidth", 1)} aria-label="Increase notes width">+</button>
                </span>
              </div>
            </div>
          </section>
        </div>
      {:else if settingsTab === "shortcuts"}
        <div class="settings-panel">
          <section class="settings-section">
            <div class="settings-section-heading"><span class="settings-section-icon" aria-hidden="true">⌘</span><span>Hotkeys</span></div>
            <div class="layout-stepper-grid">
              <div class="layout-stepper">
                <span class="layout-control-icon" aria-hidden="true">↔</span>
                <span class="layout-stepper-label">Column stride</span>
                <span class="layout-stepper-value">{columnStride}</span>
                <span class="layout-stepper-buttons">
                  <button type="button" on:click={() => adjustLayoutValue("columnStride", -1)} aria-label="Decrease column stride">−</button>
                  <button type="button" on:click={() => adjustLayoutValue("columnStride", 1)} aria-label="Increase column stride">+</button>
                </span>
              </div>
            </div>
            <label class="settings-toggle-row">
              <span class="settings-control-icon" aria-hidden="true">⇪</span>
              <span>CapsLock on = word navigation</span>
              <input type="checkbox" checked={wordNavigation} on:change={event => wordNavigation = (event.target as HTMLInputElement).checked} />
            </label>
            <label class="settings-toggle-row">
              <span class="settings-control-icon" aria-hidden="true">W</span>
              <span>WASD navigation keys</span>
              <input type="checkbox" checked={wasdNavigation} on:change={event => wasdNavigation = (event.target as HTMLInputElement).checked} />
            </label>
            <label class="settings-toggle-row">
              <span class="settings-control-icon" aria-hidden="true">H</span>
              <span>HJKL navigation keys</span>
              <input type="checkbox" checked={hjklNavigation} on:change={event => hjklNavigation = (event.target as HTMLInputElement).checked} />
            </label>
            <div class="shortcut-grid" aria-label="Custom hotkeys">
              {#each customShortcutDefinitions as shortcut}
                <div class="shortcut-row">
                  <span class="settings-control-icon" aria-hidden="true">{shortcut.icon}</span>
                  <span class="shortcut-label">{shortcut.label}</span>
                  {#if shortcutEditAction === shortcut.action}
                    <input
                      class="settings-input shortcut-input"
                      readonly
                      bind:value={shortcutEditDraft}
                      aria-label={shortcut.label}
                      title={shortcutEditError || "Press a key"}
                      on:keydown={handleShortcutKeydown}
                      on:blur={saveShortcutEdit}
                    />
                  {:else}
                    <button
                      class="shortcut-binding"
                      type="button"
                      title={`Edit ${shortcut.label}`}
                      aria-label={`Edit ${shortcut.label}`}
                      on:click={() => startShortcutEdit(shortcut.action)}
                    >
                      {shortcutBindingFor(shortcut.action)}
                    </button>
                  {/if}
                  <button
                    class="settings-mini-button"
                    type="button"
                    title={`Reset ${shortcut.label}`}
                    aria-label={`Reset ${shortcut.label}`}
                    on:click={() => customShortcuts = { ...customShortcuts, [shortcut.action]: shortcut.defaultValue }}
                  >reset</button>
                </div>
              {/each}
            </div>
            {#if shortcutEditError}
              <div class="transcribe-inline-status error">{shortcutEditError}</div>
            {/if}
          </section>
        </div>
      {:else if settingsTab === "import"}
        <div class="settings-panel">
          <section class="settings-section">
            <div class="settings-section-heading"><span class="settings-section-icon" aria-hidden="true">↵</span><span>Import</span></div>
            <div class="settings-radio-group" aria-label="Imported line handling">
              <label class="settings-choice-row">
                <span class="settings-control-icon" aria-hidden="true">≡</span>
                <span>Original lines</span>
                <input type="radio" name="importLineMode" value="original" bind:group={importLineMode} />
              </label>
              <label class="settings-choice-row">
                <span class="settings-control-icon" aria-hidden="true">.</span>
                <span>Sentence lines</span>
                <input type="radio" name="importLineMode" value="sentences" bind:group={importLineMode} />
              </label>
              <label class="settings-choice-row">
                <span class="settings-control-icon" aria-hidden="true">↵</span>
                <span>Reflow to margin</span>
                <input type="radio" name="importLineMode" value="reflow" bind:group={importLineMode} />
              </label>
            </div>
          </section>
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
    class:left-sidebar-collapsed={leftSidebarCollapsed}
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
    <div class="sidebar" class:collapsed={leftSidebarCollapsed}>
      {#if !leftSidebarCollapsed}
      <div class="sidebar-section">
        <input type="file" accept=".srt,.txt,.md,.docx,.odt,.pdf,.mp3,.wav,.m4a,.ogg,.oga,.webm,.aac,.flac,.mp4,.mov,.mkv" multiple style="display:none" bind:this={fileInput} on:change={loadFile} />
        <button class="sidebar-label load-btn sidebar-load-btn" on:click={() => fileInput.click()}>LOAD</button>
        <div class="file-actions">
          <button class="sidebar-label load-btn" on:click={saveDocument}>SAVE</button>
          <button class="sidebar-label load-btn" on:click={exportCleanHtml}>EXPORT</button>
        </div>
        <button
          class="sidebar-label load-btn sidebar-settings-btn"
          bind:this={settingsButtonEl}
          class:active={settingsOpen}
          on:click={toggleSettings}
          aria-label="Settings"
          aria-expanded={settingsOpen}
        >SETTINGS</button>
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
        <div class="sidebar-hint">style keys are editable; Tab / Shift+Tab: variants</div>
        <div class="style-list sidebar-style-list">
          <div
            class="style-row style-row-plain"
            class:active-style={currentStyle === 0}
            role="listitem"
          >
            <span class="style-key-badge">0</span>
            <div class="style-title-cell">
              <button
                class="style-name style-title-action"
                type="button"
                title="Use plain text"
                aria-label="Use plain text"
                on:click={() => { currentStyle = 0; view?.focus(); }}
                on:keydown={event => event.stopPropagation()}
              >
                plain
              </button>
            </div>
            <span class="style-remove-placeholder" aria-hidden="true"></span>
          </div>
          {#each highlightStyles as style, index}
            <div
              class="style-row"
              class:active-style={currentStyle === index + 1}
              role="listitem"
              style={`--swatch-color: ${style.color}; --swatch-text: ${annotationTextColorForStyle(style.name, style.color)};`}
            >
              {#if editingStyleKeyName === style.name}
                <input
                  class="style-key-badge style-key-input"
                  bind:this={styleKeyInput}
                  bind:value={styleKeyDraft}
                  aria-label={`Shortcut key for ${styleDisplayTitle(style.name)}`}
                  title={styleKeyError || "Press a key or Backspace/Delete to clear"}
                  readonly
                  on:click={event => event.stopPropagation()}
                  on:input={event => {
                    const value = (event.target as HTMLInputElement).value.slice(-1);
                    if (!value.trim()) {
                      styleKeyDraft = "";
                      styleKeyError = "";
                      return;
                    }
                    const result = captureStyleKey(value, style.name);
                    styleKeyError = result.error;
                    if (result.key) styleKeyDraft = result.key;
                  }}
                  on:blur={saveStyleKey}
                  on:keydown={handleStyleKeyKeydown}
                />
              {:else}
                <button
                  class="style-key-badge style-key-action"
                  class:style-key-empty={!styleKeyForName(style.name)}
                  type="button"
                  title={styleKeyForName(style.name)
                    ? `Edit shortcut key for ${styleDisplayTitle(style.name)}`
                    : `Assign shortcut key for ${styleDisplayTitle(style.name)}`}
                  on:click={event => startStyleKeyEdit(event, style.name)}
                  on:keydown={event => event.stopPropagation()}
                >
                  {styleKeyForName(style.name) || "–"}
                </button>
              {/if}
              <div class="style-title-cell">
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
                    class:variant-fill={currentStyle === index + 1 && currentAnnotationVariant === "fill"}
                    class:variant-box={currentStyle === index + 1 && currentAnnotationVariant === "box"}
                    class:variant-underline={currentStyle === index + 1 && currentAnnotationVariant === "underline"}
                    class:variant-rail={currentStyle === index + 1 && currentAnnotationVariant === "rail"}
                    class:variant-bars={currentStyle === index + 1 && currentAnnotationVariant === "bars"}
                    type="button"
                    title={`Edit ${styleDisplayTitle(style.name)} title`}
                    on:click={event => startStyleTitleEdit(event, style.name)}
                    on:keydown={event => event.stopPropagation()}
                  >
                    {styleDisplayTitle(style.name)}
                  </button>
                {/if}
              </div>
              <button
                class="style-remove-button"
                type="button"
                title={`Remove ${styleDisplayTitle(style.name)}`}
                aria-label={`Remove ${styleDisplayTitle(style.name)}`}
                on:click={event => { event.stopPropagation(); removeCustomStyle(style.name); }}
              >×</button>
            </div>
          {/each}
        </div>
        {#if styleKeyError}
          <div class="sidebar-hint style-key-status">{styleKeyError}</div>
        {/if}
        <button class="add-style-inline" type="button" on:click={openAddStyleModal} aria-label="Add annotation style">+</button>
      </div>

      <div class="sidebar-section sidebar-notes-section">
        <div class="sidebar-section-header">
          <button
            class="sidebar-label load-btn sidebar-notes-toggle"
            type="button"
            aria-expanded={sidebarNotesOpen}
            on:click={toggleSidebarNotesOpen}
          >
            NOTES {sidebarNotesOpen ? "−" : "+"}
          </button>
        </div>
        {#if sidebarNotesOpen}
          <div class="sidebar-hint">Persistent scratchpad for follow-up ideas, synced locally.</div>
          <textarea
            class="settings-input settings-textarea sidebar-notes"
            rows="10"
            bind:value={sessionNotes}
            placeholder="Write ideas, change requests, or a handoff for the next pass..."
            aria-label="Persistent notes"
            on:input={handleSessionNotesInput}
          ></textarea>
        {/if}
      </div>
      {/if}
      <div class="sidebar-header">
        <button class="summary-icon-btn sidebar-collapse-btn" type="button" title={leftSidebarCollapsed ? "Show controls" : "Hide controls"} aria-label={leftSidebarCollapsed ? "Show controls" : "Hide controls"} on:click={() => leftSidebarCollapsed = !leftSidebarCollapsed}>
          {leftSidebarCollapsed ? "›" : "‹"}
        </button>
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
      <div class="summary-content">
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
                      <span class="summary-heading-timestamp">{section.item.timestamp}</span>
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
                          <span class="summary-heading-timestamp">{item.timestamp}</span>
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
      </div>
      {/if}
    </aside>
  </div>

  {#if !summaryFullscreen}
    <div class="statusbar" style="--status-accent: {editorMode === 'insert' ? activeTheme.green : activeTheme.orange}">
      <div class="status-cluster status-primary">
        {#if documentMapPages.length || documentMapLineCount}
          <button
            class="status-file status-file-preview"
            class:active={documentPreviewOpen}
            type="button"
            bind:this={documentPreviewButtonEl}
            aria-haspopup="dialog"
            aria-expanded={documentPreviewOpen}
            aria-label={`Open preview for ${loadedFileName}`}
            on:click={toggleDocumentPreview}
          >
            <span>{loadedFileName}</span>
            <span aria-hidden="true">↗</span>
          </button>
        {:else}
          <span class="status-file">{loadedFileName}</span>
        {/if}
      </div>
      <div class="status-center" class:empty={!audioUrl && !showTtsWidget}>
        {#if audioUrl}
          <div class="audio-widget">
            <span class="audio-name">MP3</span>
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
      </div>
    </div>

    {#if documentPreviewOpen}
      <div
        class="document-preview-popover"
        bind:this={documentPreviewPopoverEl}
        role="dialog"
        aria-label="Document preview"
      >
        <div class="document-preview-header">
          <div class="document-preview-title">
            <span class="document-preview-name">{loadedFileName}</span>
            <span class="document-preview-meta">
              {#if documentMapPages.length}
                {documentMapPages.length} pages
              {:else}
                {documentMapLineCount} lines
              {/if}
            </span>
          </div>
          <div class="document-preview-controls" aria-label="Preview zoom">
            <button type="button" on:click={() => setDocumentPreviewZoom(documentPreviewZoom - 0.08)} aria-label="Zoom out">−</button>
            <button type="button" on:click={fitDocumentPreview}>FIT</button>
            <span class="document-preview-zoom">{documentPreviewZoomLabel}</span>
            <button type="button" on:click={() => setDocumentPreviewZoom(documentPreviewZoom + 0.08)} aria-label="Zoom in">+</button>
            <button type="button" on:click={closeDocumentPreview} aria-label="Close document preview">×</button>
          </div>
        </div>
        <div class="document-preview-body" on:wheel|nonpassive={handleDocumentPreviewWheel}>
          {#if documentMapPages.length}
            <div class="document-preview-pages">
              {#each documentMapPages as page}
                {@const scale = documentPreviewScale(page)}
                <button
                  class="document-preview-page"
                  type="button"
                  aria-label={`Jump near page ${page.page}`}
                  on:click={() => jumpToDocumentPage(view, page.page)}
                >
                  {#if page.kind === "pdf" && page.dataUrl}
                    <img
                      class="document-preview-page-image"
                      src={page.dataUrl}
                      alt=""
                      width={Math.round(page.width * scale)}
                      height={Math.round(page.height * scale)}
                      style={`width: ${page.width * scale}px; height: ${page.height * scale}px;`}
                    />
                  {:else if page.html}
                    <div
                      class="document-preview-docx-viewport"
                      style={`width: ${page.width * scale}px; height: ${page.height * scale}px;`}
                    >
                      <div
                        class="document-preview-docx-page"
                        style={`width: ${page.width}px; height: ${page.height}px; transform: scale(${scale});`}
                      >
                        {@html page.html}
                      </div>
                    </div>
                  {/if}
                  <span class="document-preview-page-number">{page.page}</span>
                </button>
              {/each}
            </div>
          {:else}
            <div class="document-preview-map" aria-label="Document line overview">
              <div class="document-map-track" style={`height: ${documentMapTotalHeight}px;`}>
                <div
                  class="document-map-viewport"
                  aria-hidden="true"
                  style={`top: ${documentMapViewportTop}px; height: ${documentMapViewportHeight}px;`}
                ></div>
                {#each documentMapLines as line}
                  <button
                    class="document-map-line"
                    class:blank={line.blank}
                    class:active={line.line === documentMapCurrentLine}
                    type="button"
                    aria-label={`Jump to line ${line.line}`}
                    style={`top: ${line.top}px; height: ${line.height}px;`}
                    on:click={() => jumpToDocumentLine(view, line.line)}
                  >
                    <span class="document-map-line-fill" style={`width: ${line.width}%; margin-left: ${line.indent}px;`}></span>
                  </button>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      </div>
    {/if}
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
        <label class="style-modal-field">
          <span>Hotkey</span>
          <input
            class="style-modal-input"
            bind:value={newStyleKeyDraft}
            aria-label="New annotation style hotkey"
            title={newStyleKeyError || "Press a key"}
            placeholder="Press a key"
            readonly
            on:keydown={handleNewStyleKeyKeydown}
            on:input={event => {
              const result = captureStyleKey((event.target as HTMLInputElement).value.slice(-1));
              newStyleKeyError = result.error;
              if (result.key) newStyleKeyDraft = result.key;
            }}
          />
        </label>
        {#if newStyleKeyError}
          <div class="style-modal-status">{newStyleKeyError}</div>
        {/if}
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
          {#each keyboardHelpSections as section}
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
