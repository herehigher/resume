// Page-local identities only. Never match mutable text or duplicate contents.
export function createListFoldState() {
  let entries = [];
  let keyed = false;

  function sync(ids, change) {
    const nextKeyed = ids.length > 0 && ids.every((id) => typeof id === 'string' && id);
    if (nextKeyed && new Set(ids).size !== ids.length) throw new TypeError('Row IDs must be unique.');
    if (nextKeyed) {
      const previous = keyed ? new Map(entries.map((entry) => [entry.id, entry])) : new Map();
      entries = ids.map((id) => previous.get(id) || { id, collapsed: false });
    } else {
      if (keyed) entries = [];
      const next = [...entries];
      if (change?.type === 'insert' && Number.isInteger(change.index)
        && change.index >= 0 && change.index <= next.length && ids.length === next.length + 1) {
        next.splice(change.index, 0, { id: null, collapsed: false });
      } else if (change?.type === 'remove' && Number.isInteger(change.index)
        && change.index >= 0 && change.index < next.length && ids.length === next.length - 1) {
        next.splice(change.index, 1);
      } else if (change) {
        // An unrecognized structural update must not reuse another row's folds.
        next.length = 0;
      }
      entries = next.length === ids.length ? next : ids.map(() => ({ id: null, collapsed: false }));
    }
    keyed = nextKeyed;
  }

  return {
    sync,
    get length() { return entries.length; },
    reset() { entries = []; keyed = false; },
    get(index) { return entries[index]?.collapsed ?? false; },
    set(index, collapsed) { if (entries[index]) entries[index].collapsed = Boolean(collapsed); },
    setAll(collapsed) { entries.forEach((entry) => { entry.collapsed = Boolean(collapsed); }); },
    reorder(permutation) {
      if (!Array.isArray(permutation) || permutation.length !== entries.length
        || new Set(permutation).size !== entries.length
        || !permutation.every((index) => Number.isInteger(index) && index >= 0 && index < entries.length)) {
        throw new TypeError('A complete position permutation is required.');
      }
      entries = permutation.map((index) => entries[index]);
    },
    move(from, to) {
      if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0
        || from >= entries.length || to >= entries.length || from === to) return false;
      entries.splice(to, 0, entries.splice(from, 1)[0]);
      return true;
    }
  };
}
