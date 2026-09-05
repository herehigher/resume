import { readFile } from 'node:fs/promises';

export const PRIVACY_CANARIES = Object.freeze([
  'fictional-network-input-001',
  'fictional-network-import-002',
  'fictional-network-photo-003.png',
  'fictional-network-draft-004@example.invalid'
]);

const DRAFT_STORAGE_KEY = 'resume-studio-web-v1';
const PHOTO_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

export async function exercisePrivacyCanary(page, { leaveUrl }) {
  if (!leaveUrl) throw new Error('A leave URL is required for the privacy canary lifecycle.');
  const [inputCanary, importCanary, photoFileName, draftCanary] = PRIVACY_CANARIES;
  const motivation = page.locator('[name="motivation"]');
  await motivation.evaluate((field) => {
    const details = field.closest('details');
    if (details) details.open = true;
  });
  await page.locator('[name="fullName"]').fill(inputCanary);
  await motivation.fill(draftCanary);
  await page.locator('#photoInput').setInputFiles({
    buffer: Buffer.from(PHOTO_BASE64, 'base64'),
    mimeType: 'image/png',
    name: photoFileName
  });
  await page.locator('#photoThumbnail img').waitFor({ state: 'visible' });
  await page.waitForFunction(({ key, values }) => {
    const raw = localStorage.getItem(key);
    return raw && !values.some((value) => raw.includes(value)) && JSON.parse(raw).format === 'resume-studio-local-encrypted-v1';
  }, { key: DRAFT_STORAGE_KEY, values: PRIVACY_CANARIES });

  await page.locator('#dataMenuSummary').click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportDataButton').click();
  const exported = JSON.parse(await readFile(await (await downloadPromise).path(), 'utf8'));
  const photoCanary = exported.profile.photo;
  if (!/^data:image\/jpeg;base64,/.test(photoCanary || '')) throw new Error('The fictional photo was not exported.');
  exported.profile.fields.fullName = importCanary;
  await page.locator('#importDataInput').setInputFiles({
    buffer: Buffer.from(JSON.stringify(exported)),
    mimeType: 'application/json',
    name: 'fictional-network-import.json'
  });
  await page.locator('[name="fullName"]').waitFor({ state: 'visible' });
  await page.waitForFunction((value) => document.querySelector('[name="fullName"]')?.value === value, importCanary);
  await page.waitForFunction((key) => Boolean(localStorage.getItem(key)), DRAFT_STORAGE_KEY);

  await page.reload();
  await page.waitForFunction((value) => document.querySelector('[name="fullName"]')?.value === value, importCanary);
  await page.goto(leaveUrl);
  return Object.freeze({ canaries: Object.freeze([...PRIVACY_CANARIES, photoCanary]) });
}
