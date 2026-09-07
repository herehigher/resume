export const PAGE_BREAK_LABELS = Object.freeze({
  ja: {
    add: '改頁', remove: '解除', menu: '改頁', positions: '改頁位置', after: 'の後'
  },
  'zh-CN': {
    add: '分页', remove: '取消', menu: '分页', positions: '分页位置', after: '之后'
  },
  en: {
    add: 'Add', remove: 'Remove', menu: 'Page breaks', positions: 'Page break positions', after: 'after'
  }
});

export const PAGE_BREAK_PREVIEW_GUTTER = 112;

export const SECTION_REGISTRY = Object.freeze({
  ja: Object.freeze({
    resume: Object.freeze([
      { key: 'identity', label: '基本情報', isVisible: () => true }, { key: 'history', label: '学歴・職歴', isVisible: () => true }, { key: 'qualifications', label: '免許・資格', isVisible: () => true }, { key: 'motivation', label: '志望動機・自己PRなど', isVisible: () => true }, { key: 'requests', label: '本人希望記入欄', isVisible: () => true }
    ]),
    career: Object.freeze([
      { key: 'identity', label: '基本情報', isVisible: () => true }, { key: 'summary', label: '職務要約', isVisible: () => true }, { key: 'skills', label: '活かせる経験・知識・技術', isVisible: () => true }, { key: 'career-history', label: '職務経歴', isVisible: () => true }, { key: 'self-promotion', label: '自己PR', isVisible: () => true }
    ])
  }),
  'zh-CN': Object.freeze({ resume: createInternationalRegistry('zh-CN', ['基本信息', '个人概述', '工作经历', '项目经历', '教育经历', '专业技能', '证书与资质']) }),
  en: Object.freeze({ resume: createInternationalRegistry('en', ['Contact information', 'Summary', 'Experience', 'Projects', 'Education', 'Skills', 'Certifications']) })
});

function hasText(value) { return Boolean(String(value || '').trim()); }
function hasEntry(items, fields) { return items.some((item) => fields.some((field) => hasText(item[field]))); }
function createInternationalRegistry(locale, labels) {
  const keys = ['identity', 'summary', 'experience', 'projects', 'education', 'skills', 'certifications'];
  return Object.freeze(keys.map((key, index) => Object.freeze({
    key, label: labels[index],
    isVisible: key === 'identity' ? () => true : (state) => {
      const resume = state.documents[locale].resume;
      if (key === 'summary' || key === 'skills') return hasText(resume[key]);
      if (key === 'certifications') return hasEntry(resume.certifications, ['date', 'name', 'url']);
      return hasEntry(resume[key], key === 'projects' ? ['startDate', 'endDate', 'name', 'role', 'details', 'url'] : key === 'education' ? ['startDate', 'endDate', 'school', 'degree', 'details'] : ['startDate', 'endDate', 'company', 'role', 'details']);
    }
  })));
}

export function getRegisteredSections(locale, documentType) { return SECTION_REGISTRY[locale]?.[documentType] || []; }
export function getVisibleSectionKeys(state, locale, documentType) { return getRegisteredSections(locale, documentType).filter((section) => section.isVisible(state)).map((section) => section.key); }

export function createEmptyPageBreaks() {
  return {
    ja: { A4: { resume: [], career: [] }, LETTER: { resume: [], career: [] } },
    'zh-CN': { A4: { resume: [] }, LETTER: { resume: [] } },
    en: { A4: { resume: [] }, LETTER: { resume: [] } }
  };
}

export function getPageBreaks(state, locale, paper, documentType) {
  return state.settings.pageBreaks[locale][paper][documentType];
}

export function describePageBreak(locale, previous, target, active) {
  if (locale === 'ja') return `${previous.label}の後、${target.label}の前に改ページを${active ? '解除' : '追加'}`;
  if (locale === 'zh-CN') return `${previous.label}之后、${target.label}之前${active ? '取消分页' : '添加分页'}`;
  return `${active ? 'Remove' : 'Add'} page break between ${previous.label} and ${target.label}`;
}

export function isValidPageBreakKey(locale, documentType, key) {
  return getRegisteredSections(locale, documentType).slice(1).some((section) => section.key === key);
}

