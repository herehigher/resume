import { escapeHTML } from './html.js';

const ESCAPABLE = new Set(['\\', '-', '+', '*', '[', ']', '(', ')', '`']);

function isEscapable(character) {
  return ESCAPABLE.has(character);
}

function isWhitespace(character) {
  return character !== undefined && /\s/u.test(character);
}

function escapeLiteral(source) {
  let output = '';
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '\\' && index + 1 < source.length && isEscapable(source[index + 1])) {
      output += escapeHTML(source[index + 1]);
      index += 1;
    } else {
      output += escapeHTML(character);
    }
  }
  return output;
}

function scanListMarker(line) {
  let index = 0;
  while (line[index] === ' ') index += 1;
  const indent = index;
  if (line[index] === '\t' || (indent !== 0 && indent !== 2 && indent < 4)) return null;

  let type;
  let start = 1;
  if (line[index] === '-' || line[index] === '*' || line[index] === '+') {
    type = 'ul';
    index += 1;
  } else if (line[index] >= '0' && line[index] <= '9') {
    const numberStart = index;
    while (line[index] >= '0' && line[index] <= '9') index += 1;
    const digitCount = index - numberStart;
    if (digitCount > 3 || line[index] !== '.' || line[numberStart] === '0') return null;
    start = Number(line.slice(numberStart, index));
    if (start < 1 || start > 999) return null;
    index += 1;
    type = 'ol';
  } else {
    return null;
  }

  let spacing = 0;
  while (line[index] === ' ') {
    index += 1;
    spacing += 1;
  }
  if (spacing === 0) return null;
  const content = line.slice(index);
  if (!content.trim()) return null;
  return { type, start, depth: indent === 0 ? 1 : 2, content };
}

function parseBlocks(source) {
  const normalized = String(source ?? '').replace(/\r\n/g, '\n');
  const blocks = [];
  let paragraph = null;
  let activeList = null;

  for (const line of normalized.split('\n')) {
    if (!line.trim()) {
      paragraph = null;
      activeList = null;
      continue;
    }

    const marker = scanListMarker(line);
    if (!marker) {
      activeList = null;
      if (!paragraph) {
        paragraph = { type: 'paragraph', lines: [] };
        blocks.push(paragraph);
      }
      paragraph.lines.push(line);
      continue;
    }

    paragraph = null;
    if (marker.depth === 1 || !activeList?.items.length) {
      if (!activeList || activeList.type !== marker.type) {
        activeList = { type: marker.type, start: marker.start, items: [] };
        blocks.push(activeList);
      }
      activeList.items.push({ text: marker.content, children: [] });
      continue;
    }

    const parent = activeList.items[activeList.items.length - 1];
    let nested = parent.children[parent.children.length - 1];
    if (!nested || nested.type !== marker.type) {
      nested = { type: marker.type, start: marker.start, items: [] };
      parent.children.push(nested);
    }
    nested.items.push({ text: marker.content, children: [] });
  }

  return blocks;
}

function createInlineIndex(line) {
  const length = line.length;
  const escaped = new Uint8Array(length);
  for (let index = 0; index + 1 < length; index += 1) {
    if (line[index] === '\\' && isEscapable(line[index + 1])) {
      escaped[index + 1] = 1;
      index += 1;
    }
  }

  const nextSingleStar = new Int32Array(length + 1).fill(-1);
  const nextDoubleStar = new Int32Array(length + 1).fill(-1);
  const nextSingleBacktick = new Int32Array(length + 1).fill(-1);
  const nextCloseBracket = new Int32Array(length + 1).fill(-1);
  const nextOpenBracket = new Int32Array(length + 1).fill(-1);
  const matchingCloseParen = new Int32Array(length).fill(-1);
  const starRunLength = new Int32Array(length);
  const backtickRunLength = new Int32Array(length);

  const openParentheses = [];
  for (let index = 0; index < length; index += 1) {
    if (escaped[index]) continue;
    if (line[index] === '(') openParentheses.push(index);
    else if (line[index] === ')' && openParentheses.length) {
      matchingCloseParen[openParentheses.pop()] = index;
    }
  }

  for (let index = 0; index < length;) {
    if (escaped[index]) {
      index += 1;
      continue;
    }
    const character = line[index];
    if (character === '*') {
      const start = index;
      while (line[index] === '*' && !escaped[index]) index += 1;
      starRunLength[start] = index - start;
      continue;
    }
    if (character === '`') {
      const start = index;
      while (line[index] === '`' && !escaped[index]) index += 1;
      backtickRunLength[start] = index - start;
      continue;
    }
    index += 1;
  }

  let singleStar = -1;
  let doubleStar = -1;
  let singleBacktick = -1;
  let closeBracket = -1;
  let openBracket = -1;
  for (let index = length - 1; index >= 0; index -= 1) {
    if (!escaped[index]) {
      if (starRunLength[index] === 1) singleStar = index;
      if (starRunLength[index] === 2) doubleStar = index;
      if (backtickRunLength[index] === 1) singleBacktick = index;
      if (line[index] === ']' && !escaped[index]) closeBracket = index;
      if (line[index] === '[' && !escaped[index]) openBracket = index;
    }
    nextSingleStar[index] = singleStar;
    nextDoubleStar[index] = doubleStar;
    nextSingleBacktick[index] = singleBacktick;
    nextCloseBracket[index] = closeBracket;
    nextOpenBracket[index] = openBracket;
  }

  return {
    escaped,
    starRunLength,
    backtickRunLength,
    nextSingleStar,
    nextDoubleStar,
    nextSingleBacktick,
    nextCloseBracket,
    nextOpenBracket,
    matchingCloseParen
  };
}

