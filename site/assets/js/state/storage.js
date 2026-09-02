import { STORAGE_KEY } from '../config.js';
import { cloneData } from './defaults.js';
import { assertValidState, validateState } from './schema.js';

export const ENCRYPTED_DRAFT_FORMAT = 'resume-studio-local-encrypted-v1';
export const ENCRYPTED_DRAFT_ALGORITHM = 'AES-GCM';
const KEY_DATABASE = 'resume-studio-web-v1-keys';
const KEY_STORE = 'keys';
const KEY_ID = 'draft-encryption-key';
const NONCE_BYTES = 12;
const MAX_ENVELOPE_CHARACTERS = 4 * 1024 * 1024;
const MAX_CIPHERTEXT_BYTES = 3 * 1024 * 1024;

export class DraftStorageError extends Error {
  constructor(code, cause) {
    super(code);
    this.name = 'DraftStorageError';
    this.code = code;
    this.cause = cause;
  }
}

function toBase64(bytes) {
  let value = '';
  bytes.forEach((byte) => { value += String.fromCharCode(byte); });
  return btoa(value);
}

function fromBase64(value, maximumBytes) {
  if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new DraftStorageError('corrupt-envelope');
  if (value.length > Math.ceil(maximumBytes / 3) * 4) throw new DraftStorageError('corrupt-envelope');
  try {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  } catch (error) {
    throw new DraftStorageError('corrupt-envelope', error);
  }
}

function createKeyStore(indexedDB) {
  if (!indexedDB) throw new DraftStorageError('indexeddb-unavailable');
  let databasePromise;
  function unavailable(error) {
    databasePromise = null;
    return new DraftStorageError('indexeddb-unavailable', error);
  }
  function database() {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      let request;
      try { request = indexedDB.open(KEY_DATABASE, 1); } catch (error) {
        reject(new DraftStorageError('indexeddb-unavailable', error));
        return;
      }
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(KEY_STORE)) request.result.createObjectStore(KEY_STORE);
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => {
          request.result.close();
          databasePromise = null;
        };
        resolve(request.result);
      };
      request.onerror = () => reject(unavailable(request.error));
      request.onblocked = () => reject(unavailable());
    });
    return databasePromise;
  }
  async function read() {
    const db = await database();
    return new Promise((resolve, reject) => {
      let request;
      try { request = db.transaction(KEY_STORE, 'readonly').objectStore(KEY_STORE).get(KEY_ID); } catch (error) {
        reject(unavailable(error));
        return;
      }
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(unavailable(request.error));
    });
  }
  async function write(key) {
    const db = await database();
    return new Promise((resolve, reject) => {
      let transaction;
      try {
        transaction = db.transaction(KEY_STORE, 'readwrite');
        transaction.objectStore(KEY_STORE).put(key, KEY_ID);
      } catch (error) {
        reject(unavailable(error));
        return;
      }
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(unavailable(transaction.error));
      transaction.onabort = () => reject(unavailable(transaction.error));
    });
  }
  async function remove() {
    const db = await database();
    return new Promise((resolve, reject) => {
      let transaction;
      try {
        transaction = db.transaction(KEY_STORE, 'readwrite');
        transaction.objectStore(KEY_STORE).delete(KEY_ID);
      } catch (error) {
        reject(unavailable(error));
        return;
      }
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(unavailable(transaction.error));
      transaction.onabort = () => reject(unavailable(transaction.error));
    });
  }
  return { read, write, remove };
}

function validateEnvelope(value) {
  const keys = ['algorithm', 'ciphertext', 'format', 'nonce'];
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== keys.join(',') || value.format !== ENCRYPTED_DRAFT_FORMAT || value.algorithm !== ENCRYPTED_DRAFT_ALGORITHM || typeof value.nonce !== 'string' || typeof value.ciphertext !== 'string') throw new DraftStorageError('corrupt-envelope');
  const nonce = fromBase64(value.nonce, NONCE_BYTES);
  const ciphertext = fromBase64(value.ciphertext, MAX_CIPHERTEXT_BYTES);
  if (nonce.byteLength !== NONCE_BYTES || ciphertext.byteLength === 0) throw new DraftStorageError('corrupt-envelope');
  return { nonce, ciphertext };
}

function isPlaintextState(value) {
  return value && typeof value === 'object' && validateState(value).valid;
}

