export const helpSections = [
  {
    title: "Navigation",
    items: [
      ["h j k l", "left / down / up / right"],
      ["← ↓ ↑ →", "left / down / up / right"],
      ["q r", "left / right"],
      ["w s", "line up / down"],
      ["a d", "word left / right"],
      ["c C", "column stride right / left"],
      ["Ctrl+h/l", "word left / right"],
      ["Ctrl+k/j", "paragraph start / end"],
      ["Ctrl+w/s", "paragraph start / end"],
      ["Ctrl+↑/↓", "paragraph start / end"],
      ["Ctrl+d", "jump 5 words right"]
    ]
  },
  {
    title: "Selection",
    items: [
      ["⇧hjkl", "select by char / line"],
      ["⇧q ⇧r", "select left / right"],
      ["⇧Arrows", "select by char / line"],
      ["⇧w ⇧s", "select by line"],
      ["⇧a ⇧d", "select by word"],
      ["Ctrl+⇧h/l", "select by word"],
      ["Ctrl+⇧k/j", "select to paragraph start / end"],
      ["Ctrl+⇧w/s", "select to paragraph start / end"],
      ["Ctrl+⇧↑/↓", "select to paragraph start / end"],
      ["Ctrl+Shift+a/d", "select 5 words left / right"]
    ]
  },
  {
    title: "Annotations",
    items: [
      ["Space", "wrap word / selection"],
      ["Tab / Shift+Tab", "variant next / prev"],
      ["e", "variant next"],
      ["n", "new blockquote note"],
      ["N", "style prev"],
      ["Enter", "edit note / cue playback"],
      ["x", "remove annotation"]
    ]
  },
  {
    title: "History",
    items: [
      ["u U", "undo / redo"],
      ["Ctrl+Z/Y", "undo / redo"]
    ]
  },
  {
    title: "Other",
    items: [
      ["F2", "enter Edit mode"],
      ["Esc", "return to Annotate mode"],
      ["Alt+Space", "play / pause media / TTS"],
      ["Alt+s", "play / pause media / TTS"],
      ["Alt+a/d", "seek media 5s / step TTS"],
      ["Alt+w", "cycle playback / TTS speed"],
      ["Alt+←/→", "seek media / step TTS"],
      ["Alt+r", "cycle playback / TTS speed"],
      ["F1 / ?", "toggle this help"]
    ]
  }
] as const;
