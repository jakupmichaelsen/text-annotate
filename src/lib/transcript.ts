import { formatSrtTranscript, isSrtTimestampLine, parseTimestampToSeconds } from "./srt";

export type WordTimestamp = {
  from: number;
  to: number;
  start: number;
  end: number;
  word?: string;
};

export type ParsedTranscript = {
  text: string;
  wordTimestamps: WordTimestamp[];
};

type WordTimingRow = { line?: number; word?: string; start?: number; end?: number };

const wordTimeStampLinePattern = /^\s*(\d+(?::\d{2}){1,2}(?:[.,]\d+)?)\s*-\s*(\d+(?::\d{2}){1,2}(?:[.,]\d+)?)\s*:\s*(\S.*)$/;
const wordTimeStampCuePattern = /^\[\s*(\d+(?::\d{2}){1,2}(?:[.,]\d+)?)\s*->\s*(\d+(?::\d{2}){1,2}(?:[.,]\d+)?)\s*\]\s*(.*)$/;

export function parseTranscriptFile(text: string, fileName = "") : ParsedTranscript {
  if (/\.srt$/i.test(fileName)) return { text: formatSrtTranscript(text), wordTimestamps: [] };
  if (/\.lrc$/i.test(fileName)) return parseLrcTranscript(text);
  if (isWordTimeStampsTranscript(text)) return parseWordTimeStampsTranscript(text);
  return { text: stripEmptyLines(text), wordTimestamps: [] };
}

export function isWordTimeStampsTranscript(text: string) {
  return text.split(/\r?\n/).some(line => wordTimeStampLinePattern.test(line));
}

export function parseWordTimeStampsTranscript(raw: string): ParsedTranscript {
  const lines = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
  const blocks: { start: number; end: number; text: string; words: { word: string; start: number; end: number }[] }[] = [];
  let current: (typeof blocks)[number] | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const cue = wordTimeStampCuePattern.exec(lines[index]);
    if (cue) {
      const start = parseTimestampToSeconds(cue[1]);
      const end = parseTimestampToSeconds(cue[2]);
      if (start !== null && end !== null) {
        current = { start, end, text: cue[3].trim(), words: [] };
        blocks.push(current);
      }
      continue;
    }

    if (current && /\|/.test(lines[index])) {
      const wordEntries = lines[index].split(/\s*\|\s*/);
      let foundWordEntry = false;
      for (const entry of wordEntries) {
        const word = wordTimeStampLinePattern.exec(entry);
        if (!word) continue;
        const start = parseTimestampToSeconds(word[1]);
        const end = parseTimestampToSeconds(word[2]);
        if (start !== null && end !== null) {
          current.words.push({ word: word[3].trim(), start, end });
          foundWordEntry = true;
        }
      }
      if (foundWordEntry) continue;
    }

    const word = wordTimeStampLinePattern.exec(lines[index]);
    if (word && current) {
      const start = parseTimestampToSeconds(word[1]);
      const end = parseTimestampToSeconds(word[2]);
      if (start !== null && end !== null) current.words.push({ word: word[3].trim(), start, end });
      continue;
    }

    if (current && !current.text && lines[index].trim()) current.text = lines[index].trim();
  }

  let text = "";
  const wordTimestamps: WordTimestamp[] = [];
  for (const block of blocks) {
    if (!block.text) continue;
    if (text) text += "\n";
    text += `[${formatTranscriptTime(block.start)} --> ${formatTranscriptTime(block.end)}]\n`;
    const textStart = text.length;
    text += block.text;
    const tokens = [...block.text.matchAll(/\S+/g)];
    const timings = normalizeRoundedWordTimings(block.words, block.end);
    for (let index = 0; index < timings.length && index < tokens.length; index += 1) {
      const timing = timings[index];
      const token = tokens[index];
      const from = textStart + (token.index ?? 0);
      wordTimestamps.push({
        from,
        to: from + token[0].length,
        start: timing.start,
        end: timing.end,
        word: timing.word
      });
    }
  }

  return { text, wordTimestamps };
}

