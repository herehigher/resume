import { createEnglishSampleState } from '../data/en-sample.js';
import { cloneData } from '../state/defaults.js';
import { renderEnglishDocument } from '../templates/en.js';
import { addProfileLink, removeProfileLink } from '../utils/profile-links.js';
import { canAddProfileLink, renderProfileLinksEditor, updateProfileLinkRecognition } from './profile-links-editor.js';
import { messageForDraftStorageError } from './draft-storage-error.js';
import { confirmAction } from './confirmation-dialog.js';

const PROFILE_FIELDS = new Set(['fullName', 'phone', 'email']);
const RESUME_FIELDS = new Set(['headline', 'location', 'summary', 'skills']);
const MONTH_VALUE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

const ITEM_SHAPES = Object.freeze({
  experience: { startDate: '', endDate: '', company: '', role: '', details: '' },
  projects: { startDate: '', endDate: '', name: '', role: '', details: '', url: '' },
  education: { startDate: '', endDate: '', school: '', degree: '', details: '' },
  certifications: { date: '', name: '', url: '' }
});

export function createEnglishItem(type) {
  return ITEM_SHAPES[type] ? { ...ITEM_SHAPES[type] } : null;
}

export function renderEnglishWorkspace() {
  return `<main class="workspace english-workspace" lang="en" data-english-editor data-mobile-mode="editor" hidden>
    <div class="en-mobile-view-switch" aria-label="Mobile view">
      <button class="is-active" aria-pressed="true" data-en-mobile-view="editor" type="button">Edit</button>
      <button aria-pressed="false" data-en-mobile-view="preview" type="button">Preview</button>
    </div>
    <section class="editor-panel" aria-label="English resume editor">
      <div class="editor-heading">
        <div>
          <p class="eyebrow">ATS RESUME</p>
          <h1>Create your resume</h1>
          <p>Your changes appear in the preview as you type.</p>
        </div>
        <span class="completion-label" data-en-completion-label>0% complete</span>
      </div>
      <div class="completion-track" aria-hidden="true"><span data-en-completion-bar></span></div>

      <section class="draft-controls" aria-label="Draft status and actions">
        <div class="draft-primary-row">
          <span class="draft-message is-success" data-en-save-status role="status" aria-live="polite">Saved on this device.</span>
          <div class="draft-normal-actions" data-en-normal-actions>
            <button class="secondary-button" data-en-load-sample type="button">View example</button>
          </div>
          <div class="draft-sample-actions" data-en-sample-actions hidden>
            <span class="sample-mode-copy"><strong>Viewing an example resume</strong><small>Your saved draft has not been changed.</small></span>
            <button class="secondary-button" data-en-restore-sample type="button">Return to my draft</button>
            <button class="primary-button" data-en-adopt-sample type="button">Use this example as my draft</button>
          </div>
        </div>
        <div class="draft-clear-row">
          <button class="draft-clear-button" data-en-clear type="button">Clear draft from this device</button>
          <span class="draft-clear-notice">Your input is encrypted and saved only on this device.</span>
        </div>
      </section>

      <form data-en-form autocomplete="on">
        <details class="form-section" open>
          <summary>
            <span class="section-number">01</span>
            <span><strong>Contact details</strong><small>Name, city-level location, phone, email, and professional profiles</small></span>
            <svg aria-hidden="true" viewBox="0 0 20 20"><path d="m5 7 5 5 5-5"/></svg>
          </summary>
          <div class="section-content">
            <label class="input-field"><span>Full name <em>Required</em></span><input data-profile-field="fullName" autocomplete="name" required></label>
            <label class="input-field"><span>Professional headline</span><input data-resume-field="headline" placeholder="Senior Product Manager"></label>
            <div class="field-grid two-columns">
              <label class="input-field"><span>Phone</span><input data-profile-field="phone" type="tel" autocomplete="tel"></label>
              <label class="input-field"><span>Email</span><input data-profile-field="email" type="email" autocomplete="email"></label>
            </div>
            <label class="input-field"><span>City, State / Country</span><input data-resume-field="location" autocomplete="address-level2" placeholder="Seattle, WA / United States"></label>
            <div class="profile-links-editor" data-en-profile-links></div>
            <button class="small-add-button" data-en-add-profile-link type="button">Add link</button>
            <span class="field-help">Up to 3 links. The site name and icon are matched from the URL.</span>
          </div>
        </details>

        <details class="form-section" open>
          <summary>
            <span class="section-number">02</span>
            <span><strong>Professional summary</strong><small>Highlight your experience and impact</small></span>
            <svg aria-hidden="true" viewBox="0 0 20 20"><path d="m5 7 5 5 5-5"/></svg>
          </summary>
          <div class="section-content">
            <label class="input-field"><span>Summary</span><textarea data-resume-field="summary" rows="5" placeholder="Summarize your experience, strengths, and measurable impact."></textarea></label>
          </div>
        </details>

        <details class="form-section" open>
          <summary>
            <span class="section-number">03</span>
            <span><strong>Experience</strong><small>Displayed in reverse chronological order</small></span>
            <svg aria-hidden="true" viewBox="0 0 20 20"><path d="m5 7 5 5 5-5"/></svg>
          </summary>
          <div class="section-content">
            <div class="list-heading"><strong>Roles</strong><button class="small-add-button" data-en-add="experience" type="button">+ Add</button></div>
            <div class="english-editor-list" data-en-list="experience"></div>
          </div>
        </details>

        <details class="form-section">
          <summary>
            <span class="section-number">04</span>
            <span><strong>Projects</strong><small>Selected work and outcomes</small></span>
            <svg aria-hidden="true" viewBox="0 0 20 20"><path d="m5 7 5 5 5-5"/></svg>
          </summary>
          <div class="section-content">
            <div class="list-heading"><strong>Projects</strong><button class="small-add-button" data-en-add="projects" type="button">+ Add</button></div>
            <div class="english-editor-list" data-en-list="projects"></div>
          </div>
        </details>

        <details class="form-section">
          <summary>
            <span class="section-number">05</span>
            <span><strong>Education</strong><small>Degrees and relevant study</small></span>
            <svg aria-hidden="true" viewBox="0 0 20 20"><path d="m5 7 5 5 5-5"/></svg>
          </summary>
          <div class="section-content">
            <div class="list-heading"><strong>Education</strong><button class="small-add-button" data-en-add="education" type="button">+ Add</button></div>
            <div class="english-editor-list" data-en-list="education"></div>
          </div>
        </details>

        <details class="form-section">
          <summary>
            <span class="section-number">06</span>
            <span><strong>Skills and certifications</strong><small>Use job-relevant terms and official credential names</small></span>
            <svg aria-hidden="true" viewBox="0 0 20 20"><path d="m5 7 5 5 5-5"/></svg>
          </summary>
          <div class="section-content">
            <label class="input-field"><span>Skills</span><textarea data-resume-field="skills" rows="4" placeholder="Product strategy, SQL, Customer research, Agile delivery"></textarea></label>
            <div class="list-heading has-divider"><strong>Certifications</strong><button class="small-add-button" data-en-add="certifications" type="button">+ Add</button></div>
            <div class="english-editor-list" data-en-list="certifications"></div>
          </div>
        </details>
      </form>
      <div class="editor-footer editor-footer--legal">
        <div class="editor-legal">
          <p><span data-editor-analytics-disclosure="status">Analytics is disabled in this source build. It makes no analytics requests.</span></p>
          <p class="editor-copyright">© 2026 herehigher · <a href="https://github.com/herehigher/resume/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">MIT License</a></p>
        </div>
      </div>
    </section>

    <section class="preview-panel" aria-label="English resume preview">
      <div class="preview-toolbar">
        <div><span class="preview-dot"></span><strong>Live preview</strong><span>English resume</span></div>
        <label class="english-editor-page-size"><span>Paper size</span><select data-en-page-size aria-label="Paper size"><option value="LETTER">US Letter</option><option value="A4">A4</option></select></label>
      </div>
      <div class="preview-scroll" data-en-preview-scroll><div class="document-preview" data-en-preview></div></div>
    </section>
  </main>`;
}

