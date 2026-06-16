import { Prec, type Extension } from "@codemirror/state";
import { EditorView, keymap, type EditorView as EditorViewType } from "@codemirror/view";

export const reservedStyleKeys = new Set(["h", "j", "k", "l", "w", "a", "s", "d", "n", "u", "v", "x", "c", "?", " "]);

export const customShortcutActions = [
  "stridePrevious",
  "strideNext",
  "annotationPrevious",
  "annotationNext",
  "variantPrevious",
  "variantNext"
] as const;

export type CustomShortcutAction = typeof customShortcutActions[number];

export const customShortcutDefinitions: Array<{ action: CustomShortcutAction; label: string; icon: string; defaultValue: string }> = [
  { action: "stridePrevious", label: "Stride previous", icon: "C", defaultValue: "Shift+c" },
  { action: "strideNext", label: "Stride next", icon: "c", defaultValue: "c" },
  { action: "annotationPrevious", label: "Annotation previous", icon: "N", defaultValue: "Shift+n" },
  { action: "annotationNext", label: "Annotation next", icon: "n", defaultValue: "n" },
  { action: "variantPrevious", label: "Variant previous", icon: "⇧⇥", defaultValue: "Shift+Tab" },
  { action: "variantNext", label: "Variant next", icon: "⇥", defaultValue: "Tab" }
];

export type KeyboardHelpSection = {
  title: string;
  items: readonly (readonly [string, string])[];
};

export type KeyboardPassthrough = {
  label: string;
  description: string;
  bindings: readonly string[];
};

export const editModeUsesCodeMirrorDefaults = true;

export const annotatePassthroughKeys: readonly KeyboardPassthrough[] = [
  { label: "Ctrl/Cmd+A", description: "select all", bindings: ["Ctrl+a", "Meta+a"] },
  { label: "Ctrl/Cmd+C", description: "copy", bindings: ["Ctrl+c", "Meta+c"] },
  { label: "Ctrl/Cmd+F", description: "find", bindings: ["Ctrl+f", "Meta+f"] },
  { label: "Ctrl/Cmd+L", description: "browser location", bindings: ["Ctrl+l", "Meta+l"] }
];

export const annotateHandledKeySections: readonly KeyboardHelpSection[] = [
  {
    title: "Navigation",
    items: [
      ["← ↓ ↑ →", "left / down / up / right"],
      ["CapsLock", "optional word navigation toggle"],
      ["c / C", "column stride right / left"],
      ["WASD", "optional navigation keys"],
      ["HJKL", "optional navigation keys"]
    ]
  },
  {
    title: "Selection",
    items: [
      ["v", "toggle sticky selection"],
      ["V", "visual-line selection"]
    ]
  },
  {
    title: "Annotations",
    items: [
      ["Space", "wrap word / selection"],
      ["n / N", "next / previous annotation"],
      ["1 / 2 / 3", "select styles"],
      ["0", "plain annotation"],
      ["Tab / Shift+Tab", "variant next / previous"],
      ["<", "new blockquote below"],
      [">", "split rest of line to blockquote"],
      ["Enter", "edit note / cue playback"],
      ["x", "remove annotation / delete"]
    ]
  },
  {
    title: "History",
    items: [
      ["u U", "undo / redo"],
      ["Ctrl+Z/Y", "undo / redo"]
    ]
  },
  {
    title: "Other",
    items: [
      ["F2", "enter Edit mode"],
      ["Esc", "exit Edit mode / close panels"],
      ["Alt+Space", "play / pause media / TTS"],
      ["Alt+←/→", "seek media 10s / step TTS"],
      ["Media RW/FF", "seek media / step TTS"],
      ["Ctrl/Cmd+,", "toggle settings"],
      ["F1 / ?", "toggle this help"]
    ]
  }
];

export const keyboardHelpSections: readonly KeyboardHelpSection[] = [
  {
    title: "File Types",
    items: [
      [".docx / .pdf", "document preview and import"],
      [".odt / .txt / .md", "text import"],
      [".srt", "subtitle timestamps"],
      ["audio / video", "transcription and playback"]
    ]
  },
  {
    title: "Annotation Styles",
    items: [
      ["Style keys", "editable per style"],
      ["Tab / Shift+Tab", "variant next / previous"],
      ["+", "create a style with a color"]
    ]
  },
  {
    title: "Notes",
    items: [
      ["Notes", "local scratchpad for follow-up ideas"],
      ["Blockquotes", "export as notes"]
    ]
  },
  ...annotateHandledKeySections,
  {
    title: "Passthrough",
    items: annotatePassthroughKeys.map(key => [key.label, key.description] as const)
  }
];

