export const annotationPattern = /`([^`]+)`<!--\s*(\w+(?:\s+\w+)?),\s*(.+?):\s*"([^"]*)"(?:,\s*title:\s*"([^"]*)")?\s*-->/g;
export const blockquoteMetaPattern = /<!--\s*align:(left|center|right)\s+width:(\d{1,3})\s*-->/i;

export function summaryVisibleText(text: string) {
  return text
    .replace(/`([^`]+)`<!--\s*\w+(?:\s+\w+)?,\s*.+?:\s*"[^"]*"(?:,\s*title:\s*"[^"]*")?\s*-->/g, "$1")
    .replace(/<!--\s*align:(left|center|right)\s+width:\d{1,3}\s*-->/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/^\s*\[\s*[0-9:.]+\s*-->\s*[0-9:.]+\s*\]\s*$/gm, " ")
    .replace(/^>\s?/gm, "")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/[ \t\r\n]+/g, " ");
}

function normalizeSummaryTitle(title: string, colorName: string) {
  const normalized = title.trim().replace(/\s+/g, " ").replace(/"/g, "'").replace(/[<>]/g, "").replace(/--+/g, "-");
  return normalized.toLowerCase() === colorName.toLowerCase() ? "" : normalized;
}

export function annotationWithTitle(match: RegExpExecArray, title: string) {
  const colorName = match[2];
  const normalizedTitle = normalizeSummaryTitle(title, colorName);
  const titlePart = normalizedTitle ? `, title: "${normalizedTitle}"` : "";
  return `\`${match[1]}\`<!-- ${colorName}, ${match[3]}: "${match[4]}"${titlePart} -->`;
}
