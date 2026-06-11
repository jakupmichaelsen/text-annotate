export const helpSections = [
  {
    title: "Navigation",
    items: [
      ["← ↓ ↑ →", "left / down / up / right"],
      ["CapsLock", "on = word navigation, off = character navigation"],
      ["c / C", "column stride right / left"],
      ["WASD", "optional navigation keys"],
      ["HJKL", "optional navigation keys"]
    ]
  },
  {
    title: "Selection",
    items: [
      ["v", "toggle sticky selection"],
      ["V", "visual-line selection"]
    ]
  },
  {
    title: "Annotations",
    items: [
      ["Space", "wrap word / selection"],
      ["n / N", "previous / next annotation"],
      ["1 / 2 / 3", "select styles"],
      ["0", "plain annotation"],
      ["Tab / Shift+Tab", "variant next / previous"],
      ["<", "new blockquote below"],
      [">", "split rest of line to blockquote"],
      ["Enter", "edit note / cue playback"],
      ["x", "remove annotation / delete"]
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
      ["r", "cycle playback / TTS speed"],
      ["Alt+Space", "play / pause media / TTS"],
      ["Alt+s", "play / pause media / TTS"],
      ["Alt+a/d", "seek media 5s / step TTS"],
      ["Alt+w", "cycle playback / TTS speed"],
      ["Alt+←/→", "seek media 10s / step TTS"],
      ["Media RW/FF", "seek media / step TTS"],
      ["Alt+r", "cycle playback / TTS speed"],
      ["Ctrl/Cmd+,", "toggle settings"],
      ["F1 / ?", "toggle this help"]
    ]
  }
] as const;
