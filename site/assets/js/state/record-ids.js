let generatedId = 0;

function fallbackRandomPart() {
  generatedId += 1;
  return `${Date.now().toString(36)}-${generatedId.toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function createRecordId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `record_${uuid || fallbackRandomPart()}`;
}

// v3 records did not have an ID. Deriving the first v4 ID from the immutable
// legacy payload makes a repeated, read-only migration produce the same state.
export function createLegacyRecordId(scope, index, record) {
  const value = JSON.stringify([scope, index, record]);
  let hash = 2166136261;
  for (let offset = 0; offset < value.length; offset += 1) {
    hash ^= value.charCodeAt(offset);
    hash = Math.imul(hash, 16777619);
  }
  return `record_legacy-${scope}-${index}-${(hash >>> 0).toString(36)}`;
}

export function isRecordId(value) {
  return typeof value === 'string' && /^record_[A-Za-z0-9_-]+(?:-[A-Za-z0-9_-]+)*$/.test(value);
}
