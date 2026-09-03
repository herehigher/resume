import zhCN from '../i18n/zh-CN.js';
import { createChineseSampleState } from '../state/zh-CN.js';
import { cloneData } from '../state/defaults.js';
import { getChineseFields, renderChineseDocument } from '../templates/zh-CN.js';
import { addProfileLink, removeProfileLink } from '../utils/profile-links.js';
import { canAddProfileLink, renderProfileLinksEditor, updateProfileLinkRecognition } from './profile-links-editor.js';
import { messageForDraftStorageError } from './draft-storage-error.js';
import { confirmAction } from './confirmation-dialog.js';

const PROFILE_FIELDS = new Set([
  'fullName', 'birthDate', 'gender', 'postalCode', 'address', 'phone', 'email'
]);

const ITEM_FACTORIES = Object.freeze({
  experience: () => ({ startDate: '', endDate: '', company: '', role: '', details: '' }),
  projects: () => ({ startDate: '', endDate: '', name: '', role: '', details: '', url: '' }),
  education: () => ({ startDate: '', endDate: '', school: '', degree: '', details: '' }),
  certifications: () => ({ date: '', name: '', url: '' })
});

export function createChineseItem(type) {
  const factory = ITEM_FACTORIES[type];
  if (!factory) throw new TypeError(`Unsupported Chinese resume item: ${type}`);
  return factory();
}

