import { announceStatus } from './ui/status-controller.js';

export const PAGE_BREAK_LABELS = Object.freeze({
  ja: {
    add: '改頁', remove: '解除', menu: '改ページ位置', positions: '改ページ位置', after: 'の後',
    edit: '改ページを編集', editing: '改ページ編集中', undo: '元に戻す', allPositions: 'すべての改ページ位置',
    rail: '改ページ位置の候補', set: '設定済み', unset: '未設定',
    added: 'PDF 出力時に新しい page から開始します。', removed: 'PDF 出力時の改ページを解除しました。'
  },
  'zh-CN': {
    add: '分页', remove: '取消', menu: '分页位置', positions: '分页位置', after: '之后',
    edit: '编辑分页', editing: '正在编辑分页', undo: '撤销', allPositions: '所有分页位置',
    rail: '分页位置候选', set: '已设置', unset: '未设置',
    added: '导出 PDF 时将从新页面开始。', removed: '已取消 PDF 导出时的分页。'
  },
  en: {
    add: 'Add', remove: 'Remove', menu: 'Page break positions', positions: 'Page break positions', after: 'after',
    edit: 'Edit page breaks', editing: 'Editing page breaks', undo: 'Undo', allPositions: 'All page break positions',
    rail: 'Page break position candidates', set: 'Set', unset: 'Not set',
    added: 'The PDF will start this content on a new page.', removed: 'The PDF page break has been removed.'
  }
});

// The boundary markers occupy a small, paper-exterior gutter. They never take
// part in the document's layout or printable geometry.
export const PAGE_BREAK_PREVIEW_GUTTER = 96;

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

export function describePageBreakCandidate(locale, position, total, target, active) {
  const status = PAGE_BREAK_LABELS[locale].set;
  const unset = PAGE_BREAK_LABELS[locale].unset;
  if (locale === 'ja') return `位置 ${position} / ${total}、${target.label}の前、${active ? status : unset}`;
  if (locale === 'zh-CN') return `位置 ${position} / ${total}、${target.label}之前、${active ? status : unset}`;
  return `Position ${position} of ${total}, before ${target.label}, ${active ? status : unset}`;
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
  // A section boundary and its first child record identify the same physical
  // place. Keep one section-level candidate there, while retaining the record
  // binding solely so an existing saved record break remains removable.
  const ordered = [];
  let physicalPrevious = null;
  [...normalized.values()].forEach((candidate) => {
    const previous = ordered.at(-1);
    const isFirstRecordAfterParent = candidate.bindings.every((target) => target.level === 'record')
      && candidate.boundary.parent
      && physicalPrevious?.bindings.some((target) => target.level === 'section' && target.key === candidate.boundary.parent);
    if (isFirstRecordAfterParent) {
      previous.bindings.push(...candidate.bindings);
      previous.hasRedundantFirstRecordBinding = true;
      physicalPrevious = candidate;
      return;
    }
    ordered.push({ ...candidate, visualPrevious: physicalPrevious });
    physicalPrevious = candidate;
  });
  // The first visible physical node cannot create a meaningful page boundary.
  return ordered.slice(1).map((candidate, index) => {
    const primary = candidate.bindings.find((target) => target.level === 'section') || candidate.bindings[0];
    return Object.freeze({
      ...candidate,
      previous: ordered[index],
      visualPrevious: candidate.visualPrevious || ordered[index],
      key: primary.level === 'section' ? primary.key : `record:${primary.key}`
    });
  });
}

function candidateIsActive(candidate, targets) {
  return candidate.bindings.some((target) => savedForBinding(targets, target));
}

function updateCandidateTargets(nextState, locale, paper, documentType, candidate, active) {
  const targets = nextState.settings.pageBreaks[locale][paper][documentType];
  const bindings = active && candidate.hasRedundantFirstRecordBinding
    ? candidate.bindings.filter((target) => target.level === 'section')
    : candidate.bindings;
  for (const target of bindings) {
    const field = target.level === 'record' ? 'records' : 'sections';
    targets[field] = active
      ? [...new Set([...targets[field], target.key])]
      : targets[field].filter((key) => key !== target.key);
  }
}

function icon(active = false) { return `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M${active ? '3 8h10' : '8 3v10M3 8h10'}"/></svg>`; }

