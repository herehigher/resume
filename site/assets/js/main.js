import { createDefaultState } from './state/defaults.js';
import { loadStoredState } from './state/storage.js';
import { createStore } from './state/store.js';
import { initJapaneseEditor } from './ui/japanese-editor.js';

const storedState = loadStoredState(window.localStorage);

const store = createStore({
  storage: window.localStorage,
  initialState: storedState || createDefaultState()
});

initJapaneseEditor(store);