function itemFields(type) {
  if (type === 'experience') {
    return `<label class="input-field"><span>Company</span><input data-en-item-field="company"></label>
      <label class="input-field"><span>Role</span><input data-en-item-field="role"></label>
      <div class="english-editor-date-grid">
        <label class="input-field"><span>Start date</span>${englishMonthInput('startDate')}</label>
        <label class="input-field"><span>End date <small>Leave blank for Present</small></span>${englishMonthInput('endDate')}</label>
      </div>
      <label class="input-field"><span>Responsibilities and achievements</span><textarea data-en-item-field="details" rows="5" placeholder="Write one achievement per line. Start with an action and include measurable impact when possible."></textarea></label>`;
  }
  if (type === 'projects') {
    return `<label class="input-field"><span>Project name</span><input data-en-item-field="name"></label>
      <label class="input-field"><span>Your role</span><input data-en-item-field="role"></label>
      <div class="english-editor-date-grid">
        <label class="input-field"><span>Start date</span>${englishMonthInput('startDate')}</label>
        <label class="input-field"><span>End date <small>Leave blank for Present</small></span>${englishMonthInput('endDate')}</label>
      </div>
      <label class="input-field"><span>Project achievements</span><textarea data-en-item-field="details" rows="4" placeholder="Write one outcome or contribution per line."></textarea></label>
      <label class="input-field"><span>Project URL</span><input data-en-item-field="url" type="url" inputmode="url"></label>`;
  }
  if (type === 'education') {
    return `<label class="input-field"><span>School</span><input data-en-item-field="school"></label>
      <label class="input-field"><span>Degree or program</span><input data-en-item-field="degree"></label>
      <div class="english-editor-date-grid">
        <label class="input-field"><span>Start date</span>${englishMonthInput('startDate')}</label>
        <label class="input-field"><span>End date <small>Leave blank if current</small></span>${englishMonthInput('endDate')}</label>
      </div>
      <label class="input-field"><span>Details</span><textarea data-en-item-field="details" rows="3"></textarea></label>`;
  }
  return `<label class="input-field"><span>Certification</span><input data-en-item-field="name"></label>
    <label class="input-field"><span>Date earned</span>${englishMonthInput('date')}</label>
    <label class="input-field"><span>Credential URL</span><input data-en-item-field="url" type="url" inputmode="url"></label>`;
}

