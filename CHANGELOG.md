# Changelog

この project の重要な変更を記録します。形式は [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) を参考にし、version は [Semantic Versioning](https://semver.org/) に従います。

English: This file records notable changes. Release dates are added only when the corresponding release is created.

## [Unreleased]

### Added / 追加

- 日本語の履歴書・職務経歴書 editor と A4 template。
- 简体中文 resume editor と A4 template。
- English ATS-friendly resume と US Letter / A4 template。
- 独立した三言語 document section、三言語で共有する profile、sample mode、JSON backup / restore。
- Profile URL の protocol 制限と入力 escaping。
- Desktop/mobile workflow、PDF pagination、network guard の acceptance tests。
- 三言語 README、privacy、contribution guide、MIT License、reproducible screenshot/PDF samples。
- 右下の GitHub source link、app version、三言語 Privacy & Security dialog。 / Added a source link, app version, and tri-lingual privacy dialog.

### Security / Privacy

- 本番 runtime は外部 API、CDN、外部 font、analytics を使用せず、履歴書入力を application backend へ自動送信しません。
- Production runtime uses no external APIs, CDNs, external fonts, or analytics and does not automatically submit resume input to an application backend.
