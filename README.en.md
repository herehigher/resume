# Resume Studio - English Guide

[日本語](README.md) | [简体中文](README.zh-CN.md)

Resume Studio is a personal, static web app for editing Japanese, Simplified Chinese, and English resumes in the browser and saving them as PDF or JSON. Its production code is static HTML, CSS, and ES Modules. It does not automatically submit resume input to a backend or external service.

## Web App

Publication of the hosted Web App is tracked in Issue #9. Use the local setup below until its URL has been verified.

## Documents and paper sizes

| Language | Documents | Paper |
| --- | --- | --- |
| 日本語 | Rirekisho (履歴書) and Shokumukeirekisho (職務経歴書) | A4 |
| 简体中文 | Chinese resume (中文简历) | A4 |
| English | ATS-friendly resume | US Letter and A4 |

The locale-specific document sections are stored independently and do not overwrite one another. The profile, contact details, and photo are shared across locales, so a profile change in one locale appears in the others. Example mode is temporary and leaves the saved draft unchanged unless you explicitly adopt the example.

## Run locally

Node.js is used for tests, but the app requires no production build. Because it uses ES Modules, serve `site/` from a static web server instead of opening it with `file://`.

```bash
python3 -m http.server 8000 --directory site
```

Open `http://localhost:8000/` in Chrome.

## Start with this README only

1. Select 日本語, 简体中文, or English from the language selector in the upper-right corner. You can also open `?lang=ja`, `?lang=zh-CN`, or `?lang=en` directly.
2. Edit a field and the preview updates immediately. Select “View example” to inspect a completed document first. The example does not overwrite a saved draft.
3. Input is saved automatically to `localStorage` in the current browser profile. Use “Save draft” for a manual save and “Reload saved draft” to restore the saved content.
4. Select “Save PDF,” then choose “Save as PDF” in Chrome's print dialog. Review the paper and print limitations below.
5. Export JSON from the data menu in the upper-right corner to create a backup. To restore it, choose “Import data” and select a JSON file in the same format. An invalid file does not replace the existing draft.
6. To delete saved data, switch to 日本語, select “保存した下書きを削除” at the bottom, and confirm the dialog. This removes the complete v1 draft and on-screen input for all three languages.

## Features

- Independent locale document sections, a shared profile, and locale switching
- Rirekisho / Shokumukeirekisho switching in Japanese
- Live preview while editing
- Temporary examples, example adoption, and saved-draft restoration
- Autosave, manual save, and reload
- JSON backup / restore
- Profile links restricted to `http://` and `https://`
- A4 / US Letter PDF output with automatic pagination
- Edit / preview switching at desktop and mobile widths

## Screenshots and PDF samples

![English editor and preview](docs/screenshots/en.png)

- [Japanese A4 PDF sample](output/pdf/ja-a4.pdf)
- [Simplified Chinese A4 PDF sample](output/pdf/zh-CN-a4.pdf)
- [English US Letter PDF sample](output/pdf/en-letter.pdf)

All assets use fictional sample data. Their source and Chromium version are recorded in the [asset manifest](docs/assets-manifest.json).

## Data and privacy

- The storage key is `resume-studio-web-v1`. The profile, photo, and all three language documents are stored together for the current browser origin.
- Photos and exported JSON may contain personal information. Neither localStorage nor exported files are encrypted.
- Clearing browser data, ending a private-browsing session, exceeding the storage quota, or browser storage eviction can remove a draft. Export important drafts as JSON backups.
- In-app deletion clears the v1 state. It does not delete the legacy `resume-studio-data-v1` key, downloaded JSON/PDF files, or browser download history.
- The repository `site/`, clones, and forks disable analytics by default and make no analytics requests beyond same-origin static assets. Only a validated stable tag in `herehigher/resume` may have the deployment-only adapter deterministically add standard Cloudflare Web Analytics when its tagged manifest enables it. It uses no cookies, localStorage, user-level IDs, or custom events and sends no resume input, photo, JSON, or on-device draft. The page status and Network panel expose the active mode.

Read [Privacy / English](PRIVACY.md#privacy-en) for the complete policy.

## Browser support and PDF limitations

- Automated acceptance covers current Chrome/Chromium at desktop `1440 x 1000` and a mobile-equivalent `390 x 844` viewport.
- Safari, Firefox, and physical mobile devices are unverified. Even on Chromium, the OS, fonts, and print engine can change wrapping and pagination.
- When saving a PDF, disable browser headers/footers, enable background graphics, use approximately 100% scale, and prefer the CSS page size.
- Japanese and Chinese use A4. English supports US Letter and A4. Before saving, inspect print preview for clipping, unexpected blank pages, and the selected paper size.
- Extremely long URLs, unbreakable words, or very large documents can change the layout. Visually inspect the final document before submitting it.

## Development and verification

```bash
npm ci
npm run test:acceptance
```

Do not add external APIs, CDNs, external fonts, or analytics to the `site/` source. The sole exception is the deployment-only adapter adding standard Cloudflare Web Analytics to a validated stable-tag artifact in the official repository when its tagged manifest matches. See [Contributing](CONTRIBUTING.md) and the [release acceptance checklist](docs/acceptance-checklist.md).

## Repository information

- [Privacy](PRIVACY.md#privacy-en)
- [Changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md)
- [MIT License](LICENSE)
