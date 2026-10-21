// Escape text before placing it in Markdown, including extensions that autolink URLs.
export function markdownText(value) {
  return String(value ?? '').replace(/\r\n?/g, '\n')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/[\\`*_{}[\]()#+.!|~=-]/g, '\\$&')
    .replace(/:/g, '&#58;').replace(/@/g, '&#64;');
}

export function markdownLink(label, value) {
  const source = String(value ?? '').trim();
  let url;
  try {
    url = new URL(source);
  } catch {
    return markdownText(label);
  }
  if (!/^https?:\/\//i.test(source) || !['http:', 'https:'].includes(url.protocol)
    || !url.hostname || url.username || url.password || [...source].some((character) => /\s/u.test(character) || character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return markdownText(label);
  const destination = url.href.replace(/[<>\\`"'()[\]]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`).replace(/&/g, '&amp;');
  return `[${markdownText(label)}](<${destination}>)`;
}

export function markdownIndent(value) {
  return value.replace(/^[ \t]+/gm, (space) => [...space].map((character) => character === '\t' ? '&#9;' : '&#32;').join(''));
}

export function markdownParagraph(value) {
  return markdownIndent(markdownText(String(value ?? '').trim())).replace(/\n(?=\S|&)/g, '  \n');
}

export function markdownCode(value) {
  const runs = value.match(/`+/g) || [];
  const delimiter = '`'.repeat(Math.max(0, ...runs.map((run) => run.length)) + 1);
  const content = /^ +$/.test(value) ? value : ` ${value} `;
  return `${delimiter}${content}${delimiter}`;
}
