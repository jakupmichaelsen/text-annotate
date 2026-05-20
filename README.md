# textAnnotate

textAnnotate is a focused markdown annotation editor built with
[Svelte](https://svelte.dev/), [CodeMirror 6](https://codemirror.net/), and
[Vite](https://vite.dev/).

Live app: <https://text-annotate.vercel.app/>

The app is designed for ESL teacher feedback workflows: mark phrases, attach
short notes, review the feedback by category, and keep the result as portable
markdown instead of a proprietary document format.

## Core Workflow

1. Paste text or load a `.srt`, `.txt`, `.md`, `.docx`, or `.pdf` file.
2. Use Annotate mode for fast keyboard navigation and phrase marking.
3. Switch to Edit mode when you want normal text entry.
4. Optionally load a matching media file and use gutter timestamps for playback.
5. Review comments and blockquote notes in the collapsible summary sidebar.
6. Save the raw markdown, export a clean HTML version, or export a clean HTML summary for sharing.

## Features

- **Portable annotation format** - highlighted text is stored as markdown inline
  code plus an HTML comment containing the color, timestamp, and note.
- **Clean/raw display modes** - Clean hides annotation metadata, Raw shows the
  current annotation markup, and Raw (all) shows every stored comment.
- **Named highlight palette** - includes plain backtick style plus named colors
  such as `green`, `red`, `steel`, `orange`, `periwinkle`, `sand`, `mint`,
  `denim`, `yellow`, `indigo`, `brown`, `slate`, `sky`, `rosewood`, and
  `purple`, with editable direct shortcut keys and draggable `↕` handles for
  reordering styles.
- **Inline note editing** - double-click or press `Enter` on an annotation to
  edit its stored comment.
- **Summary sidebar** - groups annotations and blockquote notes, jumps back to
  the source text, opens annotation comments for editing, lets you rename
  annotation titles inline, and lets you reorder annotation categories with a
  draggable `↕` handle. The sidebar can also be resized or expanded
  fullscreen.
- **Blockquote note controls** - adjust feedback-note alignment and background
  width while preserving those settings in markdown comments.
- **File loading** - supports `.srt`, `.txt`, `.md`, `.docx`, and `.pdf` input.
- **SRT transcript view** - drops cue IDs, normalizes timestamps, strips simple
  subtitle tags, collapses raw timestamp source lines, and shows clickable cue
  timestamps in the line-number gutter beside transcript lines.
- **Transcript media playback** - load a media file beside an SRT transcript,
  click gutter timestamps, press `Enter` on transcript text, or use keyboard
  shortcuts to play and seek while reviewing.
- **Browser text-to-speech** - for non-SRT documents without loaded media, the
  same compact player strip reads selected text or continues from the current
  cursor line using the browser or OS speech engine, preferring English voices
  when available.
- **PDF review modal** - extracts selectable PDF text, shows the PDF beside the
  extracted draft, and lets you correct the text before loading it.
- **Save and export** - saves the editable markdown, exports clean HTML that
  preserves the editor's clean-mode annotation styling, and exports a clean
  HTML summary based on the sidebar view.
- **Local restore and autosave** - restores the browser buffer from local
  storage and autosaves to an active file handle after Save when supported by
  the browser.
- **Status bar** - shows editor mode, line/column, selection size, visible word
  count, and active annotation style.
- **Focused editor cues** - the active line and cursor column follow the active
  annotation style, while the main editor caret stays hidden outside note
  editing.
- **Layout and theme controls** - tune editor padding, line height, font size,
  blockquote note presentation, and the Nord/Gruvbox theme from the sidebar.
- **Readable monospace typography** - uses `Noto Sans Mono` first, with the
  previous editor fonts kept as fallbacks.

## Annotation Format

Annotations remain valid markdown. The visible phrase is wrapped in backticks,
and the feedback metadata is stored in the following HTML comment:

```markdown
The fox was `quick`<!-- green, 6 Apr 2026 10:00:01: "Check spelling" -->.
```

The comment fields are:

- `green` - the annotation color name.
- `6 Apr 2026 10:00:01` - the local timestamp generated when the annotation is
  created.
- `"Check spelling"` - the optional feedback note.
- `title: "Grammar"` - an optional annotation title used in the summary
  sidebar.

Blockquote display settings are stored the same way:

```markdown
> Good overall point, but connect it more clearly to the text. <!-- align:left width:100 -->
```

Because the metadata is plain HTML comments, the file remains readable in other
markdown editors and rendered comments stay hidden in normal markdown output.

## Supported Inputs

| Input | Behavior |
| --- | --- |
| `.srt` | Converts cues to hidden timestamp source lines plus transcript text, with cue labels shown in the gutter. |
| `.txt` / `.md` | Loads text directly into the editor and clears any previous media session unless new media is selected too. |
| `.docx` | Extracts raw text with `mammoth` and clears any previous media session unless new media is selected too. |
| `.pdf` | Extracts text with `pdfjs-dist`, opens the review modal before loading, and clears any previous media session unless new media is selected too. |
| Media | Loads `.mp3`, `.wav`, `.m4a`, `.ogg`, `.oga`, `.webm`, `.aac`, `.flac`, `.mp4`, `.mov`, or `.mkv` for transcript playback. |

## Keyboard Shortcuts

Annotate mode uses Vim-style movement plus arrow-key equivalents.

| Key | Action |
| --- | --- |
| `h` / `j` / `k` / `l`, `a` / `s` / `w` / `d` | Move left / down / up / right |
| Arrow keys | Move left / down / up / right |
| `Tab` | Edit note / cue playback |
| `Ctrl+h` / `Ctrl+l`, `Ctrl+a` / `Ctrl+d` | Move one word left / right |
| CapsLock + `h` / `l`, CapsLock + `a` / `d` | Move one word left / right |
| `Ctrl+k` / `Ctrl+j`, `Ctrl+w` / `Ctrl+s` | Move to paragraph start / end |
| `Shift` movement variants | Extend the current selection |
| Style keys | Annotate with that color, or recolor the annotation under the cursor. Defaults are `1`-`0`, then `z`, `x`, `c`, `v`, `b`. |
| `q` / `r`, `i` / `o` | Previous / next annotation style |
| `Space` | Wrap selection or current word as an annotation |
| `Enter` | Edit annotation note, or play the current SRT cue when no annotation is active |
| `Delete` / `Backspace` | Remove annotation |
| `u` / `U` | Undo / redo |
| `Ctrl+Z` / `Ctrl+Y` | Undo / redo |
| `F2` | Toggle Annotate / Edit mode |
| `Esc` | Return to Annotate mode |
| `Alt+Space` / `Alt+Up` | Play / pause loaded media or TTS |
| `Alt+Left` / `Alt+Right` | Seek loaded media or step TTS backward / forward |
| `Alt+Down` / `Alt+r` | Cycle playback / TTS speed |
| `Alt+n` / `Alt+p` | Next / previous annotation |
| `Alt+A/H, D/L` | Back / forward |
| `Alt+W/K, S/J` | Scroll up / down |
| `F1` / `?` | Toggle keyboard help |

The in-app help modal also lists the full movement and selection variants,
including Ctrl-based word and paragraph jumps.

## Project Structure

- `src/App.svelte` contains the CodeMirror setup, annotation parsing,
  decorations, import/export behavior, toolbar, sidebar, summary panel, and
  component-scoped styles.
- `src/main.js` mounts the Svelte app into `index.html`.
- `src/app.css` contains global app styles.
- `public/` stores static files served by Vite.
- `dist/` is generated by production builds and should not be edited by hand.

## Development

Install dependencies and start the Vite dev server:

```bash
npm install
npm run dev
```

Create and preview a production build when needed:

```bash
npm run build
npm run preview
```

There is currently no configured `npm test`, lint, or format script.

## License

MIT