function decodeLinkLabel(label) {
  return escapeLiteral(label);
}

function parseSafeUrl(source) {
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (isWhitespace(character) || character === '(' || character === ')') return null;
  }
  const lower = source.toLowerCase();
  if (!lower.startsWith('http://') && !lower.startsWith('https://')) return null;
  try {
    const parsed = new URL(source);
    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
      || !parsed.hostname
      || parsed.username
      || parsed.password) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

function readBracketMarkup(line, start, index, isImage) {
  const open = start + (isImage ? 1 : 0);
  const close = index.nextCloseBracket[open + 1];
  if (close < 0) return { type: 'literal', end: line.length };
  if (index.nextOpenBracket[open + 1] >= 0 && index.nextOpenBracket[open + 1] < close) {
    const paren = line[close + 1] === '(' ? index.matchingCloseParen[close + 1] : -1;
    return { type: 'literal', end: paren < 0 ? line.length : paren + 1 };
  }
  if (line[close + 1] !== '(') return null;
  const closeParen = index.matchingCloseParen[close + 1];
  if (closeParen < 0) return { type: 'literal', end: line.length };
  const end = closeParen + 1;
  const label = line.slice(open + 1, close);
  const url = line.slice(close + 2, closeParen);
  const source = line.slice(start, end);
  if (isImage || !label || label.includes('\n')) return { type: 'literal', end };
  const href = parseSafeUrl(url);
  if (!href) return { type: 'literal', end };
  return {
    type: 'link',
    end,
    html: `<a href="${escapeHTML(href)}" target="_blank" rel="noopener noreferrer">${decodeLinkLabel(label)}</a>`,
    source
  };
}

function renderInline(line) {
  const index = createInlineIndex(line);
  let output = '';
  for (let position = 0; position < line.length;) {
    const character = line[position];
    if (character === '\\' && position + 1 < line.length && isEscapable(line[position + 1])) {
      output += escapeHTML(line[position + 1]);
      position += 2;
      continue;
    }

    if (character === '`') {
      const runLength = index.backtickRunLength[position];
      if (runLength > 1) {
        output += escapeHTML(line.slice(position, position + runLength));
        position += runLength;
        continue;
      }
      const close = index.nextSingleBacktick[position + 1];
      if (close > position + 1) {
        output += `<code>${escapeHTML(line.slice(position + 1, close))}</code>`;
        position = close + 1;
        continue;
      }
      output += '`';
      position += 1;
      continue;
    }

    if (character === '!' && line[position + 1] === '[') {
      const image = readBracketMarkup(line, position, index, true);
      if (image) {
        output += escapeLiteral(line.slice(position, image.end));
        position = image.end;
        continue;
      }
    }
    if (character === '[') {
      const link = readBracketMarkup(line, position, index, false);
      if (link) {
        output += link.type === 'link' ? link.html : escapeLiteral(line.slice(position, link.end));
        position = link.end;
        continue;
      }
    }

    if (character === '*') {
      const runLength = index.starRunLength[position];
      if (runLength === 2) {
        const close = index.nextDoubleStar[position + 2];
        if (close > position + 2) {
          const content = line.slice(position + 2, close);
          if (!isWhitespace(content[0]) && !isWhitespace(content[content.length - 1])) {
            output += `<strong>${escapeLiteral(content)}</strong>`;
            position = close + 2;
            continue;
          }
        }
        output += '**';
        position += 2;
        continue;
      }
      if (runLength === 1) {
        const close = index.nextSingleStar[position + 1];
        if (close > position + 1) {
          const content = line.slice(position + 1, close);
          if (!isWhitespace(content[0]) && !isWhitespace(content[content.length - 1])) {
            output += `<em>${escapeLiteral(content)}</em>`;
            position = close + 1;
            continue;
          }
        }
      }
      output += escapeHTML(line.slice(position, position + runLength));
      position += runLength;
      continue;
    }

    output += escapeHTML(character);
    position += 1;
  }
  return output;
}

function renderList(list) {
  const tag = list.type;
  const start = tag === 'ol' && list.start !== 1 ? ` start="${list.start}"` : '';
  const items = list.items.map((item) => {
    const nested = item.children.map(renderList).join('');
    return `<li>${renderInline(item.text)}${nested}</li>`;
  }).join('');
  return `<${tag}${start}>${items}</${tag}>`;
}

export function renderLimitedMarkdown(source) {
  const blocks = parseBlocks(source);
  return blocks.map((block) => {
    if (block.type === 'paragraph') return `<p>${block.lines.map(renderInline).join('<br>')}</p>`;
    return renderList(block);
  }).join('');
}