function iconBadge(className, active) {
  const badge = document.createElement('span');
  badge.className = className;
  // This SVG is an application-owned constant. User-provided labels are always
  // assigned through textContent below.
  badge.innerHTML = icon(active);
  return badge;
}

export function initPageBreakControls({ store, locale, preview, toolbar, getDocumentType, scheduleSave }) {
  const labels = PAGE_BREAK_LABELS[locale];
  const panelId = `page-break-panel-${locale}`;
  const menu = document.createElement('button');
  menu.type = 'button';
  menu.className = 'page-break-menu';
  menu.dataset.pageBreakModeToggle = '';
  toolbar.append(menu);
  const allPositions = document.createElement('button');
  allPositions.type = 'button';
  allPositions.className = 'page-break-all-positions';
  allPositions.hidden = true;
  const feedback = document.createElement('div');
  feedback.className = 'page-break-feedback';
  feedback.hidden = true;
  feedback.setAttribute('role', 'status');
  document.body.append(feedback);
  const panel = document.createElement('div');
  panel.id = panelId;
  panel.className = 'page-break-panel';
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', labels.allPositions);
  panel.hidden = true;
  toolbar.append(panel);
  const overlay = document.createElement('div');
  overlay.id = `page-break-overlay-${locale}`;
  overlay.className = 'page-break-overlay';
  overlay.setAttribute('aria-label', labels.rail);
  overlay.setAttribute('role', 'region');
  document.body.append(overlay);
  let modeOpen = false;
  let feedbackTimer = null;
  let geometryFrame = null;
  let lastFocusKey = null;
  let rovingFocusKey = null;
  let renderedCandidates = [];
  let allPositionsOpen = false;

  function isDesktop() { return !window.matchMedia('(max-width: 820px)').matches; }
  function isSurfaceVisible() { return preview.getClientRects().length > 0 && !preview.closest('[hidden]'); }
  function description(candidate, index) {
    return describePageBreakCandidate(locale, index + 1, renderedCandidates.length, candidate, candidate.active);
  }
  function shortDescription(active) {
    if (locale === 'ja') return active ? '改ページを解除' : 'ここで改ページ';
    if (locale === 'zh-CN') return active ? '取消分页' : '在此分页';
    return active ? 'Remove page break' : 'Start a new page here';
  }
  function createBoundary(candidate, interactive, index) {
    const boundary = document.createElement('div');
    boundary.className = `page-break-visual-boundary${candidate.active ? ' is-set' : ''}`;
    boundary.dataset.pageBreakKey = candidate.key;
    const line = document.createElement('span');
    line.className = 'page-break-boundary-line';
    line.setAttribute('aria-hidden', 'true');
    boundary.append(line);
    if (!interactive) {
      const marker = document.createElement('span');
      marker.className = 'page-break-passive-marker';
      marker.dataset.pageBreakKey = candidate.key;
      marker.setAttribute('aria-hidden', 'true');
      marker.textContent = '−';
      boundary.append(marker);
      return boundary;
    }
    const control = document.createElement('button');
    control.className = `page-break-boundary${candidate.isRecord ? ' page-break-record-boundary' : ''}`;
    control.dataset.pageBreakKey = candidate.key;
    control.type = 'button';
    control.tabIndex = candidate.key === rovingFocusKey || (!rovingFocusKey && index === 0) ? 0 : -1;
    control.setAttribute('aria-posinset', String(index + 1));
    control.setAttribute('aria-setsize', String(renderedCandidates.length));
    control.setAttribute('aria-pressed', String(candidate.active));
    control.setAttribute('aria-label', description(candidate, index));
    const sign = iconBadge('page-break-sign', candidate.active);
    sign.setAttribute('aria-hidden', 'true');
    const tooltip = document.createElement('span');
    tooltip.className = 'page-break-tooltip';
    tooltip.id = `page-break-tooltip-${locale}-${candidate.key.replace(/[^A-Za-z0-9_-]/g, '-')}`;
    tooltip.setAttribute('aria-hidden', 'true');
    tooltip.textContent = shortDescription(candidate.active);
    control.append(sign, tooltip);
    control.addEventListener('click', () => toggle(candidate));
    control.addEventListener('keydown', (event) => handleRovingKey(event, index, overlay));
    control.addEventListener('pointerenter', () => setHighlight(candidate, true));
    control.addEventListener('pointerleave', () => setHighlight(candidate, false));
    control.addEventListener('focus', () => { rovingFocusKey = candidate.key; setHighlight(candidate, true); });
    control.addEventListener('blur', () => setHighlight(candidate, false));
    candidate.element.addEventListener('pointerenter', () => setHighlight(candidate, true));
    candidate.element.addEventListener('pointerleave', () => setHighlight(candidate, false));
    boundary.append(control);
    return boundary;
  }
  function updateMenuControls() {
    const count = renderedCandidates.length;
    menu.setAttribute('aria-controls', isDesktop() ? overlay.id : panelId);
    if (locale === 'ja') menu.setAttribute('aria-label', `${labels.edit}、${count}件の候補`);
    else if (locale === 'zh-CN') menu.setAttribute('aria-label', `${labels.edit}，${count}个候选位置`);
    else menu.setAttribute('aria-label', `${labels.edit}, ${count} candidates`);
  }
  function activeContext() {
    const state = store.getState();
    const type = getDocumentType();
    return { state, type, paper: state.settings.pageSizeByLocale[locale] };
  }
  function setMode(open, { focusFirst = false } = {}) {
    modeOpen = open;
    if (!open) allPositionsOpen = false;
    menu.setAttribute('aria-pressed', String(open));
    menu.setAttribute('aria-expanded', String(open));
    menu.textContent = open ? labels.editing : labels.edit;
    updateMenuControls();
    if (!isDesktop()) {
      panel.hidden = !open;
      renderPanel(renderedCandidates);
      if (open && focusFirst) panel.querySelector('button')?.focus();
    } else {
      panel.hidden = true;
      allPositions.hidden = !open;
      allPositions.setAttribute('aria-expanded', 'false');
      renderOverlay();
      renderPanel(renderedCandidates);
      if (open && focusFirst) overlay.querySelector('button')?.focus({ preventScroll: true });
    }
  }
  function setMobilePanel(open) {
    modeOpen = open;
    panel.hidden = !open;
    menu.textContent = open ? labels.editing : labels.edit;
    menu.setAttribute('aria-pressed', String(open));
    menu.setAttribute('aria-expanded', String(open));
    if (open) panel.querySelector('button')?.focus();
  }
  function closeSurface() {
    modeOpen = false;
    allPositionsOpen = false;
    overlay.hidden = true;
    panel.hidden = true;
    menu.setAttribute('aria-pressed', 'false');
    menu.setAttribute('aria-expanded', 'false');
    menu.textContent = labels.edit;
    allPositions.hidden = true;
    allPositions.setAttribute('aria-expanded', 'false');
    clearFeedback();
  }
  function clearFeedback() {
    window.clearTimeout(feedbackTimer);
    feedback.replaceChildren();
    feedback.hidden = true;
  }
  function showFeedback(message, undo, announcement = message) {
    clearFeedback();
    const text = document.createElement('span'); text.textContent = message;
    const undoButton = document.createElement('button');
    undoButton.type = 'button'; undoButton.className = 'page-break-undo'; undoButton.textContent = labels.undo;
    undoButton.addEventListener('click', () => { undo(); clearFeedback(); });
    feedback.append(text, undoButton); feedback.hidden = false;
    announceStatus(announcement);
    feedbackTimer = window.setTimeout(clearFeedback, 6000);
  }
  function toggle(candidate, { announce = true } = {}) {
    const { state, type, paper } = activeContext();
    const targets = state.settings.pageBreaks[locale][paper][type];
    const wasActive = candidateIsActive(candidate, targets);
    const undoContext = Object.freeze({ paper, type });
    lastFocusKey = candidate.key;
    store.update((nextState) => { updateCandidateTargets(nextState, locale, paper, type, candidate, !wasActive); }, { persist: false });
    scheduleSave();
    render();
    if (announce) showFeedback(wasActive ? labels.removed : labels.added, () => {
      store.update((nextState) => { updateCandidateTargets(nextState, locale, undoContext.paper, undoContext.type, candidate, wasActive); }, { persist: false });
      scheduleSave(); render();
    }, describePageBreakCandidate(locale, renderedCandidates.findIndex((item) => item.key === candidate.key) + 1, renderedCandidates.length, candidate, !wasActive));
  }
  function setHighlight(candidate, active) {
    candidate.element.classList.toggle('page-break-target-highlight', active);
    overlay.querySelector(`[data-page-break-key="${candidate.key}"]`)?.classList.toggle('is-target-highlighted', active);
  }
  function normalizeRovingFocus() {
    if (!renderedCandidates.some((candidate) => candidate.key === rovingFocusKey)) {
      rovingFocusKey = renderedCandidates[0]?.key || null;
    }
  }
  function rovingControls(surface) {
    return [...surface.querySelectorAll('[data-page-break-key]')].filter((control) => control instanceof HTMLButtonElement);
  }
  function focusRoving(surface, index) {
    const controls = rovingControls(surface);
    if (!controls.length) return;
    const next = controls[(index + controls.length) % controls.length];
    controls.forEach((control) => { control.tabIndex = control === next ? 0 : -1; });
    rovingFocusKey = next.dataset.pageBreakKey;
    next.focus({ preventScroll: true });
  }
  function handleRovingKey(event, index, surface) {
    const keys = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
    if (event.key in keys) {
      event.preventDefault();
      focusRoving(surface, index + keys[event.key]);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusRoving(surface, 0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusRoving(surface, -1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      if (surface === overlay) setMode(false);
      else setMobilePanel(false);
      menu.focus();
    }
  }
  function renderOverlay() {
    overlay.replaceChildren();
    if (!isDesktop() || !isSurfaceVisible()) { overlay.hidden = true; return; }
    const shown = modeOpen ? renderedCandidates : renderedCandidates.filter((candidate) => candidate.active);
    overlay.hidden = shown.length === 0;
    overlay.setAttribute('aria-hidden', String(!modeOpen));
    overlay.classList.toggle('is-editing', modeOpen);
    const rail = document.createElement('div');
    rail.className = 'page-break-rail';
    rail.setAttribute('role', 'toolbar');
    rail.setAttribute('aria-label', labels.rail);
    shown.forEach((candidate, index) => { rail.append(createBoundary(candidate, modeOpen, index)); });
    overlay.append(rail);
    if (modeOpen) overlay.append(allPositions);
    positionOverlay();
  }
  function positionOverlay() {
    if (overlay.hidden) return;
    const visible = modeOpen ? renderedCandidates : renderedCandidates.filter((candidate) => candidate.active);
    const laneEnds = [];
    const positions = [];
    visible.forEach((candidate) => {
      const boundary = overlay.querySelector(`.page-break-visual-boundary[data-page-break-key="${candidate.key}"]`);
      const page = candidate.element.closest('.document-page');
      if (!boundary || !page) return;
      const pageBox = page.getBoundingClientRect();
      const targetBox = candidate.element.getBoundingClientRect();
      const previousBox = candidate.visualPrevious.element.getBoundingClientRect();
      // The semantic boundary is before the next element, but its visual line
      // belongs in the gap just after the previous one. Keep a four-pixel
      // clearance from the next element's focus/highlight outline without
      // changing document layout.
      const boundaryTop = Math.min(previousBox.bottom + 4, (previousBox.bottom + targetBox.top) / 2, targetBox.top - 4);
      let lane = 0;
      while (laneEnds[lane] !== undefined && targetBox.top - laneEnds[lane] < 30) lane += 1;
      laneEnds[lane] = targetBox.top;
      const markerWidth = 30;
      const desiredMarkerLeft = pageBox.width + 5 + (lane * 32);
      // In a narrow viewport the control centre must remain reachable even
      // when the paper itself extends beyond the right edge. The 8px tail of
      // the transparent hit target may sit outside the viewport; the 16px
      // visual marker stays visible and reaches no further than 15px over the
      // visible paper edge.
      const visibleMarkerLeft = Math.max(0, window.innerWidth - pageBox.left - (markerWidth - 8));
      const markerLeft = Math.min(desiredMarkerLeft, visibleMarkerLeft);
      boundary.style.left = `${pageBox.left}px`;
      boundary.style.top = `${boundaryTop}px`;
      boundary.style.width = `${pageBox.width}px`;
      boundary.style.setProperty('--page-break-marker-lane', String(lane));
      boundary.style.setProperty('--page-break-marker-left', `${markerLeft}px`);
      boundary.classList.toggle('is-viewport-clamped', markerLeft < desiredMarkerLeft);
      positions.push({ boundary, markerLeft, targetBox: { ...targetBox, top: boundaryTop } });
    });
    // Lanes are horizontally distinct until the viewport clamp brings them
    // together. Split only their invisible hit rectangles at the midpoint
    // between neighbouring markers. Their lines and visible signs retain the
    // exact semantic boundary y position, while no overlap can steal a click.
    positions.forEach((position) => {
      const overlapping = positions.filter((other) => other !== position
        && Math.abs(other.markerLeft - position.markerLeft) < 30
        && Math.abs(other.targetBox.top - position.targetBox.top) < 30);
      const before = overlapping.filter((other) => other.targetBox.top < position.targetBox.top)
        .sort((left, right) => right.targetBox.top - left.targetBox.top)[0];
      const after = overlapping.filter((other) => other.targetBox.top > position.targetBox.top)
        .sort((left, right) => left.targetBox.top - right.targetBox.top)[0];
      const buttonTop = position.targetBox.top - 15;
      const topInset = before ? Math.max(0, ((before.targetBox.top + position.targetBox.top) / 2) - buttonTop) : 0;
      const bottomInset = after ? Math.max(0, (buttonTop + 30) - ((after.targetBox.top + position.targetBox.top) / 2)) : 0;
      position.boundary.style.setProperty('--page-break-hit-top', `${topInset}px`);
      position.boundary.style.setProperty('--page-break-hit-bottom', `${bottomInset}px`);
      position.boundary.classList.toggle('is-marker-crowded', topInset > 0 || bottomInset > 0);
    });
    const clusters = [];
    positions.sort((left, right) => left.targetBox.top - right.targetBox.top).forEach((position) => {
      const previous = clusters.at(-1);
      if (previous && position.targetBox.top - previous.last.targetBox.top < 44) previous.items.push(position);
      else clusters.push({ items: [position], last: position });
    });
    clusters.filter((cluster) => cluster.items.length > 1).forEach((cluster) => {
      const first = cluster.items[0];
      const badge = document.createElement('span');
      badge.className = 'page-break-cluster';
      badge.dataset.pageBreakClusterCount = String(cluster.items.length);
      badge.setAttribute('aria-hidden', 'true');
      badge.textContent = String(cluster.items.length);
      badge.style.left = `${first.markerLeft + 19}px`;
      badge.style.top = '-21px';
      first.boundary.append(badge);
      cluster.items.forEach((item) => { item.boundary.classList.add('is-marker-clustered'); });
    });
  }
  function renderPanel(candidates) {
    panel.replaceChildren();
    if (!modeOpen || !isSurfaceVisible() || (isDesktop() && !allPositionsOpen)) {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    const title = document.createElement('strong'); title.textContent = labels.allPositions; panel.append(title);
    candidates.forEach((candidate, index) => {
      const row = document.createElement('button');
      row.type = 'button'; row.className = 'page-break-row'; row.dataset.pageBreakKey = candidate.key;
      row.tabIndex = candidate.key === rovingFocusKey || (!rovingFocusKey && index === 0) ? 0 : -1;
      row.setAttribute('aria-posinset', String(index + 1)); row.setAttribute('aria-setsize', String(candidates.length));
      row.setAttribute('aria-pressed', String(candidate.active)); row.setAttribute('aria-label', description(candidate, index));
      const rowText = document.createElement('span');
      const rowLabel = document.createElement('b'); rowLabel.textContent = candidate.label;
      const rowDetail = document.createElement('small'); rowDetail.textContent = candidate.active ? labels.set : labels.unset;
      const rowSwitch = document.createElement('span'); rowSwitch.className = 'page-break-switch'; rowSwitch.setAttribute('aria-hidden', 'true');
      rowText.append(rowLabel, rowDetail); row.append(rowText, rowSwitch);
      row.addEventListener('click', () => toggle(candidate));
      row.addEventListener('keydown', (event) => handleRovingKey(event, index, panel));
      row.addEventListener('pointerenter', () => setHighlight(candidate, true));
      row.addEventListener('pointerleave', () => setHighlight(candidate, false));
      row.addEventListener('focus', () => { rovingFocusKey = candidate.key; setHighlight(candidate, true); });
      row.addEventListener('blur', () => setHighlight(candidate, false));
      panel.append(row);
    });
  }
  function render() {
    const { state, type, paper } = activeContext();
    preview.querySelectorAll('.has-manual-page-break, .page-break-target-highlight').forEach((target) => {
      target.classList.remove('has-manual-page-break', 'page-break-target-highlight');
    });
    const targets = state.settings.pageBreaks[locale][paper][type];
    renderedCandidates = getBoundaryCandidates({ state, locale, documentType: type, preview }).map((candidate) => Object.freeze({
      ...candidate, active: candidateIsActive(candidate, targets), isRecord: candidate.bindings.every((target) => target.level === 'record')
    }));
    normalizeRovingFocus();
    renderedCandidates.forEach((candidate) => {
      candidate.element.classList.toggle('has-manual-page-break', candidate.active);
    });
    menu.hidden = renderedCandidates.length === 0;
    if (menu.hidden) { modeOpen = false; allPositionsOpen = false; clearFeedback(); }
    updateMenuControls();
    menu.textContent = modeOpen ? labels.editing : labels.edit;
    menu.setAttribute('aria-pressed', String(modeOpen));
    menu.setAttribute('aria-expanded', String(modeOpen));
    allPositions.hidden = !isDesktop() || !modeOpen;
    allPositions.textContent = labels.allPositions;
    allPositions.setAttribute('aria-controls', panelId);
    allPositions.setAttribute('aria-expanded', String(allPositionsOpen));
    if (isDesktop()) { renderOverlay(); renderPanel(renderedCandidates); }
    else renderPanel(renderedCandidates);
    if (lastFocusKey) {
      const target = (isDesktop() && !allPositionsOpen ? overlay : panel).querySelector(`[data-page-break-key="${lastFocusKey}"]`);
      target?.focus({ preventScroll: true }); lastFocusKey = null;
    }
  }
  menu.addEventListener('click', () => {
    if (isDesktop()) setMode(!modeOpen, { focusFirst: !modeOpen });
    else setMode(!modeOpen, { focusFirst: !modeOpen });
  });
  allPositions.addEventListener('click', () => {
    allPositionsOpen = !allPositionsOpen;
    renderPanel(renderedCandidates);
    allPositions.setAttribute('aria-expanded', String(allPositionsOpen));
    if (allPositionsOpen) panel.querySelector('button')?.focus();
  });
  toolbar.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (isDesktop() && modeOpen) { setMode(false); menu.focus(); }
    else if (!isDesktop() && !panel.hidden) { setMobilePanel(false); menu.focus(); }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !modeOpen) return;
    event.preventDefault();
    setMode(false);
    menu.focus();
  }, true);
  toolbar.addEventListener('focusout', (event) => {
    if (!isDesktop() && !panel.hidden && event.relatedTarget instanceof Node && !toolbar.contains(event.relatedTarget)) setMobilePanel(false);
  });
  document.addEventListener('pointerdown', (event) => {
    if (!isDesktop() && !panel.hidden && !toolbar.contains(event.target)) setMobilePanel(false);
  }, true);
  const workspace = preview.closest('.workspace');
  const syncSurface = () => {
    updateMenuControls();
    if (!isSurfaceVisible()) { closeSurface(); return; }
    if (isDesktop()) {
      if (!panel.hidden) {
        modeOpen = false;
        allPositionsOpen = false;
        menu.setAttribute('aria-pressed', 'false');
        menu.setAttribute('aria-expanded', 'false');
        menu.textContent = labels.edit;
      }
      renderOverlay();
      renderPanel(renderedCandidates);
    } else {
      overlay.hidden = true;
      modeOpen = false;
      allPositionsOpen = false;
      menu.setAttribute('aria-pressed', 'false');
      menu.setAttribute('aria-expanded', 'false');
      menu.textContent = labels.edit;
      renderPanel(renderedCandidates);
    }
  };
  function scheduleGeometrySync() {
    if (geometryFrame !== null) return;
    geometryFrame = window.requestAnimationFrame(() => {
      geometryFrame = null;
      if (isDesktop() && !panel.hidden) syncSurface();
      else if (isDesktop()) positionOverlay();
      updateMenuControls();
    });
  }
  const contextObserver = workspace ? new MutationObserver(syncSurface) : null;
  contextObserver?.observe(workspace, { attributes: true, attributeFilter: ['data-mobile-mode', 'hidden'] });
  window.addEventListener('resize', scheduleGeometrySync);
  preview.addEventListener('transitionend', (event) => {
    if (event.propertyName === 'transform') scheduleGeometrySync();
  });
  preview.closest('.preview-scroll')?.addEventListener('scroll', scheduleGeometrySync, { passive: true });
  syncSurface();
  return { render, position: scheduleGeometrySync };
}
