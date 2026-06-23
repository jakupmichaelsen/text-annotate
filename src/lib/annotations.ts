export const annotationPattern = /`([^`]+)`<!--\s*([\w-]+(?:\s+[\w-]+)?),\s*([^",]+?):\s*"([^"]*)"\s*-->/g;

export function summaryVisibleText(text: string) {
  return text
    .replace(/`([^`]+)`<!--\s*[\w-]+(?:\s+[\w-]+)?,\s*[^",]+?:\s*"[^"]*"\s*-->/g, "$1")
    .replace(/<!--\s*align:(left|center|right)\s+width:\d{1,3}\s*-->/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/^\s*\[\s*[0-9:.]+\s*-->\s*[0-9:.]+\s*\]\s*$/gm, " ")
    .replace(/^>\s?/gm, "")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/[ \t\r\n]+/g, " ");
}

export function annotationWithComment(match: RegExpExecArray, comment: string) {
  const normalizedComment = comment.replace(/"/g, "'").replace(/[<>]/g, "").replace(/--+/g, "-");
  return `\`${match[1]}\`<!-- ${match[2]}, ${match[3]}: "${normalizedComment}" -->`;
}

export function annotationWithStyle(match: RegExpExecArray, styleToken: string) {
  return `\`${match[1]}\`<!-- ${styleToken}, ${match[3]}: "${match[4]}" -->`;
}
