import { readFile } from 'node:fs/promises';
import packageJson from '../../package.json' with { type: 'json' };
import { expect, expectNoPageOverflow, openLocale, test } from './fixtures.js';

const REPOSITORY_URL = 'https://github.com/herehigher/resume';
const PRIVACY_URLS = {
  ja: `${REPOSITORY_URL}/blob/main/PRIVACY.md#privacy-ja`,
  'zh-CN': `${REPOSITORY_URL}/blob/main/PRIVACY.md#privacy-zh-cn`,
  en: `${REPOSITORY_URL}/blob/main/PRIVACY.md#privacy-en`
};

test('privacy UI switches immediately across all locales and exposes safe source links', async ({ page }) => {
  await openLocale(page, 'ja');
  const badge = page.locator('#privacySecurityButton');
  const dialog = page.locator('#privacySecurityDialog');

  await expect(page.locator('#privacySecurityBadgeLabel')).toHaveText('ローカル処理');
  await expect(page.locator('#privacySecurityVersion')).toHaveText(`v${packageJson.version}`);
  await expect(page.locator('#repositoryLink')).toHaveAttribute('href', REPOSITORY_URL);
  await expect(page.locator('#repositoryLink')).toHaveAttribute('target', '_blank');
  await expect(page.locator('#repositoryLink')).toHaveAttribute('rel', 'noopener noreferrer');

  await badge.click();
  await expect(dialog).toHaveAttribute('open', '');
  await expect(page.locator('#privacySecurityTitle')).toBeFocused();
  await expect(dialog).toHaveAttribute('aria-labelledby', 'privacySecurityTitle');
  await expect(dialog).toHaveAttribute('aria-describedby', 'privacySecuritySummary');
  await expect(page.locator('#privacySecurityUserBody')).toContainText('Cloudflare Web Analytics');
  await expect(page.locator('#privacySecurityUserBody')).toContainText('履歴書の内容、写真、JSON、端末上の下書き');
  await expect(page.locator('#privacySecurityTechnicalBody')).toContainText('標準 RUM endpoint');
  await expect(page.locator('#privacyNoticeLink')).toHaveAttribute('href', PRIVACY_URLS.ja);
  await expect(page.locator('#privacyRepositoryLink')).toHaveAttribute('href', REPOSITORY_URL);
  for (const link of [page.locator('#privacyRepositoryLink'), page.locator('#privacyNoticeLink')]) {
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  }

  await page.locator('#privacySecurityCloseButton').click();
  await expect(dialog).not.toHaveAttribute('open', '');
  await expect(badge).toBeFocused();

  await page.locator('#localeSelect').selectOption('zh-CN');
  await expect(page.locator('#privacySecurityBadgeLabel')).toHaveText('本地处理');
  await badge.click();
  await expect(page.locator('#privacySecurityTitle')).toHaveText('隐私与安全');
  await expect(page.locator('#privacySecurityUserBody')).toContainText('Cloudflare Web Analytics');
  await expect(page.locator('#privacySecurityUserBody')).toContainText('简历内容、照片、JSON 和设备上的草稿');
  await expect(page.locator('#privacyNoticeLink')).toHaveAttribute('href', PRIVACY_URLS['zh-CN']);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toHaveAttribute('open', '');
  await expect(badge).toBeFocused();

  await page.locator('#localeSelect').selectOption('en');
  await expect(page.locator('#privacySecurityBadgeLabel')).toHaveText('Processed locally');
  await badge.click();
  await expect(page.locator('#privacySecurityTitle')).toHaveText('Privacy & Security');
  await expect(page.locator('#privacySecurityUserBody')).toContainText('Cloudflare Web Analytics');
  await expect(page.locator('#privacySecurityUserBody')).toContainText('resume content, photo, JSON, and on-device draft');
  await expect(page.locator('#privacyNoticeLink')).toHaveAttribute('href', PRIVACY_URLS.en);
});

test('editing, local save, and JSON export remain available after going offline', async ({ context, page }) => {
  await openLocale(page, 'ja');
  await context.setOffline(true);

  const name = page.locator('[name="fullName"]');
  await name.fill('オフライン 編集');
  await page.locator('#saveDraftButton').click();
  await expect.poll(() => page.evaluate(() => (
    JSON.parse(localStorage.getItem('resume-studio-web-v1')).profile.fields.fullName
  ))).toBe('オフライン 編集');

  await page.locator('#dataMenuSummary').click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportDataButton').click();
  const download = await downloadPromise;
  const exported = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(exported.profile.fields.fullName).toBe('オフライン 編集');
});

test('source, badge, and open privacy dialog are excluded from print', async ({ page }) => {
  await openLocale(page, 'ja');
  await page.locator('#privacySecurityButton').click();
  await expect(page.locator('#privacySecurityDialog')).toHaveAttribute('open', '');

  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#repositoryLink')).toBeHidden();
  await expect(page.locator('#privacySecurityButton')).toBeHidden();
  await expect(page.locator('#privacySecurityDialog')).toBeHidden();
});

test('@mobile privacy UI stays reachable without overflowing the page', async ({ page }) => {
  await openLocale(page, 'en');
  await expect(page.locator('#repositoryLink')).toBeVisible();
  await expect(page.locator('#privacySecurityButton')).toBeVisible();
  await expectNoPageOverflow(page);

  await page.locator('#privacySecurityButton').click();
  await expect(page.locator('#privacySecurityDialog')).toHaveAttribute('open', '');
  await expect(page.locator('#privacyRepositoryLink')).toBeVisible();
  await expectNoPageOverflow(page);
  await page.locator('#privacySecurityCloseButton').click();
  await expect(page.locator('#privacySecurityButton')).toBeFocused();
});