export function normalizeStyleKey(key: string) {
  if (key.length !== 1 || /\s/.test(key)) return "";
  const normalized = key.toLowerCase();
  return normalized === "0" || !reservedStyleKeys.has(normalized) ? normalized : "";
}

export function isModeShortcut(event: KeyboardEvent) {
  return !event.ctrlKey && !event.metaKey && !event.altKey && (event.key === "Escape" || event.key === "F1" || event.key === "F2");
}

export function isAudioShortcut(event: KeyboardEvent) {
  const key = event.key.toLowerCase();
  if (!event.altKey && !event.ctrlKey && !event.metaKey &&
    (key === "mediarewind" || key === "mediafastforward" || key === "mediatrackprevious" || key === "mediatracknext")) return true;
  return event.altKey && !event.ctrlKey && !event.metaKey &&
    (event.key === " " || event.key === "ArrowLeft" || event.key === "Left" || event.key === "ArrowRight" || event.key === "Right");
}

function normalizeShortcutKey(key: string) {
  if (key === " ") return "Space";
  return key;
}

function shortcutKeyForEvent(event: KeyboardEvent) {
  if (event.key === " ") return "Space";
  if (event.key.length === 1) return event.shiftKey ? event.key.toUpperCase() : event.key.toLowerCase();
  return normalizeShortcutKey(event.key);
}

function parseShortcutBinding(binding: string) {
  const parts = binding.split("+").map(part => part.trim()).filter(Boolean);
  if (!parts.length) return null;

  const parsed = { ctrl: false, meta: false, alt: false, shift: false, key: "" };
  for (const part of parts) {
    const normalized = part.toLowerCase();
    if (normalized === "ctrl" || normalized === "control") parsed.ctrl = true;
    else if (normalized === "meta" || normalized === "cmd" || normalized === "mod") parsed.meta = true;
    else if (normalized === "alt" || normalized === "option") parsed.alt = true;
    else if (normalized === "shift") parsed.shift = true;
    else parsed.key = normalizeShortcutKey(part);
  }
  return parsed.key ? parsed : null;
}

export function normalizeShortcutBinding(value: string) {
  const parsed = parseShortcutBinding(value.trim());
  if (!parsed) return "";
  const parts: string[] = [];
  if (parsed.ctrl) parts.push("Ctrl");
  if (parsed.meta) parts.push("Meta");
  if (parsed.alt) parts.push("Alt");
  if (parsed.shift) parts.push("Shift");
  parts.push(parsed.key.length === 1 ? parsed.key.toLowerCase() : parsed.key);
  return parts.join("+");
}

export function shortcutBindingFromEvent(event: KeyboardEvent) {
  const parts: string[] = [];
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.metaKey) parts.push("Meta");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey && event.key !== "Shift") parts.push("Shift");
  const key = shortcutKeyForEvent(event);
  parts.push(key.length === 1 ? key.toLowerCase() : key);
  return parts.join("+");
}

export function shortcutBindingMatchesEvent(event: KeyboardEvent, binding: string) {
  const parsed = parseShortcutBinding(binding);
  if (!parsed) return false;
  return parsed.ctrl === event.ctrlKey &&
    parsed.meta === event.metaKey &&
    parsed.alt === event.altKey &&
    parsed.shift === event.shiftKey &&
    parsed.key.toLowerCase() === shortcutKeyForEvent(event).toLowerCase();
}

function isModifierOnlyKey(event: KeyboardEvent) {
  return event.key === "Shift" ||
    event.key === "Control" ||
    event.key === "Meta" ||
    event.key === "Alt" ||
    event.key === "AltGraph";
}

function isAnnotateModePassthrough(event: KeyboardEvent) {
  if (isModifierOnlyKey(event)) return true;
  return annotatePassthroughKeys.some(entry =>
    entry.bindings.some(binding => shortcutBindingMatchesEvent(event, binding))
  );
}

export function isAppShortcutCandidate(
  event: KeyboardEvent,
  styleNumberForKey: (key: string) => number | null
) {
  if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key === ",") return true;
  if (event.metaKey) return false;
  if (isModeShortcut(event) || isAudioShortcut(event)) return true;
  if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key === "CapsLock") return true;
  if (event.ctrlKey && !event.altKey && (event.key === "z" || event.key === "y" || event.key === "Z")) return true;
  if (event.ctrlKey && !event.altKey && event.key === "Tab") return true;
  if (event.altKey) return false;
  if (!event.ctrlKey && (styleNumberForKey(event.key) !== null || event.key === "Tab")) return true;

  if (event.ctrlKey) {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === "ArrowDown") return true;
    return false;
  }

  return event.key === " " ||
    event.key === "Tab" ||
    event.key === "Enter" ||
    event.key === "?" ||
    event.key === "ArrowLeft" ||
    event.key === "ArrowRight" ||
    event.key === "ArrowUp" ||
    event.key === "ArrowDown" ||
    "hjklwasdcHJKLWASDCxXvVnNuU<>".includes(event.key);
}

