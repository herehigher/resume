function element(id) {
  return document.getElementById(id);
}

export function confirmAction({ title, body, cancel, confirm }) {
  const dialog = element('sampleAdoptDialog');
  if (!dialog) throw new Error('Sample adoption confirmation dialog is unavailable');

  element('sampleAdoptDialogTitle').textContent = title;
  element('sampleAdoptDialogBody').textContent = body;
  element('cancelSampleAdoptButton').textContent = cancel;
  element('confirmSampleAdoptButton').textContent = confirm;

  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true });
    dialog.showModal();
  });
}

export const confirmSampleAdoption = confirmAction;
