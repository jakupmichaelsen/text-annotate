import type { DocumentData, Position, ZoomLevel } from './types';

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function ensureCursorInBounds(doc: DocumentData, cursor: Position): Position {
  if (!doc.length) return { p: 0, s: 0, w: 0, c: 0 };

  const p = clamp(cursor.p, 0, doc.length - 1);
  const paragraph = doc[p];

  const s = clamp(cursor.s, 0, paragraph.sentences.length - 1);
  const sentence = paragraph.sentences[s];

  const w = clamp(cursor.w, 0, Math.max(0, sentence.words.length - 1));
  const word = sentence.words[w] ?? '';

  const c = clamp(cursor.c, 0, word.length);

  return { p, s, w, c };
}

export function getWord(doc: DocumentData, cursor: Position): string {
  return doc[cursor.p]?.sentences[cursor.s]?.words[cursor.w] ?? '';
}

export function moveForward(doc: DocumentData, cursor: Position, zoom: ZoomLevel): Position {
  let next = { ...cursor };

  if (!doc.length) return next;

  if (zoom === 'document' || zoom === 'paragraph') {
    next.p += 1;
    next.s = 0;
    next.w = 0;
    next.c = 0;
  } else if (zoom === 'sentence') {
    const p = doc[next.p];
    if (next.s < p.sentences.length - 1) {
      next.s += 1;
    } else if (next.p < doc.length - 1) {
      next.p += 1;
      next.s = 0;
    }
    next.w = 0;
    next.c = 0;
  } else if (zoom === 'word') {
    const s = doc[next.p].sentences[next.s];
    if (next.w < s.words.length - 1) {
      next.w += 1;
    } else {
      next = moveForward(doc, next, 'sentence');
    }
    next.c = 0;
  }

  return ensureCursorInBounds(doc, next);
}

export function moveBackward(doc: DocumentData, cursor: Position, zoom: ZoomLevel): Position {
  let next = { ...cursor };

  if (!doc.length) return next;

  if (zoom === 'document' || zoom === 'paragraph') {
    next.p -= 1;
    next.s = 0;
    next.w = 0;
    next.c = 0;
  } else if (zoom === 'sentence') {
    if (next.s > 0) {
      next.s -= 1;
    } else if (next.p > 0) {
      next.p -= 1;
      next.s = doc[next.p].sentences.length - 1;
    }
    next.w = 0;
    next.c = 0;
  } else if (zoom === 'word') {
    if (next.w > 0) {
      next.w -= 1;
    } else {
      next = moveBackward(doc, next, 'sentence');
      const sentence = doc[next.p].sentences[next.s];
      next.w = Math.max(0, sentence.words.length - 1);
    }
    next.c = 0;
  }

  return ensureCursorInBounds(doc, next);
}

export function moveFineForward(doc: DocumentData, cursor: Position, zoom: ZoomLevel): Position {
  let next = { ...cursor };

  if (!doc.length) return next;

  if (zoom === 'word') {
    const word = getWord(doc, next);
    if (next.c < word.length) {
      next.c += 1;
    } else {
      next = moveForward(doc, next, 'word');
    }
  } else {
    const sentence = doc[next.p].sentences[next.s];
    if (next.w < sentence.words.length - 1) {
      next.w += 1;
      next.c = 0;
    } else {
      next = moveForward(doc, next, 'sentence');
    }
  }

  return ensureCursorInBounds(doc, next);
}

export function moveFineBackward(doc: DocumentData, cursor: Position, zoom: ZoomLevel): Position {
  let next = { ...cursor };

  if (!doc.length) return next;

  if (zoom === 'word') {
    if (next.c > 0) {
      next.c -= 1;
    } else {
      next = moveBackward(doc, next, 'word');
    }
  } else {
    if (next.w > 0) {
      next.w -= 1;
      next.c = 0;
    } else {
      next = moveBackward(doc, next, 'sentence');
    }
  }

  return ensureCursorInBounds(doc, next);
}

export function jumpToStartOfUnit(doc: DocumentData, cursor: Position, zoom: ZoomLevel): Position {
  let next = { ...cursor };

  if (!doc.length) return next;

  if (zoom === 'document' || zoom === 'paragraph') {
    next = { p: 0, s: 0, w: 0, c: 0 };
  } else if (zoom === 'sentence') {
    next.w = 0;
    next.c = 0;
  } else if (zoom === 'word') {
    next.c = 0;
  }

  return ensureCursorInBounds(doc, next);
}

export function jumpToEndOfUnit(doc: DocumentData, cursor: Position, zoom: ZoomLevel): Position {
  let next = { ...cursor };

  if (!doc.length) return next;

  if (zoom === 'document' || zoom === 'paragraph') {
    next.p = doc.length - 1;
    next.s = doc[next.p].sentences.length - 1;
    next.w = doc[next.p].sentences[next.s].words.length - 1;
    next.c = getWord(doc, next).length;
  } else if (zoom === 'sentence') {
    const sentence = doc[next.p].sentences[next.s];
    next.w = sentence.words.length - 1;
    next.c = sentence.words[next.w].length;
  } else if (zoom === 'word') {
    next.c = getWord(doc, next).length;
  }

  return ensureCursorInBounds(doc, next);
}

export function zoomIn(zoom: ZoomLevel): ZoomLevel {
  if (zoom === 'document') return 'paragraph';
  if (zoom === 'paragraph') return 'sentence';
  if (zoom === 'sentence') return 'word';
  return 'word';
}

export function zoomOut(zoom: ZoomLevel): ZoomLevel {
  if (zoom === 'word') return 'sentence';
  if (zoom === 'sentence') return 'paragraph';
  if (zoom === 'paragraph') return 'document';
  return 'document';
}

export function getWordWindow(words: string[], activeIndex: number, radius = 2) {
  const start = Math.max(0, activeIndex - radius);
  const end = Math.min(words.length, activeIndex + radius + 1);

  return words.slice(start, end).map((word, i) => ({
    word,
    originalIndex: start + i
  }));
}