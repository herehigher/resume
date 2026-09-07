export const PAGE_BREAK_LABELS = Object.freeze({
  ja: {
    identity: '基本情報', history: '学歴・職歴', qualifications: '免許・資格', motivation: '志望動機・自己PRなど', requests: '本人希望記入欄',
    summary: '職務要約', skills: '活かせる経験・知識・技術', 'career-history': '職務経歴', 'self-promotion': '自己PR',
    add: '追加', remove: '解除', menu: '改ページ', positions: '改ページ位置', after: 'の後'
  },
  'zh-CN': {
    identity: '基本信息', summary: '个人概述', experience: '工作经历', projects: '项目经历', education: '教育经历', skills: '专业技能', certifications: '证书与资质',
    add: '分页', remove: '取消', menu: '分页', positions: '分页位置', after: '之后'
  },
  en: {
    identity: 'Contact information', summary: 'Summary', experience: 'Experience', projects: 'Projects', education: 'Education', skills: 'Skills', certifications: 'Certifications',
    add: 'Add', remove: 'Remove', menu: 'Page breaks', positions: 'Page break positions', after: 'after'
  }
});

export const SECTION_REGISTRY = Object.freeze({
  ja: Object.freeze({
    resume: Object.freeze(['identity', 'history', 'qualifications', 'motivation', 'requests']),
    career: Object.freeze(['identity', 'summary', 'skills', 'career-history', 'self-promotion'])
  }),
  'zh-CN': Object.freeze({ resume: Object.freeze(['identity', 'summary', 'experience', 'projects', 'education', 'skills', 'certifications']) }),
  en: Object.freeze({ resume: Object.freeze(['identity', 'summary', 'experience', 'projects', 'education', 'skills', 'certifications']) })
});

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

export function isValidPageBreakKey(locale, documentType, key) {
  return SECTION_REGISTRY[locale]?.[documentType]?.slice(1).includes(key) || false;
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
      for (const [documentType, keys] of Object.entries(documents)) {
        const targets = byDocument[documentType];
        const path = `settings.pageBreaks.${locale}.${paper}.${documentType}`;
        if (!Array.isArray(targets)) { errors.push(`${path} must be an array`); continue; }
        if (targets.length > keys.length - 1) errors.push(`${path} has too many entries`);
        if (new Set(targets).size !== targets.length) errors.push(`${path} must not contain duplicates`);
        if (!targets.every((key) => typeof key === 'string' && keys.slice(1).includes(key))) errors.push(`${path} contains an unsupported section key`);
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
    const { type } = activeContext();
    const allowed = SECTION_REGISTRY[locale][type];
    return [...preview.querySelectorAll('[data-section-key]')].filter((element) => allowed.includes(element.dataset.sectionKey));
  }
  function setOpen(open) {
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
    return `${labels[previous]} ${labels.after} ${labels[target]}: ${active ? labels.remove : labels.add}`;
  }
  function render() {
    const { state, type, paper } = activeContext();
    const targets = getPageBreaks(state, locale, paper, type);
    const sections = visibleSections();
    const validTargets = sections.slice(1).map((element) => element.dataset.sectionKey);
    const active = targets.filter((key) => validTargets.includes(key));
    menu.textContent = `${labels.menu} ${active.length}`;
    panel.replaceChildren();
    const title = document.createElement('strong'); title.textContent = labels.positions; panel.append(title);
    sections.slice(1).forEach((section, index) => {
      const key = section.dataset.sectionKey;
      const previous = sections[index].dataset.sectionKey;
      const enabled = targets.includes(key);
      section.classList.toggle('has-manual-page-break', enabled);
      const control = document.createElement('button');
      control.type = 'button'; control.className = 'page-break-boundary'; control.dataset.pageBreakKey = key;
      control.setAttribute('aria-pressed', String(enabled)); control.setAttribute('aria-label', description(previous, key, enabled));
      control.innerHTML = `<span class="page-break-add"><span class="page-break-plus">${icon(enabled)}</span>${enabled ? labels.remove : labels.add}</span>`;
      control.addEventListener('click', () => toggle(key));
      section.prepend(control);
      const row = document.createElement('button');
      row.type = 'button'; row.className = 'page-break-row'; row.dataset.pageBreakKey = key;
      row.setAttribute('aria-pressed', String(enabled)); row.setAttribute('aria-label', description(previous, key, enabled));
      row.innerHTML = `<span><b>${labels[key]}</b><small>${enabled ? labels.remove : `${labels[previous]} ${labels.after}`}</small></span><span class="page-break-switch" aria-hidden="true"></span>`;
      row.addEventListener('click', () => toggle(key)); panel.append(row);
    });
    live.textContent = lastFocusKey ? `${labels[lastFocusKey]}: ${targets.includes(lastFocusKey) ? labels.remove : labels.add}` : '';
    if (lastFocusKey) {
      const focusTarget = window.matchMedia('(max-width: 820px)').matches
        ? panel.querySelector(`[data-page-break-key="${lastFocusKey}"]`)
        : preview.querySelector(`.page-break-boundary[data-page-break-key="${lastFocusKey}"]`);
      focusTarget?.focus(); lastFocusKey = null;
    }
  }
  menu.addEventListener('click', () => setOpen(panel.hidden));
  toolbar.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !panel.hidden) { setOpen(false); menu.focus(); } });
  return { render };
}
