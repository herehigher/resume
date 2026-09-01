# Changelog

この project の重要な変更を記録します。形式は [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) を参考にし、version は [Semantic Versioning](https://semver.org/) に従います。

English: This file records notable changes. Release dates are added only when the corresponding release is created.

## [Unreleased]

## [0.1.0] - 2026-09-01

### Added / 追加

- 日本語の履歴書・職務経歴書 editor と A4 template。
- 简体中文 resume editor と A4 template。
- English ATS-friendly resume と US Letter / A4 template。
- 独立した三言語 document section、三言語で共有する profile、sample mode、JSON backup / restore。
- Profile URL の protocol 制限と入力 escaping。
- Desktop/mobile workflow、PDF pagination、network guard の acceptance tests。
- 三言語 README、privacy、contribution guide、MIT License、reproducible screenshot/PDF samples。
- 右下の GitHub source link、app version、三言語 Privacy & Security dialog。 / Added a source link, app version, and tri-lingual privacy dialog.
- Issue #9: stable SemVer tag によってのみ起動する GitHub Pages production deployment、既存 tag の manual redeploy / rollback、version release playbook。

### Security / Privacy

- Cookie や利用者単位 ID を使わない標準 Cloudflare Web Analytics を、集計 page view / performance 計測の限定的な例外として追加。履歴書入力、写真、JSON、local draft は送信しません。
- Added standard, cookie-free Cloudflare Web Analytics as the sole exception for aggregate page-view and performance metrics. Resume input, photos, JSON, and local drafts are not sent.
