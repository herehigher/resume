import { createJapaneseSampleState, cloneData } from '../state/defaults.js';
import { getJapaneseFields, renderJapaneseDocument } from '../templates/ja.js';
import { addProfileLink, removeProfileLink } from '../utils/profile-links.js';
import { canAddProfileLink, renderProfileLinksEditor, updateProfileLinkRecognition } from './profile-links-editor.js';
import { messageForDraftStorageError } from './draft-storage-error.js';
import { confirmSampleAdoption } from './confirmation-dialog.js';

const PROFILE_FIELD_NAMES = new Set([
  'fullName',
  'birthDate',
  'gender',
  'postalCode',
  'address',
  'phone',
  'email'
]);

export async function protectDraftBeforeSample(store, shouldPersistDraft) {
  const currentDraft = cloneData(store.getState());
  if (shouldPersistDraft) await store.save();
  return currentDraft;
}

export function initJapaneseEditor(store, { embeddedPhotoUrl } = {}) {
  if (!embeddedPhotoUrl) throw new TypeError('Embedded photo URL helper is required');
  const form = document.getElementById('resumeForm');
  const preview = document.getElementById('documentPreview');
  const saveStatus = document.getElementById('saveStatus');
  const completionBar = document.getElementById('completionBar');
  const completionLabel = document.getElementById('completionLabel');
  const confirmDialog = document.getElementById('confirmDialog');
  const clearButton = document.getElementById('clearButton');
  let zoom = 1;
  let saveTimer;
  let draftMessageTimer;
  let shouldPersistDraft = store.hasStoredState();
  let sampleMode = false;
  let draftBeforeSample = null;
  let draftBeforeSampleWasStored = false;

  function japaneseDocument() {
    return store.getState().documents.ja;
  }

  function setDraftStatus(message, tone = '') {
    window.clearTimeout(draftMessageTimer);
    saveStatus.textContent = message;
    saveStatus.classList.toggle('is-success', tone === 'success');
    saveStatus.classList.toggle('is-saving', tone === 'saving');
    saveStatus.classList.toggle('is-error', tone === 'error');
  }

  function showDraftMessage(message, {
    fallback = '入力内容は自動保存されます',
    fallbackTone = '',
    tone = 'success'
  } = {}) {
    setDraftStatus(message, tone);
    draftMessageTimer = window.setTimeout(() => {
      setDraftStatus(fallback, fallbackTone);
    }, 3000);
  }

  function scheduleSave() {
    window.clearTimeout(saveTimer);
    if (sampleMode) return;
    shouldPersistDraft = true;
    setDraftStatus('保存中…', 'saving');
    saveTimer = window.setTimeout(async () => {
      try {
        await store.save();
        setDraftStatus('この端末に保存済み', 'success');
      } catch (error) {
        setDraftStatus(messageForDraftStorageError(error, 'ja', '暗号化した下書きを保存できませんでした'), 'error');
      }
    }, 300);
  }

  function mutate(mutator) {
    store.update(mutator, { persist: false });
    scheduleSave();
  }

  function setSampleModeUI(active) {
    document.getElementById('draftNormalActions').hidden = active;
    document.getElementById('sampleModeActions').hidden = !active;
    clearButton.hidden = active;
  }

  async function enterSampleMode() {
    window.clearTimeout(saveTimer);
    let currentDraft;
    try {
      currentDraft = await protectDraftBeforeSample(store, shouldPersistDraft);
    } catch (error) {
      setDraftStatus(messageForDraftStorageError(error, 'ja', '現在の下書きを保護できないため、入力例を表示できません'), 'error');
      return;
    }
    draftBeforeSample = currentDraft;
    draftBeforeSampleWasStored = shouldPersistDraft;
    sampleMode = true;
    store.replace(createJapaneseSampleState(store.getState()), { type: 'sample' });
    setSampleModeUI(true);
    setDraftStatus('入力例を一時表示しています');
  }

  function restoreDraftFromSample({ announce = true } = {}) {
    if (!sampleMode) return false;
    store.replace(draftBeforeSample, { type: 'restore' });
    shouldPersistDraft = draftBeforeSampleWasStored;
    sampleMode = false;
    draftBeforeSample = null;
    setSampleModeUI(false);
    const fallback = shouldPersistDraft ? 'この端末に保存済み' : '下書きは保存されていません';
    const fallbackTone = shouldPersistDraft ? 'success' : '';
    if (announce) {
      showDraftMessage('元の下書きに戻りました', { fallback, fallbackTone });
    } else {
      setDraftStatus(fallback, fallbackTone);
    }
    return true;
  }

  async function adoptSampleAsDraft() {
    if (!sampleMode) return;
    const confirmed = await confirmSampleAdoption({
      title: '入力例を下書きとして使用しますか？',
      body: '現在の下書きは入力例で上書きされます。この操作は取り消せません。',
      cancel: 'キャンセル',
      confirm: '使用する'
    });
    if (!confirmed || !sampleMode) return;
    try {
      await store.save();
      shouldPersistDraft = true;
      sampleMode = false;
      draftBeforeSample = null;
      draftBeforeSampleWasStored = false;
      setSampleModeUI(false);
      showDraftMessage('入力例を下書きとして保存しました', {
        fallback: 'この端末に保存済み',
        fallbackTone: 'success'
      });
    } catch (error) {
      setDraftStatus(messageForDraftStorageError(error, 'ja', '入力例を下書きとして保存できませんでした'), 'error');
    }
  }

  function renderSimpleList(type, containerId) {
    const container = document.getElementById(containerId);
    const items = japaneseDocument()[type];
    container.innerHTML = '';
    if (!items.length) {
      container.innerHTML = '<div class="empty-list">項目がありません。「追加」から入力できます。</div>';
      return;
    }
    items.forEach((item, index) => {
      const row = document.getElementById('simpleRowTemplate').content.firstElementChild.cloneNode(true);
      row.dataset.type = type;
      row.dataset.index = String(index);
      row.querySelector('[data-key="date"]').value = item.date || '';
      row.querySelector('[data-key="detail"]').value = item.detail || '';
      if (type === 'qualification') {
        row.classList.add('has-credential-link');
        row.querySelector('[data-key="url"]').value = item.url || '';
      } else {
        row.querySelector('.credential-link-field').remove();
      }
      container.appendChild(row);
    });
  }

  function renderCareerList() {
    const container = document.getElementById('careerList');
    const careers = japaneseDocument().careers;
    container.innerHTML = '';
    if (!careers.length) {
      container.innerHTML = '<div class="empty-list">勤務先がありません。「追加」から入力できます。</div>';
      return;
    }
    careers.forEach((career, index) => {
      const item = document.getElementById('careerRowTemplate').content.firstElementChild.cloneNode(true);
      item.dataset.index = String(index);
      item.querySelector('[data-career-number]').textContent = String(index + 1);
      item.querySelectorAll('[data-key]').forEach((field) => {
        field.value = career[field.dataset.key] || '';
      });
      container.appendChild(item);
    });
  }

  function renderLists() {
    renderSimpleList('education', 'educationList');
    renderSimpleList('employment', 'employmentList');
    renderSimpleList('qualification', 'qualificationList');
    renderCareerList();
  }

  function renderProfileLinks() {
    const links = store.getState().profile.fields.links;
    renderProfileLinksEditor(document.getElementById('profileLinksEditor'), links, {
      placeholder: 'https://example.com',
      removeLabel: 'リンクを削除'
    });
    const addButton = document.getElementById('addProfileLinkButton');
    addButton.disabled = !canAddProfileLink(links);
    addButton.textContent = canAddProfileLink(links) ? '＋ リンクを追加' : 'リンクは最大3件です';
  }

  function updatePhotoUI() {
    const photo = store.getState().profile.photo;
    const displayUrl = embeddedPhotoUrl.resolve(photo);
    const thumbnail = document.getElementById('photoThumbnail');
    thumbnail.replaceChildren();
    if (displayUrl) {
      const image = document.createElement('img');
      image.src = displayUrl;
      image.alt = '証明写真のプレビュー';
      thumbnail.appendChild(image);
    } else {
      const placeholder = document.createElement('span');
      placeholder.textContent = '写真';
      thumbnail.appendChild(placeholder);
    }
    document.getElementById('removePhotoButton').hidden = !photo;
  }

  function renderDocumentControls() {
    const documentType = japaneseDocument().activeDocument;
    document.querySelectorAll('.document-tab').forEach((tab) => {
      const selected = tab.dataset.document === documentType;
      tab.classList.toggle('is-active', selected);
      tab.setAttribute('aria-selected', String(selected));
      tab.setAttribute('tabindex', selected ? '0' : '-1');
    });
    document.getElementById('resumeFields').hidden = documentType !== 'resume';
    document.getElementById('careerFields').hidden = documentType !== 'career';
    document.getElementById('editorEyebrow').textContent = documentType === 'resume' ? 'RÉSUMÉ' : 'CAREER HISTORY';
    document.getElementById('editorTitle').textContent = documentType === 'resume' ? '履歴書を作成' : '職務経歴書を作成';
    document.getElementById('editorDescription').textContent = documentType === 'resume'
      ? '入力内容は右側の書類にすぐ反映されます。'
      : '経験と実績を、読みやすい書類に整えます。';
    document.getElementById('previewDocumentName').textContent = documentType === 'resume' ? '履歴書' : '職務経歴書';
  }

  function setMobileView(view) {
    if (!['editor', 'preview'].includes(view)) return;
    document.querySelectorAll('[data-mobile-view]').forEach((button) => {
      const selected = button.dataset.mobileView === view;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    document.getElementById('japaneseWorkspace').dataset.mobileMode = view;
    if (view === 'preview') window.requestAnimationFrame(fitPreviewForViewport);
  }

  function updateCompletion() {
    const state = store.getState();
    const fields = getJapaneseFields(state);
    const document = state.documents.ja;
    const sharedRequired = [fields.fullName, fields.birthDate, fields.address, fields.phone, fields.email];
    const documentRequired = document.activeDocument === 'resume'
      ? [document.education.some((item) => item.detail), document.employment.some((item) => item.detail), fields.motivation]
      : [fields.careerSummary, fields.skills, document.careers.some((item) => item.company && item.responsibilities), fields.selfPromotion];
    const values = [...sharedRequired, ...documentRequired];
    const percentage = Math.round((values.filter(Boolean).length / values.length) * 100);
    completionBar.style.width = `${percentage}%`;
    completionLabel.textContent = `${percentage}% 完了`;
  }

  function applyZoom() {
    preview.style.transform = `scale(${zoom})`;
    document.getElementById('zoomLabel').textContent = `${Math.round(zoom * 100)}%`;
    const pages = preview.querySelectorAll('.document-page');
    const naturalHeight = Array.from(pages).reduce((sum, page) => sum + page.offsetHeight + 28, 0);
    preview.parentElement.style.setProperty('--scaled-height', `${naturalHeight * zoom}px`);
    preview.style.marginBottom = `${Math.min(0, naturalHeight * (zoom - 1))}px`;
  }

  function fitPreviewForViewport() {
    if (!preview.querySelector('.document-page')) return;
    const wide = window.innerWidth > 820;
    const padding = wide ? 68 : 28;
    const fallbackWidth = wide ? 760 : 595;
    const availableWidth = document.getElementById('previewScroll').clientWidth - padding;
    const paperWidth = preview.querySelector('.document-page')?.offsetWidth || fallbackWidth;
    zoom = Math.min(1, Math.max(wide ? .55 : .45, availableWidth / paperWidth));
    applyZoom();
  }

  function renderPreview() {
    const state = store.getState();
    preview.innerHTML = renderJapaneseDocument(state, {
      photoUrl: embeddedPhotoUrl.resolve(state.profile.photo)
    });
    updateCompletion();
    window.requestAnimationFrame(fitPreviewForViewport);
  }

  function hydrateForm() {
    const fields = getJapaneseFields(store.getState());
    Object.entries(fields).forEach(([name, value]) => {
      const field = form.elements.namedItem(name);
      if (field) field.value = value || '';
    });
    updatePhotoUI();
    renderProfileLinks();
    renderLists();
    renderDocumentControls();
    setMobileView(document.getElementById('japaneseWorkspace').dataset.mobileMode || 'editor');
    renderPreview();
  }

  function switchDocument(documentType) {
    if (!['resume', 'career'].includes(documentType)) return;
    mutate((state) => {
      state.documents.ja.activeDocument = documentType;
    });
    renderDocumentControls();
    renderPreview();
  }

  function onFormInput(event) {
    const target = event.target;
    if (target.dataset.profileLinkIndex !== undefined) {
      mutate((state) => {
        state.profile.fields.links[Number(target.dataset.profileLinkIndex)] = target.value;
      });
      updateProfileLinkRecognition(target);
      renderPreview();
      return;
    }
    if (!target.name) return;
    mutate((state) => {
      const targetFields = PROFILE_FIELD_NAMES.has(target.name)
        ? state.profile.fields
        : state.documents.ja.fields;
      targetFields[target.name] = target.value;
    });
    renderPreview();
  }

  function onListInput(event) {
    const field = event.target.closest('[data-key]');
    if (!field) return;
    const simpleRow = field.closest('.repeating-row');
    const careerItem = field.closest('.career-editor-item');
    mutate((state) => {
      if (simpleRow) {
        state.documents.ja[simpleRow.dataset.type][Number(simpleRow.dataset.index)][field.dataset.key] = field.value;
      } else if (careerItem) {
        state.documents.ja.careers[Number(careerItem.dataset.index)][field.dataset.key] = field.value;
      }
    });
    renderPreview();
  }

  function addItem(type) {
    mutate((state) => {
      if (type === 'career') {
        state.documents.ja.careers.push({
          company: '',
          role: '',
          startDate: '',
          endDate: '',
          companyInfo: '',
          responsibilities: '',
          achievements: ''
        });
      } else if (['education', 'employment', 'qualification'].includes(type)) {
        state.documents.ja[type].push(type === 'qualification'
          ? { date: '', detail: '', url: '' }
          : { date: '', detail: '' });
      }
    });
    renderLists();
    renderPreview();
  }

  function removeItem(button) {
    const simpleRow = button.closest('.repeating-row');
    const careerItem = button.closest('.career-editor-item');
    mutate((state) => {
      if (simpleRow) state.documents.ja[simpleRow.dataset.type].splice(Number(simpleRow.dataset.index), 1);
      if (careerItem) state.documents.ja.careers.splice(Number(careerItem.dataset.index), 1);
    });
    renderLists();
    renderPreview();
  }

  async function handlePhoto(file) {
    if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return;
    const sourceUrl = URL.createObjectURL(file);
    try {
      const image = await new Promise((resolve, reject) => {
        const candidate = new Image();
        candidate.onload = () => resolve(candidate);
        candidate.onerror = reject;
        candidate.src = sourceUrl;
      });
      const canvas = document.createElement('canvas');
      const targetRatio = 4 / 5;
      const sourceRatio = image.width / image.height;
      let sx = 0;
      let sy = 0;
      let sw = image.width;
      let sh = image.height;
      if (sourceRatio > targetRatio) {
        sw = image.height * targetRatio;
        sx = (image.width - sw) / 2;
      } else {
        sh = image.width / targetRatio;
        sy = (image.height - sh) / 2;
      }
      canvas.width = 480;
      canvas.height = 600;
      canvas.getContext('2d').drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      mutate((state) => {
        state.profile.photo = canvas.toDataURL('image/jpeg', .84);
      });
      updatePhotoUI();
      renderPreview();
    } finally {
      URL.revokeObjectURL(sourceUrl);
    }
  }

  form.addEventListener('input', onFormInput);
  ['educationList', 'employmentList', 'qualificationList', 'careerList'].forEach((id) => {
    document.getElementById(id).addEventListener('input', onListInput);
  });

  document.addEventListener('click', (event) => {
    const documentTab = event.target.closest('[data-document]');
    const addButton = event.target.closest('[data-add]');
    const removeButton = event.target.closest('.remove-row-button, .remove-career-button');
    const removeProfileLinkButton = event.target.closest('[data-remove-profile-link]');
    const mobileViewButton = event.target.closest('[data-mobile-view]');
    if (documentTab) switchDocument(documentTab.dataset.document);
    if (addButton) addItem(addButton.dataset.add);
    if (removeButton) removeItem(removeButton);
    if (removeProfileLinkButton) {
      mutate((state) => removeProfileLink(state.profile.fields, Number(removeProfileLinkButton.dataset.removeProfileLink)));
      renderProfileLinks();
      renderPreview();
    }
    if (event.target.closest('#addProfileLinkButton')) {
      mutate((state) => addProfileLink(state.profile.fields));
      renderProfileLinks();
      renderPreview();
    }
    if (mobileViewButton) {
      setMobileView(mobileViewButton.dataset.mobileView);
    }
  });

  document.querySelector('.document-switcher').addEventListener('keydown', (event) => {
    const currentTab = event.target.closest('[data-document]');
    if (!currentTab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const tabs = [...document.querySelectorAll('[data-document]')];
    const currentIndex = tabs.indexOf(currentTab);
    const nextIndex = event.key === 'Home' ? 0
      : event.key === 'End' ? tabs.length - 1
        : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    event.preventDefault();
    const nextTab = tabs[nextIndex];
    nextTab.focus();
    switchDocument(nextTab.dataset.document);
  });

  document.getElementById('photoInput').addEventListener('change', (event) => handlePhoto(event.target.files?.[0]));
  document.getElementById('removePhotoButton').addEventListener('click', () => {
    mutate((state) => {
      state.profile.photo = '';
    });
    document.getElementById('photoInput').value = '';
    updatePhotoUI();
    renderPreview();
  });
  document.getElementById('loadSampleButton').addEventListener('click', enterSampleMode);
  document.getElementById('restoreDraftButton').addEventListener('click', () => restoreDraftFromSample());
  document.getElementById('adoptSampleButton').addEventListener('click', adoptSampleAsDraft);
  clearButton.addEventListener('click', () => confirmDialog.showModal());
  document.getElementById('confirmClearButton').addEventListener('click', async () => {
    window.clearTimeout(saveTimer);
    try {
      await store.clearPersisted();
      store.reset(store.getState().settings.locale);
      shouldPersistDraft = false;
      sampleMode = false;
      setSampleModeUI(false);
      showDraftMessage('下書きデータを削除しました', {
        fallback: '下書きは保存されていません'
      });
      window.setTimeout(() => document.getElementById('loadSampleButton').focus());
    } catch {
      setDraftStatus('下書きデータを削除できませんでした', 'error');
    }
  });
  document.getElementById('printButton').addEventListener('click', () => window.print());
  document.getElementById('zoomOutButton').addEventListener('click', () => {
    zoom = Math.max(.4, zoom - .1);
    applyZoom();
  });
  document.getElementById('zoomInButton').addEventListener('click', () => {
    zoom = Math.min(1.2, zoom + .1);
    applyZoom();
  });
  window.addEventListener('resize', fitPreviewForViewport);
  window.addEventListener('pagehide', () => {
    window.clearTimeout(saveTimer);
    if (sampleMode || !shouldPersistDraft) return;
    void store.save().catch(() => {});
  });

  store.subscribe((_state, event) => {
    if (event.type === 'import' && sampleMode) {
      sampleMode = false;
      draftBeforeSample = null;
      draftBeforeSampleWasStored = false;
      shouldPersistDraft = true;
      setSampleModeUI(false);
    }
    if (['import', 'reload', 'reset', 'sample', 'restore'].includes(event.type)) hydrateForm();
  });

  hydrateForm();
  return {
    refresh: hydrateForm,
    restoreDraftBeforePersistence() {
      window.clearTimeout(saveTimer);
      return restoreDraftFromSample({ announce: false });
    }
  };
}