export function createDraftStorage(storage, { crypto = globalThis.crypto, indexedDB = globalThis.indexedDB, keyStore = null } = {}) {
  if (!storage) throw new TypeError('localStorage is required');
  const cryptography = crypto?.subtle ? crypto : null;
  let keyStoreInstance;
  let persistenceTail = Promise.resolve();
  function keys() {
    if (!keyStoreInstance) keyStoreInstance = keyStore || createKeyStore(indexedDB);
    return keyStoreInstance;
  }
  function enqueue(operation) {
    const task = persistenceTail.then(operation, operation);
    persistenceTail = task.catch(() => {});
    return task;
  }
  async function encryptionKey({ create = false } = {}) {
    if (!cryptography) throw new DraftStorageError('crypto-unavailable');
    const store = keys();
    let key = await store.read();
    if (key && (key.type !== 'secret' || key.extractable || key.algorithm?.name !== ENCRYPTED_DRAFT_ALGORITHM || !key.usages?.includes('encrypt') || !key.usages?.includes('decrypt'))) {
      throw new DraftStorageError('key-invalid');
    }
    if (!key && create) {
      try { key = await cryptography.subtle.generateKey({ name: ENCRYPTED_DRAFT_ALGORITHM, length: 256 }, false, ['encrypt', 'decrypt']); } catch (error) {
        throw new DraftStorageError('crypto-failed', error);
      }
      try { await store.write(key); } catch (error) {
        throw error instanceof DraftStorageError ? error : new DraftStorageError('indexeddb-unavailable', error);
      }
    }
    if (!key) throw new DraftStorageError('key-missing');
    return key;
  }
  async function encrypt(state, allowKeyCreation) {
    assertValidState(state);
    const key = await encryptionKey({ create: allowKeyCreation });
    let nonce;
    let encrypted;
    try {
      nonce = cryptography.getRandomValues(new Uint8Array(NONCE_BYTES));
      encrypted = await cryptography.subtle.encrypt({ name: ENCRYPTED_DRAFT_ALGORITHM, iv: nonce }, key, new TextEncoder().encode(JSON.stringify(state)));
    } catch (error) {
      throw new DraftStorageError('crypto-failed', error);
    }
    return JSON.stringify({ format: ENCRYPTED_DRAFT_FORMAT, algorithm: ENCRYPTED_DRAFT_ALGORITHM, nonce: toBase64(nonce), ciphertext: toBase64(new Uint8Array(encrypted)) });
  }
  async function decrypt(envelope) {
    const { nonce, ciphertext } = validateEnvelope(envelope);
    const key = await encryptionKey();
    let plaintext;
    try { plaintext = await cryptography.subtle.decrypt({ name: ENCRYPTED_DRAFT_ALGORITHM, iv: nonce }, key, ciphertext); } catch (error) {
      throw new DraftStorageError('decrypt-failed', error);
    }
    try {
      const state = JSON.parse(new TextDecoder().decode(plaintext));
      if (!isPlaintextState(state)) throw new DraftStorageError('corrupt-envelope');
      return state;
    } catch (error) {
      throw error instanceof DraftStorageError ? error : new DraftStorageError('corrupt-envelope', error);
    }
  }
  async function load() {
    let raw;
    try { raw = storage.getItem(STORAGE_KEY); } catch (error) { throw new DraftStorageError('storage-unavailable', error); }
    if (!raw) return null;
    if (raw.length > MAX_ENVELOPE_CHARACTERS) throw new DraftStorageError('corrupt-envelope');
    let parsed;
    try { parsed = JSON.parse(raw); } catch (error) { throw new DraftStorageError('corrupt-envelope', error); }
    if (isPlaintextState(parsed)) {
      await save(parsed, { plaintextMigration: true });
      return parsed;
    }
    return decrypt(parsed);
  }
  function save(state, { plaintextMigration = false } = {}) {
    const snapshot = cloneData(assertValidState(state));
    return enqueue(async () => {
      let existing;
      try { existing = storage.getItem(STORAGE_KEY); } catch (error) { throw new DraftStorageError('storage-unavailable', error); }
      let allowKeyCreation = !existing || plaintextMigration;
      if (existing && !plaintextMigration) {
        if (existing.length > MAX_ENVELOPE_CHARACTERS) throw new DraftStorageError('corrupt-envelope');
        try {
          const parsed = JSON.parse(existing);
          if (isPlaintextState(parsed)) allowKeyCreation = true;
          else validateEnvelope(parsed);
        } catch (error) {
          throw error instanceof DraftStorageError ? error : new DraftStorageError('corrupt-envelope', error);
        }
      }
      const encrypted = await encrypt(snapshot, allowKeyCreation);
      try { storage.setItem(STORAGE_KEY, encrypted); } catch (error) { throw new DraftStorageError('storage-unavailable', error); }
    });
  }
  function remove() {
    return enqueue(async () => {
      let existing;
      try { existing = storage.getItem(STORAGE_KEY); } catch (error) { throw new DraftStorageError('storage-unavailable', error); }
      try { storage.removeItem(STORAGE_KEY); } catch (error) { throw new DraftStorageError('storage-unavailable', error); }
      try {
        await keys().remove();
      } catch (error) {
        if (existing !== null) {
          try { storage.setItem(STORAGE_KEY, existing); } catch (restoreError) {
            throw new DraftStorageError('clear-partial-failure', restoreError);
          }
        }
        throw error instanceof DraftStorageError ? error : new DraftStorageError('indexeddb-unavailable', error);
      }
    });
  }
  return { load, save, remove, flush: () => persistenceTail };
}

export async function loadStoredState(storage, options) {
  return createDraftStorage(storage, options).load();
}

export function serializeState(state) {
  assertValidState(state);
  return `${JSON.stringify(state, null, 2)}\n`;
}

export function parseImportedState(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new TypeError('JSONの形式が正しくありません。');
  }
  assertValidState(parsed);
  return cloneData(parsed);
}
