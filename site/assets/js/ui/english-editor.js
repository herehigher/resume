import { createEnglishSampleState } from '../data/en-sample.js';
import { cloneData } from '../state/defaults.js';
import { renderEnglishDocument } from '../templates/en.js';
import { addProfileLink, removeProfileLink } from '../utils/profile-links.js';
import { canAddProfileLink, renderProfileLinksEditor, updateProfileLinkRecognition } from './profile-links-editor.js';
import { draftStatusMessageForError } from './draft-storage-error.js';
import { initPageBreakControls, PAGE_BREAK_PREVIEW_GUTTER } from '../page-breaks.js';
import { confirmAction } from './confirmation-dialog.js';

const PROFILE_FIELDS = new Set(['fullName', 'birthDate', 'gender', 'nationality', 'postalCode', 'address', 'phone', 'email']);
const RESUME_FIELDS = new Set(['headline', 'location', 'summary', 'skills']);

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
          <span class="draft-message" data-en-save-status>Your input will be encrypted and saved on this device.</span>
          <div class="draft-normal-actions" data-en-normal-actions>
            <button class="secondary-button" data-en-load-sample type="button">View example</button>
          </div>
          <div class="draft-sample-actions" data-en-sample-actions hidden>
            <button class="primary-button" data-en-restore-sample type="button">Return to my draft</button>
            <button class="secondary-button" data-en-adopt-sample type="button">Use this example as my draft</button>
          </div>
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
            <label class="input-field"><span>Full name</span><input data-profile-field="fullName" autocomplete="name" required></label>
            <label class="input-field"><span>Professional headline</span><input data-resume-field="headline" placeholder="Senior Product Manager"></label>
            <div class="field-grid two-columns">
              <label class="input-field"><span>Phone</span><input data-profile-field="phone" type="tel" autocomplete="tel"></label>
              <label class="input-field"><span>Email</span><input data-profile-field="email" type="email" autocomplete="email"></label>
            </div>
            <label class="input-field"><span>City, State / Country</span><input data-resume-field="location" autocomplete="address-level2" placeholder="Seattle, WA / United States"></label>
            <div class="profile-links-editor" data-en-profile-links></div>
            <button class="small-add-button" data-en-add-profile-link type="button">Add link</button>
            <span class="field-help">Up to 3 links. The site name and icon are matched from the URL.</span>
            <section class="en-optional-details-editor" aria-labelledby="en-optional-details-heading">
              <div class="en-optional-details-heading">
                <div><strong id="en-optional-details-heading">Optional personal details</strong><p>Conventions vary by country and employer. When off, these details are saved but excluded from the preview and PDF.</p></div>
                <label class="en-details-switch"><input data-en-optional-details-switch type="checkbox"><span>Show optional personal details in the English resume</span></label>
              </div>
              <div class="en-optional-details-fields">
                <div class="photo-control">
                  <div class="photo-thumbnail" data-en-photo-thumbnail><span>Photo</span></div>
                  <label class="upload-button">Choose photo<input data-en-photo-input type="file" accept="image/png,image/jpeg,image/webp" hidden></label>
                  <button class="text-button" data-en-remove-photo type="button" hidden>Remove</button>
                </div>
                <div class="field-grid two-columns">
                  <label class="input-field"><span>Birth date</span><input data-profile-field="birthDate" type="date"></label>
                  <label class="input-field"><span>Gender</span><select data-profile-field="gender"><option value="">Prefer not to say</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option></select></label>
                  <label class="input-field"><span>Full address</span><input data-profile-field="address" autocomplete="street-address"></label>
                  <label class="input-field"><span>Postal code</span><input data-profile-field="postalCode" autocomplete="postal-code"></label>
                  <label class="input-field"><span>Nationality</span><input data-profile-field="nationality" autocomplete="country-name"></label>
                </div>
              </div>
            </section>
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
          <p class="editor-copyright">© 2026 herehigher · <a href="https://github.com/herehigher/resume/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">MIT License</a> · <a class="x-contact-link" href="https://x.com/kanhigher" target="_blank" rel="noopener noreferrer" aria-label="X: @kanhigher"><svg class="x-contact-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.501 11.24h-6.657l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z"></path></svg><span>@kanhigher</span></a></p>
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
        <label class="input-field"><span>Start date</span><input data-en-item-field="startDate" type="month" lang="en-US"></label>
        <label class="input-field"><span>End date <small>Leave blank for Present</small></span><input data-en-item-field="endDate" type="month" lang="en-US"></label>
      </div>
      <label class="input-field"><span>Responsibilities and achievements</span><textarea data-en-item-field="details" rows="5" placeholder="Write one achievement per line. Start with an action and include measurable impact when possible."></textarea></label>`;
  }
  if (type === 'projects') {
    return `<label class="input-field"><span>Project name</span><input data-en-item-field="name"></label>
      <label class="input-field"><span>Your role</span><input data-en-item-field="role"></label>
      <div class="english-editor-date-grid">
        <label class="input-field"><span>Start date</span><input data-en-item-field="startDate" type="month" lang="en-US"></label>
        <label class="input-field"><span>End date <small>Leave blank for Present</small></span><input data-en-item-field="endDate" type="month" lang="en-US"></label>
      </div>
      <label class="input-field"><span>Project achievements</span><textarea data-en-item-field="details" rows="4" placeholder="Write one outcome or contribution per line."></textarea></label>
      <label class="input-field"><span>Project URL</span><input data-en-item-field="url" type="url" inputmode="url"></label>`;
  }
  if (type === 'education') {
    return `<label class="input-field"><span>School</span><input data-en-item-field="school"></label>
      <label class="input-field"><span>Degree or program</span><input data-en-item-field="degree"></label>
      <div class="english-editor-date-grid">
        <label class="input-field"><span>Start date</span><input data-en-item-field="startDate" type="month" lang="en-US"></label>
        <label class="input-field"><span>End date <small>Leave blank if current</small></span><input data-en-item-field="endDate" type="month" lang="en-US"></label>
      </div>
      <label class="input-field"><span>Details</span><textarea data-en-item-field="details" rows="3"></textarea></label>`;
  }
  return `<label class="input-field"><span>Certification</span><input data-en-item-field="name"></label>
    <label class="input-field"><span>Date earned</span><input data-en-item-field="date" type="month" lang="en-US"></label>
    <label class="input-field"><span>Credential URL</span><input data-en-item-field="url" type="url" inputmode="url"></label>`;
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

export function initEnglishEditor(store, { embeddedPhotoUrl, root = document.querySelector('[data-english-editor]'), statusController } = {}) {
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
  const optionalDetailsSwitch = root.querySelector('[data-en-optional-details-switch]');
  let saveTimer;
  let sampleMode = false;
  let importPending = false;
  let draftBeforeSample = null;
  let draftBeforeSampleWasStored = false;
  let shouldPersistDraft = store.hasStoredState();
  let zoom = 1;
  const pageBreakControls = initPageBreakControls({
    store, locale: 'en', preview, toolbar: root.querySelector('.preview-toolbar'),
    getDocumentType: () => 'resume', scheduleSave
  });

  function resume() {
    return store.getState().documents.en.resume;
  }

  function setStatus(message, tone = '', options) {
    const normalizedTone = tone === true ? 'error' : tone;
    if (statusController) {
      statusController.setDraftStatus('en', message, normalizedTone, options);
      return;
    }
    saveStatus.textContent = message;
    saveStatus.classList.toggle('is-success', normalizedTone === 'success');
    saveStatus.classList.toggle('is-saving', normalizedTone === 'saving');
    saveStatus.classList.toggle('is-error', normalizedTone === 'error');
    root.querySelector('.draft-controls').classList.toggle('is-error', normalizedTone === 'error');
  }

  statusController?.registerDraftStatus('en', saveStatus, root.querySelector('.draft-controls'));

  function scheduleSave() {
    window.clearTimeout(saveTimer);
    if (sampleMode) {
      setStatus('The example is not being saved.');
      return;
    }
    if (importPending) return;
    shouldPersistDraft = true;
    setStatus('Encrypting and saving…', 'saving');
    saveTimer = window.setTimeout(async () => {
      try {
        await store.save();
        setStatus('Encrypted and saved on this device.', 'success');
      } catch (error) {
        setStatus(draftStatusMessageForError(error, 'en', 'Your changes could not be saved on this device.'), true);
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
    if (!page || root.hidden || !previewScroll.clientWidth) return;
    const padding = window.innerWidth > 820 ? 68 : 28;
    const availableWidth = previewScroll.clientWidth - padding;
    zoom = Math.min(1, availableWidth / ((page.offsetWidth || 816) + (window.innerWidth > 820 ? PAGE_BREAK_PREVIEW_GUTTER : 0)));
    applyZoom();
  }

  function renderPreview() {
    const state = store.getState();
    preview.innerHTML = renderEnglishDocument(state, {
      photoUrl: embeddedPhotoUrl?.resolve(state.profile.photo) || ''
    });
    pageBreakControls.render();
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
    optionalDetailsSwitch.checked = resume().showOptionalPersonalDetails === true;
    updatePhoto();
    Object.keys(ITEM_SHAPES).forEach(renderList);
    renderProfileLinks();
    pageSizeSelect.value = state.settings.pageSizeByLocale.en;
    setMobileView(root.dataset.mobileMode || 'editor');
    renderPreview();
  }

  function updatePhoto() {
    const photo = store.getState().profile.photo;
    const displayUrl = embeddedPhotoUrl?.resolve(photo) || '';
    const thumbnail = root.querySelector('[data-en-photo-thumbnail]');
    thumbnail.replaceChildren();
    if (displayUrl) {
      const image = document.createElement('img');
      image.src = displayUrl;
      image.alt = 'Photo preview';
      thumbnail.append(image);
    } else {
      const placeholder = document.createElement('span');
      placeholder.textContent = 'Photo';
      thumbnail.append(placeholder);
    }
    root.querySelector('[data-en-remove-photo]').hidden = !photo;
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
      const canvas = document.createElement('canvas');
      canvas.width = 480;
      canvas.height = 600;
      canvas.getContext('2d').drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      mutate((state) => {
        state.profile.photo = canvas.toDataURL('image/jpeg', .84);
      });
      updatePhoto();
      renderPreview();
    } finally {
      URL.revokeObjectURL(sourceUrl);
    }
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
  }

  async function enterSampleMode() {
    window.clearTimeout(saveTimer);
    const currentDraft = cloneData(store.getState());
    try {
      if (shouldPersistDraft) await store.save();
    } catch (error) {
      setStatus(draftStatusMessageForError(error, 'en', 'The example cannot be shown because your current draft could not be protected.'), true);
      return;
    }
    draftBeforeSample = currentDraft;
    draftBeforeSampleWasStored = shouldPersistDraft;
    sampleMode = true;
    store.replace(createEnglishSampleState(store.getState()), { type: 'en-sample' });
    setSampleUI(true);
    setStatus('Viewing an example. Your saved draft will not be changed.');
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
      setStatus(draftStatusMessageForError(error, 'en', 'The example could not be saved as your draft.'), true);
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
      setStatus(draftStatusMessageForError(error, 'en', 'The draft could not be cleared.'), true);
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
      mutate((state) => {
        state.documents.en.resume[type][Number(item.dataset.index)][itemField] = event.target.value;
      });
    } else {
      return;
    }
    renderPreview();
  }

  function onChange(event) {
    if (event.target === pageSizeSelect) {
      mutate((state) => {
        state.settings.pageSizeByLocale.en = pageSizeSelect.value === 'A4' ? 'A4' : 'LETTER';
      });
      renderPreview();
      return;
    }
    if (event.target === optionalDetailsSwitch) {
      mutate((state) => {
        state.documents.en.resume.showOptionalPersonalDetails = optionalDetailsSwitch.checked;
      });
      renderPreview();
      return;
    }
    if (event.target.matches('[data-en-photo-input]')) void handlePhoto(event.target.files?.[0]);
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
    if (event.target.closest('[data-en-remove-photo]')) {
      mutate((state) => {
        state.profile.photo = '';
      });
      root.querySelector('[data-en-photo-input]').value = '';
      updatePhoto();
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
    }
  }

  function onPageHide() {
    window.clearTimeout(saveTimer);
    if (sampleMode || importPending || !shouldPersistDraft) return;
    void store.save().catch(() => {});
  }

  const unsubscribe = store.subscribe((_state, event) => {
    if (event.type === 'import-pending') {
      importPending = true;
      window.clearTimeout(saveTimer);
      return;
    }
    if (event.type === 'import-cancel' || event.type === 'import-conflict' || event.type === 'import-failed') {
      importPending = false;
      return;
    }
    if (event.type === 'import') {
      importPending = false;
      shouldPersistDraft = true;
      setStatus('Encrypted and saved on this device.', 'success', { announce: false });
    }
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
  root.addEventListener('change', onChange);
  root.addEventListener('click', onClick);
  window.addEventListener('resize', fitPreview);
  window.addEventListener('pagehide', onPageHide);
  hydrate();
  setStatus(shouldPersistDraft
    ? 'Encrypted and saved on this device.'
    : 'Your input will be encrypted and saved on this device.', shouldPersistDraft ? 'success' : '', { announce: false });

  return {
    available: true,
    render: hydrate,
    clearDraft,
    restoreDraftBeforePersistence() {
      return restoreDraftFromSample({ announce: false });
    },
    destroy() {
      window.clearTimeout(saveTimer);
      unsubscribe();
      form.removeEventListener('input', onInput);
      root.removeEventListener('change', onChange);
      root.removeEventListener('click', onClick);
      window.removeEventListener('resize', fitPreview);
      window.removeEventListener('pagehide', onPageHide);
    }
  };
}
