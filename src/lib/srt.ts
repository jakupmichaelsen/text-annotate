import type { EditorState, Text } from "@codemirror/state";

export const srtPattern = /\[\s*([0-9:.]+)\s*-->\s*([0-9:.]+)\s*\]/g;

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

export function formatSrtTimestampLabel(matchText: string) {
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
  return /^\[\s*[0-9:.]+\s*-->\s*[0-9:.]+\s*\]$/.test(text.trim());
}

export function documentHasSrtTimestamps(state: EditorState) {
  return /^\[\s*[0-9:.]+\s*-->\s*[0-9:.]+\s*\]$/m.test(state.doc.toString());
}

export function srtTimestampForTranscriptLine(state: EditorState, lineNumber: number) {
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
