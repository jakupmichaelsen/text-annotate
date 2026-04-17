# Annotation Tool

A markdown annotation editor built with [Svelte](https://svelte.dev/) and [CodeMirror 6](https://codemirror.net/).

**Live at: https://cm6-app.vercel.app/**

Designed for ESL teachers giving feedback on student assignments.

## Features

- **Gruvbox Theme** — Warm, eye-friendly dark theme with syntax highlighting
- **Markdown** — Full markdown support with syntax highlighting
- **Color Annotations** — Highlight text with 6 named colors (yellow, green, blue, red, purple, orange), plus plain backtick style
- **Annotation Format** — Stored as standard markdown: `` `word`<!-- color, timestamp: "note" --> ``
- **Tooltip Preview** — Cursor on annotation shows a floating bubble with color, timestamp, and note
- **Inline Note Editing** — Double-click or press `Enter` on an annotation to edit its note inline
- **Recolor Annotations** — `q`/`e` or `n`/`N` cycles colors on an annotation when cursor is on it
- **Display Modes** — Clean (hidden syntax), Raw current (reveal on cursor), Raw all (reveal everything)
- **Blockquote Comments** — Use `>` blockquotes as teacher comments; styled with background, border, and italic text. Configurable alignment and width via sidebar
- **File Loading** — Load `.txt`, `.md`, and `.docx` files directly in the browser (DOCX via mammoth.js)
- **Auto-save** — Editor content persisted to `localStorage` automatically
- **Padding Controls** — Sidebar sliders for L/R/T/B editor padding, line height, and font size
- **Notes Controls** — Sidebar sliders for blockquote alignment and background width
- **Status Bar** — Live line, column, word count (total and selection), and active style
- **Custom Keymap** — Ergonomic single-hand navigation without vim mode

## Annotation Format

Annotations are stored directly in the markdown as invisible HTML comments:

```markdown
The fox was `quick`<!-- green, 6 Apr 2026 10:00:01: "Check spelling" --> nor particularly brown.
```

- **color** — one of: `yellow`, `green`, `blue`, `red`, `purple`, `orange`
- **timestamp** — local datetime, auto-generated on wrap
- **note** — optional free-text comment, editable inline

The file remains valid, portable markdown. HTML comments are invisible in rendered output.

## Blockquote Comments

Use standard markdown blockquotes as document-level teacher comments:

```markdown
> This paragraph needs more detail.
```

Blockquotes are styled with a warm background, orange left border, and italic text — visually distinct from the student's writing. Alignment and background width are adjustable in the sidebar.

## Tech Stack

- Svelte 5
- CodeMirror 6
- Vite
- mammoth.js (DOCX → text conversion)

## Getting Started

```bash
npm install
npm run dev
```

```bash
npm run build    # production build
npm run preview  # preview production build
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `j` / `k` | Char left / word right |
| `h` / `l` | Word left / char right |
| `w` / `s` | Line up / down |
| `a` / `d` | Sentence start / end |
| `A` / `D` | Line start / end (Home / End) |
| `W` / `S` | Doc start / end |
| `Shift+j/k` | Select char left / word right |
| `Shift+h/l` | Select word left / char right |
| `Shift+w/s` | Select to doc start / end |
| `Shift+a/d` | Select to line start / end |
| `Space` | Wrap word or selection with active style |
| `q` / `e` | Style prev / next (or recolor annotation under cursor) |
| `n` / `N` | Style next / prev (same as e/q) |
| `Enter` | Toggle inline note editor on annotation under cursor |
| `x` | Remove annotation (leaves plain word) |
| `u` / `U` | Undo / redo |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |

## License

MIT
