// List keys name one sibling array. Career details additionally require their
// owning career's record ID, so a reorder cannot cross company boundaries.
function list(locale, documentType, path, dateKind = null) {
  return Object.freeze({ locale, documentType, path: Object.freeze(path), dateKind });
}

export const LIST_ORDER_REGISTRY = Object.freeze({
  'ja.education': list('ja', 'resume', ['documents', 'ja', 'education'], 'date'),
  'ja.employment': list('ja', 'resume', ['documents', 'ja', 'employment'], 'date'),
  'ja.qualification': list('ja', 'resume', ['documents', 'ja', 'qualification'], 'date'),
  'ja.careers': list('ja', 'career', ['documents', 'ja', 'careers'], 'range'),
  'ja.careerDetails': list('ja', 'career', ['documents', 'ja', 'careers']),
  'zh-CN.experience': list('zh-CN', 'resume', ['documents', 'zh-CN', 'resume', 'experience'], 'range'),
  'zh-CN.projects': list('zh-CN', 'resume', ['documents', 'zh-CN', 'resume', 'projects'], 'range'),
  'zh-CN.education': list('zh-CN', 'resume', ['documents', 'zh-CN', 'resume', 'education'], 'range'),
  'zh-CN.certifications': list('zh-CN', 'resume', ['documents', 'zh-CN', 'resume', 'certifications'], 'date'),
  'en.experience': list('en', 'resume', ['documents', 'en', 'resume', 'experience'], 'range'),
  'en.projects': list('en', 'resume', ['documents', 'en', 'resume', 'projects'], 'range'),
  'en.education': list('en', 'resume', ['documents', 'en', 'resume', 'education'], 'range'),
  'en.certifications': list('en', 'resume', ['documents', 'en', 'resume', 'certifications'], 'date'),
  'profile.links': list(null, null, ['profile', 'fields', 'links'])
});

function monthKey(value) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value ?? '').trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return year >= 1 && month >= 1 && month <= 12 ? year * 12 + month : null;
}

function dateKeys(item, kind) {
  if (kind === 'date') return { end: monthKey(item.date), start: null };
  const start = monthKey(item.startDate);
  const end = String(item.endDate ?? '').trim() === '' && start !== null
    ? Infinity : monthKey(item.endDate);
  return { end, start };
}

function compareDate(left, right, direction) {
  // Unknown dates stay last in both directions, including missing start dates
  // used as the secondary key. Present sorts beyond every valid end month.
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return (left < right ? -1 : 1) * direction;
}

export function orderListByDate(items, dateKind, direction) {
  if (!['date', 'range'].includes(dateKind) || !['newest', 'oldest'].includes(direction)) {
    throw new TypeError('A supported date kind and direction are required.');
  }
  const sign = direction === 'newest' ? -1 : 1;
  return items.map((item, index) => ({ item, index, ...dateKeys(item, dateKind) }))
    .sort((left, right) => compareDate(left.end, right.end, sign)
      || (left.end !== null ? compareDate(left.start, right.start, sign) : 0)
      || left.index - right.index)
    .map(({ item }) => item);
}

function resolveList(state, target) {
  if (!target || !Object.hasOwn(LIST_ORDER_REGISTRY, target.key)) {
    throw new TypeError('A registered list target is required.');
  }
  const descriptor = LIST_ORDER_REGISTRY[target.key];
  const path = [...descriptor.path];
  if (target.key === 'ja.careerDetails') {
    const index = state.documents.ja.careers.findIndex((career) => career.id === target.careerId);
    if (index < 0) throw new TypeError('Career details require an existing career ID.');
    path.push(index, 'detailSections');
  } else if (target.careerId !== undefined) {
    throw new TypeError('Only career details accept a career ID.');
  }
  const field = path.pop();
  const parent = path.reduce((value, key) => value[key], state);
  return { descriptor, parent, field, items: parent[field] };
}

function clearDocumentBreaks(pageBreaks, locale, documentType) {
  for (const paper of ['A4', 'LETTER']) {
    pageBreaks[locale][paper][documentType] = { sections: [], records: [] };
  }
}

// Mutates only a caller-owned state copy. False means no observable change;
// the store must retain its original state and skip notifications/persistence.
export function applyListReorder(state, target, operation) {
  const { descriptor, parent, field, items } = resolveList(state, target);
  let ordered;
  if (operation?.type === 'move') {
    const { from, to } = operation;
    if (!Number.isInteger(from) || !Number.isInteger(to)
      || from < 0 || to < 0 || from >= items.length || to >= items.length || from === to) return false;
    ordered = [...items];
    ordered.splice(to, 0, ordered.splice(from, 1)[0]);
  } else if (operation?.type === 'sort') {
    ordered = orderListByDate(items, descriptor.dateKind, operation.direction);
  } else {
    throw new TypeError('A move or sort operation is required.');
  }
  if (ordered.every((item, index) => item === items[index])) return false;
  parent[field] = ordered;
  const pageBreaks = state.settings.pageBreaks;
  if (descriptor.locale) {
    clearDocumentBreaks(pageBreaks, descriptor.locale, descriptor.documentType);
  } else {
    for (const locale of ['ja', 'zh-CN', 'en']) {
      for (const documentType of Object.keys(pageBreaks[locale].A4)) {
        clearDocumentBreaks(pageBreaks, locale, documentType);
      }
    }
  }
  return true;
}
