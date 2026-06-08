import type { BlockInfo, EditorView } from "@codemirror/view";
type EditorCommand = (view: EditorView) => boolean;
type CursorScrollEffect = (view: EditorView, head?: number) => unknown;

type NavigationOptions = {
  cursorScrollEffect: CursorScrollEffect;
  isSrtTimestampLine: (text: string) => boolean;
  wordBoundary: (text: string, pos: number, forward: boolean) => number;
  wordSelectionBoundary?: (text: string, pos: number, forward: boolean) => number;
  getLineStride: () => number;
  anchorDebug?: {
    enabled: () => boolean;
    report: (info: AnchorDebugReport | null) => void;
  };
};

const whitespacePattern = /\s/;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

type SimplifiedRect = { left: number; right: number; top: number; bottom: number };

type VisualRow = {
  index: number;
  from: number;
  to: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
};

export type AnchorDebugEntry = {
  fraction: number;
  pos: number;
  leftPos: number;
  rightPos: number;
  targetX: number | null;
  source: "coords" | "fallback";
  leftCoords: SimplifiedRect | null;
  rightCoords: SimplifiedRect | null;
  hasContent: boolean;
  isFirst: boolean;
  isLast: boolean;
  stepIndex: number;
  stepCount: number;
  strideColumns: number;
  rowIndex: number;
  rowCount: number;
  rowFrom: number;
  rowTo: number;
  rowWidth: number;
  chosen: boolean;
};

export type AnchorDebugReport = {
  blockFrom: number;
  blockTo: number;
  blockText: string;
  head: number;
  direction: 1 | -1;
  entries: AnchorDebugEntry[];
};

