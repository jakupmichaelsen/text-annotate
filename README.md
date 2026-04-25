# Annotation Tool

A markdown annotation editor built with [Svelte](https://svelte.dev/) and [CodeMirror 6](https://codemirror.net/).

**Live at: https://cm6-app.vercel.app/**

Designed for ESL teachers giving feedback on student assignments.

## Features

- **Annotate/Edit Modes** — Compact switch for moving between annotation and editing
- **Markdown Editor** — Full markdown support with syntax highlighting
- **Color Annotations** — Highlight text with 6 named colors plus plain backtick style
- **Annotation Format** — Stored as standard markdown comments with color, timestamp, and note
- **Tooltip Preview** — Cursor on annotation shows a floating bubble with color, timestamp, and note
- **Inline Note Editing** — Double-click or press `Enter` on an annotation to edit its note inline
- **File Loading** — Load `.txt`, `.md`, `.docx`, and `.pdf` files
- **PDF Review Modal** — Extract text from PDFs, correct it beside the preview, then load it into the editor
- **Autosave** — Restores the previous buffer from local storage when available
- **Layout Controls** — Sidebar sliders for L/R/T/B padding, line height, and font size
- **Blockquote Controls** — Tune note alignment and background width
- **Status Bar** — Live line, column, selection count, and active style
- **Custom Keymap** — Annotate mode navigation, selection, undo/redo, and help shortcuts

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

Annotate mode uses `h j k l`, arrows, and modifier variants for movement and selection.

| Key | Action |
|-----|--------|
| `h j k l` | left / down / up / right |
| `← ↓ ↑ →` | left / down / up / right |
| `w s` | line up / down |
| `a d` | word left / right |
| `Ctrl+h/l` | word left / right |
| `Ctrl+k/j` | paragraph start / end |
| `Ctrl+w/s` | paragraph start / end |
| `Ctrl+↑/↓` | paragraph start / end |
| `Ctrl+a/d` | jump 5 words left / right |
| `⇧hjkl` | select by char / line |
| `⇧Arrows` | select by char / line |
| `⇧w/s` | select by line |
| `⇧a/d` | select by word |
| `Ctrl+⇧h/l` | select by word |
| `Ctrl+⇧k/j` | select to paragraph start / end |
| `Ctrl+⇧w/s` | select to paragraph start / end |
| `Ctrl+⇧↑/↓` | select to paragraph start / end |
| `Ctrl+Shift+a/d` | select 5 words left / right |
| `Space` | wrap word or selection |
| `q e` | style prev / next |
| `n N` | style next / prev |
| `Enter` | edit annotation note |
| `x` | remove annotation |
| `u U` | undo / redo |
| `Ctrl+Z/Y` | undo / redo |
| `F2` | enter Edit mode |
| `Esc` | return to Annotate mode |
| `F1 / ?` | toggle help |

## License

MIT
