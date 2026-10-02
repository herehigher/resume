import { expect, openLocale, test } from './fixtures.js';

test('結びDOM: 空末尾を除き実本文コンテナーを選び、末尾改行だけを取り除く（PDF生成なし）', async ({ page }) => {
  await openLocale(page, 'ja');
  const result = await page.evaluate(async () => {
    const { createDefaultState } = await import('/assets/js/state/defaults.js');
    const { renderJapaneseDocument } = await import('/assets/js/templates/ja.js');
    const { addJapaneseDocumentEnding } = await import('/assets/js/ui/japanese-document-ending.js');
    const rows = [];
    for (const tail of ['resume', 'self-promotion', 'detail', 'long-label', 'role', 'companyInfo', 'company', 'skills', 'summary', 'identity', 'identity-links']) {
      const state = createDefaultState('ja');
      const doc = state.documents.ja;
      doc.activeDocument = tail === 'resume' ? 'resume' : 'career';
      state.profile.fields.links = tail === 'identity-links' ? ['https://example.invalid/fictional'] : [];
      doc.fields.requests = 'FIRST\nLAST\n\n  ';
      doc.fields.selfPromotion = tail === 'self-promotion' ? 'FIRST\nLAST\n\n  ' : '';
      doc.fields.skills = tail === 'skills' ? 'FIRST\nLAST\n\n  ' : '';
      doc.fields.careerSummary = tail === 'summary' ? 'FIRST\nLAST\n\n  ' : '';
      doc.careers = ['detail', 'long-label', 'role', 'companyInfo', 'company'].includes(tail) ? [{
        id: 'record_dom-tail', company: 'Fictional Company', role: tail === 'role' ? 'FIRST\nLAST\n\n  ' : '',
        companyInfo: tail === 'companyInfo' ? 'FIRST\nLAST\n\n  ' : '', startDate: '', endDate: '',
        detailSections: [{ title: tail === 'long-label' ? '架空項目'.repeat(50) : 'Fictional Detail', content: ['detail', 'long-label'].includes(tail) ? '- FIRST\n- LAST\n\n  ' : '' }, { title: 'EMPTY-TAIL', content: '' }]
      }, { id: 'record_dom-empty', company: '', role: '', companyInfo: '', startDate: '', endDate: '', detailSections: [] }] : [];
      const preview = document.createElement('div');
      preview.innerHTML = renderJapaneseDocument(state);
      addJapaneseDocumentEnding(preview, state);
      const host = preview.querySelector('.ja-ending-host');
      const selectors = {
        resume: '.requests-section .paper-text-content', 'self-promotion': '[data-section-key="self-promotion"] .career-body',
        detail: '.career-company-grid > div:last-child', 'long-label': '.career-company-grid > div:last-child', role: '.career-company-grid > div:last-child',
        companyInfo: '.career-company-info', company: '.career-company-heading', skills: '[data-section-key="skills"] .career-body',
        summary: '[data-section-key="summary"] .career-body', identity: '.career-doc-meta', 'identity-links': '.career-profile-links'
      };
      const source = host.querySelector('.ja-ending-source');
      let terminal = source;
      while (terminal.lastChild) terminal = terminal.lastChild;
      rows.push({ tail, correctHost: host.matches(selectors[tail]), endings: preview.querySelectorAll('.ja-document-ending').length,
        emptyItemPrinted: preview.textContent.includes('EMPTY-TAIL'), trailingSpace: /\s$/.test(source.textContent),
        breaksAfterLast: terminal.nodeName === 'BR',
        bodyLinesPreserved: !['resume', 'self-promotion', 'detail', 'long-label', 'role', 'companyInfo', 'skills', 'summary'].includes(tail)
          || (source.textContent.includes('FIRST') && source.textContent.includes('LAST')) });
    }
    return rows;
  });
  expect(result).toEqual(result.map(({ tail }) => ({ tail, correctHost: true, endings: 1, emptyItemPrinted: false, trailingSpace: false, breaksAfterLast: false, bodyLinesPreserved: true })));
});
