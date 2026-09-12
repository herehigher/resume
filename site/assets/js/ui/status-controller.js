const NOTICE_DURATION = 3500;

function noticePriority(tone) {
  if (tone === 'error') return 3;
  if (tone === 'saving') return 2;
  return 1;
}

export function announceStatus(message, tone = '') {
  const announcer = document.getElementById('statusAnnouncer');
  if (!announcer || !message) return;
  announcer.setAttribute('aria-live', tone === 'error' ? 'assertive' : 'polite');
  announcer.textContent = '';
  window.requestAnimationFrame(() => { announcer.textContent = message; });
}

export function initStatusController() {
  const notice = document.getElementById('appNotice');
  const noticeMessage = document.getElementById('globalMessage');
  const dismissButton = document.getElementById('appNoticeDismiss');
  const draftStatuses = new Map();
  let activeNotice = null;
  let timer = null;

  function announce(message, tone = '') { announceStatus(message, tone); }

  function clearNotice() {
    window.clearTimeout(timer);
    timer = null;
    activeNotice = null;
    notice.hidden = true;
    noticeMessage.textContent = '';
    notice.classList.remove('is-success', 'is-saving', 'is-error');
    noticeMessage.classList.remove('is-error');
    dismissButton.hidden = true;
  }

  function showAppNotice(message, { tone = 'success', persistent = false, blocking = false, announce: shouldAnnounce = true } = {}) {
    const nextPriority = blocking ? 4 : noticePriority(tone);
    if (activeNotice?.persistent && activeNotice.priority > nextPriority) return false;
    window.clearTimeout(timer);
    activeNotice = { message, tone, persistent, priority: nextPriority };
    notice.hidden = false;
    noticeMessage.textContent = message;
    notice.classList.toggle('is-success', tone === 'success');
    notice.classList.toggle('is-saving', tone === 'saving');
    notice.classList.toggle('is-error', tone === 'error');
    noticeMessage.classList.toggle('is-error', tone === 'error');
    dismissButton.hidden = !persistent;
    if (shouldAnnounce) announce(message, tone);
    if (!persistent) timer = window.setTimeout(clearNotice, NOTICE_DURATION);
    return true;
  }

  function registerDraftStatus(locale, element, controls) {
    draftStatuses.set(locale, { element, controls });
  }

  function setDraftStatus(locale, message, tone = '', { announce: shouldAnnounce = true } = {}) {
    const draft = draftStatuses.get(locale);
    if (!draft) return;
    draft.element.textContent = message;
    draft.element.classList.toggle('is-success', tone === 'success');
    draft.element.classList.toggle('is-saving', tone === 'saving');
    draft.element.classList.toggle('is-error', tone === 'error');
    draft.controls.classList.toggle('is-error', tone === 'error');
    if (shouldAnnounce) announce(message, tone);
  }

  dismissButton.addEventListener('click', clearNotice);
  return { announce, clearNotice, registerDraftStatus, setDraftStatus, showAppNotice };
}