export function validatePageBreaks(value) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['settings.pageBreaks must be an object'];
  if (Object.keys(value).some((locale) => !(locale in SECTION_REGISTRY))) errors.push('settings.pageBreaks contains an unsupported locale');
  for (const [locale, documents] of Object.entries(SECTION_REGISTRY)) {
    if (Object.keys(value[locale] || {}).some((paper) => !['A4', 'LETTER'].includes(paper))) errors.push(`settings.pageBreaks.${locale} contains an unsupported paper size`);
    for (const paper of ['A4', 'LETTER']) {
      const byDocument = value[locale]?.[paper];
      if (!byDocument || typeof byDocument !== 'object' || Array.isArray(byDocument)) {
        errors.push(`settings.pageBreaks.${locale}.${paper} must be an object`);
        continue;
      }
      if (Object.keys(byDocument).some((documentType) => !(documentType in documents))) errors.push(`settings.pageBreaks.${locale}.${paper} contains an unsupported document type`);
      for (const [documentType, sections] of Object.entries(documents)) {
        const targets = byDocument[documentType];
        const path = `settings.pageBreaks.${locale}.${paper}.${documentType}`;
        if (!Array.isArray(targets)) { errors.push(`${path} must be an array`); continue; }
        if (targets.length > sections.length - 1) errors.push(`${path} has too many entries`);
        if (new Set(targets).size !== targets.length) errors.push(`${path} must not contain duplicates`);
        if (!targets.every((key) => isValidPageBreakKey(locale, documentType, key))) errors.push(`${path} contains an unsupported section key`);
      }
    }
  }
  return errors;
}

function icon(active = false) { return `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M${active ? '3 8h10' : '8 3v10M3 8h10'}"/></svg>`; }

