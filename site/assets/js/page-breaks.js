import { announceStatus } from './ui/status-controller.js';

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

const RECORD_ID_PATTERN = /^record_[A-Za-z0-9_-]+(?:-[A-Za-z0-9_-]+)*$/;

function section(key, label, isVisible = () => true) {
  return Object.freeze({
    key, level: 'section', parent: null, label, isVisible,
    dom: Object.freeze({ selector: `[data-section-key="${key}"]` })
  });
}

function records(key, parent, label, selector) {
  return Object.freeze({
    key, level: 'record', parent, label, isVisible: () => true,
    dom: Object.freeze({ selector })
  });
}

function createInternationalRegistry(locale, labels, recordSelector) {
  const keys = ['identity', 'summary', 'experience', 'projects', 'education', 'skills', 'certifications'];
  const sections = keys.map((key, index) => section(key, labels[index], key === 'identity' ? () => true : (state) => {
    const resume = state.documents[locale].resume;
    if (key === 'summary' || key === 'skills') return hasText(resume[key]);
    if (key === 'certifications') return hasEntry(resume.certifications, ['date', 'name', 'url']);
    return hasEntry(resume[key], key === 'projects' ? ['startDate', 'endDate', 'name', 'role', 'details', 'url'] : key === 'education' ? ['startDate', 'endDate', 'school', 'degree', 'details'] : ['startDate', 'endDate', 'company', 'role', 'details']);
  }));
  return Object.freeze([...sections, records('experience-record', 'experience', labels[2], recordSelector)]);
}

// This registry is the only place where saved semantic targets are mapped to
// template DOM. Saved values deliberately contain section keys or record IDs,
// never selectors or display indexes.
export const SEMANTIC_BOUNDARY_REGISTRY = Object.freeze({
  ja: Object.freeze({
    resume: Object.freeze([
      section('identity', '基本情報'), section('history', '学歴・職歴'), section('qualifications', '免許・資格'), section('motivation', '志望動機・自己PRなど'), section('requests', '本人希望記入欄')
    ]),
    career: Object.freeze([
      section('identity', '基本情報'), section('summary', '職務要約'), section('skills', '活かせる経験・知識・技術'), section('career-history', '職務経歴'), section('self-promotion', '自己PR'),
      records('career-record', 'career-history', '職務経歴', '[data-section-key="career-history"] .career-company[data-record-id]')
    ])
  }),
  'zh-CN': Object.freeze({ resume: createInternationalRegistry('zh-CN', ['基本信息', '个人概述', '工作经历', '项目经历', '教育经历', '专业技能', '证书与资质'], '[data-section-key="experience"] .zh-timeline-item[data-record-id]') }),
  en: Object.freeze({ resume: createInternationalRegistry('en', ['Contact information', 'Summary', 'Experience', 'Projects', 'Education', 'Skills', 'Certifications'], '[data-section-key="experience"] .en-experience-entry[data-record-id]') })
});

// Kept as a sections-only compatibility view for validation and callers.
export const SECTION_REGISTRY = Object.freeze(Object.fromEntries(Object.entries(SEMANTIC_BOUNDARY_REGISTRY).map(([locale, documents]) => [locale, Object.freeze(Object.fromEntries(Object.entries(documents).map(([type, boundaries]) => [type, Object.freeze(boundaries.filter((boundary) => boundary.level === 'section'))])))])));

function hasText(value) { return Boolean(String(value || '').trim()); }
function hasEntry(items, fields) { return items.some((item) => fields.some((field) => hasText(item[field]))); }
export function getRegisteredSections(locale, documentType) { return SECTION_REGISTRY[locale]?.[documentType] || []; }
export function getVisibleSectionKeys(state, locale, documentType) { return getRegisteredSections(locale, documentType).filter((section) => section.isVisible(state)).map((section) => section.key); }
export function getRegisteredBoundaries(locale, documentType) { return SEMANTIC_BOUNDARY_REGISTRY[locale]?.[documentType] || []; }

export function createEmptyPageBreaks() {
  return {
    ja: { A4: { resume: createEmptyBreakTargets(), career: createEmptyBreakTargets() }, LETTER: { resume: createEmptyBreakTargets(), career: createEmptyBreakTargets() } },
    'zh-CN': { A4: { resume: createEmptyBreakTargets() }, LETTER: { resume: createEmptyBreakTargets() } },
    en: { A4: { resume: createEmptyBreakTargets() }, LETTER: { resume: createEmptyBreakTargets() } }
  };
}

