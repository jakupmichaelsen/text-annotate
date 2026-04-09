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
- **Padding Controls** — Sidebar sliders for L/R/T/B editor padding
- **Status Bar** — Live line, column, selection count, and active style
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

## Tech Stack

- Svelte 5
- CodeMirror 6
- Vite

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
| `h` / `l` | Char left / right |
| `j` / `k` | Word forward / back |
| `w` / `s` | Line up / down (visual, preserves column) |
| `a` / `d` | Line start / end |
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
