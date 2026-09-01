# 開発ガイドと文書構成

この文書は、Resume Studio の開発方法、repository 構成、検証 command、公開文書 asset、release 運用をまとめます。Repository 全体の必須ルールは [AGENTS.md](../AGENTS.md)、Issue / Pull Request と test evidence は [CONTRIBUTING.md](../CONTRIBUTING.md)、release 前の目視確認は [受入チェックリスト](acceptance-checklist.md) を正とします。

## Application 構成

- Production は browser 標準の HTML、CSS、ES Modules で動作し、build や runtime framework を必要としません。
- 正式な配布先は GitHub Pages です。Local development でも `file://` ではなく static server を使用します。
- 公開用 application file は `site/` に集約し、履歴書の入力 data は browser 内で扱います。
- Runtime の外部通信は、同一 origin の static asset、利用者が選択した profile link、標準 Cloudflare Web Analytics の固定 beacon script / RUM endpoint に限定します。Analytics は集計 page view と performance のみに使い、custom event や履歴書 data を送信しません。
- `site/index.html` は editor と `x-default` の入口です。`/ja/`、`/zh-cn/`、`/en/` は JavaScript が無効でも読める locale-specific public entry で、既存の `/?lang=ja`、`/?lang=zh-CN`、`/?lang=en` editor へ案内します。
- Root と三言語 public entry は canonical / reciprocal hreflang で関係を宣言し、`site/sitemap.xml` は index 対象の canonical URL だけを列挙します。
- 保存形式は `resume-studio-web-v1` です。日本語・简体中文・English の document section は独立し、profile・連絡先・写真は三言語で共有します。
- 公開 export contract は `site/schema/resume-studio-web-v1.schema.json`、架空の import example は同 directory の JSON file です。Application の runtime validator と public JSON Schema の契約を一致させます。

