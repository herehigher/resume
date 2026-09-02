import { MAX_PROFILE_LINKS, profileLinkIcon, profileLinkMeta } from '../utils/profile-links.js';

export function renderProfileLinksEditor(container, links, {
  placeholder = 'https://example.com',
  removeLabel = 'Remove link'
} = {}) {
  container.replaceChildren();
  links.forEach((value, index) => {
    const row = document.createElement('div');
    row.className = 'profile-link-editor-row';
    row.dataset.profileLinkRow = String(index);

    const label = document.createElement('label');
    label.className = 'input-field';
    const caption = document.createElement('span');
    caption.textContent = 'URL';
    const input = document.createElement('input');
    input.type = 'url';
    input.inputMode = 'url';
    input.autocomplete = 'url';
    input.placeholder = placeholder;
    input.value = value;
    input.dataset.profileLinkIndex = String(index);
    label.append(caption, input);

    const recognition = document.createElement('span');
    recognition.className = 'profile-link-recognition';
    const meta = profileLinkMeta(value);
    recognition.innerHTML = `${profileLinkIcon(meta.icon)}<span>${meta.name}</span>`;

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove-profile-link-button';
    remove.dataset.removeProfileLink = String(index);
    remove.setAttribute('aria-label', removeLabel);
    remove.textContent = '×';
    row.append(label, recognition, remove);
    container.append(row);
  });
}

export function updateProfileLinkRecognition(input) {
  const row = input.closest('[data-profile-link-row]');
  const recognition = row?.querySelector('.profile-link-recognition');
  if (!recognition) return;
  const meta = profileLinkMeta(input.value);
  recognition.innerHTML = `${profileLinkIcon(meta.icon)}<span>${meta.name}</span>`;
}

export function canAddProfileLink(links) {
  return Array.isArray(links) && links.length < MAX_PROFILE_LINKS;
}
