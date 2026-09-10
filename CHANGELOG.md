# Changelog

この project の重要な変更を記録します。形式は [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) を参考にし、version は [Semantic Versioning](https://semver.org/) に従います。

English: This file records notable changes. Dates mark release-candidate freeze; GitHub records the actual publication time.

## [Unreleased]

### Changed / 変更

- 草稿と JSON import/export の format version を単一の `version: 2` へ統合し、端末内草稿を version ごとの key、Web Lock、IndexedDB 鍵領域へ分離。明示した互換 key は新 key への保存成功後に自動消去し、対応範囲外の旧草稿は読込・変更・削除しないよう変更。

## [0.2.7] - 2026-09-10

### Added / 追加

- 日本語の職務経歴書で、勤務先ごとの詳細項目を任意の見出しで追加・編集・削除できるようにし、入力例・preview・PDF・完了率・公開 JSON Schema を新しい構造へ対応。
- 保存 data に初回 schema revision と移行 registry を導入し、旧形式の草稿と JSON import を現在の形式へ安全に移行。移行完了時は日本語・简体中文・English で通知。

### Fixed / 修正

- 日本語 PDF の学歴・職歴・免許／資格の表見出しと年月配置を整理し、職務経歴書の会社概要・事業内容で入力した改行と長い文字列を保持。
- 草稿の変更・移行・復旧を Web Locks で直列化し、別 tab の新しい暗号化草稿を古い画面からの保存や削除で上書きしないよう修正。Lock、暗号化、容量、競合などの失敗時は既存 data と鍵を保持。
- JSON import を保存前に確認し、成功後だけ画面と草稿を置換。Cancel、非対応 revision、保存失敗では既存 data・表示設定・自動保存状態を維持。

### Security / Privacy

- 草稿処理を設定済み key のみに限定し、無関係な storage 項目を列挙・読込・変更しないことを browser 統合 test で検証。

## [0.2.6] - 2026-09-08

### Added / 追加

- 日本語・简体中文・English の公開入口に、各言語の説明と既存 brand logo を使った Open Graph 共有画像を追加し、生成元と digest を manifest で検証。

### Fixed / 修正

- iOS で改ページ menu から focus が遅れて外れた場合も、選択中の操作を失わず外部操作では正しく閉じるよう修正。
- 安定版の公開 PR と最終 main Quality で展示 screenshot / PDF の version、site hash、生成・semantic contract と各 manifest digest を照合し、古い展示 asset を含む tag の公開を停止するよう修正。Quality の検証済み asset を read-only CI のまま公開 PR へ取り込める手順も追加。
- Version を更新した公開 PR の merge を公開承認として扱い、その結果 commit の main Quality 成功後に準備・tag・deploy を自動継続するよう公開手順を簡略化。
- Product・test の `Quality` と展示 asset 更新状態の `Release assets current` を分離し、asset promotion が必要な状態と回帰 failure を区別。公開 PR では manifest に記録した Quality run から promotion 元 artifact を再取得して commit 済み LFS object との exact bytes を確認し、merge 後は最終 main Quality evidence と PDF 全文・page、screenshot visual を再照合する。Version を変えない展示 asset 変更を拒否し、公開準備を7日間の過去 artifact 保持へ依存させず、別 browser run 間の不安定な raw bytes 比較だけを廃止。
- 展示 asset manifest に generator・verifier・dependency lockfile の input hash を追加し、生成 code の更新漏れで古い asset が通る問題を防止。
- 展示 PDF の時刻 metadata、print layout 待機、screenshot の shadow rasterization を安定化し、長大 PDF test は import 完了後に印刷するよう修正。

## [0.2.5] - 2026-09-08

### Changed / 変更

- Quality と公開 workflow の Playwright 準備を、必要な Chromium Headless Shell と WebKit の取得に限定し、pull request の scope 判定を同じ job に統合。更新された pull request の古い Quality run は自動で終了するよう整理。

### Fixed / 修正

- Smartphone の改ページ menu で2件目以降を touch した際、click より先に menu が閉じて操作できない問題を修正。Keyboard focus、外部操作、Escape による既存の閉じ方は維持。

## [0.2.4] - 2026-09-07

### Added / 追加

- 表示中の章同士の間に手動改ページを追加・解除できる操作を desktop と smartphone に追加。設定は言語・用紙・書類種別ごとに保存し、JSON の読込・書出しにも含める。

### Changed / 変更

- 简体中文 A4 と English A4 / Letter の画面プレビューを印刷時と同じ版面寸法・余白へ統一し、画面幅や用紙切替による本文の再配置を防止。
- 手動改ページの境界線と操作位置、mobile の改ページ menu と backup menu の閉じ方、dialog 後の focus 復帰を調整。
- 三言語の公開入口と editor の説明・検索 metadata に、無料、open source、local processing、privacy、PDF、template の特性を明示。

### Fixed / 修正

- 表示中の言語・用紙に対応する印刷 page rule を一つだけ適用し、locale や用紙の切替後も末尾の空白 page が生じないよう修正。
- 長い section や連続した手動改ページでも、内容のない重複 page を作らず対象の章を本文付きの新しい page から開始するよう安定化。

## [0.2.3] - 2026-09-06

### Changed / 変更

- 公開準備・承認・配布・smoke を一つの Actions 入口へ統合し、同じ main commit の Quality と準備済み artifact を再利用するよう整理。
- 毎 version の展示 screenshot / PDF 更新、独立 asset 承認、手動 digest 転記と未使用の旧 release helper を廃止し、検証出力を一時 Actions artifact に分離。
- 開発・公開文書を統合し、文言や現在 version を固定する test と docs-only の一律 browser gate を削減。
- Mobile の下書き状態 UI を圧縮し、保存状態と入力例 action を一行へまとめ、下書き削除を backup menu へ移動。
- 日本語・简体中文・English の公開入口で、言語切替 link を編集開始 button の直下へ移動。
- 入力例表示中は元の下書きへ戻る操作を主 button とし、例を下書きとして使用する操作との優先度を三言語で統一。

### Fixed / 修正

- Cloudflare RUM の browser / engine / OS 情報 `bi` を提供者の根拠に基づいて検証し、実 provider script の互換性確認を公開準備へ接続。
- 履歴書の入力・写真・JSON・暗号化草稿から再読込・離脱までの通信検査と、同一 origin の不正 request / WebSocket を検出する回帰 test を補完。
- 日本語履歴書の長文と長い URL を欠落なく自然に改 page し、プロフィール欄の罫線、写真枠、文字配置を安定化。三言語の長大 record も継続 page で文脈を維持。
- Mobile の日本語 editor で履歴書と職務経歴書を切り替えられない問題を修正し、文書切替と入力・preview 表示を独立して保持。

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
