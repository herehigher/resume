# Resume Studio — English usage guide

Resume Studio is a resume builder that needs no sign-in. Read the [English public entry](/en/) and start editing in the [English editor](/editor/?lang=en).

## Documents and PDF

- Japanese supports a resume and a career history document; Simplified Chinese and English each support a resume. Document content is independent for each language and is not automatically translated. Profile details such as name, contact information, and photo are shared.
- Check content and page breaks in the live preview. Japanese and Chinese support A4; English supports Letter / A4.
- Use the editor's print action to open the browser print dialog and choose Save as PDF. Confirm the current language, document, and paper size, then check every page for clipped or overlapping text. There is no public PDF generation API.

## JSON and local drafts

- A JSON export backs up documents in every language, the shared profile, photo, and settings. PDF and JSON files may contain personal information. Keep them in a safe location chosen by the user.
- The current saved format is `version: 4` (`resume-studio-web-v4`). See the [v4 JSON Schema](/schema/resume-studio-web-v4.schema.json) and the [import example with explicitly fictional data](/schema/resume-studio-web-v4.example.json). The Schema describes the export format; it is not an upload API.
- The Schema's `x-resume-studio-uniqueBy: "id"` is a required custom applicator. Record IDs must be unique within each marked array. Ordinary JSON Schema validators may ignore unknown keywords, so passing one alone does not establish that a file can be imported. Support this applicator as well and check with the editor's actual import validation. Preserve array order and do not arbitrarily rewrite IDs or page-break references.
- Importing JSON replaces the current content. Back up first and confirm the user's intent before importing.
- Drafts are encrypted and saved automatically on the device for the same site and browser. Saving depends on a secure context (HTTPS or localhost) and supported browser features. Storage limits, save failures, conflicts, and read-only states do not mean a save completed. Check the on-screen notice and export JSON.
- There is no account sync or server backup. Clearing browser site data or changing devices may lose drafts. Obtain the user's confirmation before deleting or replacing the current draft.

## Privacy and agent actions

Resume input, photos, JSON, and drafts are processed in the browser and are not included in the application's network requests. Source, clones, and forks contain no Analytics beacon. The official hosted site receives Web Analytics from the Cloudflare Pages delivery layer, but resume data is not included in Analytics requests.

This public guide and Content Signals do not grant blanket permission to upload, transmit, or share the user's private data. An agent must obtain the user's explicit authorization for the specific action before passing resume data to an external service.

Use of the public guide after retrieval follows the same Content-Signal as public HTML. See [robots.txt](/robots.txt) for the published policy and the [sitemap](/sitemap.xml) for the three public language entries. These preferences do not change existing [MIT License](https://github.com/herehigher/resume/blob/main/LICENSE) rights and do not control access to private data.

This document has its own static Markdown URL. It does not establish content negotiation through `Accept: text/markdown` at the same HTML URL or mean that Markdown for Agents is enabled.
