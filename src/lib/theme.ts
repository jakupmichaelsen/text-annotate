import type { Extension } from "@codemirror/state";
import { HighlightStyle } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

export const highlightStyles = [
  { name: "green", color: "#b8bb26" },
  { name: "red", color: "#fb4934" },
  { name: "steel", color: "#83a598" },
  { name: "orange", color: "#fe8019" },
  { name: "periwinkle", color: "#8370d0" },
  { name: "sand", color: "#d8bd7f" },
  { name: "mint", color: "#6fc6a4" },
  { name: "denim", color: "#3f5f9f" },
  { name: "yellow", color: "#fabd2f" },
  { name: "indigo", color: "#4f46e5" },
  { name: "brown", color: "#8f6f3f" },
  { name: "slate", color: "#586e75" },
  { name: "sky", color: "#57a0d5" },
  { name: "rosewood", color: "#8f3f4d" },
  { name: "purple", color: "#d3869b" }
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

export function contrastColor(hex: string): string {
  const toLinear = (c: number) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  const luminance = (h: string) => {
    const r = toLinear(parseInt(h.slice(1, 3), 16) / 255);
    const g = toLinear(parseInt(h.slice(3, 5), 16) / 255);
    const b = toLinear(parseInt(h.slice(5, 7), 16) / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (L1: number, L2: number) => (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
  const Lann = luminance(hex);
  return contrast(Lann, luminance(gruvbox.bg)) >= contrast(Lann, luminance(gruvbox.fg)) ? gruvbox.bg : gruvbox.fg;
}

export const gruvboxHighlight = HighlightStyle.define([
  { tag: tags.heading, color: gruvbox.yellow, fontWeight: "700" },
  { tag: tags.contentSeparator, color: gruvbox.orange },
  { tag: tags.emphasis, color: gruvbox.fg, fontStyle: "italic" },
  { tag: tags.strong, color: gruvbox.fg, fontWeight: "700" },
  { tag: tags.strikethrough, color: gruvbox.fgMuted, textDecoration: "line-through" },
  { tag: tags.link, color: gruvbox.blue, textDecoration: "underline" },
  { tag: tags.url, color: gruvbox.aqua, textDecoration: "underline" },
  { tag: tags.labelName, color: gruvbox.yellow },
  { tag: tags.keyword, color: gruvbox.red },
  { tag: [tags.atom, tags.bool, tags.null], color: gruvbox.purple },
  { tag: [tags.number, tags.integer, tags.float], color: gruvbox.purple },
  { tag: [tags.string, tags.special(tags.string)], color: gruvbox.green },
  { tag: tags.regexp, color: gruvbox.aqua },
  { tag: tags.escape, color: gruvbox.orange },
  { tag: [tags.variableName, tags.name], color: gruvbox.fg },
  { tag: tags.function(tags.variableName), color: gruvbox.green },
  { tag: [tags.className, tags.typeName], color: gruvbox.yellow },
  { tag: [tags.operator, tags.compareOperator, tags.logicOperator], color: gruvbox.red },
  { tag: [tags.punctuation, tags.separator, tags.bracket], color: gruvbox.fgMuted },
  { tag: tags.comment, color: gruvbox.comment },
  { tag: tags.meta, color: gruvbox.orange },
  { tag: tags.monospace, color: "inherit" }
]);

export function buildGruvboxTheme(): Extension {
  return EditorView.theme({
    "&": { height: "100%", color: gruvbox.fg, backgroundColor: gruvbox.bg },
    ".cm-scroller": { overflow: "auto", fontFamily: '"Noto Sans Mono", "JetBrains Mono", "Fira Code", ui-monospace, monospace', lineHeight: "1.75" },
    ".cm-content": { textAlign: "left", padding: "1rem 1.25rem 4rem", minHeight: "100%", caretColor: gruvbox.cursor, whiteSpace: "pre-wrap", wordBreak: "break-word" },
    ".cm-line": { textAlign: "left" },
    "&.cm-focused .cm-cursor": { borderLeftColor: gruvbox.cursor },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: `${gruvbox.orange} !important`, color: gruvbox.bg, opacity: "50%" },
    ".cm-gutters": { backgroundColor: gruvbox.bgHard, color: gruvbox.gutterText, borderRight: "none" },
    ".cm-activeLine": { backgroundColor: "transparent" },
    ".cm-activeLineGutter": { color: gruvbox.yellow },
    ".cm-panels": { backgroundColor: gruvbox.bgSoft, color: gruvbox.fg },
    ".cm-searchMatch": { backgroundColor: "#665c54", outline: `1px solid ${gruvbox.yellow}` },
    ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "#7c6f64" },
    ".cm-matchingBracket, .cm-nonmatchingBracket": { backgroundColor: gruvbox.bgAlt, outline: `1px solid ${gruvbox.blue}` },
    ...Object.fromEntries(highlightStyles.map(s => [
      `.cm-annotation-${s.name}`,
      { color: `${contrastColor(s.color)} !important`, backgroundColor: `${s.color} !important`, border: "none" }
    ])),
    ".cm-formatting-code": { color: gruvbox.orange },
    ".cm-formatting-code-block": { color: gruvbox.orange },
    ".cm-formatting": { color: gruvbox.fgMuted },
    ".cm-blockquote-line": {
      borderLeft: `3px solid ${gruvbox.orange}`,
      paddingLeft: "0.75em",
      paddingRight: "0.35em",
      backgroundColor: "#4a3520",
      marginBottom: "2px",
      color: gruvbox.yellow
    }
  }, { dark: true });
}