export function createNavigationCommands({
  cursorScrollEffect,
  isSrtTimestampLine,
  wordBoundary,
  wordSelectionBoundary = wordBoundary,
  getLineStride,
  anchorDebug
}: NavigationOptions) {
  function visualLineBlockAt(view: EditorView, pos: number): BlockInfo {
    const getter = (view as unknown as { visualLineAt?: (pos: number) => BlockInfo }).visualLineAt;
    return typeof getter === "function" ? getter.call(view, pos) : view.lineBlockAt(pos);
  }

  function simplifyRect(rect: DOMRect | null): SimplifiedRect | null {
    if (!rect) return null;
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom
    };
  }

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
      const next = extend ? wordSelectionBoundary(docText, head, forward) : wordBoundary(docText, head, forward);
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
    const selection = v.state.selection.main;
    const doc = v.state.doc;
    const currentLine = doc.lineAt(selection.head);
    const step = direction === "up" ? -1 : 1;

    for (let lineNumber = currentLine.number + step; lineNumber >= 1 && lineNumber <= doc.lines; lineNumber += step) {
      const line = doc.line(lineNumber);
      if (isSrtTimestampLine(line.text)) continue;
      const head = line.from;
      v.dispatch({
        selection: { anchor: extend ? selection.anchor : head, head },
        effects: cursorScrollEffect(v, head)
      });
      return true;
    }

    const head = direction === "up" ? 0 : doc.length;
    v.dispatch({
      selection: { anchor: extend ? selection.anchor : head, head },
      effects: cursorScrollEffect(v, head)
    });
    return true;
  }

  function trimmedBlockRange(docText: string, baseFrom: number) {
    let leading = 0;
    let trailing = docText.length;

    while (leading < trailing && whitespacePattern.test(docText[leading] ?? "")) leading += 1;
    while (trailing > leading && whitespacePattern.test(docText[trailing - 1] ?? "")) trailing -= 1;

    return {
      start: baseFrom + leading,
      end: baseFrom + trailing
    };
  }

  function coordsWithFallback(v: EditorView, block: BlockInfo, pos: number, forward: boolean) {
    const maxShift = Math.min(24, Math.max(0, block.to - block.from));
    let current = Math.max(block.from, Math.min(block.to, pos));
    for (let shift = 0; shift <= maxShift; shift += 1) {
      const attempt = v.coordsAtPos(current, forward ? 1 : -1);
      if (attempt) return attempt;
      current += forward ? 1 : -1;
      if (current < block.from || current > block.to) break;
    }
    return null;
  }

  function resolveVisualRows(v: EditorView, block: BlockInfo): VisualRow[] {
    const rows: VisualRow[] = [];
    const span = block.to - block.from;
    if (span <= 0) return rows;

    let coords = v.coordsAtPos(block.from, 1);
    if (!coords) return rows;

    let currentRow: VisualRow = {
      index: 0,
      from: block.from,
      to: block.from,
      left: coords.left,
      right: coords.right,
      top: coords.top,
      bottom: coords.bottom,
      width: Math.max(0, coords.right - coords.left)
    };

    for (let pos = block.from + 1; pos <= block.to; pos += 1) {
      const next = v.coordsAtPos(pos, 1);
      if (!next) continue;
      const startsNewRow = next.top > currentRow.bottom + 0.75;
      if (startsNewRow) {
        rows.push({
          ...currentRow,
          to: pos - 1,
          width: Math.max(0, currentRow.right - currentRow.left)
        });
        currentRow = {
          index: rows.length,
          from: pos,
          to: pos,
          left: next.left,
          right: next.right,
          top: next.top,
          bottom: next.bottom,
          width: Math.max(0, next.right - next.left)
        };
      } else {
        currentRow.to = pos;
        currentRow.left = Math.min(currentRow.left, next.left);
        currentRow.right = Math.max(currentRow.right, next.right);
        currentRow.bottom = Math.max(currentRow.bottom, next.bottom);
      }
    }

    rows.push({
      ...currentRow,
      to: Math.max(currentRow.from, Math.min(block.to, currentRow.to)),
      width: Math.max(0, currentRow.right - currentRow.left)
    });
    return rows;
  }

  function measureRowStrideTargets(
    v: EditorView,
    block: BlockInfo,
    row: VisualRow,
    strideColumns: number,
    rowCount: number
  ) {
    const charWidth = v.defaultCharacterWidth ?? 8;
    const stridePx = Math.max(charWidth, strideColumns * charWidth);
    const rowText = v.state.doc.sliceString(row.from, row.to);
    const { start, end } = trimmedBlockRange(rowText, row.from);
    const hasContent = end > start;

    const leftRect = v.coordsAtPos(row.from, 1)
      ?? coordsWithFallback(v, block, row.from, true);
    const rightRect = coordsWithFallback(v, block, Math.max(row.from, row.to - 1), true)
      ?? v.coordsAtPos(row.to, -1);

    const rowLeft = leftRect?.left ?? 0;
    const rowRight = Math.max(rowLeft, rightRect?.right ?? rowLeft + stridePx);
    const midY = leftRect ? (leftRect.top + leftRect.bottom) / 2 : rightRect ? (rightRect.top + rightRect.bottom) / 2 : 0;

    const targets: AnchorDebugEntry[] = [];
    const stepPositions: number[] = [];
    let stepIndex = 0;
    while (true) {
      const targetX = stepIndex === 0 ? rowLeft : rowLeft + stepIndex * stridePx;
      if (targetX >= rowRight - charWidth) {
        if (!stepPositions.length || Math.abs(stepPositions[stepPositions.length - 1] - rowRight) > 0.5) {
          stepPositions.push(rowRight);
        }
        break;
      }
      if (!stepPositions.length || Math.abs(stepPositions[stepPositions.length - 1] - targetX) > 0.5) {
        stepPositions.push(targetX);
      }
      stepIndex += 1;
    }

    const totalSteps = stepPositions.length;
    const rowLength = Math.max(row.to - row.from, 1);

    for (let index = 0; index < totalSteps; index += 1) {
      const targetX = stepPositions[index];
      let targetPos: number | null = null;
      let source: "coords" | "fallback" = "fallback";

      if (index === 0) {
        targetPos = row.from;
      } else if (index === totalSteps - 1) {
        targetPos = row.to;
      } else {
        const candidate = v.posAtCoords({ x: targetX, y: midY });
        if (candidate !== null) {
          targetPos = clamp(candidate, row.from, row.to);
          source = "coords";
        }
      }

      if (targetPos === null) {
        const normalized = index === totalSteps - 1 ? 1 : index / Math.max(totalSteps - 1, 1);
        if (hasContent) {
          const rowInteriorLength = Math.max(row.to - row.from, 1);
          const offset = Math.floor(rowInteriorLength * normalized);
          targetPos = clamp(row.from + offset, row.from, row.to);
        } else {
          const offset = Math.floor(rowLength * normalized);
          targetPos = clamp(row.from + offset, row.from, row.to);
        }
      }

      targets.push({
        fraction: totalSteps <= 1 ? 0 : index / (totalSteps - 1),
        pos: targetPos,
        leftPos: row.from,
        rightPos: row.to,
        targetX,
        source,
        leftCoords: simplifyRect(leftRect),
        rightCoords: simplifyRect(rightRect),
        hasContent,
        isFirst: index === 0,
        isLast: index === totalSteps - 1,
        stepIndex: index,
        stepCount: totalSteps,
        strideColumns,
        rowIndex: row.index,
        rowCount,
        rowFrom: row.from,
        rowTo: row.to,
        rowWidth: row.width,
        chosen: false
      });
    }

    return targets;
  }

  function visualLineTargets(v: EditorView, block: BlockInfo) {
    const rows = resolveVisualRows(v, block);
    const strideColumns = Math.max(1, Math.floor(getLineStride?.() ?? 30));
    if (!rows.length) {
      const fallbackRow: VisualRow = {
        index: 0,
        from: block.from,
        to: block.to,
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        width: 0
      };
      return measureRowStrideTargets(v, block, fallbackRow, strideColumns, 1);
    }

    const entries: AnchorDebugEntry[] = [];
    const rowCount = rows.length;
    for (const row of rows) {
      entries.push(...measureRowStrideTargets(v, block, row, strideColumns, rowCount));
    }
    return entries;
  }

  function nextVisualLineBlock(v: EditorView, block: BlockInfo) {
    const docLength = v.state.doc.length;
    if (block.to >= docLength) return null;
    const nextStart = Math.min(docLength, block.to + 1);
    const nextBlock = visualLineBlockAt(v, nextStart);
    return nextBlock.from === block.from && nextBlock.to === block.to ? null : nextBlock;
  }

  function previousVisualLineBlock(v: EditorView, block: BlockInfo) {
    if (block.from <= 0) return null;
    const prevPos = Math.max(0, block.from - 1);
    const previous = visualLineBlockAt(v, prevPos);
    return previous.from === block.from && previous.to === block.to ? null : previous;
  }

  function findVisualLineTarget(v: EditorView, head: number, direction: 1 | -1) {
    const { doc } = v.state;
    const clampedHead = clamp(head, 0, doc.length);
    let block = visualLineBlockAt(v, clampedHead);
    let currentHead = clampedHead;
    const visited = new Set<number>();
    const debugActive = anchorDebug?.enabled?.() ?? false;
    let debugReport: AnchorDebugReport | null = null;

    if (debugActive) anchorDebug?.report(null);

    while (true) {
      const measurements = visualLineTargets(v, block);
      if (debugActive) {
        debugReport = {
          blockFrom: block.from,
          blockTo: block.to,
          blockText: v.state.doc.sliceString(block.from, block.to),
          head: currentHead,
          direction,
          entries: measurements.map(entry => ({ ...entry }))
        };
      }

      if (direction > 0) {
        const idx = measurements.findIndex(entry => entry.pos > currentHead + 1e-6);
        if (idx >= 0) {
          if (debugReport) debugReport.entries[idx].chosen = true;
          if (debugActive) anchorDebug?.report(debugReport);
          return measurements[idx].pos;
        }
        if (block.to >= doc.length) {
          if (debugActive) anchorDebug?.report(debugReport);
          return doc.length;
        }
        visited.add(block.from);
        const nextBlock = nextVisualLineBlock(v, block);
        if (!nextBlock || visited.has(nextBlock.from)) {
          if (debugActive) anchorDebug?.report(debugReport);
          return doc.length;
        }
        block = nextBlock;
        currentHead = block.from - 1;
      } else {
        for (let index = measurements.length - 1; index >= 0; index -= 1) {
          const entry = measurements[index];
          if (entry.pos < currentHead - 1e-6) {
            if (debugReport) debugReport.entries[index].chosen = true;
            if (debugActive) anchorDebug?.report(debugReport);
            return entry.pos;
          }
        }
        if (block.from <= 0) {
          if (debugActive) anchorDebug?.report(debugReport);
          return 0;
        }
        visited.add(block.from);
        const previousBlock = previousVisualLineBlock(v, block);
        if (!previousBlock || visited.has(previousBlock.from)) {
          if (debugActive) anchorDebug?.report(debugReport);
          return 0;
        }
        block = previousBlock;
        currentHead = block.to + 1;
      }
    }
  }

  function lineHorizontalToggle(v: EditorView, direction: 1 | -1, extend = false) {
    const selection = v.state.selection.main;
    const head = selection.head;
    const target = findVisualLineTarget(v, head, direction);
    if (target === null || target === head) return false;

    v.dispatch({
      selection: { anchor: extend ? selection.anchor : target, head: target },
      effects: cursorScrollEffect(v, target)
    });
    return true;
  }

  return {
    moveByWordCount,
    paragraphBoundary,
    moveLineSkippingSrt,
    lineHorizontalToggle,
    runWithCursorScroll,
    scrollCursorIntoView
  };
}
