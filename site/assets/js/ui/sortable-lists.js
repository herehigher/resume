import { LIST_ORDER_REGISTRY } from '../state/list-order.js';
import { createListFoldState } from './list-fold-state.js';
import { announceStatus } from './status-controller.js';

const LABELS = {
  ja: {
    collapse: '折りたたむ', expand: '展開する', collapseAll: 'すべて折りたたむ', expandAll: 'すべて展開する',
    up: '上へ移動', down: '下へ移動', actions: '項目の操作', handle: '並べ替え（上下キーで移動）',
    moved: (name, position, count) => `${name}を ${count} 件中 ${position} 番目に移動しました。`,
    cleared: '関連文書の改ページを解除しました。'
  },
  'zh-CN': {
    collapse: '收起', expand: '展开', collapseAll: '全部收起', expandAll: '全部展开',
    up: '上移', down: '下移', actions: '条目操作', handle: '排序（用上下方向键移动）',
    moved: (name, position, count) => `${name}已移到第 ${position} 项，共 ${count} 项。`,
    cleared: '已清除相关文书的手动分页。'
  },
  en: {
    collapse: 'Collapse', expand: 'Expand', collapseAll: 'Collapse all', expandAll: 'Expand all',
    up: 'Move up', down: 'Move down', actions: 'Item actions', handle: 'Reorder (use up/down arrow keys)',
    moved: (name, position, count) => `${name} moved to position ${position} of ${count}.`,
    cleared: 'Manual page breaks cleared for the affected documents.'
  }
};
const REPLACEMENTS = new Set(['replace', 'import', 'reload', 'reset', 'sample', 'restore']);
let nextBodyId = 0;

function targetInfo(state, target) {
  if (!target || !Object.hasOwn(LIST_ORDER_REGISTRY, target.key)) throw new TypeError('A registered list target is required.');
  const descriptor = LIST_ORDER_REGISTRY[target.key];
  let items = descriptor.path.reduce((value, key) => value[key], state);
  if (target.key === 'ja.careerDetails') {
    const career = items.find((item) => item.id === target.careerId);
    if (!career) return null;
    items = career.detailSections;
  } else if (target.careerId !== undefined) throw new TypeError('Only career details accept a career ID.');
  return { descriptor, items };
}

function hasAffectedBreaks(state, descriptor) {
  const locales = descriptor.locale ? [descriptor.locale] : ['ja', 'zh-CN', 'en'];
  return locales.some((locale) => ['A4', 'LETTER'].some((paper) => {
    const byDocument = state.settings.pageBreaks[locale][paper];
    const documents = descriptor.documentType ? [descriptor.documentType] : Object.keys(byDocument);
    return documents.some((type) => byDocument[type].sections.length || byDocument[type].records.length);
  }));
}

function button(document, text, className) {
  const element = document.createElement('button');
  element.type = 'button'; element.className = className; element.textContent = text;
  return element;
}

