# Changelog

この project の重要な変更を記録します。形式は [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) を参考にし、version は [Semantic Versioning](https://semver.org/) に従います。

English: This file records notable changes. Dates mark release-candidate freeze; GitHub records the actual publication time.

## [Unreleased]

### Changed / 変更

- 公開準備・承認・配布・smoke を一つの Actions 入口へ統合し、同じ main commit の Quality と準備済み artifact を再利用するよう整理。
- 毎 version の展示 screenshot / PDF 更新、独立 asset 承認、手動 digest 転記と未使用の旧 release helper を廃止し、検証出力を一時 Actions artifact に分離。
- 開発・公開文書を統合し、文言や現在 version を固定する test と docs-only の一律 browser gate を削減。

### Fixed / 修正

- Cloudflare RUM の browser / engine / OS 情報 `bi` を提供者の根拠に基づいて検証し、実 provider script の互換性確認を公開準備へ接続。
- 履歴書の入力・写真・JSON・暗号化草稿から再読込・離脱までの通信検査と、同一 origin の不正 request / WebSocket を検出する回帰 test を補完。

## [0.2.2] - 2026-09-05

### Fixed / 修正

- GitHub Pages の enabled Analytics artifact を、masked repository secret を CLI argument に展開せず tagged module API から再構築するよう修正。

## [0.2.1] - 2026-09-04

### Added / 追加

- 壊れた暗号化下書きを起動時に検出し、既存 data を保持したまま安全に復旧できる操作。
- 公開ページと editor の footer に、repository owner の X 連絡先への導線。
- GitHub runner 内だけで Analytics provider value を使用し、release manifest 用の非機密 digest を生成する read-only workflow。

### Changed / 変更

- Resume Studio の brand logo と desktop / mobile favicon をマーモットの artwork に更新。
- `/` を日本語紹介ページとして統合し、重複していた既定入口と locale metadata、README の案内を整理。
- Release asset の staging / approval / promotion と tag publish を、固定 bundle、exact SHA、明示 approval による fail-closed 手順へ強化。

### Fixed / 修正

- 日本語 preview と印刷時の A4 版面差異、および多言語 PDF の末尾空白 page、資格・証書 section の不安定な改 page を修正。
- 下書き復旧中の競合と、pre-tag workflow の YAML / provider 検証経路を修正。
- Actions variable の provider value が step environment として log に表示される経路を masked repository secret へ移行し、GitHub runner の origin URL 表記差で pre-tag gate が停止する問題を修正。
- Tag publish helper の repository permission query を対応する `gh repo view` 構文へ修正。

### Security / Privacy

- GitHub 操作を owner-approved trusted release host の認証済み session に限定し、OS credential API と raw provider value を agent process から分離。

## [0.2.0] - 2026-09-03

### Added / 追加

- `localStorage` の下書き本文を Web Crypto AES-GCM で暗号化し、取り出せない鍵を同一 origin の IndexedDB に分離して保存する仕組み。
- 日本語・简体中文・English の紹介ページと、`/editor/` に分離した編集画面。表示 locale の独立した端末内 preference。
- GitHub、LinkedIn、GitLab、Qiita などを自動判定する、最大3件の共通 profile link 入力。
- Desktop、Apple touch icon、Android 向けの複数サイズ favicon。
- GitHub runner 内で Release SHA、Analytics manifest、artifact digest、Pages semantic smoke を一括検証する read-only release preflight / pre-tag artifact gate。
- 1 MiB を超える repository snapshot も固定 SHA から安全に検証できる release archive gate。

### Changed / 変更

- 日本語履歴書 PDF を、連絡先、経歴、資格と長文の可読性を高めた現代的な layout に刷新。
- 公開首頁、三言語の紹介ページ、editor の導線と brand 表示を整理し、検索対象ページと編集画面の役割を明確化。
- Mobile の言語選択、三言語の端末内下書き status、削除確認 UI、copyright 表示を改善。
- Pages deployment と smoke test を reusable Quality gate、固定 release SHA、再現可能な artifact 検証へ更新。

### Fixed / 修正

- English の month input locale、多言語 UI の表示不整合、Cloudflare Analytics status marker を修正。
- Non-secure HTTP origin で暗号化草稿を利用できない場合に、既存の保存内容を変更せず理由を案内するよう修正。

### Security / Privacy

- 下書きの暗号化保存には secure context を要求し、暗号化・鍵・storage の検証失敗時に plaintext fallback や既存 ciphertext の上書きを行わない。
- JSON export と PDF は暗号化されないこと、端末内暗号化の保護範囲、復号鍵喪失時の risk を三言語の privacy notice に明記。

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

- `site/` source、clone、fork は Analytics 無効とし、`herehigher/resume` の検証済み stable tag artifact だけへ tagged manifest に従う標準 Cloudflare Web Analytics を deployment 時に決定的に追加。Raw provider token は tracked tree に保存せず、履歴書入力、写真、JSON、local draft は送信しません。
- Source sites and forks disable analytics. Only the official repository's validated stable-tag artifact receives the deterministic, tagged Cloudflare Web Analytics adapter; no raw provider token or resume data is committed or sent.
