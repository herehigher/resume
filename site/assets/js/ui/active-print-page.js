const PRINT_PAGE_STYLE_ID = 'activePrintPageStyle';

const printPageRules = Object.freeze({
  ja: Object.freeze({ pageSize: 'A4 portrait', margin: '14mm 15mm' }),
  'zh-CN': Object.freeze({ pageSize: 'A4 portrait', margin: '13mm 15mm 14mm' }),
  en: Object.freeze({
    A4: Object.freeze({ pageSize: 'A4 portrait', margin: '14mm 15mm' }),
    LETTER: Object.freeze({ pageSize: 'Letter portrait', margin: '.55in .62in' })
  })
});

export function activePrintPageRule(locale, pageSize = 'A4') {
  const localeRule = printPageRules[locale] || printPageRules.ja;
  const rule = locale === 'en' ? localeRule[pageSize === 'A4' ? 'A4' : 'LETTER'] : localeRule;
  return `@page { margin: ${rule.margin}; size: ${rule.pageSize}; }`;
}

export function setActivePrintPage(document, locale, pageSize) {
  let style = document.getElementById(PRINT_PAGE_STYLE_ID);
  if (!style) {
    style = document.createElement('style');
    style.id = PRINT_PAGE_STYLE_ID;
    style.media = 'print';
    document.head.append(style);
  }
  style.textContent = activePrintPageRule(locale, pageSize);
}
