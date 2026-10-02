import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createDefaultState } from '../../site/assets/js/state/defaults.js';
import { createPdfFixture } from '../fixtures/pdf-pagination.mjs';
import { expect, openLocale, test } from './fixtures.js';

async function importState(page, state) {
  await page.locator('#importDataInput').setInputFiles({ name: 'fictional-ending.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(state)) });
  await page.locator('#confirmSampleAdoptButton').click();
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

function writeEvidence(page, testInfo, cases, data) {
  writeFileSync(testInfo.outputPath('evidence.json'), JSON.stringify({ sourceSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), platform: process.platform, browser: page.context().browser().version(), viewport: page.viewportSize(), data, cases }, null, 2));
}

function assertEnding(pages) {
  const endings = pages.flatMap((page) => page.items.filter((item) => item.str === '以上'));
  expect(endings).toHaveLength(1);
  const last = pages.at(-1);
  const ending = last.items.find((item) => item.str === '以上');
  expect(ending).toBeTruthy();
  const body = last.items.filter((item) => item !== ending);
  expect(body.length).toBeGreaterThan(0);
  const lastBaseline = Math.min(...body.map((item) => item.transform[5]));
  const gap = lastBaseline - ending.transform[5];
  expect(gap).toBeGreaterThan(ending.height);
  expect(gap).toBeLessThanOrEqual(ending.height * 2.1);
  // All source characters, including the ending, must fit the printable box.
  for (const page of pages) {
    for (const item of page.items) {
      expect(item.transform[5]).toBeGreaterThan(35);
      expect(item.transform[5] + item.height).toBeLessThan(page.size.height - 35);
    }
  }
  const right = ending.transform[4] + ending.width;
  expect(right).toBeGreaterThan(last.size.width - 60);
  expect(right).toBeLessThan(last.size.width - 40);
}

test('日本語PDF: 両書類・A4/Letter・短文/長文/手動改ページの実本文直下に結びを一度表示', async ({ page }, testInfo) => {
  await openLocale(page, 'ja');
  const evidence = [];
  for (const documentType of ['resume', 'career']) {
    for (const paper of ['A4', 'LETTER']) {
      for (const length of ['short', 'standard', 'extra-long']) {
        const { state, endMarker } = createPdfFixture({ locale: 'ja', documentType, pageSize: paper, length });
        state.documents.ja.fields[documentType === 'resume' ? 'requests' : 'selfPromotion'] += '\n\n  ';
        if (length === 'standard') {
          state.settings.pageBreaks.ja.A4[documentType].sections = [documentType === 'resume' ? 'requests' : 'self-promotion'];
        }
        await page.emulateMedia({ media: 'screen' });
        await importState(page, state);
        await expect(page.locator('.ja-document-ending')).toBeHidden();
        await page.emulateMedia({ media: 'print' });
        // Japanese UI currently fixes A4. Exercise Letter through the browser's
        // page rule, without introducing a new product paper-size setting.
        await page.locator('#activePrintPageStyle').evaluate((style, paper) => {
          style.textContent = `@page { margin: 14mm 15mm; size: ${paper === 'A4' ? 'A4' : 'Letter'} portrait; }`;
        }, paper);
        const name = `${documentType}-${paper}-${length}`;
        const pdfPath = testInfo.outputPath(`${name}.pdf`);
        const buffer = await page.pdf({ path: pdfPath, preferCSSPageSize: true, printBackground: true });
        const pages = await inspectPdf(buffer);
        assertEnding(pages);
        const lastText = pages.at(-1).items.map((item) => item.str).join('');
        expect(lastText).toContain(endMarker);
        expect(pages[0].size.width).toBeCloseTo(paper === 'A4' ? 595.28 : 612, 0);
        evidence.push({ name, pages: pages.length, pdfPath });
      }
    }
  }
  writeEvidence(page, testInfo, evidence, 'fictional PDF pagination fixtures; trailing whitespace; standard cases have manual section breaks; Letter is a browser page-rule override');
});

test('日本語PDF: 空の末尾項目・未記入section・予約空白行を本文末尾と混同しない', async ({ page }, testInfo) => {
  await openLocale(page, 'ja');
  const evidence = [];
  for (const tail of ['detail', 'long-label', 'role', 'companyInfo', 'company', 'skills', 'summary', 'identity', 'identity-links']) {
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
    await page.emulateMedia({ media: 'screen' });
    await importState(page, state);
    await page.emulateMedia({ media: 'print' });
    await page.addStyleTag({ content: '.career-company-grid { min-height: 300px; }' });
    const pdfPath = testInfo.outputPath(`empty-tail-${tail}.pdf`);
    const pages = await inspectPdf(await page.pdf({ path: pdfPath, preferCSSPageSize: true, printBackground: true }));
    assertEnding(pages);
    expect(pages).toHaveLength(1);
    expect(pages.flatMap((page) => page.items).map((item) => item.str).join('')).not.toContain('自己PRを入力');
    evidence.push({ tail, pages: pages.length, pdfPath });
  }
  writeEvidence(page, testInfo, evidence, 'fictional empty records and detail sections, trailing empty sections, list ending, long label, role whitespace; a 300px grid reservation is injected only in this test');
});

test('日本語PDF: ページ境界で本文と結びを一緒に送り、結びだけの追加ページを作らない', async ({ page }) => {
  await openLocale(page, 'ja');
  for (const documentType of ['resume', 'career']) {
    const state = createDefaultState('ja');
    state.documents.ja.activeDocument = documentType;
    const field = documentType === 'resume' ? 'requests' : 'selfPromotion';
    for (const lines of [28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40]) {
      state.documents.ja.fields[field] = Array.from({ length: lines }, (_, index) => `架空の境界検証行 ${index + 1}`).join('\n');
      await page.emulateMedia({ media: 'screen' });
      await importState(page, state);
      await page.emulateMedia({ media: 'print' });
      assertEnding(await inspectPdf(await page.pdf({ preferCSSPageSize: true })));
    }
  }
});

test('中文・English PDF には日本語の結びを追加しない', async ({ page }) => {
  for (const locale of ['zh-CN', 'en']) {
    await page.emulateMedia({ media: 'screen' });
    await openLocale(page, locale);
    await page.locator(locale === 'en' ? '[data-en-load-sample]' : '[data-zh-action="sample"]').click();
    const pages = await inspectPdf(await page.pdf({ preferCSSPageSize: true }));
    expect(pages.flatMap((page) => page.items).some((item) => item.str === '以上')).toBe(false);
  }
});