function normalizeRoundedWordTimings(words: { word: string; start: number; end: number }[], cueEnd: number) {
  return words.map((word, index) => {
    if (word.end > word.start) return word;
    let groupStart = index;
    while (groupStart > 0 && words[groupStart - 1].start === word.start && words[groupStart - 1].end <= words[groupStart - 1].start) groupStart -= 1;
    let groupEnd = index + 1;
    while (groupEnd < words.length && words[groupEnd].start === word.start && words[groupEnd].end <= words[groupEnd].start) groupEnd += 1;
    const nextStart = words.slice(groupEnd).find(next => next.start > word.start)?.start ?? cueEnd;
    const duration = Math.max(0.05, nextStart - word.start);
    const groupIndex = index - groupStart;
    const groupSize = Math.max(1, groupEnd - groupStart);
    return {
      ...word,
      end: word.start + duration * ((groupIndex + 1) / groupSize)
    };
  });
}

export function parseLrcTranscript(raw: string): ParsedTranscript {
  const entries = raw.replace(/^\uFEFF/, "").split(/\r?\n/).flatMap(line => {
    const match = /^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/.exec(line.trim());
    if (!match) return [];
    return [{ start: Number(match[1]) * 60 + Number(match[2]), text: match[3].trim() }];
  }).filter(entry => entry.text);
  const text = entries.map((entry, index) => {
    const end = entries[index + 1]?.start ?? entry.start + 10;
    return `[${formatTranscriptTime(entry.start)} --> ${formatTranscriptTime(Math.max(entry.start, end))}]\n${entry.text}`;
  }).join("\n\n");
  return { text, wordTimestamps: [] };
}

export function transcriptionPayloadToText(payload: unknown): ParsedTranscript {
  if (typeof payload === "string") return { text: stripEmptyLines(payload), wordTimestamps: [] };
  if (!payload || typeof payload !== "object") return { text: "", wordTimestamps: [] };

  const data = payload as {
    text?: string;
    segments?: { start?: number; end?: number; text?: string; words?: { start?: number; end?: number }[] }[];
  };
  if (!Array.isArray(data.segments) || !data.segments.length) {
    return { text: stripEmptyLines(data.text ?? ""), wordTimestamps: [] };
  }

  let text = "";
  const wordTimestamps: WordTimestamp[] = [];
  for (const segment of data.segments) {
    const segmentText = (segment.text ?? "").replace(/\s+/g, " ").trim();
    if (!segmentText) continue;
    if (text) text += "\n";
    text += `[${formatTranscriptTime(segment.start ?? 0)} --> ${formatTranscriptTime(segment.end ?? segment.start ?? 0)}]\n`;
    const segmentTextOffset = text.length;
    text += segmentText;
    const tokens = [...segmentText.matchAll(/\S+/g)];
    for (let index = 0; index < (segment.words ?? []).length && index < tokens.length; index += 1) {
      const word = segment.words?.[index];
      const start = Number(word?.start);
      const end = Number(word?.end);
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      const token = tokens[index];
      const from = segmentTextOffset + (token.index ?? 0);
      wordTimestamps.push({ from, to: from + token[0].length, start, end });
    }
  }
  return { text, wordTimestamps };
}

export function mapVoiceTextWordTimings(rows: unknown[], documentText: string): WordTimestamp[] {
  const lines = documentText.split("\n");
  const transcriptLines = lines.map((text, index) => ({ text, index }))
    .filter(line => line.text.trim() && !isSrtTimestampLine(line.text));
  const result: WordTimestamp[] = [];
  const cursors = new Map<number, number>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const item = row as WordTimingRow;
    const lineNumber = Number(item.line);
    const word = String(item.word ?? "").trim();
    const start = Number(item.start);
    const end = Number(item.end);
    const line = transcriptLines[lineNumber];
    if (!line || !word || !Number.isFinite(start) || !Number.isFinite(end)) continue;
    const cursor = cursors.get(lineNumber) ?? 0;
    const relative = line.text.slice(cursor).indexOf(word);
    const offset = relative >= 0 ? cursor + relative : line.text.indexOf(word);
    if (offset < 0) continue;
    cursors.set(lineNumber, offset + word.length);
    const lineStart = lines.slice(0, line.index).reduce((total, value) => total + value.length + 1, 0);
    result.push({ from: lineStart + offset, to: lineStart + offset + word.length, start, end, word });
  }
  return result;
}

function formatTranscriptTime(seconds: number) {
  const value = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const totalMs = Math.round(value * 1000);
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const wholeSeconds = Math.floor((totalMs % 60_000) / 1000);
  const milliseconds = totalMs % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}

function stripEmptyLines(text: string) {
  return text.replace(/\r\n?/g, "\n").split("\n").map(line => line.trimEnd()).filter(line => line.trim()).join("\n");
}
