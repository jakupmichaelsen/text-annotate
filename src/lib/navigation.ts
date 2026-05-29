import type { EditorView } from "@codemirror/view";
import {
  cursorLineUp,
  cursorLineDown,
  selectLineUp,
  selectLineDown
} from "@codemirror/commands";

type EditorCommand = (view: EditorView) => boolean;
type CursorScrollEffect = (view: EditorView, head?: number) => unknown;

type NavigationOptions = {
  cursorScrollEffect: CursorScrollEffect;
  isSrtTimestampLine: (text: string) => boolean;
  wordBoundary: (text: string, pos: number, forward: boolean) => number;
};

export function createNavigationCommands({
  cursorScrollEffect,
  isSrtTimestampLine,
  wordBoundary
}: NavigationOptions) {
  function scrollCursorIntoView(v: EditorView) {
    v.dispatch({ effects: cursorScrollEffect(v) });
  }

  function runWithCursorScroll(v: EditorView, command: EditorCommand) {
    const handled = command(v);
    if (handled) scrollCursorIntoView(v);
    return handled;
  }

  function moveByWordCount(v: EditorView, forward: boolean, count: number, extend = false) {
    const selection = v.state.selection.main;
    const docText = v.state.doc.toString();
    let head = selection.head;

    for (let i = 0; i < count; i += 1) {
      const next = wordBoundary(docText, head, forward);
      if (next === head) break;
      head = next;
    }

    v.dispatch({
      selection: { anchor: extend ? selection.anchor : head, head },
      effects: cursorScrollEffect(v, head)
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
      v.dispatch({
        selection: { anchor: extend ? current.anchor : line.from, head: line.from },
        effects: cursorScrollEffect(v, line.from)
      });
      return true;
    }

    while (line.number < doc.lines && !line.text.trim()) line = doc.line(line.number + 1);
    while (line.number < doc.lines && doc.line(line.number + 1).text.trim()) line = doc.line(line.number + 1);
    if (current.head === line.to && line.number < doc.lines) {
      line = doc.line(line.number + 1);
      while (line.number < doc.lines && !line.text.trim()) line = doc.line(line.number + 1);
      while (line.number < doc.lines && doc.line(line.number + 1).text.trim()) line = doc.line(line.number + 1);
    }
    v.dispatch({
      selection: { anchor: extend ? current.anchor : line.to, head: line.to },
      effects: cursorScrollEffect(v, line.to)
    });
    return true;
  }

  function moveLineSkippingSrt(v: EditorView, direction: "up" | "down", extend = false) {
    const move = direction === "up"
      ? (extend ? selectLineUp : cursorLineUp)
      : (extend ? selectLineDown : cursorLineDown);
    const selection = v.state.selection.main;
    const doc = v.state.doc;
    const currentLine = doc.lineAt(selection.head);
    const step = direction === "up" ? -1 : 1;
    const adjacentNumber = currentLine.number + step;

    if (adjacentNumber < 1 || adjacentNumber > doc.lines) {
      runWithCursorScroll(v, move);
      return true;
    }

    const adjacentLine = doc.line(adjacentNumber);
    if (!isSrtTimestampLine(adjacentLine.text)) {
      runWithCursorScroll(v, move);
      return true;
    }

    const column = selection.head - currentLine.from;
    for (let lineNumber = adjacentNumber + step; lineNumber >= 1 && lineNumber <= doc.lines; lineNumber += step) {
      const line = doc.line(lineNumber);
      if (isSrtTimestampLine(line.text) || !line.text.trim()) continue;
      const head = line.from + Math.min(column, line.length);
      v.dispatch({
        selection: { anchor: extend ? selection.anchor : head, head },
        effects: cursorScrollEffect(v, head)
      });
      return true;
    }

    return true;
  }

  return {
    moveByWordCount,
    paragraphBoundary,
    moveLineSkippingSrt,
    runWithCursorScroll,
    scrollCursorIntoView
  };
}