export type EditorMode = "normal" | "insert";

export type EditorKeymapHandlers = {
  getEditorMode: () => EditorMode;
  useWordNavigation: () => boolean;
  useCapsLockWordNavigation: () => boolean;
  useWasdNavigation: () => boolean;
  useHjklNavigation: () => boolean;
  toggleWordNavigation: () => boolean;
  setWordNavigation: (active: boolean) => boolean;
  getCustomShortcut: (action: CustomShortcutAction) => string;
  handleCustomShortcut: (action: CustomShortcutAction, view: EditorViewType) => boolean;
  handleVariantPickerKey: (view: EditorViewType, event: KeyboardEvent) => boolean;
  setAnnotationColorOrStyle: (view: EditorViewType, style: number) => boolean;
  setMode: (mode: EditorMode) => boolean;
  handleEscape: () => boolean;
  toggleHelp: () => boolean;
  toggleSettings: () => boolean;
  finishBlockquoteEditMode: (view: EditorViewType) => boolean;
  insertBlockquoteLineBreak: (view: EditorViewType) => boolean;
  insertBlockquoteLevel: (view: EditorViewType) => boolean;
  exitBlockquoteEditForNavigation: (view: EditorViewType) => boolean;
  cursorCharLeft: (view: EditorViewType) => boolean;
  cursorCharRight: (view: EditorViewType) => boolean;
  selectCharLeft: (view: EditorViewType) => boolean;
  selectCharRight: (view: EditorViewType) => boolean;
  navigation: {
    moveLineSkippingSrt: (view: EditorViewType, direction: "up" | "down", extend?: boolean) => boolean;
    moveByWordCount: (view: EditorViewType, forward: boolean, count: number, extend?: boolean) => boolean;
    paragraphBoundary: (view: EditorViewType, where: "start" | "end", extend?: boolean) => boolean;
  };
  moveCursorByColumnStride: (view: EditorViewType, direction: 1 | -1) => boolean;
  wrapSelectionOrWord: (view: EditorViewType, style: number) => boolean;
  currentStyle: () => number;
  handleEnterInAnnotationMode: (view: EditorViewType) => boolean;
  isStickySelectionActive: () => boolean;
  toggleStickySelection: (view: EditorViewType) => boolean;
  setShiftSelectionActive: (active: boolean) => void;
  isVisualLineSelectionActive: () => boolean;
  startVisualLineSelection: (view: EditorViewType) => boolean;
  extendVisualLineSelection: (view: EditorViewType, direction: "up" | "down") => boolean;
  scrollCurrentLineIntoView: (view: EditorViewType) => boolean;
  removeAnnotationOrDelete: (view: EditorViewType) => boolean;
  deleteCurrentLine: (view: EditorViewType) => boolean;
  cycleAnnotationVariant: (view: EditorViewType, delta: 1 | -1) => boolean;
  toggleMediaPlayback: () => void;
  enterBlockquoteEditMode: (view: EditorViewType) => boolean;
  splitLineEndToBlockquote: (view: EditorViewType) => boolean;
  undo: (view: EditorViewType) => boolean;
  redo: (view: EditorViewType) => boolean;
  handleMediaShortcut: (key: string) => void;
  seekAudio: (deltaSeconds: number) => void;
  styleNumberForKey: (key: string) => number | null;
};