export function initPageBreakControls({ store, locale, preview, toolbar, getDocumentType, scheduleSave }) {
  const labels = PAGE_BREAK_LABELS[locale];
  const panelId = `page-break-panel-${locale}`;
  const menu = document.createElement('button');
  menu.type = 'button';
  menu.className = 'page-break-menu';
  menu.setAttribute('aria-expanded', 'false');
  menu.setAttribute('aria-controls', panelId);
  toolbar.append(menu);
  const panel = document.createElement('div');
  panel.id = panelId;
  panel.className = 'page-break-panel';
  panel.hidden = true;
  toolbar.append(panel);
  const live = document.createElement('p');
  live.className = 'page-break-live';
  live.setAttribute('aria-live', 'polite');
  toolbar.append(live);
  let lastFocusKey = null;

  function activeContext() {
    const state = store.getState();
    const type = getDocumentType();
    return { state, type, paper: state.settings.pageSizeByLocale[locale] };
  }
  function visibleSections() {
    const { state, type } = activeContext();
    const elements = new Map([...preview.querySelectorAll('[data-section-key]')].map((element) => [element.dataset.sectionKey, element]));
    return getVisibleSectionKeys(state, locale, type).map((key) => ({
      section: getRegisteredSections(locale, type).find((item) => item.key === key), element: elements.get(key)
    })).filter((item) => item.element);
  }
  function setOpen(open) {
    if (menu.hidden) { panel.hidden = true; menu.setAttribute('aria-expanded', 'false'); return; }
    panel.hidden = !open;
    menu.setAttribute('aria-expanded', String(open));
    if (open) panel.querySelector('button')?.focus();
  }
  function toggle(key) {
    const { state, type, paper } = activeContext();
    if (!isValidPageBreakKey(locale, type, key)) return;
    const targets = getPageBreaks(state, locale, paper, type);
    const next = targets.includes(key) ? targets.filter((target) => target !== key) : [...targets, key];
    lastFocusKey = key;
    store.update((nextState) => { nextState.settings.pageBreaks[locale][paper][type] = next; }, { persist: false });
    scheduleSave();
    render();
  }
  function description(previous, target, active) {
    return describePageBreak(locale, previous, target, active);
  }
  function render() {
    const { state, type, paper } = activeContext();
    const targets = getPageBreaks(state, locale, paper, type);
    const sections = visibleSections();
    const validTargets = sections.slice(1).map((item) => item.section.key);
    const active = targets.filter((key) => validTargets.includes(key));
    preview.querySelectorAll('.page-break-boundary').forEach((control) => { control.remove(); });
    preview.querySelectorAll('[data-section-key]').forEach((section) => {
      section.classList.remove('has-manual-page-break');
      section.style.removeProperty('--page-break-paper-left-offset');
      section.style.removeProperty('--page-break-paper-right-offset');
    });
    menu.hidden = validTargets.length === 0;
    if (menu.hidden) { setOpen(false); panel.replaceChildren(); live.textContent = ''; return; }
    menu.textContent = `${labels.menu} ${active.length}`;
    panel.replaceChildren();
    const title = document.createElement('strong'); title.textContent = labels.positions; panel.append(title);
    sections.slice(1).forEach(({ section, element }, index) => {
      const key = section.key;
      const previous = sections[index].section;
      const enabled = targets.includes(key);
      element.classList.toggle('has-manual-page-break', enabled);
      const control = document.createElement('button');
      control.type = 'button'; control.className = 'page-break-boundary'; control.dataset.pageBreakKey = key;
      control.setAttribute('aria-pressed', String(enabled)); control.setAttribute('aria-label', description(previous, section, enabled));
      control.innerHTML = `<span class="page-break-add"><span class="page-break-plus">${icon(enabled)}</span>${enabled ? labels.remove : labels.add}</span>`;
      control.addEventListener('click', () => toggle(key));
      element.prepend(control);
      const documentPage = element.closest('.document-page');
      const pageRect = documentPage?.getBoundingClientRect();
      const sectionRect = element.getBoundingClientRect();
      const scale = pageRect && documentPage.offsetWidth ? pageRect.width / documentPage.offsetWidth : 1;
      const leftOffset = pageRect && scale ? Math.max(0, (sectionRect.left - pageRect.left) / scale) : 0;
      const rightOffset = pageRect && scale ? Math.max(0, (pageRect.right - sectionRect.right) / scale) : 0;
      element.style.setProperty('--page-break-paper-left-offset', `${leftOffset}px`);
      element.style.setProperty('--page-break-paper-right-offset', `${rightOffset}px`);
      const row = document.createElement('button');
      row.type = 'button'; row.className = 'page-break-row'; row.dataset.pageBreakKey = key;
      row.setAttribute('aria-pressed', String(enabled)); row.setAttribute('aria-label', description(previous, section, enabled));
      row.innerHTML = `<span><b>${section.label}</b><small>${enabled ? labels.remove : `${previous.label} ${labels.after}`}</small></span><span class="page-break-switch" aria-hidden="true"></span>`;
      row.addEventListener('click', () => toggle(key)); panel.append(row);
    });
    if (lastFocusKey) {
      const target = getRegisteredSections(locale, type).find((section) => section.key === lastFocusKey);
      if (locale === 'ja') live.textContent = `${target.label}の前に改ページを${targets.includes(lastFocusKey) ? '追加しました' : '解除しました'}`;
      else if (locale === 'zh-CN') live.textContent = `${target.label}之前的分页已${targets.includes(lastFocusKey) ? '添加' : '取消'}`;
      else live.textContent = `Page break ${targets.includes(lastFocusKey) ? 'added' : 'removed'} before ${target.label}`;
    }
    if (lastFocusKey) {
      const focusTarget = window.matchMedia('(max-width: 820px)').matches
        ? panel.querySelector(`[data-page-break-key="${lastFocusKey}"]`)
        : preview.querySelector(`.page-break-boundary[data-page-break-key="${lastFocusKey}"]`);
      focusTarget?.focus({ preventScroll: true }); lastFocusKey = null;
    }
  }
  menu.addEventListener('click', () => setOpen(panel.hidden));
  toolbar.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !panel.hidden) { setOpen(false); menu.focus(); } });
  toolbar.addEventListener('focusout', () => {
    window.queueMicrotask(() => {
      if (!panel.hidden && !toolbar.contains(document.activeElement)) setOpen(false);
    });
  });
  document.addEventListener('pointerdown', (event) => {
    if (!panel.hidden && !toolbar.contains(event.target)) setOpen(false);
  });
  return { render };
}
