export const helpSections = [
  {
    title: "Navigation",
    items: [
      ["h j k l", "left / down / up / right"],
      ["← ↓ ↑ →", "left / down / up / right"],
      ["w s", "line up / down"],
      ["a d", "word left / right"],
      ["Ctrl+h/l", "word left / right"],
      ["Ctrl+k/j", "paragraph start / end"],
      ["Ctrl+w/s", "paragraph start / end"],
      ["Ctrl+↑/↓", "paragraph start / end"],
      ["Ctrl+a/d", "jump 5 words left / right"]
    ]
  },
  {
    title: "Selection",
    items: [
      ["⇧hjkl", "select by char / line"],
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
      ["q e", "variant prev / next"],
      ["4", "variant next"],
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
      ["Alt+Space", "play / pause audio"],
      ["Alt+←/→", "seek audio back / forward"],
      ["F1 / ?", "toggle this help"]
    ]
  }
] as const;
