import { Prec, type Extension } from "@codemirror/state";
import { EditorView, keymap, type EditorView as EditorViewType } from "@codemirror/view";

export const reservedStyleKeys = new Set(["h", "j", "k", "l", "w", "a", "s", "d", "q", "e", "r", "f", "n", "u", "v", "x", "z", "c", "?", " "]);

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
    (event.key === " " || event.key === "ArrowLeft" || event.key === "Left" || event.key === "ArrowRight" || event.key === "Right" ||
      key === "a" || key === "d" || key === "s" || key === "w");
}

export function isAudioRateShortcut(event: KeyboardEvent) {
  return event.altKey && !event.ctrlKey && !event.metaKey && (event.key.toLowerCase() === "r" || event.key.toLowerCase() === "w");
}

export function isAppShortcutCandidate(
  event: KeyboardEvent,
  styleNumberForKey: (key: string) => number | null
) {
  if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key === ",") return true;
  if (event.metaKey) return false;
  if (isModeShortcut(event) || isAudioShortcut(event) || isAudioRateShortcut(event)) return true;
  if (event.ctrlKey && !event.altKey && (event.key === "z" || event.key === "y" || event.key === "Z")) return true;
  if (event.ctrlKey && !event.altKey && event.key === "Tab") return true;
  if (event.altKey) return false;
  if (!event.ctrlKey && (event.key.toLowerCase() === "r" || styleNumberForKey(event.key) !== null || event.key === "Tab")) return true;

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
    "hjklwasdcqeHJKLWASDCQEfrxvznNuU".includes(event.key);
}

export type EditorMode = "normal" | "insert";

