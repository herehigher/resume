import { createSortableLists } from './sortable-lists.js';

// Thin DOM adapter: existing fields, indices, actions and persistence callbacks
// remain owned by each editor. The shared controller owns all interactions.
export function createEditorLists({ store, locale, scheduleSave, renderPreview, isBlocked }) {
  const controller = createSortableLists({ store, locale });
  const bindings = new Map();
  const counts = new Map();
  const changes = new Map();
  function identity(target) { return JSON.stringify([target.key, target.careerId || null]); }
  function release(target) {
    const key = identity(target);
    bindings.get(key)?.prepare();
  }
  function bind({ target, container, rows, itemLabel, getSummary, getMeta, render, actionSelector, headingSelector }) {
    const key = identity(target);
    const previousBinding = bindings.get(key);
    if (previousBinding && previousBinding.container !== container) { previousBinding.destroy(); bindings.delete(key); }
    release(target);
    let toolbar = container.previousElementSibling;
    if (!toolbar?.classList.contains('editor-list-tools')) {
      toolbar = container.ownerDocument.createElement('div');
      toolbar.className = 'editor-list-tools'; container.before(toolbar);
    }
    const list = bindings.get(key) || controller.registerList({ target, container, toolbar, itemLabel, getSummary, getMeta,
      scheduleSave, isBlocked,
      render: () => { render(); renderPreview(); }
    });
    let change = changes.get(key);
    const previous = counts.get(key);
    if (!change && previous !== undefined && rows.length === previous + 1) change = { type: 'insert', index: previous };
    if (!change && previous !== undefined && rows.length !== previous) change = { type: 'structure' };
    changes.delete(key); counts.set(key, rows.length);
    const descriptors = rows.map((element) => {
      const actions = [...element.querySelectorAll(actionSelector)];
      const heading = headingSelector ? element.querySelector(headingSelector) : null;
      if (heading) heading.hidden = true;
      const body = element.ownerDocument.createElement('div');
      body.className = `sortable-existing-body${element.classList.contains('repeating-row') ? ' sortable-simple-fields' : ''}${element.classList.contains('profile-link-editor-row') ? ' sortable-link-fields' : ''}`;
      if (element.classList.contains('has-credential-link')) body.classList.add('has-credential-link');
      [...element.childNodes].forEach((node) => { body.append(node); }); element.append(body);
      return { element, body, actions };
    });
    list.sync(descriptors, { change });
    bindings.set(key, list);
  }
  return {
    bind, release,
    releaseDetails() { for (const key of [...bindings.keys()]) { const [listKey] = JSON.parse(key); if (listKey === 'ja.careerDetails') { bindings.get(key).destroy(); bindings.delete(key); } } },
    removed(target, index) { changes.set(identity(target), { type: 'remove', index }); },
    cancel: controller.cancel,
    destroy() { controller.destroy(); bindings.clear(); counts.clear(); changes.clear(); }
  };
}