実装時の privacy、network、storage compatibility、escape、locale、release authority の制約は [AGENTS.md](../AGENTS.md#mandatory-rules) を参照してください。

## Repository 構成

```text
resume/
├── site/                       # GitHub Pages へ配信する static application
│   ├── index.html              # Editor shell と x-default entry
│   ├── ja/index.html           # 日本語 public entry
│   ├── zh-cn/index.html        # 简体中文 public entry
│   ├── en/index.html           # English public entry
│   ├── sitemap.xml             # Canonical public URL 一覧
│   ├── schema/                 # v1 JSON Schema と架空 import example
│   └── assets/
│       ├── css/                # 基本、editor、public entry、responsive、print、locale template
│       └── js/                 # state、UI、template、i18n、utility
├── tests/                      # Node unit/document test と Playwright E2E/PDF test
├── scripts/                    # Static check と公開文書 asset generator
├── docs/                       # 開発・受入資料、asset manifest、screenshot
├── output/pdf/                 # README から参照する生成済み PDF sample
├── .github/workflows/          # CI と tag-based GitHub Pages deployment
├── README*.md                  # 日本語・简体中文・English の公開利用 guide
├── PRIVACY.md                  # 三言語 privacy notice
├── CONTRIBUTING.md             # Contribution 手順
├── CHANGELOG.md                # Release change log
├── LICENSE                     # MIT License
└── AGENTS.md                   # Repository-wide mandatory rules
```

## 文書の役割

| 文書 | 対象 | 役割 |
| --- | --- | --- |
| [README.md](../README.md) | 利用者 | Default の日本語利用 guide、三言語入口、local start、PDF / JSON、制限 |
| [README.zh-CN.md](../README.zh-CN.md) | 中文利用者 | 简体中文 locale guide |
| [README.en.md](../README.en.md) | English users | English locale guide |
| [PRIVACY.md](../PRIVACY.md) | 利用者 | 保存、通信、削除、data loss risk |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | Contributor | Setup、変更原則、PR / Issue、test evidence |
| [acceptance-checklist.md](acceptance-checklist.md) | Reviewer | Release 前の browser / PDF / manual acceptance |
| [assets-manifest.json](assets-manifest.json) | Maintainer | Screenshot / PDF の source hash、browser、output hash |
| [AGENTS.md](../AGENTS.md) | Agent・実装者 | Scope、privacy、storage、locale、verification の mandatory rules |

## Local development

Dependency を導入し、`site/` を static server から配信します。

```bash
npm ci
python3 -m http.server 8000 --directory site
```

Chrome で editor の `http://localhost:8000/`、public entry の `http://localhost:8000/ja/`、`http://localhost:8000/zh-cn/`、`http://localhost:8000/en/` を開けます。Production code に build step はありません。

## 変更に応じた検証

変更範囲に近い focused test を先に実行し、広い gate は統合後に実行します。Pull Request 前の full gate は `npm run test:acceptance` です。実行できない項目がある場合は、理由と影響範囲を Pull Request に記録します。

### Command の役割

| Command | 確認内容 |
| --- | --- |
| `npm test` | Node unit / document test、`tests/public-entry.test.js` による canonical / hreflang / sitemap と代表的な JSON Schema / import case、`scripts/check-site.mjs` による JavaScript syntax、network API、legacy storage key、全公開 HTML の external runtime asset / Cloudflare beacon 構成の static check |
| `npm run lint` | `site/assets/js/`、`scripts/`、`tests/` の Biome lint |
| `npm run test:e2e` | Desktop / mobile workflow、public entry の no-JavaScript 表示、UI semantic state、privacy / network guard、Cloudflare request allowlist、PDF page size・pagination・抽出 text の Playwright acceptance。Cloudflare は test 内で固定 response に置換し、live service に依存しない |
| `npm run test:acceptance` | `npm test`、lint、E2E を順に実行する full gate |
| `npm run generate:docs` | 三言語 screenshot、PDF sample、provenance manifest の再生成 |

### 変更種別ごとの route

| 変更種別 | 開発中と統合後の確認 |
| --- | --- |
| Markdown / repository metadata | 関連する Node test、`npm test`、`npm run lint`、`git diff --check` |
| Public entry、canonical / hreflang、sitemap、JSON Schema | `node --test tests/public-entry.test.js`、関連 E2E、`npm run test:acceptance`、[受入チェックリスト](acceptance-checklist.md) の online smoke |
| State、template、UI、i18n、import / export、privacy / network | 関連する Node test と E2E の後、`npm run test:acceptance` |
| CSS、responsive、print、PDF | 関連する Node / E2E test、`npm run test:acceptance`、[受入チェックリスト](acceptance-checklist.md) の対象 page |
| Script、dependency、workflow、release gate | 変更対象の focused check、`npm run test:acceptance`、実際の CI / release dependency の review |
| `site/` または公開 sample data | 上記に加えて公開文書 asset の再生成と次節の provenance / visual check |

CI の `Quality` workflow も `npm test`、lint、Playwright E2E を実行します。Public entry と machine-readable contract、locale resolution、locale data isolation、invalid import protection、escape / URL protocol、mobile operation、network guard、PDF の詳細な release 判定は [受入チェックリスト](acceptance-checklist.md) に集約します。

## 公開文書 asset の更新

`site/` または公開 sample data を変更した場合は、screenshot、PDF、manifest を同じ commit で再生成します。開発文書だけの変更では再生成しません。

```bash
npm run generate:docs
node --test tests/documentation.test.js
```

生成後は次を確認します。

- `docs/screenshots/` の三言語 screenshot が同一 release candidate 由来であること。
- `output/pdf/` の日本語 A4、中国語 A4、English Letter を全 page render し、文字切れ、重なり、空白・重複 page、壊れた glyph がないこと。
- `docs/assets-manifest.json` の site hash、Chromium version、output hash が生成物と一致すること。
- Fixture、sample、生成 asset に、実在する個人・organization・account と誤認される data を含めないこと。

## Release と責任範囲

- Pull Request と `main` の quality check は `.github/workflows/ci.yml` で実行します。通常の `main` push は application を deploy しません。
- Production release tag は leading zero、prerelease、build metadata を含まない安定版 `vMAJOR.MINOR.PATCH` だけを使用します。Tag と `package.json` の version は一致させ、tag の commit は `main` の履歴に含めます。
- `.github/workflows/deploy-pages.yml` は tag の exact ref を commit まで解決し、同じ full commit SHA を reusable `Quality` workflow と Pages artifact checkout に渡します。Quality が失敗した場合は artifact 作成と deploy を実行しません。Artifact は `site/` だけを含みます。
- Public release、tag、Pages settings、repository visibility を変更するには、owner の明示承認が必要です。Release tag は移動または削除せず、修正が必要な場合は新しい version を発行します。

### 初回 GitHub Pages 設定

Owner は最初の tag を push する前に、GitHub の `Settings` → `Pages` で Build and deployment の Source を `GitHub Actions` に設定します。Custom domain を使わない project site の production URL は `https://herehigher.github.io/resume/` です。最初の deployment 後に同 URL が HTTPS で取得できることと、`Enforce HTTPS` の状態を確認します。

設定変更時は Issue または Pull Request に、設定者、確認日時、Source、custom domain の有無、HTTPS の状態を記録します。Secret や access token は記録しません。初回 deployment の workflow run URL、environment に表示された Pages URL、online smoke の結果も同じ記録へ追記します。

English summary: configure Pages to use GitHub Actions, record the non-secret settings and evidence, and verify the project URL over HTTPS after the first deployment.

### v0.1.0 release 手順

1. `site/` と version を release candidate として確定します。`site/` を変更した場合は tag 前に `npm run generate:docs` を実行し、screenshot、PDF、manifest を同じ candidate commit に含めます。Workflow や文書だけの変更では生成 asset を更新しません。
2. [受入チェックリスト](acceptance-checklist.md) の目視項目を確認し、`npm run test:acceptance` と `git diff --check` の結果、candidate の full commit SHA を Pull Request に記録します。
3. Pull Request を `main` へ merge し、`main` の `Quality / quality` 成功を確認します。この通常の `main` push では Pages deployment は開始されません。
4. Owner の承認後、candidate を含む `main` commit に annotated tag `v0.1.0` を作成して push します。Tag の update / delete や force push は行いません。
5. `Deploy Pages` の validate、quality、artifact、deploy、smoke が順に成功したことを確認します。GitHub Actions の `github-pages` environment に表示された deployment URL と workflow run URL を判定記録へ残します。
6. 実 URLを private window でも確認し、online smoke と目視確認に合格した後で release 完了とします。
7. 三言語 README の Web 版 URL は、初回 deployment と HTTP / browser check が成功した後の docs-only follow-up Pull Request で掲載します。この `main` commit は再 deployment を起動しません。

### Online smoke と再 deployment

Deploy 後の smoke job は action が返した URL を `https://herehigher.github.io/resume/` に正規化して一致を確認し、cache-busting query を付けて root、`/ja/`、`/zh-cn/`、`/en/`、`sitemap.xml`、JSON Schema、import example、version config を HTTPS で取得します。HTML を browser で実行しないため、Cloudflare Web Analytics の script / RUM endpoint の一時障害は smoke の対象外です。

Smoke の失敗は「deploy 済みだが未受入」であり、「未公開」を意味しません。CDN 反映などの一時的な失敗は同じ run の rerun、または `workflow_dispatch` に既存の安定版 tag を入力して再確認します。Manual dispatch は default branch からだけ実行でき、指定 tag の exact ref、version、`main` ancestry を自動 release と同じ条件で再検証します。

同一 origin の file 欠落、version 不一致など release 内容の欠陥では tag を移動せず、修正 Pull Request と新しい version を発行します。直前の正常な既存 tag を `workflow_dispatch` で指定すると、その immutable commit の quality を再実行して rollback deployment できます。
