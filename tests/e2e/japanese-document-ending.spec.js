import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createDefaultState } from '../../site/assets/js/state/defaults.js';
import { createPdfFixture } from '../fixtures/pdf-pagination.mjs';
import { japanesePdfViolations } from '../helpers/japanese-pdf.js';
import { expect, openLocale, test } from './fixtures.js';

async function importState(page, state, expectedContent) {
  await page.locator('#importDataInput').setInputFiles({ name: 'fictional-ending.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(state)) });
  await page.locator('#confirmSampleAdoptButton').click();
  // The previous success toast can remain visible while this import encrypts.
  await expect(page.locator('#importDataInput')).toHaveValue('');
  await expect(page.locator('#documentPreview')).toContainText(expectedContent);
  await expect(page.locator('#globalMessage')).toHaveText('データを読み込みました。');
}

async function inspectPdf(buffer) {
  const task = getDocument({ data: new Uint8Array(buffer), disableFontFace: true, isEvalSupported: false, useSystemFonts: true });
  try {
    const pdf = await task.promise;
    return await Promise.all(Array.from({ length: pdf.numPages }, async (_, index) => {
      const page = await pdf.getPage(index + 1);
      return { items: (await page.getTextContent()).items.filter((item) => item.str.trim()), size: page.getViewport({ scale: 1 }) };
    }));
  } finally { await task.destroy(); }
}

async function printAndCheck(page, testInfo, name, expectedLines = []) {
  await page.emulateMedia({ media: 'print' });
  const sourceText = await page.locator('#documentPreview').innerText();
  const pdfPath = testInfo.outputPath(`${name}.pdf`);
  const pages = await inspectPdf(await page.pdf({ path: pdfPath, preferCSSPageSize: true, printBackground: true }));
  expect(japanesePdfViolations(pages, { sourceText, expectedLines }), name).toEqual([]);
  return { pages, pdfPath };
}

function writeEvidence(page, testInfo, cases, data) {
  writeFileSync(testInfo.outputPath('evidence.json'), JSON.stringify({ sourceSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), platform: process.platform, browser: page.context().browser().version(), viewport: page.viewportSize(), data, cases }, null, 2));
}

function tailState(tail) {
  const state = createDefaultState('ja');
  state.documents.ja.activeDocument = 'career';
  state.profile.fields.fullName = '架空 太郎';
  state.profile.fields.links = tail === 'identity-links' ? [`https://example.invalid/${'long-profile-path/'.repeat(30)}`, 'https://example.invalid/short'] : [];
  state.documents.ja.fields.careerSummary = tail === 'summary' ? '最後の要約 END-SUMMARY' : '';
  state.documents.ja.fields.skills = tail === 'skills' ? '最後の技術 END-SKILLS' : '';
  state.documents.ja.careers = ['detail', 'long-label', 'role', 'companyInfo', 'company'].includes(tail) ? [{
    id: 'record_ending-company', company: '架空会社 END-COMPANY', role: tail === 'role' ? '架空役職 END-ROLE\n\n  ' : '',
    companyInfo: tail === 'companyInfo' ? '架空事業 END-INFO' : '', startDate: '', endDate: '',
    detailSections: [{ title: tail === 'long-label' ? '長い架空項目タイトル'.repeat(8) : '架空項目', content: tail === 'detail' ? '- 第一行\n- 最後の項目 END-DETAIL\n\n' : tail === 'long-label' ? '本文 END-LABEL' : '' }, { title: '空の末尾項目', content: '' }]
  }, { id: 'record_ending-empty', company: '', role: '', companyInfo: '', startDate: '', endDate: '', detailSections: [] }] : [];
  return state;
}

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
        firstLinePreserved: !source.textContent.includes('LAST') || source.textContent.includes('FIRST') });
    }
    return rows;
  });
  expect(result).toEqual(result.map(({ tail }) => ({ tail, correctHost: true, endings: 1, emptyItemPrinted: false, trailingSpace: false, breaksAfterLast: false, firstLinePreserved: true })));
});

test('結びPDFのimport待機: 前回toastと暗号化中の旧previewで完了扱いしない（PDF生成なし）', async ({ page }) => {
  await openLocale(page, 'ja');
  const state = createDefaultState('ja');
  state.documents.ja.fields.requests = 'OLD-IMPORT-CONTENT';
  await importState(page, state, 'OLD-IMPORT-CONTENT');
  await page.evaluate(() => {
    const original = crypto.subtle.encrypt.bind(crypto.subtle);
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    window.endingImportGate = { entered: false, release };
    crypto.subtle.encrypt = async (...args) => {
      window.endingImportGate.entered = true;
      await gate;
      return original(...args);
    };
  });
  state.documents.ja.fields.requests = 'NEW-IMPORT-CONTENT';
  let finished = false;
  const importing = importState(page, state, 'NEW-IMPORT-CONTENT').then(() => { finished = true; });
  await expect.poll(() => page.evaluate(() => window.endingImportGate.entered)).toBe(true);
  await expect(page.locator('#globalMessage')).toHaveText('データを読み込みました。');
  await expect(page.locator('#importDataInput')).not.toHaveValue('');
  await expect(page.locator('#documentPreview')).toContainText('OLD-IMPORT-CONTENT');
  expect(finished).toBe(false);
  await page.evaluate(() => window.endingImportGate.release());
  await importing;
  expect(finished).toBe(true);
});