function englishMonthInput(field) {
  return `<input data-en-item-field="${field}" data-en-month-input type="text" inputmode="numeric" autocomplete="off" pattern="[0-9]{4}-(0[1-9]|1[0-2])" placeholder="YYYY-MM">`;
}

function renderEditorItem(type, item, index) {
  const element = document.createElement('article');
  element.className = 'english-editor-item';
  element.dataset.enItem = type;
  element.dataset.index = String(index);
  element.innerHTML = `<div class="english-editor-item-heading"><strong>${type === 'certifications' ? 'Certification' : 'Entry'} ${index + 1}</strong><button class="english-editor-remove" data-en-remove type="button" aria-label="Remove entry ${index + 1}">Remove</button></div>${itemFields(type)}`;
  element.querySelectorAll('[data-en-item-field]').forEach((field) => {
    field.value = item[field.dataset.enItemField] || '';
  });
  return element;
}

export function initEnglishEditor(store, { root = document.querySelector('[data-english-editor]') } = {}) {
  if (!root) {
    return {
      available: false,
      render() {},
      restoreDraftBeforePersistence() { return false; },
      destroy() {}
    };
  }

  const form = root.querySelector('[data-en-form]');
  const preview = root.querySelector('[data-en-preview]');
  const previewScroll = root.querySelector('[data-en-preview-scroll]');
  const pageSizeSelect = root.querySelector('[data-en-page-size]');
  const saveStatus = root.querySelector('[data-en-save-status]');
  const completionBar = root.querySelector('[data-en-completion-bar]');
  const completionLabel = root.querySelector('[data-en-completion-label]');
  let saveTimer;
  let sampleMode = false;
  let draftBeforeSample = null;
  let draftBeforeSampleWasStored = false;
  let shouldPersistDraft = store.hasStoredState();
  let zoom = 1;

  function resume() {
    return store.getState().documents.en.resume;
  }

  function setStatus(message, tone = '') {
    saveStatus.textContent = message;
    const normalizedTone = tone === true ? 'error' : tone;
    saveStatus.classList.toggle('is-success', normalizedTone === 'success');
    saveStatus.classList.toggle('is-saving', normalizedTone === 'saving');
    saveStatus.classList.toggle('is-error', normalizedTone === 'error');
  }

  function scheduleSave() {
    window.clearTimeout(saveTimer);
    if (sampleMode) {
      setStatus('The example is not being saved.');
      return;
    }
    shouldPersistDraft = true;
    setStatus('Saving…', 'saving');
    saveTimer = window.setTimeout(async () => {
      try {
        await store.save();
        setStatus('Saved on this device.', 'success');
      } catch (error) {
        setStatus(messageForDraftStorageError(error, 'en', 'Your changes could not be saved on this device.'), true);
      }
    }, 300);
  }

  function mutate(mutator) {
    store.update(mutator, { persist: false });
    scheduleSave();
  }

  function renderList(type) {
    const container = root.querySelector(`[data-en-list="${type}"]`);
    const items = resume()[type];
    container.replaceChildren();
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-list';
      empty.textContent = 'No entries yet. Select Add to create one.';
      container.appendChild(empty);
      return;
    }
    items.forEach((item, index) => {
      container.appendChild(renderEditorItem(type, item, index));
    });
  }

  function renderProfileLinks() {
    const links = store.getState().profile.fields.links;
    renderProfileLinksEditor(root.querySelector('[data-en-profile-links]'), links, { removeLabel: 'Remove link' });
    const addButton = root.querySelector('[data-en-add-profile-link]');
    addButton.disabled = !canAddProfileLink(links);
    addButton.textContent = canAddProfileLink(links) ? 'Add link' : 'Maximum of 3 links';
  }

  function updateCompletion() {
    const state = store.getState();
    const values = [
      state.profile.fields.fullName,
      state.profile.fields.email,
      resume().summary,
      resume().experience.some((item) => item.company && item.role && item.details),
      resume().skills
    ];
    const percentage = Math.round((values.filter(Boolean).length / values.length) * 100);
    completionBar.style.width = `${percentage}%`;
    completionLabel.textContent = `${percentage}% complete`;
  }

  function applyZoom() {
    preview.style.transform = `scale(${zoom})`;
    preview.style.marginBottom = `${Math.min(0, preview.offsetHeight * (zoom - 1))}px`;
  }

  function fitPreview() {
    const page = preview.querySelector('.english-document');
    if (!page || root.hidden) return;
    const padding = window.innerWidth > 820 ? 68 : 28;
    const availableWidth = previewScroll.clientWidth - padding;
    zoom = Math.min(1, Math.max(window.innerWidth > 820 ? .55 : .45, availableWidth / (page.offsetWidth || 816)));
    applyZoom();
  }

  function renderPreview() {
    preview.innerHTML = renderEnglishDocument(store.getState());
    updateCompletion();
    window.requestAnimationFrame(fitPreview);
  }

  function hydrate() {
    const state = store.getState();
    root.querySelectorAll('[data-profile-field]').forEach((field) => {
      field.value = state.profile.fields[field.dataset.profileField] || '';
    });
    root.querySelectorAll('[data-resume-field]').forEach((field) => {
      field.value = resume()[field.dataset.resumeField] || '';
    });
    Object.keys(ITEM_SHAPES).forEach(renderList);
    renderProfileLinks();
    pageSizeSelect.value = state.settings.pageSizeByLocale.en;
    setMobileView(root.dataset.mobileMode || 'editor');
    renderPreview();
  }

  function setMobileView(view) {
    if (!['editor', 'preview'].includes(view)) return;
    root.dataset.mobileMode = view;
    root.querySelectorAll('[data-en-mobile-view]').forEach((button) => {
      const selected = button.dataset.enMobileView === view;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    if (view === 'preview') window.requestAnimationFrame(fitPreview);
  }

  function setSampleUI(active) {
    root.querySelector('.draft-controls').classList.toggle('is-sample-mode', active);
    root.querySelector('[data-en-normal-actions]').hidden = active;
    root.querySelector('[data-en-sample-actions]').hidden = !active;
    root.querySelector('[data-en-clear]').hidden = active;
  }

  async function enterSampleMode() {
    window.clearTimeout(saveTimer);
    const currentDraft = cloneData(store.getState());
    try {
      if (shouldPersistDraft) await store.save();
    } catch (error) {
      setStatus(messageForDraftStorageError(error, 'en', 'The example cannot be shown because your current draft could not be protected.'), true);
      return;
    }
    draftBeforeSample = currentDraft;
    draftBeforeSampleWasStored = shouldPersistDraft;
    sampleMode = true;
    store.replace(createEnglishSampleState(store.getState()), { type: 'en-sample' });
    setSampleUI(true);
    setStatus('Viewing an example. Your draft is protected.');
  }

  function restoreDraftFromSample({ announce = true } = {}) {
    if (!sampleMode) return false;
    store.replace(draftBeforeSample, { type: 'en-restore' });
    shouldPersistDraft = draftBeforeSampleWasStored;
    sampleMode = false;
    draftBeforeSample = null;
    draftBeforeSampleWasStored = false;
    setSampleUI(false);
    if (announce) setStatus(shouldPersistDraft ? 'Returned to your saved draft.' : 'Returned to your draft.', shouldPersistDraft ? 'success' : '');
    return true;
  }

  async function adoptSample() {
    if (!sampleMode) return;
    const confirmed = await confirmAction({
      title: 'Use this example as your draft?',
      body: 'The example will replace your current draft. This cannot be undone.',
      cancel: 'Cancel',
      confirm: 'Use example'
    });
    if (!confirmed || !sampleMode) return;
    try {
      await store.save();
      shouldPersistDraft = true;
      sampleMode = false;
      draftBeforeSample = null;
      draftBeforeSampleWasStored = false;
      setSampleUI(false);
      setStatus('The example was saved as your draft.', 'success');
    } catch (error) {
      setStatus(messageForDraftStorageError(error, 'en', 'The example could not be saved as your draft.'), true);
    }
  }

  async function clearDraft() {
    const confirmed = await confirmAction({
      title: 'Clear this device’s draft?',
      body: 'Your saved draft and the current input will be deleted. This cannot be undone.',
      cancel: 'Cancel',
      confirm: 'Clear draft'
    });
    if (!confirmed) return;
    window.clearTimeout(saveTimer);
    try {
      await store.clearPersisted();
      store.reset(store.getState().settings.locale);
      shouldPersistDraft = false;
      sampleMode = false;
      draftBeforeSample = null;
      draftBeforeSampleWasStored = false;
      setSampleUI(false);
      setStatus('Draft cleared.');
    } catch (error) {
      setStatus(messageForDraftStorageError(error, 'en', 'The draft could not be cleared.'), true);
    }
  }

  function onInput(event) {
    const profileField = event.target.dataset.profileField;
    const resumeField = event.target.dataset.resumeField;
    const itemField = event.target.dataset.enItemField;
    const profileLinkIndex = event.target.dataset.profileLinkIndex;
    if (profileLinkIndex !== undefined) {
      mutate((state) => {
        state.profile.fields.links[Number(profileLinkIndex)] = event.target.value;
      });
      updateProfileLinkRecognition(event.target);
      renderPreview();
      return;
    }
    if (profileField && PROFILE_FIELDS.has(profileField)) {
      mutate((state) => {
        state.profile.fields[profileField] = event.target.value;
      });
    } else if (resumeField && RESUME_FIELDS.has(resumeField)) {
      mutate((state) => {
        state.documents.en.resume[resumeField] = event.target.value;
      });
    } else if (itemField) {
      const item = event.target.closest('[data-en-item]');
      const type = item?.dataset.enItem;
      if (!ITEM_SHAPES[type] || !(itemField in ITEM_SHAPES[type])) return;
      const value = event.target.value;
      if (event.target.dataset.enMonthInput !== undefined && value && !MONTH_VALUE_PATTERN.test(value)) {
        event.target.setAttribute('aria-invalid', 'true');
        return;
      }
      event.target.removeAttribute('aria-invalid');
      mutate((state) => {
        state.documents.en.resume[type][Number(item.dataset.index)][itemField] = value;
      });
    } else {
      return;
    }
    renderPreview();
  }

  function onChange(event) {
    if (event.target !== pageSizeSelect) return;
    mutate((state) => {
      state.settings.pageSizeByLocale.en = pageSizeSelect.value === 'A4' ? 'A4' : 'LETTER';
    });
    renderPreview();
  }

  function onBlur(event) {
    const field = event.target;
    if (field.dataset.enMonthInput === undefined || !field.value || MONTH_VALUE_PATTERN.test(field.value)) return;
    const item = field.closest('[data-en-item]');
    const type = item?.dataset.enItem;
    const key = field.dataset.enItemField;
    field.value = ITEM_SHAPES[type] && key in ITEM_SHAPES[type]
      ? resume()[type][Number(item.dataset.index)][key]
      : '';
    field.removeAttribute('aria-invalid');
  }

  async function onClick(event) {
    const mobileViewButton = event.target.closest('[data-en-mobile-view]');
    if (mobileViewButton) {
      setMobileView(mobileViewButton.dataset.enMobileView);
      return;
    }
    const addButton = event.target.closest('[data-en-add]');
    const removeButton = event.target.closest('[data-en-remove]');
    const addProfileLinkButton = event.target.closest('[data-en-add-profile-link]');
    const removeProfileLinkButton = event.target.closest('[data-remove-profile-link]');
    if (addProfileLinkButton) {
      mutate((state) => addProfileLink(state.profile.fields));
      renderProfileLinks();
      renderPreview();
      return;
    }
    if (removeProfileLinkButton) {
      mutate((state) => removeProfileLink(state.profile.fields, Number(removeProfileLinkButton.dataset.removeProfileLink)));
      renderProfileLinks();
      renderPreview();
      return;
    }
    if (addButton) {
      const type = addButton.dataset.enAdd;
      const item = createEnglishItem(type);
      if (!item) return;
      mutate((state) => state.documents.en.resume[type].push(item));
      renderList(type);
      renderPreview();
      return;
    }
    if (removeButton) {
      const item = removeButton.closest('[data-en-item]');
      const type = item.dataset.enItem;
      mutate((state) => state.documents.en.resume[type].splice(Number(item.dataset.index), 1));
      renderList(type);
      renderPreview();
      return;
    }
    if (event.target.closest('[data-en-load-sample]')) {
      enterSampleMode();
    } else if (event.target.closest('[data-en-restore-sample]')) {
      restoreDraftFromSample();
    } else if (event.target.closest('[data-en-adopt-sample]')) {
      adoptSample();
    } else if (event.target.closest('[data-en-clear]')) {
      clearDraft();
    }
  }

  function onPageHide() {
    window.clearTimeout(saveTimer);
    if (sampleMode || !shouldPersistDraft) return;
    void store.save().catch(() => {});
  }

  const unsubscribe = store.subscribe((_state, event) => {
    if (event.type === 'import' && sampleMode) {
      sampleMode = false;
      draftBeforeSample = null;
      draftBeforeSampleWasStored = false;
      shouldPersistDraft = true;
      setSampleUI(false);
    }
    if (['import', 'reload', 'reset', 'en-sample', 'en-restore'].includes(event.type)) hydrate();
  });
  form.addEventListener('input', onInput);
  form.addEventListener('blur', onBlur, true);
  root.addEventListener('change', onChange);
  root.addEventListener('click', onClick);
  window.addEventListener('resize', fitPreview);
  window.addEventListener('pagehide', onPageHide);
  hydrate();

  return {
    available: true,
    render: hydrate,
    restoreDraftBeforePersistence() {
      return restoreDraftFromSample({ announce: false });
    },
    destroy() {
      window.clearTimeout(saveTimer);
      unsubscribe();
      form.removeEventListener('input', onInput);
      form.removeEventListener('blur', onBlur, true);
      root.removeEventListener('change', onChange);
      root.removeEventListener('click', onClick);
      window.removeEventListener('resize', fitPreview);
      window.removeEventListener('pagehide', onPageHide);
    }
  };
}
