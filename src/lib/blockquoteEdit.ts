import { EditorSelection } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

export type BlockquoteEditStart = {
  handled: boolean;
  returnAnchor: number | null;
};

function quotePrefix(text: string) {
  return /^(?:>\s*)+/.exec(text)?.[0] ?? "";
}

function quoteText(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line, index) => `${index === 0 ? line.trimStart() : line}`.replace(/^> ?/, ""))
    .map(line => `> ${line}`)
    .join("\n");
}

function ensureTrailingQuoteLine(text: string) {
  return text.endsWith("\n> ") ? text : `${text}\n> `;
}

function blockquoteContentCursor(lineFrom: number, lineText: string) {
  const prefix = quotePrefix(lineText);
  return lineFrom + Math.max(prefix.length, lineText.startsWith("> ") ? 2 : 1);
}

function blockquoteRunEnd(view: EditorView, pos: number) {
  let line = view.state.doc.lineAt(pos);
  while (line.number < view.state.doc.lines) {
    const next = view.state.doc.line(line.number + 1);
    if (!next.text.startsWith(">")) break;
    line = next;
  }
  return line;
}

function trailingEmptyQuoteLine(view: EditorView, pos: number) {
  const endLine = blockquoteRunEnd(view, pos);
  return endLine.text.trim() === ">" ? endLine : null;
}

export function enterBlockquoteEdit(view: EditorView): BlockquoteEditStart {
  const selection = view.state.selection.main;
  const returnAnchor = selection.head;

  if (!selection.empty) {
    const from = Math.min(selection.from, selection.to);
    const to = Math.max(selection.from, selection.to);
    const beforeNeedsBreak = from > 0 && view.state.doc.sliceString(from - 1, from) !== "\n";
    const quotedText = quoteText(view.state.doc.sliceString(from, to));
    const prefix = beforeNeedsBreak ? "\n" : "";
    const insert = `${prefix}${ensureTrailingQuoteLine(quotedText)}`;
    const tr = view.state.update({
      changes: { from, to, insert },
      selection: { anchor: from + prefix.length + blockquoteContentCursor(0, quotedText) }
    });
    view.dispatch(tr);
    return { handled: true, returnAnchor: tr.changes.mapPos(returnAnchor, 1) };
  }

  const head = selection.head;
  const line = view.state.doc.lineAt(head);

  if (line.text.startsWith(">")) {
    view.dispatch({ selection: { anchor: blockquoteContentCursor(line.from, line.text) } });
    return { handled: true, returnAnchor };
  }

  const insertAt = line.text.trim().length === 0 ? line.from : line.to;
  const deleteTo = line.text.trim().length === 0 ? line.to : line.to;
  const prefix = line.text.trim().length === 0 ? "" : "\n";
  const insert = `${prefix}> \n> `;
  const firstQuoteStart = insertAt + prefix.length;
  view.dispatch({
    changes: { from: insertAt, to: deleteTo, insert },
    selection: { anchor: firstQuoteStart + 2 }
  });
  return { handled: true, returnAnchor };
}

export function splitLineEndToBlockquote(view: EditorView): BlockquoteEditStart {
  const selection = view.state.selection.main;
  const head = selection.head;
  const line = view.state.doc.lineAt(head);
  const from = Math.min(selection.from, selection.to);
  const to = Math.max(selection.from, selection.to);
  const selectedText = selection.empty
    ? view.state.doc.sliceString(head, line.to)
    : view.state.doc.sliceString(from, to);
  const quotedText = quoteText(selectedText);
  const insert = `\n${ensureTrailingQuoteLine(quotedText || "> ")}`;
  const changeFrom = selection.empty ? head : from;
  const changeTo = selection.empty ? line.to : to;

  view.dispatch({
    changes: { from: changeFrom, to: changeTo, insert },
    selection: { anchor: changeFrom + 1 + blockquoteContentCursor(0, quotedText || "> ") }
  });
  return { handled: true, returnAnchor: head };
}

export function finishBlockquoteEdit(view: EditorView, returnAnchor: number | null) {
  if (returnAnchor === null) return false;
  const selection = view.state.selection.main;
  const endLine = blockquoteRunEnd(view, selection.head);
  const emptyLine = endLine.text.trim() === ">" ? endLine : null;
  const changes = emptyLine
    ? { from: emptyLine.from, to: emptyLine.to, insert: "" }
    : { from: endLine.to, insert: "\n" };
  const cursor = emptyLine ? emptyLine.from : endLine.to + 1;
  view.dispatch({ changes, selection: EditorSelection.cursor(cursor) });
  return true;
}

export function cancelBlockquoteEdit(view: EditorView, returnAnchor: number | null) {
  if (returnAnchor === null) return false;
  const target = Math.max(0, Math.min(returnAnchor, view.state.doc.length));
  view.dispatch({ selection: EditorSelection.cursor(target) });
  return true;
}

export function insertBlockquoteLineBreak(view: EditorView, returnAnchor: number | null) {
  if (returnAnchor === null) return false;
  const selection = view.state.selection.main;
  const from = Math.min(selection.from, selection.to);
  const to = Math.max(selection.from, selection.to);
  const line = view.state.doc.lineAt(from);
  if (!line.text.startsWith(">")) return false;
  const trailing = trailingEmptyQuoteLine(view, from);
  const insertAt = trailing ? trailing.from : to;
  view.dispatch({
    changes: { from: insertAt, to: insertAt, insert: "> \n" },
    selection: { anchor: insertAt + 2 }
  });
  return true;
}

export function indentBlockquoteLine(view: EditorView) {
  const selection = view.state.selection.main;
  if (!selection.empty) return false;
  const head = selection.head;
  const line = view.state.doc.lineAt(head);
  if (!line.text.startsWith(">")) return false;

  const insertAt = line.from + quotePrefix(line.text).length;
  view.dispatch({
    changes: { from: insertAt, insert: "> " },
    selection: { anchor: head + (insertAt <= head ? 2 : 0) }
  });
  return true;
}

export function outdentBlockquoteLine(view: EditorView) {
  const selection = view.state.selection.main;
  if (!selection.empty) return false;
  const head = selection.head;
  const line = view.state.doc.lineAt(head);
  const prefix = quotePrefix(line.text);
  if (!prefix) return false;

  const levels = [...prefix.matchAll(/>/g)].length;
  if (levels <= 1) return true;
  const removeFrom = line.from + prefix.lastIndexOf(">");
  const removeTo = Math.min(line.to, removeFrom + (line.text[removeFrom - line.from + 1] === " " ? 2 : 1));
  view.dispatch({
    changes: { from: removeFrom, to: removeTo, insert: "" },
    selection: { anchor: Math.max(line.from + 2, head - (removeTo - removeFrom)) }
  });
  return true;
}
