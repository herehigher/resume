(() => {
  'use strict';

  const STORAGE_KEY = 'resume-studio-data-v1';
  const form = document.getElementById('resumeForm');
  const preview = document.getElementById('documentPreview');
  const saveStatus = document.getElementById('saveStatus');
  const completionBar = document.getElementById('completionBar');
  const completionLabel = document.getElementById('completionLabel');
  const confirmDialog = document.getElementById('confirmDialog');

  const defaultData = () => ({
    activeDocument: 'resume',
    photo: '',
    fields: {
      fullName: '', nameKana: '', birthDate: '', gender: '', createdDate: today(),
      postalCode: '', addressKana: '', address: '', phone: '', email: '', github: '',
      motivation: '', requests: '', careerSummary: '', skills: '', selfPromotion: ''
    },
    education: [{ date: '', detail: '' }],
    employment: [{ date: '', detail: '' }],
    qualification: [{ date: '', detail: '', url: '' }],
    careers: [{ company: '', role: '', startDate: '', endDate: '', companyInfo: '', responsibilities: '', achievements: '' }]
  });

  const sampleData = {
    activeDocument: 'resume',
    photo: '',
    fields: {
      fullName: '山田 太郎', nameKana: 'やまだ たろう', birthDate: '1992-04-15', gender: '', createdDate: today(),
      postalCode: '100-0001', addressKana: 'とうきょうとちよだくちよだ', address: '東京都千代田区千代田1-1',
      phone: '090-1234-5678', email: 'taro.yamada@example.jp', github: 'https://github.com/taro-yamada',
      motivation: 'これまで培った企画力とチームでのプロジェクト推進経験を活かし、貴社のサービス成長に貢献したいと考え志望いたしました。顧客の声とデータの双方から課題を整理し、関係者と合意形成しながら改善を進めることを得意としています。',
      requests: '貴社規定に従います。',
      careerSummary: '大学卒業後、ITサービス企業にて法人向けプロダクトの企画・運営に従事してきました。顧客課題の分析、要件定義、開発チームとの連携、リリース後の改善まで一貫して担当しています。直近では5名のチームをリードし、主要指標を前年比125%まで改善しました。',
      skills: '・プロダクト企画、要件定義、ロードマップ策定\n・データ分析、KPI設計、ユーザーインタビュー\n・プロジェクト管理、チームマネジメント\n・英語：ビジネスレベル',
      selfPromotion: '私の強みは、曖昧な課題を構造化し、チームを巻き込みながら成果につなげる推進力です。現職では利用率低下の原因を定量・定性の両面から分析し、オンボーディングの改善を提案しました。開発・営業・サポートと共通目標を設定して施策を実行した結果、3か月で継続率を18ポイント改善しました。'
    },
    education: [
      { date: '2011-04', detail: '○○大学 ○○学部 入学' },
      { date: '2015-03', detail: '○○大学 ○○学部 卒業' }
    ],
    employment: [
      { date: '2015-04', detail: '株式会社サンプル 入社' },
      { date: '2021-10', detail: 'プロダクト企画部 マネージャー就任' },
      { date: '', detail: '現在に至る' }
    ],
    qualification: [
      { date: '2014-08', detail: '普通自動車第一種運転免許 取得', url: '' },
      { date: '2020-12', detail: 'TOEIC Listening & Reading 850点 取得', url: '' }
    ],
    careers: [{
      company: '株式会社サンプル', role: 'プロダクト企画部 マネージャー', startDate: '2015-04', endDate: '',
      companyInfo: '法人向けクラウドサービスの企画・開発・運営（従業員約300名）',
      responsibilities: '・法人向けSaaSプロダクトの企画、要件定義\n・利用データおよび顧客インタビューに基づく改善施策の立案\n・エンジニア、デザイナー、営業とのプロジェクト推進\n・5名の企画チームのマネジメント',
      achievements: '・オンボーディング改善により継続率を18ポイント向上\n・新機能の企画・提供により主要指標を前年比125%へ改善\n・開発プロセスの見直しによりリードタイムを30%短縮'
    }]
  };

  let data = loadData();
  let zoom = 1;
  let saveTimer;
  let draftMessageTimer;
  let shouldPersistDraft = hasStoredDraft();

  function today() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  function loadData() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!stored) return defaultData();
      const defaults = defaultData();
      return {
        ...defaults,
        ...stored,
        fields: { ...defaults.fields, ...(stored.fields || {}) },
        education: Array.isArray(stored.education) ? stored.education : defaults.education,
        employment: Array.isArray(stored.employment) ? stored.employment : defaults.employment,
        qualification: Array.isArray(stored.qualification) ? stored.qualification : defaults.qualification,
        careers: Array.isArray(stored.careers) ? stored.careers : defaults.careers
      };
    } catch {
      return defaultData();
    }
  }

  function hasStoredDraft() {
    try {
      return localStorage.getItem(STORAGE_KEY) !== null;
    } catch {
      return false;
    }
  }

  function saveData() {
    clearTimeout(saveTimer);
    shouldPersistDraft = true;
    saveStatus.classList.add('is-saving');
    saveStatus.textContent = '保存中…';
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        saveStatus.classList.remove('is-saving');
        saveStatus.textContent = 'この端末に保存済み';
      } catch {
        saveStatus.classList.remove('is-saving');
        saveStatus.textContent = '保存容量を超えました';
      }
    }, 300);
  }

  function showDraftMessage(message) {
    const draftMessage = document.getElementById('draftMessage');
    clearTimeout(draftMessageTimer);
    draftMessage.textContent = message;
    draftMessage.classList.add('is-success');
    draftMessageTimer = setTimeout(() => {
      draftMessage.textContent = '入力内容は自動保存されます';
      draftMessage.classList.remove('is-success');
    }, 3000);
  }

  function saveDraftNow() {
    clearTimeout(saveTimer);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      shouldPersistDraft = true;
      saveStatus.classList.remove('is-saving');
      saveStatus.textContent = 'この端末に保存済み';
      showDraftMessage('下書きを保存しました');
    } catch {
      showDraftMessage('保存できませんでした');
    }
  }

  function reloadDraft() {
    clearTimeout(saveTimer);
    if (!hasStoredDraft()) {
      showDraftMessage('保存された下書きはありません');
      return;
    }
    data = loadData();
    hydrateForm();
    showDraftMessage('保存した内容を読み込みました');
  }

  function hydrateForm() {
    Object.entries(data.fields).forEach(([name, value]) => {
      const field = form.elements.namedItem(name);
      if (field) field.value = value || '';
    });
    updatePhotoUI();
    renderLists();
    switchDocument(data.activeDocument, false);
    renderPreview();
  }

  function renderLists() {
    renderSimpleList('education', 'educationList');
    renderSimpleList('employment', 'employmentList');
    renderSimpleList('qualification', 'qualificationList');
    renderCareerList();
  }

  function renderSimpleList(type, containerId) {
    const container = document.getElementById(containerId);
    const items = data[type];
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
    container.innerHTML = '';
    if (!data.careers.length) {
      container.innerHTML = '<div class="empty-list">勤務先がありません。「追加」から入力できます。</div>';
      return;
    }
    data.careers.forEach((career, index) => {
      const item = document.getElementById('careerRowTemplate').content.firstElementChild.cloneNode(true);
      item.dataset.index = String(index);
      item.querySelector('[data-career-number]').textContent = String(index + 1);
      item.querySelectorAll('[data-key]').forEach((field) => { field.value = career[field.dataset.key] || ''; });
      container.appendChild(item);
    });
  }

  function updatePhotoUI() {
    const thumbnail = document.getElementById('photoThumbnail');
    const removeButton = document.getElementById('removePhotoButton');
    thumbnail.innerHTML = data.photo ? `<img src="${data.photo}" alt="証明写真のプレビュー">` : '<span>写真</span>';
    removeButton.hidden = !data.photo;
  }

  function switchDocument(documentType, shouldSave = true) {
    data.activeDocument = documentType;
    document.querySelectorAll('.document-tab').forEach((tab) => tab.classList.toggle('is-active', tab.dataset.document === documentType));
    document.getElementById('resumeFields').hidden = documentType !== 'resume';
    document.getElementById('careerFields').hidden = documentType !== 'career';
    document.getElementById('editorEyebrow').textContent = documentType === 'resume' ? 'RÉSUMÉ' : 'CAREER HISTORY';
    document.getElementById('editorTitle').textContent = documentType === 'resume' ? '履歴書を作成' : '職務経歴書を作成';
    document.getElementById('editorDescription').textContent = documentType === 'resume'
      ? '入力内容は右側の書類にすぐ反映されます。'
      : '経験と実績を、読みやすい書類に整えます。';
    document.getElementById('previewDocumentName').textContent = documentType === 'resume' ? '履歴書' : '職務経歴書';
    if (shouldSave) saveData();
    renderPreview();
  }

  function onFormInput(event) {
    const target = event.target;
    if (!target.name) return;
    data.fields[target.name] = target.value;
    saveData();
    renderPreview();
  }

  function onListInput(event) {
    const field = event.target.closest('[data-key]');
    if (!field) return;
    const simpleRow = field.closest('.repeating-row');
    const careerItem = field.closest('.career-editor-item');
    if (simpleRow) {
      data[simpleRow.dataset.type][Number(simpleRow.dataset.index)][field.dataset.key] = field.value;
    } else if (careerItem) {
      data.careers[Number(careerItem.dataset.index)][field.dataset.key] = field.value;
    }
    saveData();
    renderPreview();
  }

  function addItem(type) {
    if (type === 'career') {
      data.careers.push({ company: '', role: '', startDate: '', endDate: '', companyInfo: '', responsibilities: '', achievements: '' });
    } else {
      data[type].push(type === 'qualification' ? { date: '', detail: '', url: '' } : { date: '', detail: '' });
    }
    renderLists();
    saveData();
    renderPreview();
  }

  function removeItem(button) {
    const simpleRow = button.closest('.repeating-row');
    const careerItem = button.closest('.career-editor-item');
    if (simpleRow) data[simpleRow.dataset.type].splice(Number(simpleRow.dataset.index), 1);
    if (careerItem) data.careers.splice(Number(careerItem.dataset.index), 1);
    renderLists();
    saveData();
    renderPreview();
  }

  function escapeHTML(value = '') {
    return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
  }

  function displayText(value, fallback = '') {
    return value ? escapeHTML(value) : `<span class="empty-preview">${escapeHTML(fallback)}</span>`;
  }

  function formatMonth(value) {
    if (!value) return '';
    const [year, month] = value.split('-');
    return `${year}年 ${Number(month)}月`;
  }

  function formatDate(value) {
    if (!value) return '';
    const [year, month, day] = value.split('-');
    return `${year}年${Number(month)}月${Number(day)}日`;
  }

  function calculateAge(birthDate) {
    if (!birthDate) return '';
    const birth = new Date(`${birthDate}T00:00:00`);
    const reference = data.fields.createdDate ? new Date(`${data.fields.createdDate}T00:00:00`) : new Date();
    let age = reference.getFullYear() - birth.getFullYear();
    const beforeBirthday = reference.getMonth() < birth.getMonth() || (reference.getMonth() === birth.getMonth() && reference.getDate() < birth.getDate());
    if (beforeBirthday) age -= 1;
    return Number.isFinite(age) && age >= 0 ? `${age}歳` : '';
  }

  function renderHistoryRows(items, category) {
    const rows = [`<div class="paper-table-row category-row"><div class="paper-table-date"></div><div class="paper-table-detail">${category}</div></div>`];
    items.forEach((item) => {
      rows.push(`<div class="paper-table-row"><div class="paper-table-date">${escapeHTML(formatMonth(item.date))}</div><div class="paper-table-detail">${displayText(item.detail, '未入力')}</div></div>`);
    });
    return rows.join('');
  }

  function blankRows(count) {
    return Array.from({ length: count }, () => '<div class="paper-table-row empty-row"><div class="paper-table-date"></div><div class="paper-table-detail"></div></div>').join('');
  }

  function credentialLink(value) {
    if (!value) return '';
    const url = String(value).trim();
    const label = url.replace(/^https?:\/\//i, '').replace(/\/$/, '');
    if (!/^https?:\/\//i.test(url)) return `<span class="qualification-proof">確認URL: ${escapeHTML(label)}</span>`;
    return `<a class="qualification-proof" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">確認URL: ${escapeHTML(label)}</a>`;
  }

  function renderResume() {
    const fields = data.fields;
    const age = calculateAge(fields.birthDate);
    const photo = data.photo ? `<img src="${data.photo}" alt="">` : '証明写真';
    return `
      <article class="document-page resume-document">
        <h2 class="resume-document-title">履 歴 書</h2>
        <div class="resume-current-date">${displayText(formatDate(fields.createdDate), '作成日')} 現在</div>
        <section class="resume-profile">
          <div class="profile-text">
            <div class="profile-kana"><span class="paper-label">ふりがな</span><span class="paper-value">${displayText(fields.nameKana)}</span></div>
            <div class="profile-name"><span class="paper-label">氏名</span><span class="paper-value">${displayText(fields.fullName, '氏名未入力')}</span></div>
            <div class="profile-birth"><span class="paper-label">生年月日</span><span class="paper-value">${displayText(formatDate(fields.birthDate))} ${age ? `（${escapeHTML(age)}）` : ''}</span><span class="paper-value">${escapeHTML(fields.gender)}</span></div>
          </div>
          <div class="profile-photo">${photo}</div>
        </section>
        <section class="resume-contact">
          <div><span class="paper-label">ふりがな</span><span class="paper-value full-contact">${displayText(fields.addressKana)}</span></div>
          <div><span class="paper-label">現住所</span><span class="paper-value full-contact">${fields.postalCode ? `〒${escapeHTML(fields.postalCode)}　` : ''}${displayText(fields.address)}</span></div>
          <div><span class="paper-label">電話</span><span class="paper-value">${displayText(fields.phone)}</span><span class="paper-label">E-mail</span><span class="paper-value">${displayText(fields.email)}</span></div>
          <div><span class="paper-label">GitHub</span><span class="paper-value full-contact">${displayText(fields.github)}</span></div>
        </section>
        <section class="paper-section">
          <div class="paper-table-header"><div>年月</div><div>学歴・職歴</div></div>
          ${renderHistoryRows(data.education, '学歴')}
          ${renderHistoryRows(data.employment, '職歴')}
          ${blankRows(Math.max(2, 8 - data.education.length - data.employment.length))}
        </section>
      </article>
      <article class="document-page resume-document">
        <section class="paper-section" style="border-top:1px solid #374151">
          <div class="paper-table-header"><div>年月</div><div>免許・資格</div></div>
          ${data.qualification.map((item) => `<div class="paper-table-row"><div class="paper-table-date">${escapeHTML(formatMonth(item.date))}</div><div class="paper-table-detail">${displayText(item.detail, '未入力')}${credentialLink(item.url)}</div></div>`).join('')}
          ${blankRows(Math.max(4, 8 - data.qualification.length))}
        </section>
        <section class="paper-text-section"><div class="paper-text-title">志望動機・自己PRなど</div><div class="paper-text-content">${displayText(fields.motivation, '志望動機・自己PRを入力してください')}</div></section>
        <section class="paper-text-section" style="min-height:145px"><div class="paper-text-title">本人希望記入欄</div><div class="paper-text-content">${displayText(fields.requests, '貴社規定に従います。')}</div></section>
      </article>`;
  }

  function renderCareer() {
    const fields = data.fields;
    const careers = data.careers.map((career) => `
      <section class="career-company">
        <div class="career-company-heading"><strong>${displayText(career.company, '会社名未入力')}</strong><span>${escapeHTML(formatMonth(career.startDate))} 〜 ${career.endDate ? escapeHTML(formatMonth(career.endDate)) : '現在'}</span></div>
        <div class="career-company-info">${displayText(career.companyInfo, '事業内容・会社概要')}</div>
        <div class="career-company-grid">
          <div>所属・役職</div><div>${displayText(career.role, '未入力')}</div>
          <div>担当業務</div><div>${displayText(career.responsibilities, '担当業務を入力してください')}</div>
          <div>実績・成果</div><div>${displayText(career.achievements, '実績・成果を入力してください')}</div>
        </div>
      </section>`).join('');

    return `
      <article class="document-page career-document">
        <header class="career-doc-header">
          <h2>職務経歴書</h2>
          <div class="career-doc-meta">${displayText(formatDate(fields.createdDate), '作成日')}<br>${displayText(fields.fullName, '氏名未入力')}</div>
        </header>
        <section class="career-section"><h3 class="career-section-title">職務要約</h3><div class="career-body">${displayText(fields.careerSummary, '職務要約を入力してください')}</div></section>
        <section class="career-section"><h3 class="career-section-title">活かせる経験・知識・技術</h3><div class="career-body">${displayText(fields.skills, '経験・知識・技術を入力してください')}</div></section>
        <section class="career-section"><h3 class="career-section-title">職務経歴</h3>${careers || '<div class="career-body empty-preview">職務経歴を追加してください</div>'}</section>
        <section class="career-section"><h3 class="career-section-title">自己PR</h3><div class="career-body">${displayText(fields.selfPromotion, '自己PRを入力してください')}</div></section>
      </article>`;
  }

  function renderPreview() {
    preview.innerHTML = data.activeDocument === 'resume' ? renderResume() : renderCareer();
    updateCompletion();
    requestAnimationFrame(fitPreviewForViewport);
  }

  function updateCompletion() {
    const sharedRequired = [data.fields.fullName, data.fields.birthDate, data.fields.address, data.fields.phone, data.fields.email];
    const documentRequired = data.activeDocument === 'resume'
      ? [data.education.some((item) => item.detail), data.employment.some((item) => item.detail), data.fields.motivation]
      : [data.fields.careerSummary, data.fields.skills, data.careers.some((item) => item.company && item.responsibilities), data.fields.selfPromotion];
    const values = [...sharedRequired, ...documentRequired];
    const percentage = Math.round((values.filter(Boolean).length / values.length) * 100);
    completionBar.style.width = `${percentage}%`;
    completionLabel.textContent = `${percentage}% 完了`;
  }

  function fitPreviewForViewport() {
    if (window.innerWidth > 820) {
      const availableWidth = document.getElementById('previewScroll').clientWidth - 68;
      const paperWidth = preview.querySelector('.document-page')?.offsetWidth || 760;
      zoom = Math.min(1, Math.max(.55, availableWidth / paperWidth));
    } else {
      const availableWidth = document.getElementById('previewScroll').clientWidth - 28;
      const paperWidth = preview.querySelector('.document-page')?.offsetWidth || 595;
      zoom = Math.min(1, Math.max(.45, availableWidth / paperWidth));
    }
    applyZoom();
  }

  function applyZoom() {
    preview.style.transform = `scale(${zoom})`;
    document.getElementById('zoomLabel').textContent = `${Math.round(zoom * 100)}%`;
    const pages = preview.querySelectorAll('.document-page');
    const naturalHeight = Array.from(pages).reduce((sum, page) => sum + page.offsetHeight + 28, 0);
    preview.parentElement.style.setProperty('--scaled-height', `${naturalHeight * zoom}px`);
    preview.style.marginBottom = `${Math.min(0, naturalHeight * (zoom - 1))}px`;
  }

  async function handlePhoto(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    const image = await loadImage(file);
    const canvas = document.createElement('canvas');
    const targetRatio = 4 / 5;
    const sourceRatio = image.width / image.height;
    let sx = 0, sy = 0, sw = image.width, sh = image.height;
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
    data.photo = canvas.toDataURL('image/jpeg', .84);
    updatePhotoUI();
    saveData();
    renderPreview();
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => { URL.revokeObjectURL(image.src); resolve(image); };
      image.onerror = reject;
      image.src = URL.createObjectURL(file);
    });
  }

  form.addEventListener('input', onFormInput);
  document.getElementById('educationList').addEventListener('input', onListInput);
  document.getElementById('employmentList').addEventListener('input', onListInput);
  document.getElementById('qualificationList').addEventListener('input', onListInput);
  document.getElementById('careerList').addEventListener('input', onListInput);

  document.addEventListener('click', (event) => {
    const documentTab = event.target.closest('[data-document]');
    const addButton = event.target.closest('[data-add]');
    const removeButton = event.target.closest('.remove-row-button, .remove-career-button');
    const mobileViewButton = event.target.closest('[data-mobile-view]');
    if (documentTab) switchDocument(documentTab.dataset.document);
    if (addButton) addItem(addButton.dataset.add);
    if (removeButton) removeItem(removeButton);
    if (mobileViewButton) {
      document.querySelectorAll('[data-mobile-view]').forEach((button) => button.classList.toggle('is-active', button === mobileViewButton));
      document.querySelector('.workspace').dataset.mobileMode = mobileViewButton.dataset.mobileView;
      if (mobileViewButton.dataset.mobileView === 'preview') requestAnimationFrame(fitPreviewForViewport);
    }
  });

  document.getElementById('photoInput').addEventListener('change', (event) => handlePhoto(event.target.files[0]));
  document.getElementById('removePhotoButton').addEventListener('click', () => {
    data.photo = '';
    document.getElementById('photoInput').value = '';
    updatePhotoUI();
    saveData();
    renderPreview();
  });

  document.getElementById('loadSampleButton').addEventListener('click', () => {
    data = JSON.parse(JSON.stringify(sampleData));
    hydrateForm();
    saveData();
  });

  document.getElementById('saveDraftButton').addEventListener('click', saveDraftNow);
  document.getElementById('reloadDraftButton').addEventListener('click', reloadDraft);

  document.getElementById('clearButton').addEventListener('click', () => confirmDialog.showModal());
  document.getElementById('confirmClearButton').addEventListener('click', () => {
    clearTimeout(saveTimer);
    try {
      localStorage.removeItem(STORAGE_KEY);
      shouldPersistDraft = false;
      data = defaultData();
      hydrateForm();
      saveStatus.classList.remove('is-saving');
      saveStatus.textContent = '下書きは保存されていません';
      showDraftMessage('下書きデータを削除しました');
    } catch {
      showDraftMessage('下書きデータを削除できませんでした');
    }
  });

  document.getElementById('printButton').addEventListener('click', () => window.print());
  document.getElementById('zoomOutButton').addEventListener('click', () => { zoom = Math.max(.4, zoom - .1); applyZoom(); });
  document.getElementById('zoomInButton').addEventListener('click', () => { zoom = Math.min(1.2, zoom + .1); applyZoom(); });
  window.addEventListener('resize', fitPreviewForViewport);
  window.addEventListener('pagehide', () => {
    clearTimeout(saveTimer);
    if (!shouldPersistDraft) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* 保存容量超過時は既存データを維持 */ }
  });

  hydrateForm();
})();