function createEmptyBreakTargets() { return { sections: [], records: [] }; }

export function getPageBreaks(state, locale, paper, documentType) {
  return state.settings.pageBreaks[locale][paper][documentType].sections;
}

export function getRecordPageBreaks(state, locale, paper, documentType) {
  return state.settings.pageBreaks[locale][paper][documentType].records;
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
        if (!targets || typeof targets !== 'object' || Array.isArray(targets)
          || Object.keys(targets).sort().join(',') !== 'records,sections') {
          errors.push(`${path} must contain sections and records`);
          continue;
        }
        if (!Array.isArray(targets.sections) || !Array.isArray(targets.records)) {
          errors.push(`${path}.sections and ${path}.records must be arrays`);
          continue;
        }
        if (targets.sections.length > sections.length - 1) errors.push(`${path}.sections has too many entries`);
        if (new Set(targets.sections).size !== targets.sections.length) errors.push(`${path}.sections must not contain duplicates`);
        if (!targets.sections.every((key) => isValidPageBreakKey(locale, documentType, key))) errors.push(`${path}.sections contains an unsupported section key`);
        if (new Set(targets.records).size !== targets.records.length) errors.push(`${path}.records must not contain duplicates`);
        if (!targets.records.every((id) => typeof id === 'string' && RECORD_ID_PATTERN.test(id))) errors.push(`${path}.records contains an unsupported record ID`);
      }
    }
  }
  return errors;
}