export type EditorKeymapHandlers = {
  getEditorMode: () => EditorMode;
  useArrowWordNavigation: () => boolean;
  useWasdWordNavigation: () => boolean;
  useHjklWordNavigation: () => boolean;
  handleVariantPickerKey: (view: EditorViewType, event: KeyboardEvent) => boolean;
  setAnnotationColorOrStyle: (view: EditorViewType, style: number) => boolean;
  setMode: (mode: EditorMode) => boolean;
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
  isVisualLineSelectionActive: () => boolean;
  startVisualLineSelection: (view: EditorViewType) => boolean;
  extendVisualLineSelection: (view: EditorViewType, direction: "up" | "down") => boolean;
  scrollCurrentLineIntoView: (view: EditorViewType) => boolean;
  removeAnnotationOrDelete: (view: EditorViewType) => boolean;
  cycleAnnotationVariant: (view: EditorViewType, delta: 1 | -1) => boolean;
  toggleMediaPlayback: () => void;
  enterBlockquoteEditMode: (view: EditorViewType) => boolean;
  splitLineEndToBlockquote: (view: EditorViewType) => boolean;
  cycleAnnotationColor: (view: EditorViewType, delta: 1 | -1) => boolean;
  cycleStyle: (delta: 1 | -1) => void;
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

  const normalNavigationBehavior = EditorView.domEventHandlers({
    keydown(event, view) {
      if (handlers.getEditorMode() !== "normal") return false;
      if (event.ctrlKey || event.metaKey || event.altKey) return false;

      const key = event.key.toLowerCase();
      const visualLineSelection = handlers.isVisualLineSelectionActive();
      const extend = event.shiftKey || handlers.isStickySelectionActive();

      if (
        key === "arrowleft" || key === "arrowright" ||
        key === "h" || key === "l" || key === "q" || key === "e" ||
        key === "a" || key === "d"
      ) {
        if (visualLineSelection) {
          event.preventDefault();
          event.stopImmediatePropagation();
          return true;
        }
        const forward = key === "arrowright" || key === "l" || key === "e" || key === "d";
        const useWordNavigation =
          key === "arrowleft" || key === "arrowright"
            ? handlers.useArrowWordNavigation()
            : key === "a" || key === "d"
              ? handlers.useWasdWordNavigation()
              : handlers.useHjklWordNavigation();
        event.preventDefault();
        event.stopImmediatePropagation();
        return moveHorizontal(view, forward, extend, useWordNavigation);
      }

      let direction: "up" | "down" | null = null;
      if (key === "arrowdown" || key === "j" || key === "s") direction = "down";
      else if (key === "arrowup" || key === "k" || key === "w") direction = "up";
      else return false;

      event.preventDefault();
      event.stopImmediatePropagation();
      if (visualLineSelection) return handlers.extendVisualLineSelection(view, direction);
      return handlers.navigation.moveLineSkippingSrt(view, direction, extend);
    }
  });

  return [
    normalNavigationBehavior,
    Prec.high(keymap.of([
      { any: (view, event) => handlers.getEditorMode() === "normal" && handlers.handleVariantPickerKey(view, event) },
      { key: "Escape", run: view => { handlers.setMode("normal"); return true; } },
      { key: "F2", run: view => { handlers.setMode(handlers.getEditorMode() === "insert" ? "normal" : "insert"); return true; } },
      { key: "F1", run: () => handlers.toggleHelp() },
      { key: "Mod-,", run: () => handlers.toggleSettings() },
      { key: "Ctrl-Tab", run: view => handlers.scrollCurrentLineIntoView(view) },
      { key: "Enter", run: view => handlers.finishBlockquoteEditMode(view) },
      { key: "Shift-Enter", run: view => handlers.insertBlockquoteLineBreak(view) },
      { key: "Alt-Enter", run: view => handlers.insertBlockquoteLineBreak(view) },
      { key: "Tab", run: view => handlers.insertBlockquoteLevel(view) },
      { key: "ArrowUp", run: view => handlers.exitBlockquoteEditForNavigation(view) },
      { key: "ArrowDown", run: view => handlers.exitBlockquoteEditForNavigation(view) },

      { key: "Ctrl-ArrowLeft",        run: normal(view => handlers.navigation.moveByWordCount(view, false, 1)) },
      { key: "Ctrl-ArrowRight",       run: normal(view => handlers.navigation.moveByWordCount(view, true, 1)) },
      { key: "Ctrl-ArrowUp",          run: normal(view => handlers.navigation.paragraphBoundary(view, "start")) },
      { key: "Ctrl-ArrowDown",        run: normal(view => handlers.navigation.paragraphBoundary(view, "end")) },
      { key: "Shift-Ctrl-ArrowLeft",  run: normal(view => handlers.navigation.moveByWordCount(view, false, 1, true)) },
      { key: "Shift-Ctrl-ArrowRight", run: normal(view => handlers.navigation.moveByWordCount(view, true, 1, true)) },
      { key: "Shift-Ctrl-ArrowUp",    run: normal(view => handlers.navigation.paragraphBoundary(view, "start", true)) },
      { key: "Shift-Ctrl-ArrowDown",  run: normal(view => handlers.navigation.paragraphBoundary(view, "end", true)) },
      { key: "Ctrl-h", run: normal(view => handlers.navigation.moveByWordCount(view, false, 1)) },
      { key: "Ctrl-j", run: normal(view => handlers.navigation.paragraphBoundary(view, "end")) },
      { key: "Ctrl-k", run: normal(view => handlers.navigation.paragraphBoundary(view, "start")) },
      { key: "Ctrl-l", run: normal(view => handlers.navigation.moveByWordCount(view, true, 1)) },
      { key: "Ctrl-w", run: normal(view => handlers.navigation.paragraphBoundary(view, "start")) },
      { key: "Ctrl-s", run: normal(view => handlers.navigation.paragraphBoundary(view, "end")) },
      { key: "Ctrl-d", run: normal(view => handlers.navigation.moveByWordCount(view, true, 5)) },
      { key: "Tab", run: normal(view => handlers.moveCursorByColumnStride(view, 1)) },
      { key: "Shift-Tab", run: normal(view => handlers.moveCursorByColumnStride(view, -1)) },
      { key: "Shift-Ctrl-h", run: normal(view => handlers.navigation.moveByWordCount(view, false, 1, true)) },
      { key: "Shift-Ctrl-j", run: normal(view => handlers.navigation.paragraphBoundary(view, "end", true)) },
      { key: "Shift-Ctrl-k", run: normal(view => handlers.navigation.paragraphBoundary(view, "start", true)) },
      { key: "Shift-Ctrl-l", run: normal(view => handlers.navigation.moveByWordCount(view, true, 1, true)) },
      { key: "Shift-Ctrl-w", run: normal(view => handlers.navigation.paragraphBoundary(view, "start", true)) },
      { key: "Shift-Ctrl-s", run: normal(view => handlers.navigation.paragraphBoundary(view, "end", true)) },
      { key: "Shift-Ctrl-a", run: normal(view => handlers.navigation.moveByWordCount(view, false, 5, true)) },
      { key: "Shift-Ctrl-d", run: normal(view => handlers.navigation.moveByWordCount(view, true, 5, true)) },
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
      { key: "z",      run: normal(view => { if (!handlers.cycleAnnotationColor(view, -1)) handlers.cycleStyle(-1); return true; }) },
      { key: "c",      run: normal(view => { if (!handlers.cycleAnnotationColor(view, +1)) handlers.cycleStyle(+1); return true; }) },
      { key: "f",      run: normal(view => handlers.cycleAnnotationVariant(view, +1)) },
      { key: "v",      run: normal(view => handlers.toggleStickySelection(view)) },
      { key: "V",      run: normal(view => handlers.startVisualLineSelection(view)) },
      { key: "r",      run: normal(() => { handlers.handleMediaShortcut("r"); return true; }) },
      { key: "n",      run: normal(view => handlers.enterBlockquoteEditMode(view)) },
      { key: "N",      run: normal(view => handlers.splitLineEndToBlockquote(view)) },
      { key: "u",      run: normal(view => handlers.undo(view)) },
      { key: "U",      run: normal(view => handlers.redo(view)) },
      { key: "Ctrl-z", run: view => handlers.undo(view) },
      { key: "Ctrl-y", run: view => handlers.redo(view) },
      { key: "Ctrl-Z", run: view => handlers.redo(view) },
      { key: "?",      run: normal(() => handlers.toggleHelp()) },
      { key: "Alt-r", run: () => { handlers.handleMediaShortcut("r"); return true; } },
      { key: "Alt-w", run: () => { handlers.handleMediaShortcut("w"); return true; } },
      { key: "Alt-a", run: () => { handlers.handleMediaShortcut("a"); return true; } },
      { key: "Alt-s", run: () => { handlers.handleMediaShortcut("s"); return true; } },
      { key: "Alt-d", run: () => { handlers.handleMediaShortcut("d"); return true; } },
      { key: "Alt-Space",  run: () => { handlers.toggleMediaPlayback(); return true; } },
      { key: "Alt-ArrowLeft",  run: () => { handlers.seekAudio(-10); return true; } },
      { key: "Alt-ArrowRight", run: () => { handlers.seekAudio(10); return true; } },
      { key: "MediaRewind", run: () => { handlers.handleMediaShortcut("MediaRewind"); return true; } },
      { key: "MediaFastForward", run: () => { handlers.handleMediaShortcut("MediaFastForward"); return true; } },
      { key: "MediaTrackPrevious", run: () => { handlers.handleMediaShortcut("MediaTrackPrevious"); return true; } },
      { key: "MediaTrackNext", run: () => { handlers.handleMediaShortcut("MediaTrackNext"); return true; } },
      {
        any: (_view, event) =>
          handlers.getEditorMode() === "normal" &&
          event.key.length === 1 &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey
      },
    ]))
  ];
}
