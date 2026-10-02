function hasText(value) {
  return Boolean(String(value ?? '').trim());
}

function trimTrailingSpace(node) {
  for (const child of [...node.childNodes].reverse()) {
    if (child.nodeType === 3) {
      child.textContent = child.textContent.trimEnd();
      if (child.textContent) return true;
    } else if (child.nodeName === 'BR') child.remove();
    else if (trimTrailingSpace(child)) return true;
  }
  return false;
}

// Keep the ending in the final text container so its line height, padding and
// page fragmentation follow the body, rather than a page footer or spare rows.
export function addJapaneseDocumentEnding(preview, state) {
  const doc = state.documents.ja;
  let host = preview.querySelector('.requests-section .paper-text-content');
  if (doc.activeDocument === 'career') {
    const section = (key) => preview.querySelector(`[data-section-key="${key}"]`);
    const sections = ['summary', 'skills', 'career-history', 'self-promotion'];
    const careers = [...preview.querySelectorAll('.career-company')];
    const lastKey = hasText(doc.fields.selfPromotion) ? 'self-promotion'
      : careers.length ? 'career-history'
        : hasText(doc.fields.skills) ? 'skills'
          : hasText(doc.fields.careerSummary) ? 'summary' : 'identity';
    for (const key of sections.slice(sections.indexOf(lastKey) + 1)) {
      section(key)?.classList.add('ja-ending-empty');
    }
    if (lastKey === 'identity') {
      host = preview.querySelector('.career-profile-links') || preview.querySelector('.career-doc-meta');
    } else if (lastKey !== 'career-history') {
      host = section(lastKey).querySelector('.career-body');
    } else {
      const company = careers.at(-1);
      const career = doc.careers.find((item) => item.id === company.dataset.recordId);
      const grid = company.querySelector('.career-company-grid');
      const details = career.detailSections.filter((item) => hasText(item.content));
      if (details.length) host = grid.lastElementChild;
      else if (hasText(career.role)) host = grid.lastElementChild;
      else {
        grid.classList.add('ja-ending-empty');
        host = company.querySelector(hasText(career.companyInfo) ? '.career-company-info' : '.career-company-heading');
      }
      if (!hasText(career.companyInfo)) company.querySelector('.career-company-info').classList.add('ja-ending-empty');
    }
  }
  if (!host) return;
  host.classList.add('ja-ending-host');
  if (host.parentElement.classList.contains('career-company-grid')) {
    host.previousElementSibling.classList.add('ja-ending-label');
  }
  const source = preview.ownerDocument.createElement('div');
  source.className = 'ja-ending-source';
  source.append(...host.childNodes);
  trimTrailingSpace(source);
  const ending = preview.ownerDocument.createElement('div');
  ending.className = 'ja-document-ending';
  ending.textContent = '以上';
  host.append(source, ending);
}
