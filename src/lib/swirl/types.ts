export type ZoomLevel = 'document' | 'paragraph' | 'sentence' | 'word';
export type ColorName = 'red' | 'yellow' | 'green' | 'blue' | 'purple';

export type Position = {
  p: number;
  s: number;
  w: number;
  c: number;
};

export type Annotation = {
  id: string;
  color: ColorName;
  comment: string;
  start: Position;
  end: Position;
  createdAt: string;
};

export type SentenceData = {
  id: string;
  text: string;
  words: string[];
};

export type ParagraphData = {
  id: string;
  text: string;
  sentences: SentenceData[];
};

export type DocumentData = ParagraphData[];