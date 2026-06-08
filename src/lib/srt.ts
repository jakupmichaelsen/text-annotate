import type { EditorState, Text } from "@codemirror/state";

const timestampRangeLinePattern = /^\[?\s*(\d+(?::\d{2}){1,2}(?:[.,]\d+)?)\s*-->\s*(\d+(?::\d{2}){1,2}(?:[.,]\d+)?)\s*\]?$/;
const timestampOnlyLinePattern = /^\[?\s*(\d+(?::\d{2}){1,2}(?:[.,]\d+)?)\s*\]?$/;

export const srtPattern = /\[\s*(\d+(?::\d{2}){1,2}(?:[.,]\d+)?)\s*-->\s*(\d+(?::\d{2}){1,2}(?:[.,]\d+)?)\s*\]/g;

export function formatSrtTranscript(text: string) {
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

export function parseSrtTimestampLine(text: string) {
  const trimmed = text.trim();
  const range = timestampRangeLinePattern.exec(trimmed);
  if (range) {
    const startSeconds = parseTimestampToSeconds(range[1]);
    if (startSeconds === null) return null;
    return {
      label: shortenTimestamp(range[1]) + " → " + shortenTimestamp(range[2]),
      start: normalizeSrtTimestamp(range[1]),
      end: normalizeSrtTimestamp(range[2]),
      startSeconds
    };
  }

  const single = timestampOnlyLinePattern.exec(trimmed);
  if (!single) return null;
  const startSeconds = parseTimestampToSeconds(single[1]);
  if (startSeconds === null) return null;
  return {
    label: shortenTimestamp(single[1]),
    start: normalizeSrtTimestamp(single[1]),
    end: null,
    startSeconds
  };
}

export function formatSrtTimestampLabel(matchText: string) {
  return parseSrtTimestampLine(matchText)?.label ?? matchText;
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

export function parseTimestampToSeconds(timestamp: string) {
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

export function isSrtTimestampLine(text: string) {
  return parseSrtTimestampLine(text) !== null;
}

export function documentHasSrtTimestamps(state: EditorState) {
  return state.doc.toString().split("\n").some(isSrtTimestampLine);
}

export function srtTimestampForTranscriptLine(state: EditorState, lineNumber: number) {
  if (lineNumber <= 1 || lineNumber > state.doc.lines) return null;
  const previousLine = state.doc.line(lineNumber - 1);
  if (!isSrtTimestampLine(previousLine.text)) return null;
  return parseSrtTimestampLine(previousLine.text);
}

export function srtLineExitPosition(doc: Text, lineNumber: number, direction: "left" | "right") {
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
