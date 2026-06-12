import type { Extension } from "@codemirror/state";
import { HighlightStyle } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { basicDark } from "cm6-theme-basic-dark";
import { basicLight } from "cm6-theme-basic-light";
import { gruvboxDark } from "cm6-theme-gruvbox-dark";
import { gruvboxLight } from "cm6-theme-gruvbox-light";
import { materialDark } from "cm6-theme-material-dark";
import { nord as nordCodeMirrorTheme } from "cm6-theme-nord";
import { solarizedDark } from "cm6-theme-solarized-dark";
import { solarizedLight } from "cm6-theme-solarized-light";

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
  red: "#fb4934", purple: "#d3869b", selection: "#7c6f64",
  activeLine: "#3c3836aa", gutterText: "#7c6f64",
  cursor: "#fe8019", comment: "#928374"
};

export const themeOptions = [
  { value: "basic-light", label: "Basic Light" },
  { value: "basic-dark", label: "Basic Dark" },
  { value: "gruvbox-light", label: "Gruvbox Light" },
  { value: "gruvbox-dark", label: "Gruvbox Dark" },
  { value: "material-dark", label: "Material Dark" },
  { value: "nord", label: "Nord" },
  { value: "solarized-light", label: "Solarized Light" },
  { value: "solarized-dark", label: "Solarized Dark" }
] as const;

export type ThemeMode = typeof themeOptions[number]["value"];

export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === "string" && themeOptions.some(option => option.value === value);
}

export type ThemePalette = typeof gruvbox & {
  dark: boolean;
  searchMatch: string;
  searchMatchSelected: string;
  blockquoteBg: string;
  blockquoteFg: string;
  plainCodeBg: string;
};

