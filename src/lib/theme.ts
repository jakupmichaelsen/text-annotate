import type { Extension } from "@codemirror/state";
import { HighlightStyle } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

export const highlightStyles = [
  { name: "red", color: "#fb4934" },
  { name: "green", color: "#b8bb26" },
  { name: "callout", color: "currentColor" }
];

export const gruvbox = {
  bg: "#282828", bgSoft: "#32302f", bgHard: "#1d2021",
  bgAlt: "#3c3836", border: "#504945", fg: "#ebdbb2",
  fgMuted: "#a89984", yellow: "#fabd2f", green: "#b8bb26",
  blue: "#83a598", aqua: "#8ec07c", orange: "#fe8019",
  red: "#fb4934", purple: "#d3869b", selection: "#665c54",
  activeLine: "#3c3836aa", gutterText: "#7c6f64",
  cursor: "#fe8019", comment: "#928374"
};

export type ThemeMode = "gruvbox" | "nord";

export type ThemePalette = typeof gruvbox & {
  dark: boolean;
  searchMatch: string;
  searchMatchSelected: string;
  blockquoteBg: string;
  blockquoteFg: string;
  plainCodeBg: string;
};

export const themes: Record<ThemeMode, ThemePalette> = {
  gruvbox: {
    ...gruvbox,
    dark: true,
    activeLine: "transparent",
    searchMatch: "#665c54",
    searchMatchSelected: "#7c6f64",
    blockquoteBg: "#4a3520",
    blockquoteFg: "#fabd2f",
    plainCodeBg: "#32302f"
  },
  nord: {
    dark: false,
    bg: "#eceff4", bgSoft: "#e5e9f0", bgHard: "#d8dee9",
    bgAlt: "#e5e9f0", border: "#cfd7e3", fg: "#2e3440",
    fgMuted: "#4c566a", yellow: "#ebcb8b", green: "#a3be8c",
    blue: "#81a1c1", aqua: "#8fbcbb", orange: "#d08770",
    red: "#bf616a", purple: "#b48ead", selection: "#d8dee9",
    activeLine: "transparent", gutterText: "#5e6472",
    cursor: "#5e81ac", comment: "#4c566a",
    searchMatch: "#d8dee9", searchMatchSelected: "#cfd7e3",
    blockquoteBg: "#e5e9f0", blockquoteFg: "#5e81ac",
    plainCodeBg: "#e5e9f0"
  }
};

export function getTheme(mode: ThemeMode): ThemePalette {
  return themes[mode];
}

export function contrastColor(hex: string, bg = gruvbox.bg, fg = gruvbox.fg): string {
  const toLinear = (c: number) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  const luminance = (h: string) => {
    const r = toLinear(parseInt(h.slice(1, 3), 16) / 255);
    const g = toLinear(parseInt(h.slice(3, 5), 16) / 255);
    const b = toLinear(parseInt(h.slice(5, 7), 16) / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (L1: number, L2: number) => (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
  const Lann = luminance(hex);
  return contrast(Lann, luminance(bg)) >= contrast(Lann, luminance(fg)) ? bg : fg;
}

export function buildHighlightStyle(theme: ThemePalette) {
  return HighlightStyle.define([
  { tag: tags.heading, color: theme.yellow, fontWeight: "700" },
  { tag: tags.contentSeparator, color: theme.orange },
  { tag: tags.emphasis, color: theme.fg, fontStyle: "italic" },
  { tag: tags.strong, color: theme.fg, fontWeight: "700" },
  { tag: tags.strikethrough, color: theme.fgMuted, textDecoration: "line-through" },
  { tag: tags.link, color: theme.blue, textDecoration: "underline" },
  { tag: tags.url, color: theme.aqua, textDecoration: "underline" },
  { tag: tags.labelName, color: theme.yellow },
  { tag: tags.keyword, color: theme.red },
  { tag: [tags.atom, tags.bool, tags.null], color: theme.purple },
  { tag: [tags.number, tags.integer, tags.float], color: theme.purple },
  { tag: [tags.string, tags.special(tags.string)], color: theme.green },
  { tag: tags.regexp, color: theme.aqua },
  { tag: tags.escape, color: theme.orange },
  { tag: [tags.variableName, tags.name], color: theme.fg },
  { tag: tags.function(tags.variableName), color: theme.green },
  { tag: [tags.className, tags.typeName], color: theme.yellow },
  { tag: [tags.operator, tags.compareOperator, tags.logicOperator], color: theme.red },
  { tag: [tags.punctuation, tags.separator, tags.bracket], color: theme.fgMuted },
  { tag: tags.comment, color: theme.comment },
  { tag: tags.meta, color: theme.orange },
  { tag: tags.monospace, color: "inherit" }
  ]);
}

export const gruvboxHighlight = buildHighlightStyle(themes.gruvbox);

export function buildEditorTheme(theme: ThemePalette): Extension {
  return EditorView.theme({
    "&": { height: "100%", color: theme.fg, backgroundColor: theme.bg },
    ".cm-scroller": { overflow: "auto", fontFamily: "var(--app-font-family)", lineHeight: "1.75" },
    ".cm-content": { textAlign: "left", padding: "1rem 1.25rem 4rem", minHeight: "100%", caretColor: theme.cursor, whiteSpace: "pre-wrap", wordBreak: "break-word" },
    ".cm-line": { textAlign: "left" },
    "&.cm-focused .cm-cursor": { borderLeftColor: theme.cursor },
    "&.mode-normal .cm-content, &.mode-normal .cm-line": { caretColor: "transparent !important" },
    "&.mode-normal .cm-cursorLayer, &.mode-normal .cm-cursor, &.mode-normal .cm-cursor-primary, &.mode-normal .cm-cursor-secondary, &.mode-normal .cm-secondaryCursor, &.mode-normal .cm-dropCursor": {
      borderLeft: "0 !important",
      borderLeftColor: "transparent !important",
      display: "none !important",
      opacity: "0 !important",
      visibility: "hidden !important"
    },
    ".cm-gutters": { backgroundColor: theme.bgHard, color: theme.gutterText, borderRight: "none" },
    ".cm-activeLine": { backgroundColor: theme.activeLine },
    ".cm-activeLineGutter": { color: theme.gutterText, backgroundColor: theme.bgHard },
    ".cm-panels": { backgroundColor: theme.bgSoft, color: theme.fg },
    ".cm-searchMatch": { backgroundColor: theme.searchMatch, outline: `1px solid ${theme.yellow}` },
    ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: theme.searchMatchSelected },
    ".cm-matchingBracket, .cm-nonmatchingBracket": { backgroundColor: theme.bgAlt, outline: `1px solid ${theme.blue}` },
    ".cm-formatting-code": { color: theme.orange },
    ".cm-formatting-code-block": { color: theme.orange },
    ".cm-formatting": { color: theme.fgMuted },
    ".cm-blockquote-line": {
      borderLeft: `3px solid ${theme.orange}`,
      paddingLeft: "0.75em",
      paddingRight: "0.35em",
      backgroundColor: theme.blockquoteBg,
      marginBottom: "2px",
      color: theme.blockquoteFg
    }
  }, { dark: theme.dark });
}

export function buildGruvboxTheme(): Extension {
  return buildEditorTheme(themes.gruvbox);
}