for (const documentType of ['resume', 'career']) {
  for (const paper of ['A4', 'LETTER']) {
    test(`日本語PDF ${documentType}: 短文 ${paper} の本文直下に結びを一度表示`, async ({ page }, testInfo) => {
      const { state, endMarker } = createPdfFixture({ locale: 'ja', documentType, pageSize: 'A4', length: 'short' });
      state.documents.ja.fields[documentType === 'resume' ? 'requests' : 'selfPromotion'] += '\n\n  ';
      await openLocale(page, 'ja');
      await importState(page, state, endMarker);
      await expect(page.locator('.ja-document-ending')).toBeHidden();
      if (paper === 'LETTER') {
        // The product UI fixes Japanese A4. Override only the browser page rule,
        // after this import completes, for one compatibility PDF per document.
        await page.locator('#activePrintPageStyle').evaluate((style) => { style.textContent = '@page { margin: 14mm 15mm; size: Letter portrait; }'; });
      }
      const { pages, pdfPath } = await printAndCheck(page, testInfo, `${documentType}-${paper}-short`);
      expect(pages[0].size.width).toBeCloseTo(paper === 'A4' ? 595.28 : 612, 0);
      expect(pages[0].size.height).toBeCloseTo(paper === 'A4' ? 841.89 : 792, 0);
      writeEvidence(page, testInfo, [{ documentType, paper, pages: pages.length, pdfPath }], 'fictional short fixture; trailing whitespace; Japanese Letter uses a browser page-rule override');
    });
  }

  test(`日本語PDF ${documentType}: 相隣る行数で実際にページ境界を跨ぎ末行と結びを同頁に保つ`, async ({ page }, testInfo) => {
    await openLocale(page, 'ja');
    const evidence = [];
    // Calibrate with one unprinted line at the actual A4 printable width.
    // Font metrics may differ between local macOS and CI Linux; no PDF scan or
    // artificial height is needed to choose the adjacent boundary fixtures.
    await page.setViewportSize({ width: Math.ceil(180 * 96 / 25.4), height: 1000 });
    const calibration = createDefaultState('ja');
    calibration.documents.ja.activeDocument = documentType;
    calibration.documents.ja.fields[documentType === 'resume' ? 'requests' : 'selfPromotion'] = 'BOUNDARY-CALIBRATION-END';
    await importState(page, calibration, 'BOUNDARY-CALIBRATION-END');
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('#documentPreview')).toHaveCSS('transform', 'none');
    const geometry = await page.locator('.ja-ending-host').evaluate((host) => ({
      bottom: host.getBoundingClientRect().bottom - host.closest('.document-page').getBoundingClientRect().top,
      lineHeight: Number.parseFloat(getComputedStyle(host.querySelector('.ja-document-ending')).lineHeight)
    }));
    const fittingLines = 1 + Math.floor((269 * 96 / 25.4 - geometry.bottom) / geometry.lineHeight);
    expect(fittingLines).toBeGreaterThan(0);
    expect(fittingLines).toBeLessThan(100);
    for (const count of [fittingLines, fittingLines + 1]) {
      const state = createDefaultState('ja');
      state.documents.ja.activeDocument = documentType;
      const lines = Array.from({ length: count }, (_, index) => `BOUNDARY-${documentType}-${String(index + 1).padStart(3, '0')}-END`);
      state.documents.ja.fields[documentType === 'resume' ? 'requests' : 'selfPromotion'] = lines.join('\n');
      await page.emulateMedia({ media: 'screen' });
      await importState(page, state, lines.at(-1));
      const { pages, pdfPath } = await printAndCheck(page, testInfo, `${documentType}-boundary-${count}`, lines);
      expect(pages.at(-1).items.map((item) => item.str).join('')).toContain(lines.at(-1));
      evidence.push({ count, pages: pages.length, lastBodyPage: pages.findIndex((item) => item.items.map((text) => text.str).join('').includes(lines.at(-1))), pdfPath });
    }
    expect(evidence[0].pages).toBe(1);
    expect(evidence[1].pages).toBe(2);
    expect(evidence[1].pages).toBe(evidence[0].pages + 1);
    expect(evidence[1].lastBodyPage).toBe(evidence[0].lastBodyPage + 1);
    writeEvidence(page, testInfo, evidence, { description: 'fictional adjacent boundary line counts; unmodified product print styles; DOM calibration without PDF generation', geometry });
  });
}

for (const tail of ['long-label', 'identity-links']) {
  test(`日本語PDF: 空末尾の代表 ${tail} を印刷する`, async ({ page }, testInfo) => {
    await openLocale(page, 'ja');
    const state = tailState(tail);
    await importState(page, state, tail === 'long-label' ? 'END-LABEL' : 'example.invalid/short');
    // Only this explicit reservation stress case changes the product styles.
    if (tail === 'long-label') await page.addStyleTag({ content: '.career-company-grid { min-height: 300px; }' });
    const { pages, pdfPath } = await printAndCheck(page, testInfo, `empty-tail-${tail}`);
    expect(pages).toHaveLength(1);
    writeEvidence(page, testInfo, [{ tail, pages: pages.length, pdfPath }], tail === 'long-label' ? 'fictional long label and empty detail/record; explicit 300px grid reservation stress' : 'fictional identity with wrapping profile links; unmodified product styles');
  });
}
