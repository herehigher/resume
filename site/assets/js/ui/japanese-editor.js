import { createJapaneseSampleState, cloneData } from '../state/defaults.js';
import { getJapaneseFields, renderJapaneseDocument } from '../templates/ja.js';

const PROFILE_FIELD_NAMES = new Set([
  'fullName',
  'birthDate',
  'gender',
  'postalCode',
  'address',
  'phone',
  'email',
  'github',
  'linkedin',
  'portfolio'
]);

export function protectDraftBeforeSample(store, shouldPersistDraft) {
  const currentDraft = cloneData(store.getState());
  if (shouldPersistDraft) store.save();
  return currentDraft;
}

export function initJapaneseEditor(store) {
  const form = document.getElementById('resumeForm');
  const preview = document.getElementById('documentPreview');
  const saveStatus = document.getElementById('saveStatus');
  const completionBar = document.getElementById('completionBar');
  const completionLabel = document.getElementById('completionLabel');
  const confirmDialog = document.getElementById('confirmDialog');
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

  function showDraftMessage(message) {
    const draftMessage = document.getElementById('draftMessage');
    window.clearTimeout(draftMessageTimer);
    draftMessage.textContent = message;
    draftMessage.classList.add('is-success');
    draftMessageTimer = window.setTimeout(() => {
      draftMessage.textContent = '入力内容は自動保存されます';
      draftMessage.classList.remove('is-success');
    }, 3000);
  }

  function saveNow(message = '下書きを保存しました') {
    window.clearTimeout(saveTimer);
    try {
      store.save();
      shouldPersistDraft = true;
      saveStatus.classList.remove('is-saving');
      saveStatus.textContent = 'この端末に保存済み';
      showDraftMessage(message);
    } catch {
      saveStatus.classList.remove('is-saving');
      saveStatus.textContent = '保存容量を超えました';
      showDraftMessage('保存できませんでした');
    }
  }

  function scheduleSave() {
    window.clearTimeout(saveTimer);
    if (sampleMode) {
      saveStatus.classList.remove('is-saving');
      saveStatus.textContent = '入力例は保存されません';
      return;
    }
    shouldPersistDraft = true;
    saveStatus.classList.add('is-saving');
    saveStatus.textContent = '保存中…';
    saveTimer = window.setTimeout(() => {
      try {
        store.save();
        saveStatus.classList.remove('is-saving');
        saveStatus.textContent = 'この端末に保存済み';
      } catch {
        saveStatus.classList.remove('is-saving');
        saveStatus.textContent = '保存容量を超えました';
      }
    }, 300);
  }

  function mutate(mutator) {
    store.update(mutator, { persist: false });
    scheduleSave();
  }

  function reloadDraft() {
    window.clearTimeout(saveTimer);
    if (!store.reload()) {
      showDraftMessage('保存された下書きはありません');
      return;
    }
    shouldPersistDraft = true;
    showDraftMessage('保存した内容を読み込みました');
  }

  function setSampleModeUI(active) {
    document.querySelector('.draft-controls').hidden = active;
    document.getElementById('sampleModePanel').hidden = !active;
    document.getElementById('clearButton').hidden = active;
    const sampleButton = document.getElementById('loadSampleButton');
    sampleButton.disabled = active;
    sampleButton.textContent = active ? '入力例を表示中' : '入力例を表示';
  }

  function enterSampleMode() {
    window.clearTimeout(saveTimer);
    let currentDraft;
    try {
      currentDraft = protectDraftBeforeSample(store, shouldPersistDraft);
    } catch {
      saveStatus.classList.remove('is-saving');
      saveStatus.textContent = '保存できませんでした';
      showDraftMessage('現在の下書きを保護できないため、入力例を表示できません');
      return;
    }
    draftBeforeSample = currentDraft;
    draftBeforeSampleWasStored = shouldPersistDraft;
    sampleMode = true;
    store.replace(createJapaneseSampleState(store.getState()), { type: 'sample' });
    setSampleModeUI(true);
    saveStatus.classList.remove('is-saving');
    saveStatus.textContent = '入力例は一時表示です';
  }

  function restoreDraftFromSample() {
    if (!sampleMode) return;
    store.replace(draftBeforeSample, { type: 'restore' });
    shouldPersistDraft = draftBeforeSampleWasStored;
    sampleMode = false;
    draftBeforeSample = null;
    setSampleModeUI(false);
    saveStatus.textContent = shouldPersistDraft ? 'この端末に保存済み' : '下書きは保存されていません';
    showDraftMessage('元の下書きに戻りました');
  }

  function adoptSampleAsDraft() {
    if (!sampleMode) return;
    sampleMode = false;
    draftBeforeSample = null;
    draftBeforeSampleWasStored = false;
    setSampleModeUI(false);
    saveNow('入力例を下書きとして保存しました');
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

  function updatePhotoUI() {
    const photo = store.getState().profile.photo;
    const thumbnail = document.getElementById('photoThumbnail');
    thumbnail.replaceChildren();
    if (photo) {
      const image = document.createElement('img');
      image.src = photo;
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
      tab.classList.toggle('is-active', tab.dataset.document === documentType);
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
    preview.innerHTML = renderJapaneseDocument(store.getState());
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
    renderLists();
    renderDocumentControls();
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
    const mobileViewButton = event.target.closest('[data-mobile-view]');
    if (documentTab) switchDocument(documentTab.dataset.document);
    if (addButton) addItem(addButton.dataset.add);
    if (removeButton) removeItem(removeButton);
    if (mobileViewButton) {
      document.querySelectorAll('[data-mobile-view]').forEach((button) => {
        button.classList.toggle('is-active', button === mobileViewButton);
      });
      document.getElementById('japaneseWorkspace').dataset.mobileMode = mobileViewButton.dataset.mobileView;
      if (mobileViewButton.dataset.mobileView === 'preview') window.requestAnimationFrame(fitPreviewForViewport);
    }
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
  document.getElementById('restoreDraftButton').addEventListener('click', restoreDraftFromSample);
  document.getElementById('adoptSampleButton').addEventListener('click', adoptSampleAsDraft);
  document.getElementById('saveDraftButton').addEventListener('click', () => saveNow());
  document.getElementById('reloadDraftButton').addEventListener('click', reloadDraft);
  document.getElementById('clearButton').addEventListener('click', () => confirmDialog.showModal());
  document.getElementById('confirmClearButton').addEventListener('click', () => {
    window.clearTimeout(saveTimer);
    try {
      store.reset();
      store.clearPersisted();
      shouldPersistDraft = false;
      sampleMode = false;
      setSampleModeUI(false);
      saveStatus.classList.remove('is-saving');
      saveStatus.textContent = '下書きは保存されていません';
      showDraftMessage('下書きデータを削除しました');
    } catch {
      showDraftMessage('下書きデータを削除できませんでした');
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
    try {
      store.save();
    } catch {
      // 保存容量を超えた場合は既存データを維持する。
    }
  });

  store.subscribe((_state, event) => {
    if (['reload', 'reset', 'sample', 'restore'].includes(event.type)) hydrateForm();
  });

  hydrateForm();
}
