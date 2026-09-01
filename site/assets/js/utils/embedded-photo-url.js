const EMBEDDED_PHOTO = /^data:(image\/(?:jpeg|png|webp));base64,([a-z0-9+/]*={0,2})$/i;

function embeddedPhotoBlob(source) {
  const match = String(source || '').match(EMBEDDED_PHOTO);
  if (!match) return null;
  try {
    const bytes = Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0));
    return new Blob([bytes], { type: match[1].toLowerCase() });
  } catch {
    return null;
  }
}

export function createEmbeddedPhotoUrl({
  createObjectURL = (blob) => URL.createObjectURL(blob),
  revokeObjectURL = (url) => URL.revokeObjectURL(url)
} = {}) {
  let currentSource = '';
  let currentUrl = '';

  function clear() {
    if (currentUrl) revokeObjectURL(currentUrl);
    currentSource = '';
    currentUrl = '';
  }

  return {
    clear,
    resolve(source) {
      const normalizedSource = String(source || '');
      if (normalizedSource && normalizedSource === currentSource) return currentUrl;
      const blob = embeddedPhotoBlob(normalizedSource);
      if (!blob) {
        clear();
        return '';
      }
      let nextUrl;
      try {
        nextUrl = createObjectURL(blob);
      } catch {
        clear();
        return '';
      }
      clear();
      currentSource = normalizedSource;
      currentUrl = nextUrl;
      return currentUrl;
    }
  };
}
