// Inline syntax and autolinks need protection; ordinary punctuation does not.
export function markdownInlineText(value) {
  return String(value ?? '').replace(/\r\n?/g, '\n')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/[\\`*[\]|~]/g, '\\$&')
    .replace(/(?<![\p{L}\p{N}])_|_(?![\p{L}\p{N}])/gu, '\\$&')
    .replace(/(?<![a-z0-9])www\./gi, (prefix) => `${prefix.slice(0, -1)}&#46;`)
    .replace(/:/g, '&#58;').replace(/@/g, '&#64;');
}

// Apply after inline serialization, including for the limited Markdown renderer.
export function markdownBlockText(value) {
  return value
    .replace(/^( *)(#{1,6})(?=\s|$)/gm, '$1\\$2')
    .replace(/^( *)([-+])(?=\s|$)/gm, '$1\\$2')
    .replace(/^( *)(\d{1,9})([.)])(?=\s|$)/gm, '$1$2\\$3')
    .replace(/^( *)(=+|-{2,})([ \t]*)$/gm, '$1\\$2$3')
    // A trailing hash run could close a generated heading.
    .replace(/(\S[ \t]+)(#+)(?=[ \t]*$)/gm, '$1\\$2');
}

export function markdownText(value) {
  return markdownBlockText(markdownInlineText(value));
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
