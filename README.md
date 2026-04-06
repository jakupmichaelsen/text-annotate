# Annotation Tool

A markdown annotation editor built with [Svelte](https://svelte.dev/) and [CodeMirror 6](https://codemirror.net/).

**Live at: https://cm6-app.vercel.app/**

Designed for ESL teachers giving feedback on student assignments.

## Features

- **Vim Mode** — Full Vim keybindings (Normal, Insert, Visual modes)
- **Gruvbox Theme** — Warm, eye-friendly syntax highlighting
- **Markdown** — Write and edit markdown with full syntax highlighting
- **Status Bar** — Live mode, line, column, and active annotation style
- **Space Key** — Wrap word or selection using the active annotation style
- **Paste in Normal Mode** — `p` replaces entire document with clipboard content
- **Color Annotations** — Highlight text with 6 named colors (yellow, green, blue, red, purple, orange)
- **Annotation Format** — Annotations are stored as standard markdown: `` `word`<!-- color timestamp "note" --> ``
- **Tooltip Preview** — Cursor on annotation shows a floating bubble with color, timestamp, and note
- **Edit Annotations** — Double-click or press `Enter` to edit the annotation note inline
- **Recolor Annotations** — `Alt+J/K` cycles colors on an existing annotation when cursor is on it
- **Raw Annotations** — Checkbox in the footer reveals full HTML comment markup for editing
- **Display Line Navigation** — `j`/`k` and arrow keys navigate visual (wrapped) lines
- **Line-Wrapping Motion** — `h`/`l` and left/right arrows continue across line boundaries

## Annotation Format

Annotations are stored directly in the markdown file as invisible HTML comments:

```markdown
The fox was `quick`<!-- green 2026-04-06T10:00:01 "Check spelling" --> nor particularly brown.
```

- **color** — one of: `yellow`, `green`, `blue`, `red`, `purple`, `orange`
- **timestamp** — ISO-style local datetime, auto-generated on wrap
- **note** — optional free-text comment, editable inline

The file remains valid, portable markdown. HTML comments are invisible in rendered output.

## Tech Stack

- Svelte 5
- CodeMirror 6
- Vim (via @replit/codemirror-vim)
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
| `i` | Enter Insert mode |
| `Esc` | Enter Normal mode |
| `v` / `V` | Visual / Visual Line mode |
| `p` | Replace document with clipboard |
| `Space` | Wrap word/selection with active annotation style |
| `Alt+H` | Set style 1 (yellow) — or recolor annotation under cursor |
| `Alt+L` | Set style 6 (orange) — or recolor annotation under cursor |
| `Alt+J` | Previous style — or cycle annotation color left |
| `Alt+K` | Next style — or cycle annotation color right |
| `Enter` | Edit annotation note (cursor on annotation, normal mode) |
| `j` / `k` | Move by display line (respects word wrap) |
| `h` / `l` | Move left/right, wrapping across line boundaries |
| `/` | Search |

## License

MIT