// Editors supply existing row/body/action nodes and re-render only the affected
// list after a successful transaction. This module never writes arbitrary paths.
export function createSortableLists({ store, locale, announce = announceStatus }) {
  if (!LABELS[locale]) throw new TypeError('A supported UI locale is required.');
  const labels = LABELS[locale];
  const lists = new Set();
  const foldStates = new Map();
  const composing = new Set();
  let committing = false;
  let destroyed = false;
  function compositionStart(event) { composing.add(event.target); }
  function compositionEnd(event) { composing.delete(event.target); }
  function clearComposition() { composing.clear(); lists.forEach((list) => { list.refresh(); }); }
  document.addEventListener('compositionstart', compositionStart, true);
  document.addEventListener('compositionend', compositionEnd, true);
  window.addEventListener('blur', clearComposition);
  const unsubscribe = store.subscribe((_state, event) => {
    if (REPLACEMENTS.has(event.type)) {
      clearComposition();
      foldStates.forEach((folds) => { folds.reset(); });
      lists.forEach((list) => { list.invalidate(true); });
    } else if (event.type === 'reorder' && !committing) {
      const key = JSON.stringify([event.target?.key, event.target?.careerId ?? null]);
      const folds = foldStates.get(key);
      if (folds && event.permutation?.length === folds.length) folds.reorder(event.permutation);
      else folds?.reset();
      lists.forEach((list) => {
        if (list.foldKey === key) list.invalidate(false);
        else list.refresh();
      });
    } else if (event.type === 'update' || event.type === 'import-pending' || event.type === 'import-cancel') {
      for (const [key, entry] of foldStates) {
        const [listKey, careerId] = JSON.parse(key);
        if (listKey === 'ja.careerDetails' && !store.getState().documents.ja.careers.some((career) => career.id === careerId)) {
          entry.reset(); foldStates.delete(key);
        }
      }
      lists.forEach((list) => { list.refresh(); });
    }
  });

  function registerList({ target, container, toolbar, itemLabel, getSummary, render, scheduleSave, isBlocked = () => false }) {
    if (destroyed) throw new TypeError('The sortable controller was destroyed.');
    target = Object.freeze({ ...target });
    if (!targetInfo(store.getState(), target)) throw new TypeError('The parent career must exist.');
    if (typeof itemLabel !== 'string' || !itemLabel.trim() || typeof getSummary !== 'function'
      || typeof render !== 'function' || typeof scheduleSave !== 'function') throw new TypeError('A list adapter is required.');
    const doc = container.ownerDocument;
    const foldKey = JSON.stringify([target.key, target.careerId ?? null]);
    if ([...lists].some((list) => list.foldKey === foldKey)) throw new TypeError('A target already has an active binding.');
    const folds = foldStates.get(foldKey) || createListFoldState();
    foldStates.set(foldKey, folds);
    const tools = doc.createElement('div'); tools.className = 'sortable-list-tools'; tools.lang = locale;
    const collapseAll = button(doc, labels.collapseAll, 'sortable-tool');
    const expandAll = button(doc, labels.expandAll, 'sortable-tool');
    tools.append(collapseAll, expandAll); toolbar.append(tools);
    let rows = [];
    let rowIds = [];
    let bound = false;
    let syncedState = null;
    let disposed = false;
    let highlightTimer;
    const keyed = ['ja.careers', 'zh-CN.experience', 'en.experience'].includes(target.key);

    function currentInfo() { return targetInfo(store.getState(), target); }
    function blocked() {
      return disposed || !bound || composing.size > 0 || store.isImportPending() || isBlocked();
    }
    function valid() {
      const info = currentInfo();
      return info && info.items.length === rows.length && rows.every((row, index) => row.element.parentElement === container
        && (!keyed || info.items[index].id === rowIds[index]));
    }
    function name(index) {
      const item = currentInfo()?.items[index];
      return String((item === undefined ? '' : getSummary(item, index)) ?? '').trim() || `${itemLabel} ${index + 1}`;
    }
    function paintRow(row, index) {
      const summary = name(index);
      row.summary.textContent = summary;
      row.summary.title = summary;
      row.position.textContent = String(index + 1);
      row.handle.setAttribute('aria-label', `${labels.handle}: ${summary}, ${index + 1}/${rows.length}`);
      row.toggle.setAttribute('aria-label', `${folds.get(index) ? labels.expand : labels.collapse}: ${summary}`);
      row.toggle.setAttribute('aria-expanded', String(!folds.get(index)));
      row.toggle.textContent = folds.get(index) ? '▸' : '▾';
      row.body.hidden = folds.get(index);
      row.element.classList.toggle('is-collapsed', folds.get(index));
      row.menuToggle.setAttribute('aria-label', `${labels.actions}: ${summary}, ${index + 1}/${rows.length}`);
      row.menuBody.setAttribute('aria-label', `${labels.actions}: ${summary}`);
      row.up.disabled = blocked() || index === 0;
      row.down.disabled = blocked() || index === rows.length - 1;
      row.handle.disabled = blocked() || rows.length < 2;
      row.toggle.disabled = !bound;
    }
    function refresh() {
      if (disposed) return;
      if (!valid()) bound = false;
      rows.forEach(paintRow);
      tools.hidden = rows.length === 0;
      collapseAll.disabled = !bound;
      expandAll.disabled = !bound;
    }
    function setCollapsed(index, collapsed) {
      const row = rows[index];
      if (!row || !bound) return;
      if (collapsed && row.body.contains(doc.activeElement)) row.toggle.focus();
      folds.set(index, collapsed);
      row.menu.open = false;
      paintRow(row, index);
    }
    function setAllCollapsed(collapsed) { rows.forEach((_row, index) => { setCollapsed(index, collapsed); }); }
    function releaseRows() {
      window.clearTimeout(highlightTimer);
      rows.forEach((row) => {
        row.element.removeEventListener('input', row.onInput);
        [...row.actions].reverse().forEach(({ element, parent, next }) => { parent.insertBefore(element, next?.parentNode === parent ? next : null); });
        row.header.remove();
        row.body.hidden = row.wasHidden;
        if (row.previousBodyId === null) row.body.removeAttribute('id');
        else row.body.id = row.previousBodyId;
        row.element.classList.remove('sortable-row', 'is-collapsed', 'sortable-row-moved');
      });
      rows = [];
    }
    function sync(descriptors, { change } = {}) {
      if (disposed) return;
      const info = currentInfo();
      if (!info || descriptors.length !== info.items.length || descriptors.some(({ element, body }) =>
        element.parentElement !== container || !element.contains(body) || element === body)) {
        throw new TypeError('Each current sibling row needs its existing body node.');
      }
      releaseRows();
      rowIds = info.items.map((item) => keyed ? item.id : null);
      folds.sync(rowIds, change);
      rows = descriptors.map(({ element, body, actions = [] }) => {
        const header = doc.createElement('div'); header.className = 'sortable-row-heading'; header.lang = locale;
        const handle = button(doc, '⠿', 'sortable-handle'); handle.setAttribute('aria-keyshortcuts', 'ArrowUp ArrowDown');
        const toggle = button(doc, '', 'sortable-toggle');
        const previousBodyId = body.getAttribute('id');
        if (!body.id) body.id = `sortable-body-${++nextBodyId}`;
        toggle.setAttribute('aria-controls', body.id);
        const position = doc.createElement('span'); position.className = 'sortable-position'; position.setAttribute('aria-hidden', 'true');
        const summary = doc.createElement('span'); summary.className = 'sortable-summary';
        const menu = doc.createElement('details'); menu.className = 'sortable-actions';
        const menuToggle = doc.createElement('summary'); menuToggle.textContent = '⋯';
        const menuBody = doc.createElement('div'); menuBody.className = 'sortable-action-buttons'; menuBody.setAttribute('role', 'group');
        const up = button(doc, labels.up, 'sortable-action');
        const down = button(doc, labels.down, 'sortable-action');
        menuBody.append(up, down);
        const savedActions = actions.map((action) => ({ element: action, parent: action.parentNode, next: action.nextSibling }));
        actions.forEach((action) => { menuBody.append(action); });
        menu.append(menuToggle, menuBody); header.append(handle, toggle, position, summary, menu); element.prepend(header);
        element.classList.add('sortable-row');
        const row = { element, body, header, handle, toggle, position, summary, menu, menuBody, menuToggle, up, down,
          previousBodyId, wasHidden: body.hidden, actions: savedActions };
        const index = () => rows.indexOf(row);
        toggle.addEventListener('click', () => { if (index() >= 0) setCollapsed(index(), !folds.get(index())); });
        up.addEventListener('click', () => move(index(), index() - 1));
        down.addEventListener('click', () => move(index(), index() + 1));
        handle.addEventListener('keydown', (event) => {
          if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            move(index(), index() + (event.key === 'ArrowUp' ? -1 : 1));
          }
        });
        menu.addEventListener('keydown', (event) => {
          if (event.key === 'Escape' && menu.open) { event.preventDefault(); menu.open = false; menuToggle.focus(); }
        });
        row.onInput = (event) => {
          // Nested lists own their summaries; their input must not repaint a
          // parent's row or reconstruct any form fields during composition.
          if (event.target.closest('.sortable-row') === element && index() >= 0) paintRow(row, index());
        };
        element.addEventListener('input', row.onInput);
        return row;
      });
      bound = true;
      syncedState = store.getState();
      refresh();
    }
    function move(from, to) {
      if (blocked() || !valid() || !Number.isInteger(from) || !Number.isInteger(to)
        || from < 0 || to < 0 || from >= rows.length || to >= rows.length || from === to) return false;
      const before = store.getState();
      const info = currentInfo();
      const cleared = hasAffectedBreaks(before, info.descriptor);
      const summary = name(from);
      const count = rows.length;
      // Move transient identity before editor callbacks rebuild the DOM. No
      // persistence is scheduled for a rejected/no-op state transaction.
      committing = true;
      let changed;
      try { changed = store.reorderList(target, { type: 'move', from, to }); }
      finally { committing = false; }
      if (!changed) return false;
      folds.move(from, to);
      bound = false;
      render({ from, to });
      scheduleSave();
      const moved = rows[to];
      if (bound && moved?.element.isConnected) {
        moved.handle.focus();
        moved.element.classList.add('sortable-row-moved');
        highlightTimer = window.setTimeout(() => moved.element.classList.remove('sortable-row-moved'), 500);
      }
      announce(`${labels.moved(summary, to + 1, count)}${cleared ? ` ${labels.cleared}` : ''}`);
      return true;
    }
    function invalidate(reset) {
      if (reset) folds.reset();
      // Editor subscribers may have already drawn the new snapshot. Keep those
      // controls usable regardless of listener registration order.
      bound = syncedState === store.getState() && Boolean(valid());
      if (bound) folds.sync(rowIds);
      rows.forEach((row) => { row.menu.open = false; });
      refresh();
    }
    collapseAll.addEventListener('click', () => setAllCollapsed(true));
    expandAll.addEventListener('click', () => setAllCollapsed(false));
    function onComposition() { refresh(); }
    doc.addEventListener('compositionstart', onComposition);
    doc.addEventListener('compositionend', onComposition);
    function closeMenus(event) {
      rows.forEach((row) => {
        if (row.menu.open && !row.menu.contains(event.target)) row.menu.open = false;
      });
    }
    doc.addEventListener('click', closeMenus);
    const api = { sync, refresh, move, setCollapsed, setAllCollapsed, foldKey,
      getCollapsed: (index) => folds.get(index),
      invalidate,
      destroy() {
        if (disposed) return;
        disposed = true; releaseRows(); tools.remove(); lists.delete(api);
        doc.removeEventListener('compositionstart', onComposition);
        doc.removeEventListener('compositionend', onComposition);
        doc.removeEventListener('click', closeMenus);
      }
    };
    lists.add(api);
    tools.hidden = true;
    return api;
  }

  return { registerList,
    destroy() {
      if (destroyed) return;
      destroyed = true; unsubscribe();
      [...lists].forEach((list) => { list.destroy(); });
      document.removeEventListener('compositionstart', compositionStart, true);
      document.removeEventListener('compositionend', compositionEnd, true);
      window.removeEventListener('blur', clearComposition); composing.clear(); foldStates.clear();
    }
  };
}