export const themes: Record<ThemeMode, ThemePalette> = {
  "basic-light": {
    dark: false,
    bg: "#eceff4", bgSoft: "#e5e9f0", bgHard: "#d8dee9",
    bgAlt: "#e5e9f0", border: "#cfd7e3", fg: "#2e3440",
    fgMuted: "#4c566a", yellow: "#8f5f00", green: "#4f7d33",
    blue: "#81a1c1", aqua: "#8fbcbb", orange: "#b65f4a",
    red: "#bf616a", purple: "#b48ead", selection: "#b8c2d4",
    activeLine: "transparent", gutterText: "#5e6472",
    cursor: "#5e81ac", comment: "#4c566a",
    searchMatch: "#d8dee9", searchMatchSelected: "#cfd7e3",
    blockquoteBg: "#e5e9f0", blockquoteFg: "#5e81ac",
    plainCodeBg: "#e5e9f0"
  },
  "basic-dark": {
    dark: true,
    bg: "#2e3235", bgSoft: "#292d30", bgHard: "#202325",
    bgAlt: "#383d40", border: "#4a5054", fg: "#dddddd",
    fgMuted: "#b0b0b0", yellow: "#fda331", green: "#b5bd68",
    blue: "#6fb3d2", aqua: "#8abeb7", orange: "#fc6d24",
    red: "#a54543", purple: "#cc99cc", selection: "#202325",
    activeLine: "transparent",
    gutterText: "#808080",
    cursor: "#dddddd", comment: "#808080",
    searchMatch: "#b9d2ff", searchMatchSelected: "#e0e0e0",
    blockquoteBg: "#292d30", blockquoteFg: "#fda331",
    plainCodeBg: "#292d30"
  },
  "gruvbox-light": {
    dark: false,
    bg: "#fbf1c7", bgSoft: "#f2e5bc", bgHard: "#ebdbb2",
    bgAlt: "#f2e5bc", border: "#d5c4a1", fg: "#3c3836",
    fgMuted: "#7c6f64", yellow: "#b57614", green: "#79740e",
    blue: "#076678", aqua: "#427b58", orange: "#af3a03",
    red: "#9d0006", purple: "#8f3f71", selection: "#d5c4a1",
    activeLine: "transparent", gutterText: "#7c6f64",
    cursor: "#af3a03", comment: "#928374",
    searchMatch: "#f2e5bc", searchMatchSelected: "#ebdbb2",
    blockquoteBg: "#f2e5bc", blockquoteFg: "#076678",
    plainCodeBg: "#f2e5bc"
  },
  "gruvbox-dark": {
    ...gruvbox,
    dark: true,
    activeLine: "transparent",
    searchMatch: "#665c54",
    searchMatchSelected: "#7c6f64",
    blockquoteBg: "#4a3520",
    blockquoteFg: "#fabd2f",
    plainCodeBg: "#32302f"
  },
  "material-dark": {
    dark: true,
    bg: "#263238", bgSoft: "#2f3b41", bgHard: "#1e272b",
    bgAlt: "#37474f", border: "#455a64", fg: "#eeffff",
    fgMuted: "#90a4ae", yellow: "#ffcb6b", green: "#c3e88d",
    blue: "#82aaff", aqua: "#89ddff", orange: "#f78c6c",
    red: "#ff5370", purple: "#c792ea", selection: "#33444e",
    activeLine: "transparent", gutterText: "#607d8b",
    cursor: "#82aaff", comment: "#546e7a",
    searchMatch: "#37474f", searchMatchSelected: "#455a64",
    blockquoteBg: "#2f3b41", blockquoteFg: "#82aaff",
    plainCodeBg: "#2f3b41"
  },
  nord: {
    dark: true,
    bg: "#2e3440", bgSoft: "#3b4252", bgHard: "#252a33",
    bgAlt: "#434c5e", border: "#4c566a", fg: "#d8dee9",
    fgMuted: "#81a1c1", yellow: "#ebcb8b", green: "#a3be8c",
    blue: "#5e81ac", aqua: "#8fbcbb", orange: "#d08770",
    red: "#bf616a", purple: "#b48ead", selection: "#4c566a",
    activeLine: "transparent", gutterText: "#4c566a",
    cursor: "#d8dee9", comment: "#616e88",
    searchMatch: "#3b4252", searchMatchSelected: "#4c566a",
    blockquoteBg: "#3b4252", blockquoteFg: "#88c0d0",
    plainCodeBg: "#3b4252"
  },
  "solarized-light": {
    dark: false,
    bg: "#fdf6e3", bgSoft: "#eee8d5", bgHard: "#e7e0c7",
    bgAlt: "#eee8d5", border: "#d8c9a8", fg: "#657b83",
    fgMuted: "#93a1a1", yellow: "#b58900", green: "#859900",
    blue: "#268bd2", aqua: "#2aa198", orange: "#cb4b16",
    red: "#dc322f", purple: "#6c71c4", selection: "#d6cfc0",
    activeLine: "transparent", gutterText: "#93a1a1",
    cursor: "#586e75", comment: "#93a1a1",
    searchMatch: "#eee8d5", searchMatchSelected: "#e7e0c7",
    blockquoteBg: "#eee8d5", blockquoteFg: "#268bd2",
    plainCodeBg: "#eee8d5"
  },
  "solarized-dark": {
    dark: true,
    bg: "#002b36", bgSoft: "#073642", bgHard: "#001f27",
    bgAlt: "#0b3a46", border: "#586e75", fg: "#eee8d5",
    fgMuted: "#93a1a1", yellow: "#b58900", green: "#859900",
    blue: "#268bd2", aqua: "#2aa198", orange: "#cb4b16",
    red: "#dc322f", purple: "#6c71c4", selection: "#586e75",
    activeLine: "transparent", gutterText: "#586e75",
    cursor: "#93a1a1", comment: "#586e75",
    searchMatch: "#073642", searchMatchSelected: "#0b3a46",
    blockquoteBg: "#073642", blockquoteFg: "#2aa198",
    plainCodeBg: "#073642"
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

export const gruvboxHighlight = buildHighlightStyle(themes["gruvbox-dark"]);

export function buildEditorTheme(theme: ThemePalette): Extension {
  return EditorView.theme({
    "&": { height: "100%", color: theme.fg, backgroundColor: theme.bg },
    ".cm-scroller": { overflow: "auto", fontFamily: "var(--app-font-family)", lineHeight: "1.75" },
    ".cm-content": { textAlign: "left", padding: "1rem 1.25rem 4rem", minHeight: "100%", caretColor: theme.cursor, whiteSpace: "pre-wrap", wordBreak: "break-word" },
    ".cm-line": { textAlign: "left" },
    "&.mode-normal .cm-content, &.mode-normal .cm-line": { caretColor: "transparent !important" },
    "&.mode-normal .cm-cursorLayer, &.mode-normal .cm-cursor, &.mode-normal .cm-cursor-primary, &.mode-normal .cm-cursor-secondary, &.mode-normal .cm-secondaryCursor, &.mode-normal .cm-dropCursor": {
      borderLeft: "0 !important",
      borderLeftColor: "transparent !important",
      display: "none !important",
      opacity: "0 !important",
      visibility: "hidden !important"
    },
    ".cm-selectionBackground": { background: `${theme.selection} !important` },
    "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": { background: `${theme.selection} !important` },
    ".cm-content ::selection": { backgroundColor: `${theme.selection} !important` },
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

export function buildCodeMirrorTheme(mode: ThemeMode): Extension[] {
  const theme = mode === "basic-light" || mode === "gruvbox-light" || mode === "solarized-light"
    ? mode === "basic-light"
      ? basicLight
      : mode === "gruvbox-light"
        ? gruvboxLight
        : solarizedLight
    : mode === "basic-dark"
      ? basicDark
      : mode === "gruvbox-dark"
        ? gruvboxDark
        : mode === "material-dark"
          ? materialDark
          : mode === "nord"
            ? nordCodeMirrorTheme
            : solarizedDark;
  return [
    theme,
    buildEditorTheme(themes[mode])
  ];
}

export function buildGruvboxTheme(): Extension {
  return buildEditorTheme(themes["gruvbox-dark"]);
}