export function buildEditorKeymap(handlers: EditorKeymapHandlers): Extension {
  const normal = (fn: (view: EditorViewType) => boolean) =>
    (view: EditorViewType) => handlers.getEditorMode() === "normal" ? fn(view) : false;

  const moveHorizontal = (view: EditorViewType, forward: boolean, extend = false, useWordNavigation = false) => {
    if (useWordNavigation) {
      return handlers.navigation.moveByWordCount(view, forward, 1, extend);
    }
    if (forward) return extend ? handlers.selectCharRight(view) : handlers.cursorCharRight(view);
    return extend ? handlers.selectCharLeft(view) : handlers.cursorCharLeft(view);
  };

  const handleShiftedAnnotationKey = (view: EditorViewType, event: KeyboardEvent) => {
    if (
      handlers.getEditorMode() !== "normal" ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    ) return false;

    const key = event.key.toLowerCase();
    if (event.shiftKey && key === "x") return handlers.deleteCurrentLine(view);
    if (event.shiftKey && key === "v") return handlers.startVisualLineSelection(view);
    if (event.key === "<" || event.key === ">" || (event.shiftKey && (event.code === "Comma" || event.code === "Period"))) {
      return event.key === "<" || event.code === "Comma"
        ? handlers.enterBlockquoteEditMode(view)
        : handlers.splitLineEndToBlockquote(view);
    }
    return false;
  };

  const handleUserShortcutKey = (view: EditorViewType, event: KeyboardEvent) => {
    if (handlers.getEditorMode() !== "normal") return false;
    for (const action of customShortcutActions) {
      if (!shortcutBindingMatchesEvent(event, handlers.getCustomShortcut(action))) continue;
      return handlers.handleCustomShortcut(action, view);
    }
    return false;
  };

  const normalNavigationBehavior = EditorView.domEventHandlers({
    keydown(event, view) {
      if (handlers.getEditorMode() !== "normal") return false;
      if (event.ctrlKey || event.metaKey || event.altKey) return false;

      const key = event.key.toLowerCase();
      if (key === "capslock") {
        if (!handlers.useCapsLockWordNavigation()) return false;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.repeat) return true;
        return handlers.toggleWordNavigation();
      }

      if (handleShiftedAnnotationKey(view, event)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return true;
      }

      const visualLineSelection = handlers.isVisualLineSelectionActive();
      const extend = event.shiftKey || handlers.isStickySelectionActive();

      if (
        key === "arrowleft" || key === "arrowright" ||
        key === "h" || key === "l" ||
        key === "a" || key === "d"
      ) {
        const isWasdNavigation = key === "a" || key === "d";
        const isHjklNavigation = key === "h" || key === "l";
        if (isWasdNavigation && !handlers.useWasdNavigation()) return false;
        if (isHjklNavigation && !handlers.useHjklNavigation()) return false;
        if (visualLineSelection) {
          event.preventDefault();
          event.stopImmediatePropagation();
          return true;
        }
        const forward = key === "arrowright" || key === "l" || key === "d";
        event.preventDefault();
        event.stopImmediatePropagation();
        return moveHorizontal(view, forward, extend, handlers.useWordNavigation());
      }

      let direction: "up" | "down" | null = null;
      if (key === "arrowdown" || key === "j" || key === "s") direction = "down";
      else if (key === "arrowup" || key === "k" || key === "w") direction = "up";
      else return false;

      if (key === "j" || key === "k") {
        if (!handlers.useHjklNavigation()) return false;
      } else if (key === "w" || key === "s") {
        if (!handlers.useWasdNavigation()) return false;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      handlers.setShiftSelectionActive(event.shiftKey);
      if (visualLineSelection) return handlers.extendVisualLineSelection(view, direction);
      return handlers.navigation.moveLineSkippingSrt(view, direction, extend);
    },
    keyup(event) {
      if (handlers.getEditorMode() !== "normal") return false;
      if (event.ctrlKey || event.metaKey || event.altKey || event.key !== "CapsLock") return false;
      if (!handlers.useCapsLockWordNavigation()) return false;
      event.preventDefault();
      event.stopImmediatePropagation();
      return true;
    }
  });

  const normalPrintableKeyBehavior = EditorView.domEventHandlers({
    keydown(event) {
      if (handlers.getEditorMode() !== "normal") return false;
      if (event.ctrlKey || event.metaKey || event.altKey) return false;
      if (event.key.length !== 1) return false;
      if (isAppShortcutCandidate(event, handlers.styleNumberForKey)) return false;
      event.preventDefault();
      event.stopImmediatePropagation();
      return true;
    }
  });

  const customShortcutBehavior = EditorView.domEventHandlers({
    keydown(event, view) {
      if (handleUserShortcutKey(view, event)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return true;
      }
      return false;
    }
  });

  const annotateModeKeyBoundary = keymap.of([
    {
      any: (_view, event) => {
        if (handlers.getEditorMode() !== "normal") return false;
        return !isAnnotateModePassthrough(event);
      }
    }
  ]);

  return [
    customShortcutBehavior,
    normalNavigationBehavior,
    normalPrintableKeyBehavior,
    Prec.high(keymap.of([
      { any: (view, event) => handlers.getEditorMode() === "normal" && handlers.handleVariantPickerKey(view, event) },
      { any: (view, event) => handleUserShortcutKey(view, event) },
      { any: (view, event) => handleShiftedAnnotationKey(view, event) },
      { key: "Escape", run: () => handlers.handleEscape() },
      { key: "F2", run: normal(view => { handlers.setMode("insert"); return true; }) },
      { key: "F1", run: normal(() => handlers.toggleHelp()) },
      { key: "Mod-,", run: normal(() => handlers.toggleSettings()) },
      { key: "Ctrl-Tab", run: normal(view => handlers.scrollCurrentLineIntoView(view)) },
      { key: "Enter", run: normal(view => handlers.finishBlockquoteEditMode(view)) },
      { key: "Shift-Enter", run: normal(view => handlers.insertBlockquoteLineBreak(view)) },
      { key: "Alt-Enter", run: normal(view => handlers.insertBlockquoteLineBreak(view)) },
      { key: "Tab", run: normal(view => handlers.insertBlockquoteLevel(view)) },
      { key: "ArrowUp", run: normal(view => handlers.exitBlockquoteEditForNavigation(view)) },
      { key: "ArrowDown", run: normal(view => handlers.exitBlockquoteEditForNavigation(view)) },

      { key: "Ctrl-ArrowLeft",        run: normal(view => handlers.navigation.moveByWordCount(view, false, 1)) },
      { key: "Ctrl-ArrowRight",       run: normal(view => handlers.navigation.moveByWordCount(view, true, 1)) },
      { key: "Ctrl-ArrowUp",          run: normal(view => handlers.navigation.paragraphBoundary(view, "start")) },
      { key: "Ctrl-ArrowDown",        run: normal(view => handlers.navigation.paragraphBoundary(view, "end")) },
      { key: "Shift-Ctrl-ArrowLeft",  run: normal(view => handlers.navigation.moveByWordCount(view, false, 1, true)) },
      { key: "Shift-Ctrl-ArrowRight", run: normal(view => handlers.navigation.moveByWordCount(view, true, 1, true)) },
      { key: "Shift-Ctrl-ArrowUp",    run: normal(view => handlers.navigation.paragraphBoundary(view, "start", true)) },
      { key: "Shift-Ctrl-ArrowDown",  run: normal(view => handlers.navigation.paragraphBoundary(view, "end", true)) },
      {
        any: (view, event) => {
          if (
            handlers.getEditorMode() !== "normal" ||
            event.key.length !== 1 ||
            event.ctrlKey ||
            event.metaKey ||
            event.altKey
          ) return false;
          const style = handlers.styleNumberForKey(event.key);
          return style === null ? false : handlers.setAnnotationColorOrStyle(view, style);
        }
      },
      { key: "Space",  run: normal(view => handlers.wrapSelectionOrWord(view, handlers.currentStyle())) },
      { key: "Enter",  run: normal(view => handlers.handleEnterInAnnotationMode(view)) },
      { key: "x",      run: normal(view => handlers.removeAnnotationOrDelete(view)) },
      { key: "Backspace", run: normal(() => true) },
      { key: "Delete",    run: normal(() => true) },
      { key: "Shift-x", run: normal(view => handlers.deleteCurrentLine(view)) },
      { key: "v",      run: normal(view => handlers.toggleStickySelection(view)) },
      { key: "Shift-v", run: normal(view => handlers.startVisualLineSelection(view)) },
      { key: "Shift-,", run: normal(view => handlers.enterBlockquoteEditMode(view)) },
      { key: "Shift-.", run: normal(view => handlers.splitLineEndToBlockquote(view)) },
      { key: "u",      run: normal(view => handlers.undo(view)) },
      { key: "U",      run: normal(view => handlers.redo(view)) },
      { key: "Ctrl-z", run: normal(view => handlers.undo(view)) },
      { key: "Ctrl-y", run: normal(view => handlers.redo(view)) },
      { key: "Ctrl-Z", run: normal(view => handlers.redo(view)) },
      { key: "?",      run: normal(() => handlers.toggleHelp()) },
      { key: "Alt-Space",  run: normal(() => { handlers.toggleMediaPlayback(); return true; }) },
      { key: "Alt-ArrowLeft",  run: normal(() => { handlers.seekAudio(-10); return true; }) },
      { key: "Alt-ArrowRight", run: normal(() => { handlers.seekAudio(10); return true; }) },
      { key: "MediaRewind", run: normal(() => { handlers.handleMediaShortcut("MediaRewind"); return true; }) },
      { key: "MediaFastForward", run: normal(() => { handlers.handleMediaShortcut("MediaFastForward"); return true; }) },
      { key: "MediaTrackPrevious", run: normal(() => { handlers.handleMediaShortcut("MediaTrackPrevious"); return true; }) },
      { key: "MediaTrackNext", run: normal(() => { handlers.handleMediaShortcut("MediaTrackNext"); return true; }) }
    ])),
    annotateModeKeyBoundary
  ];
}
