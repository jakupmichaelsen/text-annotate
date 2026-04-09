import type { DocumentData } from './types';

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function splitIntoSentences(paragraph: string): string[] {
  const matches = paragraph.match(/[^.!?]+[.!?"]*|[^.!?]+$/g);
  return (matches ?? []).map((s) => s.trim()).filter(Boolean);
}

export function splitIntoWords(sentence: string): string[] {
  return sentence.split(/\s+/).filter(Boolean);
}

export function parseDocument(text: string): DocumentData {
  const cleaned = normalizeText(text);
  const paragraphs = cleaned.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  return paragraphs.map((paragraph) => ({
    id: uid('p'),
    text: paragraph,
    sentences: splitIntoSentences(paragraph).map((sentence) => ({
      id: uid('s'),
      text: sentence,
      words: splitIntoWords(sentence)
    }))
  }));
}