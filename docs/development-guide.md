# 開発ガイドと文書構成

この文書は、Resume Studio の開発方法、repository 構成、検証 command、公開文書 asset、release 運用をまとめます。Repository 全体の必須ルールは [AGENTS.md](../AGENTS.md)、Issue / Pull Request と test evidence は [CONTRIBUTING.md](../CONTRIBUTING.md)、release 前の目視確認は [受入チェックリスト](acceptance-checklist.md) を正とします。

## Application 構成

- Production は browser 標準の HTML、CSS、ES Modules で動作し、build や runtime framework を必要としません。
- 正式な配布先は GitHub Pages です。Local development でも `file://` ではなく static server を使用します。
- 公開用 application file は `site/` に集約し、履歴書の入力 data は browser 内で扱います。
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
| `npm test` | Node unit / document test、`tests/public-entry.test.js` による canonical / hreflang / sitemap / JSON Schema contract、`scripts/check-site.mjs` による JavaScript syntax、network API、legacy storage key、全公開 HTML の external runtime asset check |
| `npm run lint` | `site/assets/js/`、`scripts/`、`tests/` の Biome lint |
| `npm run test:e2e` | Desktop / mobile workflow、public entry の no-JavaScript 表示、UI semantic state、privacy / network guard、PDF page size・pagination・抽出 text の Playwright acceptance |
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

- Pull Request と `main` の quality check は `.github/workflows/quality.yml` で実行します。
- Tag-based GitHub Pages release は `.github/workflows/deploy-pages.yml` で quality 成功、version 一致、main 履歴への包含を確認してから deploy します。
- Public release、tag、Pages settings、repository visibility を変更するには、owner の明示承認が必要です。
- Deploy 後は GitHub Pages の project path `/resume/` で root、三言語 public entry、`sitemap.xml`、JSON Schema が取得でき、canonical / hreflang と editor CTA が実 URL に一致することを online smoke で確認します。
- README の Web 版 URL は、実 deployment と HTTP / browser check が成功した URL だけを掲載します。