export function calculateChineseCompletion(state) {
  const fields = getChineseFields(state);
  const checks = [
    fields.fullName,
    fields.headline,
    fields.summary,
    fields.experience.some((item) => item.company && item.details),
    fields.projects.some((item) => item.name && item.details),
    fields.education.some((item) => item.school),
    fields.skills
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

export async function protectChineseDraftBeforeSample(store, shouldPersistDraft) {
  const snapshot = cloneData(store.getState());
  if (shouldPersistDraft) await store.save();
  return snapshot;
}

export function renderChineseEditorShell() {
  return `
    <div class="zh-mobile-view-switch" aria-label="移动端视图切换">
      <button class="is-active" type="button" aria-pressed="true" data-zh-mobile-view="editor">${zhCN.inputView}</button>
      <button type="button" aria-pressed="false" data-zh-mobile-view="preview">${zhCN.previewView}</button>
    </div>
    <section class="editor-panel zh-editor-panel" aria-label="${zhCN.editorAriaLabel}">
      <div class="editor-heading">
        <div><p class="eyebrow">RÉSUMÉ</p><h1>${zhCN.editorTitle}</h1><p>${zhCN.editorDescription}</p></div>
        <span class="completion-label" data-zh-completion-label>0% ${zhCN.completion}</span>
      </div>
      <div class="completion-track" aria-hidden="true"><span data-zh-completion-bar></span></div>
      <section class="draft-controls" data-zh-draft-controls aria-label="草稿状态与操作">
        <div class="draft-primary-row">
          <span class="draft-message is-success" data-zh-draft-message role="status" aria-live="polite">${zhCN.savedStatus}</span>
          <div class="draft-normal-actions" data-zh-normal-actions>
            <button class="secondary-button" type="button" data-zh-action="sample">${zhCN.loadSample}</button>
          </div>
          <div class="draft-sample-actions" data-zh-sample-actions hidden>
            <span class="sample-mode-copy"><strong>${zhCN.sampleNotice}</strong></span>
            <button class="secondary-button" type="button" data-zh-action="restore">${zhCN.restoreDraft}</button>
            <button class="primary-button" type="button" data-zh-action="adopt">${zhCN.adoptSample}</button>
          </div>
        </div>
        <div class="draft-clear-row">
          <button class="draft-clear-button" type="button" data-zh-action="clear">清除此设备上的草稿</button>
          <span class="draft-clear-notice">输入内容会加密后仅保存在此设备上。</span>
        </div>
      </section>
      <form class="zh-resume-form" autocomplete="on">
        <details class="form-section" open>
          <summary><span class="section-number">01</span><span><strong>基本信息</strong><small>姓名、联系方式与选填的个人信息</small></span><span aria-hidden="true">⌄</span></summary>
          <div class="section-content">
            <div class="photo-and-name">
              <div class="photo-control">
                <div class="photo-thumbnail" data-zh-photo-thumbnail><span>照片</span></div>
                <label class="upload-button">选择照片<input data-zh-photo-input type="file" accept="image/png,image/jpeg,image/webp" hidden></label>
                <button class="text-button" type="button" data-zh-action="remove-photo" hidden>删除照片</button>
              </div>
              <div class="field-stack">
                <label class="input-field"><span>姓名 <em>${zhCN.requiredLabel}</em></span><input data-profile="fullName" autocomplete="name" required placeholder="例：简立"></label>
                <label class="input-field"><span>求职方向 / 职业定位</span><input data-resume="headline" placeholder="例：高级产品经理｜企业服务"></label>
              </div>
            </div>
            <div class="field-grid two-columns">
              <label class="input-field"><span>手机号码</span><input data-profile="phone" type="tel" autocomplete="tel"></label>
              <label class="input-field"><span>电子邮箱</span><input data-profile="email" type="email" autocomplete="email"></label>
              <label class="input-field"><span>所在城市 / 地址</span><input data-profile="address" autocomplete="street-address"></label>
              <label class="input-field"><span>邮政编码 <em>${zhCN.optionalLabel}</em></span><input data-profile="postalCode" autocomplete="postal-code"></label>
            </div>
            <div class="field-grid two-columns">
              <label class="input-field"><span>出生日期 <em>${zhCN.optionalLabel}</em></span><input data-profile="birthDate" type="date"></label>
              <label class="input-field"><span>性别 <em>${zhCN.optionalLabel}</em></span><select data-profile="gender"><option value="">不填写</option><option>男</option><option>女</option><option>其他</option></select></label>
            </div>
            <div class="field-grid"><div class="list-heading"><strong>Links</strong><button class="small-add-button" data-zh-add-profile-link type="button">添加链接</button></div><span class="field-help">最多 3 条。输入 URL 后自动识别网站名称和图标。</span><div class="profile-links-editor" data-zh-profile-links></div></div>
          </div>
        </details>
        <details class="form-section" open>
          <summary><span class="section-number">02</span><span><strong>个人概述</strong><small>用 3–5 行概括经验、方向和优势</small></span><span aria-hidden="true">⌄</span></summary>
          <div class="section-content"><label class="input-field"><span>个人概述</span><textarea data-resume="summary" rows="6" placeholder="概括从业年限、专业领域和代表性成果。"></textarea></label></div>
        </details>
        ${renderListSection('03', '工作经历', 'experience', '按结束时间自动倒序排列')}
        ${renderListSection('04', '项目经历', 'projects', '突出职责、方法和可量化结果')}
        ${renderListSection('05', '教育经历', 'education', '按结束时间自动倒序排列')}
        <details class="form-section">
          <summary><span class="section-number">06</span><span><strong>专业技能</strong><small>按类别组织工具、方法与语言能力</small></span><span aria-hidden="true">⌄</span></summary>
          <div class="section-content"><label class="input-field"><span>专业技能</span><textarea data-resume="skills" rows="7"></textarea></label></div>
        </details>
        ${renderListSection('07', '证书与资质', 'certifications', '名称、取得时间与可选验证链接')}
      </form>
      <div class="editor-footer">
        <div class="editor-footer-actions"><button class="primary-button" type="button" data-zh-action="print">${zhCN.exportPdf}</button></div>
        <div class="editor-legal">
          <p><span data-editor-analytics-disclosure="status">${zhCN.privacyNotice}</span></p>
          <p class="editor-copyright">© 2026 herehigher · <a href="https://github.com/herehigher/resume/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">MIT License</a></p>
        </div>
      </div>
    </section>
    <section class="preview-panel zh-preview-panel" aria-label="${zhCN.previewAriaLabel}">
      <div class="preview-toolbar">
        <div><span class="preview-dot"></span><strong>${zhCN.livePreview}</strong><span>${zhCN.documentName}</span></div>
        <div class="zoom-controls" aria-label="预览缩放">
          <button type="button" data-zh-action="zoom-out" aria-label="${zhCN.zoomOut}">−</button>
          <span data-zh-zoom-label>100%</span>
          <button type="button" data-zh-action="zoom-in" aria-label="${zhCN.zoomIn}">＋</button>
        </div>
      </div>
      <div class="preview-scroll" data-zh-preview-scroll><div class="document-preview" data-zh-preview></div></div>
    </section>`;
}

function renderListSection(number, title, type, help) {
  return `
    <details class="form-section" open>
      <summary><span class="section-number">${number}</span><span><strong>${title}</strong><small>${help}</small></span><span aria-hidden="true">⌄</span></summary>
      <div class="section-content">
        <div class="list-heading"><strong>${title}</strong><button class="small-add-button" type="button" data-zh-add="${type}">＋ ${zhCN.addItem}</button></div>
        <div class="zh-entry-list" data-zh-list="${type}"></div>
      </div>
    </details>`;
}

const FIELD_DEFINITIONS = Object.freeze({
  experience: [
    ['company', '公司名称', 'text'], ['role', '部门 / 职位', 'text'],
    ['startDate', '开始时间', 'month'], ['endDate', '结束时间', 'month'],
    ['details', '主要职责与成果', 'textarea']
  ],
  projects: [
    ['name', '项目名称', 'text'], ['role', '项目角色', 'text'],
    ['startDate', '开始时间', 'month'], ['endDate', '结束时间', 'month'],
    ['details', '项目内容与成果', 'textarea'], ['url', '项目链接', 'url']
  ],
  education: [
    ['school', '学校名称', 'text'], ['degree', '学历 / 专业', 'text'],
    ['startDate', '开始时间', 'month'], ['endDate', '结束时间', 'month'],
    ['details', '补充说明', 'textarea']
  ],
  certifications: [['name', '证书名称', 'text'], ['date', '取得时间', 'month'], ['url', '验证链接', 'url']]
});

function renderEntry(documentObject, type, item, index) {
  const article = documentObject.createElement('article');
  article.className = 'zh-entry-editor';
  article.dataset.zhType = type;
  article.dataset.zhIndex = String(index);
  const header = documentObject.createElement('div');
  header.className = 'zh-entry-editor-header';
  const title = documentObject.createElement('strong');
  title.textContent = `${type === 'experience' ? '工作经历' : type === 'projects' ? '项目经历' : type === 'education' ? '教育经历' : '证书'} ${index + 1}`;
  const remove = documentObject.createElement('button');
  remove.type = 'button';
  remove.dataset.zhRemove = '';
  remove.textContent = '删除';
  remove.setAttribute('aria-label', zhCN.removeItem);
  header.append(title, remove);
  article.append(header);
  const grid = documentObject.createElement('div');
  grid.className = 'zh-entry-grid';
  FIELD_DEFINITIONS[type].forEach(([key, label, inputType]) => {
    const wrapper = documentObject.createElement('label');
    wrapper.className = `input-field zh-entry-field zh-entry-field-${key}`;
    const caption = documentObject.createElement('span');
    caption.textContent = label;
    const field = inputType === 'textarea'
      ? documentObject.createElement('textarea')
      : documentObject.createElement('input');
    if (inputType === 'textarea') field.rows = 4;
    else field.type = inputType;
    if (inputType === 'url') field.inputMode = 'url';
    field.dataset.zhKey = key;
    field.value = item[key] || '';
    if (key === 'details' && ['experience', 'projects'].includes(type)) {
      field.placeholder = type === 'experience'
        ? '每行填写一项职责或成果，尽量包含行动和量化结果。'
        : '每行填写一项贡献或项目成果。';
    }
    if (key === 'endDate') {
      const help = documentObject.createElement('small');
      help.className = 'field-help';
      help.textContent = zhCN.currentEmploymentHelp;
      wrapper.append(caption, field, help);
    } else {
      wrapper.append(caption, field);
    }
    grid.append(wrapper);
  });
  article.append(grid);
  return article;
}

export function initChineseEditor(store, { embeddedPhotoUrl, root = '#chineseWorkspace' } = {}) {
  if (!embeddedPhotoUrl) throw new TypeError('Embedded photo URL helper is required');
  const rootElement = typeof root === 'string' ? document.querySelector(root) : root;
  if (!rootElement) throw new TypeError('Chinese editor root element is required');
  rootElement.innerHTML = renderChineseEditorShell();
  rootElement.classList.add('workspace', 'zh-workspace');
  rootElement.dataset.mobileMode = 'editor';
  const preview = rootElement.querySelector('[data-zh-preview]');
  const previewScroll = rootElement.querySelector('[data-zh-preview-scroll]');
  const saveStatus = rootElement.querySelector('[data-zh-draft-message]');
  let zoom = 1;
  let saveTimer;
  let shouldPersistDraft = store.hasStoredState();
  let sampleMode = false;
  let draftBeforeSample = null;
  let draftBeforeSampleWasStored = false;

  function chineseResume() {
    return store.getState().documents['zh-CN'].resume;
  }

  function setStatus(message, tone = '') {
    saveStatus.textContent = message;
    saveStatus.classList.toggle('is-success', tone === 'success');
    saveStatus.classList.toggle('is-saving', tone === 'saving');
    saveStatus.classList.toggle('is-error', tone === 'error');
  }

  function scheduleSave() {
    window.clearTimeout(saveTimer);
    if (sampleMode) return;
    shouldPersistDraft = true;
    setStatus(zhCN.savingStatus, 'saving');
    saveTimer = window.setTimeout(async () => {
      try {
        await store.save();
        setStatus(zhCN.savedStatus, 'success');
      } catch (error) {
        setStatus(messageForDraftStorageError(error, 'zh-CN', zhCN.saveError), 'error');
      }
    }, 300);
  }

  function mutate(mutator) {
    store.update(mutator, { persist: false });
    scheduleSave();
  }

  function renderLists() {
    Object.keys(ITEM_FACTORIES).forEach((type) => {
      const container = rootElement.querySelector(`[data-zh-list="${type}"]`);
      container.replaceChildren();
      const items = chineseResume()[type];
      if (!items.length) {
        const empty = document.createElement('div');
        empty.className = 'empty-list';
        empty.textContent = '暂无内容，可点击“添加”。';
        container.append(empty);
        return;
      }
      items.forEach((item, index) => {
        container.append(renderEntry(document, type, item, index));
      });
    });
  }

  function renderProfileLinks() {
    const links = store.getState().profile.fields.links;
    renderProfileLinksEditor(rootElement.querySelector('[data-zh-profile-links]'), links, { removeLabel: '删除链接' });
    const addButton = rootElement.querySelector('[data-zh-add-profile-link]');
    addButton.disabled = !canAddProfileLink(links);
    addButton.textContent = canAddProfileLink(links) ? '添加链接' : '最多 3 条链接';
  }

  function applyZoom() {
    preview.style.transform = `scale(${zoom})`;
    rootElement.querySelector('[data-zh-zoom-label]').textContent = `${Math.round(zoom * 100)}%`;
    preview.style.marginBottom = `${Math.min(0, preview.offsetHeight * (zoom - 1))}px`;
  }

  function fitPreview() {
    const page = preview.querySelector('.zh-resume-document');
    if (!page || rootElement.hidden) return;
    const available = previewScroll.clientWidth - (window.innerWidth > 820 ? 68 : 28);
    zoom = Math.min(1, Math.max(window.innerWidth > 820 ? .55 : .45, available / (page.offsetWidth || 760)));
    applyZoom();
  }

  function renderPreview() {
    const state = store.getState();
    preview.innerHTML = renderChineseDocument(state, {
      photoUrl: embeddedPhotoUrl.resolve(state.profile.photo)
    });
    const completion = calculateChineseCompletion(store.getState());
    rootElement.querySelector('[data-zh-completion-bar]').style.width = `${completion}%`;
    rootElement.querySelector('[data-zh-completion-label]').textContent = `${completion}% ${zhCN.completion}`;
    window.requestAnimationFrame(fitPreview);
  }

  function updatePhoto() {
    const photo = store.getState().profile.photo;
    const displayUrl = embeddedPhotoUrl.resolve(photo);
    const thumbnail = rootElement.querySelector('[data-zh-photo-thumbnail]');
    thumbnail.replaceChildren();
    if (displayUrl) {
      const image = document.createElement('img');
      image.src = displayUrl;
      image.alt = zhCN.photoPreviewAlt;
      thumbnail.append(image);
    } else {
      const placeholder = document.createElement('span');
      placeholder.textContent = '照片';
      thumbnail.append(placeholder);
    }
    rootElement.querySelector('[data-zh-action="remove-photo"]').hidden = !photo;
  }

  function hydrate() {
    const state = store.getState();
    rootElement.querySelectorAll('[data-profile]').forEach((field) => {
      field.value = state.profile.fields[field.dataset.profile] || '';
    });
    rootElement.querySelectorAll('[data-resume]').forEach((field) => {
      field.value = state.documents['zh-CN'].resume[field.dataset.resume] || '';
    });
    updatePhoto();
    renderProfileLinks();
    renderLists();
    setMobileView(rootElement.dataset.mobileMode || 'editor');
    renderPreview();
  }

  function setMobileView(view) {
    if (!['editor', 'preview'].includes(view)) return;
    rootElement.dataset.mobileMode = view;
    rootElement.querySelectorAll('[data-zh-mobile-view]').forEach((button) => {
      const selected = button.dataset.zhMobileView === view;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    if (view === 'preview') window.requestAnimationFrame(fitPreview);
  }

  function setSampleMode(active) {
    rootElement.querySelector('[data-zh-normal-actions]').hidden = active;
    rootElement.querySelector('[data-zh-sample-actions]').hidden = !active;
    rootElement.querySelector('[data-zh-action="clear"]').hidden = active;
  }

  async function enterSampleMode() {
    window.clearTimeout(saveTimer);
    try {
      draftBeforeSample = await protectChineseDraftBeforeSample(store, shouldPersistDraft);
    } catch (error) {
      setStatus(messageForDraftStorageError(error, 'zh-CN', '无法保护当前草稿，示例未打开。'), 'error');
      return;
    }
    draftBeforeSampleWasStored = shouldPersistDraft;
    sampleMode = true;
    store.replace(createChineseSampleState(store.getState()), { type: 'zh-sample' });
    setSampleMode(true);
    setStatus('正在查看填写示例。');
  }

  function restoreDraftFromSample() {
    if (!sampleMode) return false;
    store.replace(draftBeforeSample, { type: 'zh-restore' });
    shouldPersistDraft = draftBeforeSampleWasStored;
    sampleMode = false;
    draftBeforeSample = null;
    setSampleMode(false);
    setStatus(shouldPersistDraft ? zhCN.savedStatus : zhCN.saveStatus, shouldPersistDraft ? 'success' : '');
    return true;
  }

  async function adoptSample() {
    if (!sampleMode) return;
    const confirmed = await confirmAction({
      title: '将此示例保存为草稿吗？',
      body: '当前草稿将被示例覆盖，且无法撤销。',
      cancel: '取消',
      confirm: '保存示例'
    });
    if (!confirmed || !sampleMode) return;
    try {
      await store.save();
      shouldPersistDraft = true;
      sampleMode = false;
      draftBeforeSample = null;
      draftBeforeSampleWasStored = false;
      setSampleMode(false);
      setStatus('示例已保存为草稿。', 'success');
    } catch (error) {
      setStatus(messageForDraftStorageError(error, 'zh-CN', '无法将示例保存为草稿。'), 'error');
    }
  }

  async function clearDraft() {
    const confirmed = await confirmAction({
      title: '清除本设备上的草稿吗？',
      body: '保存的草稿和当前输入内容都会被删除，且无法撤销。',
      cancel: '取消',
      confirm: '清除'
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
      setSampleMode(false);
      setStatus('草稿已清除。');
    } catch (error) {
      setStatus(messageForDraftStorageError(error, 'zh-CN', '无法清除草稿。'), 'error');
    }
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

  function onInput(event) {
    const field = event.target;
    if (field.dataset.profileLinkIndex !== undefined) {
      mutate((state) => {
        state.profile.fields.links[Number(field.dataset.profileLinkIndex)] = field.value;
      });
      updateProfileLinkRecognition(field);
      renderPreview();
      return;
    }
    if (field.dataset.profile) {
      mutate((state) => {
        state.profile.fields[field.dataset.profile] = field.value;
      });
      renderPreview();
      return;
    }
    if (field.dataset.resume) {
      mutate((state) => {
        state.documents['zh-CN'].resume[field.dataset.resume] = field.value;
      });
      renderPreview();
      return;
    }
    if (field.dataset.zhKey) {
      const entry = field.closest('[data-zh-type]');
      mutate((state) => {
        state.documents['zh-CN'].resume[entry.dataset.zhType][Number(entry.dataset.zhIndex)][field.dataset.zhKey] = field.value;
      });
      renderPreview();
    }
  }

  async function onClick(event) {
    const add = event.target.closest('[data-zh-add]');
    const remove = event.target.closest('[data-zh-remove]');
    const addProfileLinkButton = event.target.closest('[data-zh-add-profile-link]');
    const removeProfileLinkButton = event.target.closest('[data-remove-profile-link]');
    const action = event.target.closest('[data-zh-action]');
    const mobileView = event.target.closest('[data-zh-mobile-view]');
    if (add) {
      mutate((state) => state.documents['zh-CN'].resume[add.dataset.zhAdd].push(createChineseItem(add.dataset.zhAdd)));
      renderLists();
      renderPreview();
    }
    if (remove) {
      const entry = remove.closest('[data-zh-type]');
      mutate((state) => state.documents['zh-CN'].resume[entry.dataset.zhType].splice(Number(entry.dataset.zhIndex), 1));
      renderLists();
      renderPreview();
    }
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
    if (mobileView) {
      setMobileView(mobileView.dataset.zhMobileView);
    }
    if (!action) return;
    if (action.dataset.zhAction === 'sample') enterSampleMode();
    if (action.dataset.zhAction === 'restore') restoreDraftFromSample();
    if (action.dataset.zhAction === 'adopt') adoptSample();
    if (action.dataset.zhAction === 'clear') clearDraft();
    if (action.dataset.zhAction === 'print') window.print();
    if (action.dataset.zhAction === 'zoom-out') {
      zoom = Math.max(.4, zoom - .1);
      applyZoom();
    }
    if (action.dataset.zhAction === 'zoom-in') {
      zoom = Math.min(1.2, zoom + .1);
      applyZoom();
    }
    if (action.dataset.zhAction === 'remove-photo') {
      mutate((state) => {
        state.profile.photo = '';
      });
      rootElement.querySelector('[data-zh-photo-input]').value = '';
      updatePhoto();
      renderPreview();
    }
  }

  function onPhotoChange(event) {
    if (event.target.matches('[data-zh-photo-input]')) handlePhoto(event.target.files?.[0]);
  }

  function onPageHide() {
    window.clearTimeout(saveTimer);
    if (sampleMode || !shouldPersistDraft) return;
    void store.save().catch(() => {});
  }

  rootElement.addEventListener('input', onInput);
  rootElement.addEventListener('click', onClick);
  rootElement.addEventListener('change', onPhotoChange);
  window.addEventListener('resize', fitPreview);
  window.addEventListener('pagehide', onPageHide);
  const unsubscribe = store.subscribe((_state, event) => {
    if (event.type === 'import' && sampleMode) {
      sampleMode = false;
      draftBeforeSample = null;
      draftBeforeSampleWasStored = false;
      shouldPersistDraft = true;
      setSampleMode(false);
    }
    if (['import', 'reload', 'reset', 'zh-sample', 'zh-restore'].includes(event.type)) hydrate();
  });
  hydrate();

  return {
    refresh: hydrate,
    restoreDraftBeforePersistence: restoreDraftFromSample,
    destroy() {
      window.clearTimeout(saveTimer);
      unsubscribe();
      rootElement.removeEventListener('input', onInput);
      rootElement.removeEventListener('click', onClick);
      rootElement.removeEventListener('change', onPhotoChange);
      window.removeEventListener('resize', fitPreview);
      window.removeEventListener('pagehide', onPageHide);
    }
  };
}

export { PROFILE_FIELDS as CHINESE_PROFILE_FIELDS };
