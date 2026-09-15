import { announceStatus } from './ui/status-controller.js';

export const PAGE_BREAK_LABELS = Object.freeze({
  ja: {
    add: '改頁', remove: '解除', menu: '改ページ位置', positions: '改ページ位置', after: 'の後',
    edit: '改ページを編集', editing: '改ページ編集中', undo: '元に戻す',
    added: 'PDF 出力時に新しい page から開始します。', removed: 'PDF 出力時の改ページを解除しました。'
  },
  'zh-CN': {
    add: '分页', remove: '取消', menu: '分页位置', positions: '分页位置', after: '之后',
    edit: '编辑分页', editing: '正在编辑分页', undo: '撤销',
    added: '导出 PDF 时将从新页面开始。', removed: '已取消 PDF 导出时的分页。'
  },
  en: {
    add: 'Add', remove: 'Remove', menu: 'Page break positions', positions: 'Page break positions', after: 'after',
    edit: 'Edit page breaks', editing: 'Editing page breaks', undo: 'Undo',
    added: 'The PDF will start this content on a new page.', removed: 'The PDF page break has been removed.'
  }
});

// The desktop rail is fixed over the preview rather than part of the document.
// This reserves only outer preview space; the printable document geometry is unchanged.
export const PAGE_BREAK_PREVIEW_GUTTER = 400;

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

function iconBadge(className, active) {
  const badge = document.createElement('span');
  badge.className = className;
  // This SVG is an application-owned constant. User-provided labels are always
  // assigned through textContent below.
  badge.innerHTML = icon(active);
  return badge;
}

