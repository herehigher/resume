function normalizePdfText(value) {
  return String(value).normalize('NFKC').replaceAll('⻑', '長').replace(/\s/g, '');
}

// Explicit input occurrence counts allow intentional repeated input and
// recurring headings without treating equal page text as a defect.
export function japanesePdfViolations(pages, { expectedLines = [] } = {}) {
  const errors = [];
  const text = pages.map((page) => page.items.map((item) => item.str).join('')).join('');
  const normalized = normalizePdfText(text);
  if (!pages.length) errors.push('PDF has no pages');
  pages.forEach((page, index) => {
    if (!page.items.some((item) => item.str.trim())) errors.push(`Page ${index + 1} is empty`);
    const height = page.size?.height ?? page.height;
    const outside = page.items.filter((item) => item.str.trim() && (item.transform[5] <= 35 || item.transform[5] + item.height >= height - 35));
    if (outside.length) errors.push(`Page ${index + 1}: ${outside.length} text items outside printable vertical bounds`);
  });
  const counts = new Map();
  for (const line of expectedLines) {
    const needle = normalizePdfText(line);
    counts.set(needle, (counts.get(needle) || 0) + 1);
  }
  for (const [needle, count] of counts) {
    const actual = normalized.split(needle).length - 1;
    if (actual !== count) errors.push(`${needle}: expected ${count} occurrences, got ${actual}`);
  }
  const endings = pages.flatMap((page) => page.items.filter((item) => item.str === '以上'));
  if (endings.length !== 1) errors.push(`Expected one ending, got ${endings.length}`);
  const last = pages.at(-1);
  const ending = last?.items.find((item) => item.str === '以上');
  if (!ending) errors.push('Ending is missing from the last page');
  else {
    const body = last.items.filter((item) => item !== ending && item.str.trim());
    if (!body.length) errors.push('Last page contains only the ending');
    else {
      const gap = Math.min(...body.map((item) => item.transform[5])) - ending.transform[5];
      if (gap <= ending.height || gap > ending.height * 2.1) errors.push(`Ending is not on the next body line: gap ${gap}`);
    }
    const right = ending.transform[4] + ending.width;
    const width = last.size?.width ?? last.width;
    if (right <= width - 60 || right >= width - 40) errors.push(`Ending is not right aligned: ${right}`);
  }
  return errors;
}
