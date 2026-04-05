# Annotation Tool

A markdown annotation editor built with [Svelte](https://svelte.dev/) and [CodeMirror 6](https://codemirror.net/).

**Live at: https://cm6-app.vercel.app/**

Designed for ESL teachers giving feedback on student assignments.

## Features

- **Vim Mode** — Full Vim keybindings (Normal, Insert, Visual modes)
- **Gruvbox Theme** — Warm, eye-friendly syntax highlighting
- **Markdown** — Write and preview markdown with syntax highlighting
- **Status Bar** — Live mode, line, and column display
- **Space Key** — Wrap word or selection in backticks
- **Paste in Normal Mode** — `p` replaces entire document with clipboard content
- **Color Annotations** — Highlight text with 6 colors for feedback (Alt+H/L, Alt+J/K)

## Tech Stack

- Svelte 5
- CodeMirror 6
- Vim (via @replit/codemirror-vim)
- Vite

## Getting Started

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Deployment

Deploy free to [Vercel](https://vercel.com) or [Netlify](https://netlify.com):

```bash
npm run build
```

Then connect your repo to your preferred platform.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `i` | Enter Insert mode |
| `Esc` | Enter Normal mode |
| `v` | Visual mode |
| `V` | Visual Line mode |
| `p` | Replace document with clipboard |
| `Space` | Wrap word/selection in backticks |
| `Alt+H` | Set annotation style 1 (yellow) |
| `Alt+L` | Set annotation style 6 (orange) |
| `Alt+J` | Previous annotation style |
| `Alt+K` | Next annotation style |
| `/` | Search |
| `:wq` | Save and... well, it's a web app |

## License

MIT