export function initPageBreakControls({ store, locale, preview, toolbar, getDocumentType, scheduleSave }) {
  // A rail must be wide enough for a complete, readable position description.
  // Below this threshold the fixed rail would either cover the paper or create a
  // tiny hit target, so edit mode deliberately uses the complete panel instead.
  const MIN_DESKTOP_RAIL_WIDTH = 140;
  const RAIL_VERTICAL_GAP = 4;
  const labels = PAGE_BREAK_LABELS[locale];
  const panelId = `page-break-panel-${locale}`;
  const railId = `page-break-rail-${locale}`;
  const menu = document.createElement('button');
  menu.type = 'button';
  menu.className = 'page-break-menu';
  menu.dataset.pageBreakModeToggle = '';
  toolbar.append(menu);
  const feedback = document.createElement('div');
  feedback.className = 'page-break-feedback';
  feedback.hidden = true;
  feedback.setAttribute('role', 'status');
  toolbar.append(feedback);
  const panel = document.createElement('div');
  panel.id = panelId;
  panel.className = 'page-break-panel';
  panel.hidden = true;
  toolbar.append(panel);
  const rail = document.createElement('div');
  rail.id = railId;
  rail.className = 'page-break-rail';
  rail.setAttribute('aria-label', labels.positions);
  rail.setAttribute('role', 'region');
  document.body.append(rail);
  const railMeasure = document.createElement('div');
  railMeasure.className = 'page-break-rail page-break-rail-measure';
  railMeasure.setAttribute('aria-hidden', 'true');
  document.body.append(railMeasure);
  let modeOpen = false;
  let feedbackTimer = null;
  let geometryFrame = null;
  let lastFocusKey = null;
  let renderedCandidates = [];
  let surface = 'none';

  function isDesktop() { return !window.matchMedia('(max-width: 820px)').matches; }
  function isSurfaceVisible() { return preview.getClientRects().length > 0 && !preview.closest('[hidden]'); }
  function railSpaceFor(candidate) {
    const page = candidate?.element.closest('.document-page');
    const previewRect = preview.closest('.preview-scroll')?.getBoundingClientRect();
    if (!page || !previewRect) return Number.NEGATIVE_INFINITY;
    const pageRect = page.getBoundingClientRect();
    const scale = page.offsetWidth ? pageRect.width / page.offsetWidth : 1;
    return previewRect.right - (pageRect.right + Math.max(12, 16 * scale)) - 8;
  }
  function railPositionFor(candidate) {
    const page = candidate?.element.closest('.document-page');
    if (!page) return null;
    const pageRect = page.getBoundingClientRect();
    const targetRect = candidate.element.getBoundingClientRect();
    const scale = page.offsetWidth ? pageRect.width / page.offsetWidth : 1;
    return {
      left: pageRect.right + Math.max(12, 16 * scale),
      maxWidth: railSpaceFor(candidate),
      top: targetRect.top - (candidate.isRecord ? 1 : 11) * scale
    };
  }
  function createRailControl(candidate, { measure = false } = {}) {
    const control = document.createElement('button');
    control.className = measure
      ? `page-break-measure-boundary${candidate.isRecord ? ' page-break-measure-record-boundary' : ''}`
      : `page-break-boundary${candidate.isRecord ? ' page-break-record-boundary' : ''}`;
    control.dataset.pageBreakKey = candidate.key;
    control.type = 'button';
    control.setAttribute('aria-pressed', String(candidate.active));
    control.setAttribute('aria-label', description(candidate.previous, candidate, candidate.active));
    const fullDescription = description(candidate.previous, candidate, candidate.active);
    if (candidate.isRecord) {
      const tick = iconBadge('page-break-compact-tick', candidate.active); tick.setAttribute('aria-hidden', 'true');
      const fullLabel = document.createElement('span'); fullLabel.className = 'page-break-full-label'; fullLabel.textContent = fullDescription;
      control.append(tick, fullLabel);
    } else {
      const add = document.createElement('span'); add.className = 'page-break-add';
      add.append(iconBadge('page-break-plus', candidate.active), document.createTextNode(fullDescription));
      control.append(add);
    }
    if (!measure) {
      control.addEventListener('click', () => toggle(candidate));
      control.addEventListener('pointerenter', () => setHighlight(candidate, true));
      control.addEventListener('pointerleave', () => setHighlight(candidate, false));
      control.addEventListener('focus', () => setHighlight(candidate, true));
      control.addEventListener('blur', () => setHighlight(candidate, false));
      candidate.element.addEventListener('pointerenter', () => setHighlight(candidate, true));
      candidate.element.addEventListener('pointerleave', () => setHighlight(candidate, false));
    }
    return control;
  }
  function railLayout() {
    railMeasure.replaceChildren();
    const controls = renderedCandidates.map((candidate) => {
      const position = railPositionFor(candidate);
      if (!position || position.maxWidth < MIN_DESKTOP_RAIL_WIDTH) return null;
      const control = createRailControl(candidate, { measure: true });
      control.style.left = `${position.left}px`;
      control.style.maxWidth = `${position.maxWidth}px`;
      control.style.top = `${position.top}px`;
      railMeasure.append(control);
      return { candidate, control, position };
    });
    if (controls.some((item) => item === null)) return null;
    const visible = controls.map((item) => {
      item.box = item.control.getBoundingClientRect();
      return item;
    })
      .filter(({ box }) => box.bottom > 0 && box.top < window.innerHeight)
      .sort((left, right) => left.position.top - right.position.top);
    let nextTop = 0;
    for (const item of visible) {
      if (item.box.left < 0 || item.box.right > window.innerWidth) return null;
      item.top = Math.max(item.position.top, nextTop);
      if (item.top + item.box.height > window.innerHeight) return null;
      nextTop = item.top + item.box.height + RAIL_VERTICAL_GAP;
    }
    return controls;
  }
  function canUseRail() {
    return isDesktop() && isSurfaceVisible() && renderedCandidates.length > 0
      && railLayout() !== null;
  }
  function usesPanel() { return !isDesktop() || !canUseRail(); }
  function updateMenuControls() { menu.setAttribute('aria-controls', usesPanel() ? panelId : railId); }
  function activeContext() {
    const state = store.getState();
    const type = getDocumentType();
    return { state, type, paper: state.settings.pageSizeByLocale[locale] };
  }
  function description(previous, target, active) { return describePageBreak(locale, previous, target, active); }
  function setMode(open, { focusFirst = false } = {}) {
    modeOpen = open;
    menu.setAttribute('aria-pressed', String(open));
    menu.textContent = `${open ? labels.editing : labels.edit} · ${renderedCandidates.filter((candidate) => candidate.active).length}`;
    updateMenuControls();
    if (usesPanel()) {
      panel.hidden = !open;
      menu.setAttribute('aria-expanded', String(open));
      renderPanel(renderedCandidates);
      if (open && focusFirst) panel.querySelector('button')?.focus();
    } else {
      panel.hidden = true;
      menu.setAttribute('aria-expanded', 'false');
      renderRail();
      if (open && focusFirst) rail.querySelector('button')?.focus({ preventScroll: true });
    }
  }
  function setMobilePanel(open) {
    panel.hidden = !open;
    menu.setAttribute('aria-expanded', String(open));
    if (open) panel.querySelector('button')?.focus();
  }
  function closeSurface() {
    modeOpen = false;
    rail.hidden = true;
    panel.hidden = true;
    menu.setAttribute('aria-pressed', 'false');
    menu.setAttribute('aria-expanded', 'false');
    surface = 'none';
    clearFeedback();
  }
  function clearFeedback() {
    window.clearTimeout(feedbackTimer);
    feedback.replaceChildren();
    feedback.hidden = true;
  }
  function showFeedback(message, undo) {
    clearFeedback();
    const text = document.createElement('span'); text.textContent = message;
    const undoButton = document.createElement('button');
    undoButton.type = 'button'; undoButton.className = 'page-break-undo'; undoButton.textContent = labels.undo;
    undoButton.addEventListener('click', () => { undo(); clearFeedback(); });
    feedback.append(text, undoButton); feedback.hidden = false;
    announceStatus(message);
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
    });
  }
  function setHighlight(candidate, active) {
    candidate.element.classList.toggle('page-break-target-highlight', active);
    rail.querySelector(`[data-page-break-key="${candidate.key}"]`)?.classList.toggle('is-target-highlighted', active);
  }
  function positionRail() {
    const layout = railLayout();
    if (!layout) return;
    const positions = new Map(layout.map((item) => [item.candidate.key, item]));
    rail.querySelectorAll('button, .page-break-passive-marker').forEach((control) => {
      const candidate = renderedCandidates.find((item) => item.key === control.dataset.pageBreakKey);
      const page = candidate?.element.closest('.document-page');
      if (!candidate || !page) return;
      const position = positions.get(candidate.key)?.position;
      if (!position) return;
      const top = positions.get(candidate.key)?.top ?? position.top;
      control.style.maxWidth = `${position.maxWidth}px`;
      control.style.left = `${position.left}px`;
      control.style.top = `${top}px`;
    });
  }
  function renderRail() {
    rail.replaceChildren();
    if (!canUseRail()) { rail.hidden = true; return; }
    const shown = modeOpen ? renderedCandidates : renderedCandidates.filter((candidate) => candidate.active);
    rail.hidden = shown.length === 0;
    surface = 'rail';
    shown.forEach((candidate) => {
        const control = modeOpen ? createRailControl(candidate) : document.createElement('span');
        control.className = modeOpen
          ? control.className
          : 'page-break-passive-marker';
        control.dataset.pageBreakKey = candidate.key;
      if (!modeOpen) {
        control.setAttribute('aria-hidden', 'true');
        control.textContent = '↵';
      }
      rail.append(control);
    });
    window.requestAnimationFrame(positionRail);
  }
  function renderPanel(candidates) {
    panel.replaceChildren();
    if (!usesPanel() || !isSurfaceVisible()) {
      panel.hidden = true;
      panel.classList.remove('page-break-panel--desktop-fallback');
      menu.setAttribute('aria-expanded', 'false');
      return;
    }
    panel.classList.toggle('page-break-panel--desktop-fallback', isDesktop());
    surface = 'panel';
    const title = document.createElement('strong'); title.textContent = labels.positions; panel.append(title);
    candidates.forEach((candidate) => {
      const row = document.createElement('button');
      row.type = 'button'; row.className = 'page-break-row'; row.dataset.pageBreakKey = candidate.key;
      row.setAttribute('aria-pressed', String(candidate.active)); row.setAttribute('aria-label', description(candidate.previous, candidate, candidate.active));
      const rowText = document.createElement('span');
      const rowLabel = document.createElement('b'); rowLabel.textContent = candidate.label;
      const rowDetail = document.createElement('small'); rowDetail.textContent = candidate.active ? labels.remove : `${candidate.previous.label} ${labels.after}`;
      const rowSwitch = document.createElement('span'); rowSwitch.className = 'page-break-switch'; rowSwitch.setAttribute('aria-hidden', 'true');
      rowText.append(rowLabel, rowDetail); row.append(rowText, rowSwitch);
      row.addEventListener('click', () => toggle(candidate)); panel.append(row);
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
    renderedCandidates.forEach((candidate) => {
      candidate.element.classList.toggle('has-manual-page-break', candidate.active);
    });
    menu.hidden = renderedCandidates.length === 0;
    if (menu.hidden) { modeOpen = false; clearFeedback(); }
    updateMenuControls();
    menu.textContent = `${modeOpen ? labels.editing : labels.edit} · ${renderedCandidates.filter((candidate) => candidate.active).length}`;
    menu.setAttribute('aria-pressed', String(modeOpen));
    renderPanel(renderedCandidates);
    renderRail();
    if (lastFocusKey) {
      const target = (usesPanel() ? panel : rail).querySelector(`[data-page-break-key="${lastFocusKey}"]`);
      target?.focus({ preventScroll: true }); lastFocusKey = null;
    }
  }
  menu.addEventListener('click', () => {
    if (isDesktop()) setMode(!modeOpen, { focusFirst: !modeOpen });
    else setMobilePanel(panel.hidden);
  });
  toolbar.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (isDesktop() && modeOpen) { setMode(false); menu.focus(); }
    else if (!isDesktop() && !panel.hidden) { setMobilePanel(false); menu.focus(); }
  });
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
    if (isDesktop() && canUseRail()) {
      panel.hidden = true;
      panel.classList.remove('page-break-panel--desktop-fallback');
      menu.setAttribute('aria-expanded', 'false');
      renderRail();
    } else {
      rail.hidden = true;
      if (isDesktop()) {
        panel.hidden = !modeOpen;
        menu.setAttribute('aria-expanded', String(modeOpen));
      } else {
        modeOpen = false;
        menu.setAttribute('aria-pressed', 'false');
      }
      renderPanel(renderedCandidates);
    }
  };
  function focusedBoundaryKey() {
    return document.activeElement instanceof Element
      ? document.activeElement.closest('[data-page-break-key]')?.dataset.pageBreakKey || null
      : null;
  }
  function restoreSurfaceFocus(key) {
    if (!key) return;
    const container = surface === 'rail' ? rail : panel;
    container.querySelector(`[data-page-break-key="${key}"]`)?.focus({ preventScroll: true });
  }
  function scheduleGeometrySync() {
    if (geometryFrame !== null) return;
    geometryFrame = window.requestAnimationFrame(() => {
      geometryFrame = null;
      if (!isDesktop()) {
        if (surface === 'rail') {
          const focusKey = focusedBoundaryKey();
          syncSurface();
          restoreSurfaceFocus(focusKey);
        }
        return;
      }
      const nextSurface = usesPanel() ? 'panel' : 'rail';
      if (nextSurface === surface) {
        if (nextSurface === 'rail') positionRail();
        updateMenuControls();
        return;
      }
      const focusKey = focusedBoundaryKey();
      syncSurface();
      positionRail();
      restoreSurfaceFocus(focusKey);
    });
  }
  const contextObserver = workspace ? new MutationObserver(syncSurface) : null;
  contextObserver?.observe(workspace, { attributes: true, attributeFilter: ['data-mobile-mode', 'hidden'] });
  window.addEventListener('resize', scheduleGeometrySync);
  preview.addEventListener('transitionend', (event) => {
    if (event.propertyName === 'transform') scheduleGeometrySync();
  });
  preview.closest('.preview-scroll')?.addEventListener('scroll', positionRail, { passive: true });
  syncSurface();
  return { render, position: scheduleGeometrySync };
}