function isVisibleTarget(element) {
  if (!element || element.hidden || element.getAttribute('aria-hidden') === 'true' || !element.textContent.trim()) return false;
  if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') return true;
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function compareDocumentOrder(left, right) {
  if (left === right) return 0;
  const position = left.compareDocumentPosition(right);
  return position & 4 ? -1 : 1;
}

function recordLabel(boundary, element) {
  const title = element.querySelector('h3, strong')?.textContent.trim();
  return title ? `${boundary.label}: ${title}` : boundary.label;
}

function binding(level, key) { return Object.freeze({ level, key }); }

function savedForBinding(targets, target) {
  return targets[target.level === 'record' ? 'records' : 'sections'].includes(target.key);
}

export function getBoundaryCandidates({ state, locale, documentType, preview }) {
  const candidates = [];
  for (const boundary of getRegisteredBoundaries(locale, documentType)) {
    if (!boundary.isVisible(state)) continue;
    if (boundary.level === 'section') {
      const element = preview.querySelector(boundary.dom.selector);
      if (isVisibleTarget(element)) candidates.push({ boundary, element, label: boundary.label, bindings: [binding('section', boundary.key)] });
      continue;
    }
    const records = [...preview.querySelectorAll(boundary.dom.selector)]
      .filter((element) => RECORD_ID_PATTERN.test(element.dataset.recordId || '') && isVisibleTarget(element));
    records.forEach((element) => {
      candidates.push({ boundary, element, label: recordLabel(boundary, element), bindings: [binding('record', element.dataset.recordId)] });
    });
  }
  const normalized = new Map();
  candidates.sort((left, right) => compareDocumentOrder(left.element, right.element)).forEach((candidate) => {
    const existing = normalized.get(candidate.element);
    if (existing) {
      existing.bindings.push(...candidate.bindings);
      return;
    }
    normalized.set(candidate.element, { ...candidate, bindings: [...candidate.bindings] });
  });
  // The first visible physical node cannot create a meaningful page boundary.
  const ordered = [...normalized.values()];
  return ordered.slice(1).map((candidate, index) => {
    const primary = candidate.bindings.find((target) => target.level === 'section') || candidate.bindings[0];
    return Object.freeze({ ...candidate, previous: ordered[index], key: primary.level === 'section' ? primary.key : `record:${primary.key}` });
  });
}

function candidateIsActive(candidate, targets) {
  return candidate.bindings.some((target) => savedForBinding(targets, target));
}

function updateCandidateTargets(nextState, locale, paper, documentType, candidate, active) {
  const targets = nextState.settings.pageBreaks[locale][paper][documentType];
  for (const target of candidate.bindings) {
    const field = target.level === 'record' ? 'records' : 'sections';
    targets[field] = active
      ? [...new Set([...targets[field], target.key])]
      : targets[field].filter((key) => key !== target.key);
  }
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
  let lastFocusKey = null;

  function activeContext() {
    const state = store.getState();
    const type = getDocumentType();
    return { state, type, paper: state.settings.pageSizeByLocale[locale] };
  }
  function setOpen(open) {
    if (menu.hidden) { panel.hidden = true; menu.setAttribute('aria-expanded', 'false'); return; }
    panel.hidden = !open;
    menu.setAttribute('aria-expanded', String(open));
    if (open) panel.querySelector('button')?.focus();
  }
  function toggle(candidate) {
    const { state, type, paper } = activeContext();
    const targets = state.settings.pageBreaks[locale][paper][type];
    lastFocusKey = candidate.key;
    store.update((nextState) => { updateCandidateTargets(nextState, locale, paper, type, candidate, !candidateIsActive(candidate, targets)); }, { persist: false });
    scheduleSave();
    render();
  }
  function description(previous, target, active) {
    return describePageBreak(locale, previous, target, active);
  }
  function render() {
    const { state, type, paper } = activeContext();
    const targets = state.settings.pageBreaks[locale][paper][type];
    preview.querySelectorAll('.page-break-boundary').forEach((control) => { control.remove(); });
    preview.querySelectorAll('.has-manual-page-break').forEach((target) => {
      target.classList.remove('has-manual-page-break');
      target.style.removeProperty('--page-break-paper-left-offset');
      target.style.removeProperty('--page-break-paper-right-offset');
    });
    const candidates = getBoundaryCandidates({ state, locale, documentType: type, preview });
    const active = candidates.filter((candidate) => candidateIsActive(candidate, targets));
    menu.hidden = candidates.length === 0;
    if (menu.hidden) { setOpen(false); panel.replaceChildren(); return; }
    menu.textContent = `${labels.menu} ${active.length}`;
    panel.replaceChildren();
    const title = document.createElement('strong'); title.textContent = labels.positions; panel.append(title);
    candidates.forEach((candidate) => {
      const { element } = candidate;
      const { previous } = candidate;
      const enabled = candidateIsActive(candidate, targets);
      element.classList.toggle('has-manual-page-break', enabled);
      const control = document.createElement('button');
      control.type = 'button'; control.className = `page-break-boundary${candidate.bindings.every((target) => target.level === 'record') ? ' page-break-record-boundary' : ''}`; control.dataset.pageBreakKey = candidate.key;
      control.setAttribute('aria-pressed', String(enabled)); control.setAttribute('aria-label', description(previous, candidate, enabled));
      control.innerHTML = `<span class="page-break-add"><span class="page-break-plus">${icon(enabled)}</span>${enabled ? labels.remove : labels.add}</span>`;
      control.addEventListener('click', () => toggle(candidate));
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
      row.type = 'button'; row.className = 'page-break-row'; row.dataset.pageBreakKey = candidate.key;
      row.setAttribute('aria-pressed', String(enabled)); row.setAttribute('aria-label', description(previous, candidate, enabled));
      row.innerHTML = `<span><b>${candidate.label}</b><small>${enabled ? labels.remove : `${previous.label} ${labels.after}`}</small></span><span class="page-break-switch" aria-hidden="true"></span>`;
      row.addEventListener('click', () => toggle(candidate)); panel.append(row);
    });
    if (lastFocusKey) {
      const target = candidates.find((candidate) => candidate.key === lastFocusKey);
      const enabled = target && candidateIsActive(target, state.settings.pageBreaks[locale][paper][type]);
      if (target && locale === 'ja') announceStatus(`${target.label}の前に改ページを${enabled ? '追加しました' : '解除しました'}`);
      else if (target && locale === 'zh-CN') announceStatus(`${target.label}之前的分页已${enabled ? '添加' : '取消'}`);
      else if (target) announceStatus(`Page break ${enabled ? 'added' : 'removed'} before ${target.label}`);
    }
    if (lastFocusKey) {
      const findControl = (container) => [...container.querySelectorAll('[data-page-break-key]')].find((control) => control.dataset.pageBreakKey === lastFocusKey);
      const focusTarget = window.matchMedia('(max-width: 820px)').matches ? findControl(panel) : findControl(preview);
      focusTarget?.focus({ preventScroll: true }); lastFocusKey = null;
    }
  }
  menu.addEventListener('click', () => setOpen(panel.hidden));
  toolbar.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !panel.hidden) { setOpen(false); menu.focus(); } });
  toolbar.addEventListener('focusout', (event) => {
    if (!panel.hidden && event.relatedTarget instanceof Node && !toolbar.contains(event.relatedTarget)) setOpen(false);
  });
  document.addEventListener('pointerdown', (event) => {
    if (!panel.hidden && !toolbar.contains(event.target)) setOpen(false);
  }, true);
  return { render };
}
