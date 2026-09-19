const ACCEPTED_PHOTO_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const TARGET_WIDTH = 480;
const TARGET_HEIGHT = 600;
const TARGET_RATIO = TARGET_WIDTH / TARGET_HEIGHT;
const JPEG_QUALITY = .84;

function loadImage(sourceUrl, ImageConstructor) {
  return new Promise((resolve, reject) => {
    const image = new ImageConstructor();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = sourceUrl;
  });
}

function cropDimensions(image) {
  const sourceRatio = image.width / image.height;
  if (sourceRatio > TARGET_RATIO) {
    const sw = image.height * TARGET_RATIO;
    return { sx: (image.width - sw) / 2, sy: 0, sw, sh: image.height };
  }
  const sh = image.width / TARGET_RATIO;
  return { sx: 0, sy: (image.height - sh) / 2, sw: image.width, sh };
}

function hasTransparentPixels(context) {
  const pixels = context.getImageData(0, 0, TARGET_WIDTH, TARGET_HEIGHT).data;
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] !== 255) return true;
  }
  return false;
}

export function isAcceptedProfilePhoto(file) {
  return Boolean(file && ACCEPTED_PHOTO_TYPES.has(file.type));
}

export async function createProfilePhotoDataUrl(file, dependencies = {}) {
  if (!isAcceptedProfilePhoto(file)) return '';
  const {
    createCanvas = () => document.createElement('canvas'),
    createObjectURL = (blob) => URL.createObjectURL(blob),
    ImageConstructor = globalThis.Image,
    revokeObjectURL = (url) => URL.revokeObjectURL(url)
  } = dependencies;

  const sourceUrl = createObjectURL(file);
  try {
    const image = await loadImage(sourceUrl, ImageConstructor);
    const canvas = createCanvas();
    canvas.width = TARGET_WIDTH;
    canvas.height = TARGET_HEIGHT;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not create a 2D canvas context');
    const { sx, sy, sw, sh } = cropDimensions(image);
    context.drawImage(image, sx, sy, sw, sh, 0, 0, TARGET_WIDTH, TARGET_HEIGHT);
    return hasTransparentPixels(context)
      ? canvas.toDataURL('image/png')
      : canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  } finally {
    revokeObjectURL(sourceUrl);
  }
}
