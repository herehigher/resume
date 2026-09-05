# 開発ガイドと文書構成

この文書は、Resume Studio の開発方法、repository 構成、検証 command、公開文書 asset、release 運用をまとめます。Repository 全体の必須ルールは [AGENTS.md](../AGENTS.md)、Issue / Pull Request と test evidence は [CONTRIBUTING.md](../CONTRIBUTING.md)、release 前の目視確認は [受入チェックリスト](acceptance-checklist.md)、version 公開の操作手順は [release playbook](release-playbook.md) を正とします。

## Application 構成

- Production は browser 標準の HTML、CSS、ES Modules で動作し、build や runtime framework を必要としません。
- 正式な配布先は GitHub Pages です。Local development でも `file://` ではなく static server を使用します。
- 公開用 application file は `site/` に集約し、履歴書の入力 data は browser 内で扱います。
- `site/` source の runtime 通信は同一 origin の static asset と利用者が選択した profile link に限定し、Analytics は無効です。`herehigher/resume` の検証済み stable tag だけは、`.github/pages-release-manifest.json` が有効な場合に deployment-only adapter が staging artifact へ固定 Cloudflare beacon を追加します。Clone / fork は注入せず、未対応 configuration は失敗させます。
- Analytics provider、固定 injection template、endpoint、privacy / network policy を変える場合は、独立した Pull Request、version、immutable stable tag が必要です。Manifest structure または provider fingerprint の意味を変える場合は `schemaVersion` を増やします。既存 tag の manual redeploy は、その tag 自身に含まれる adapter と schema の契約を使用して互換性を保ちます。Enabled tag が固定した旧 token を利用できない場合は再構築を hard failure とし、同じ tag を新しい token へ移行しません。
- `site/index.html` は redirect を行わない既定言語（日本語）の公開紹介ページで、`/editor/?lang=ja` へ直接案内します。`/zh-cn/` と `/en/` は JavaScript が無効でも読める各言語の公開 entry で、それぞれ対応する editor へ案内します。`/ja/` は既存外部リンク用の互換入口で、canonical を root へ統合し、sitemap・hreflang・通常の内部導線から除外します。editor は `/editor/` にあり、`noindex,follow` として公開 hreflang cluster・sitemap から除外します。
- Root、`/zh-cn/`、`/en/` の3 public entry は canonical / reciprocal hreflang で関係を宣言し、`site/sitemap.xml` はこの3 canonical URL だけを列挙します。
- 表示 locale は非機密の versioned localStorage key `resume-studio-locale-v1` に draft と分離して保存します。決定順は URL query、保存 preference、`navigator.languages`、`ja` です。import 内の `settings.locale` は document data として保持しますが、表示 preference は変更しません。`zh-TW` と `zh-Hant` は简体中文へ自動 mapping しません。
- 保存形式は `resume-studio-web-v1` です。日本語・简体中文・English の document section は独立し、profile・連絡先・写真は三言語で共有します。
- 公開 export contract は `site/schema/resume-studio-web-v1.schema.json`、架空の import example は同 directory の JSON file です。Application の runtime validator と public JSON Schema の契約を一致させます。

実装時の privacy、network、storage compatibility、escape、locale、release authority の制約は [AGENTS.md](../AGENTS.md#mandatory-rules) を参照してください。

## Repository 構成

```text
resume/
├── site/                       # GitHub Pages へ配信する static application
│   ├── index.html              # Default Japanese public homepage
│   ├── editor/index.html       # noindex editor shell
│   ├── ja/index.html           # Legacy Japanese compatibility entry (canonical: root)
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
│   └── release-playbook.md     # Version release と rollback の canonical 手順
├── output/pdf/                 # README から参照する release PDF sample（Git LFS）
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
| [release-playbook.md](release-playbook.md) | Owner・maintainer | Version release、Pages、証拠記録、rollback の canonical 手順 |
| [assets-manifest.json](assets-manifest.json) | Maintainer | Screenshot / PDF の source hash、browser、output hash |
| [AGENTS.md](../AGENTS.md) | Agent・実装者 | Scope、privacy、storage、locale、verification の mandatory rules |

## Local development

Dependency を導入し、`site/` を static server から配信します。

```bash
npm ci
python3 -m http.server 8000 --directory site
```

通常の開発・test・CI は Git LFS client や過去の screenshot / PDF sample の実体を必要としません。

Chrome で editor の `http://localhost:8000/editor/`、public entry の `http://localhost:8000/`、`http://localhost:8000/zh-cn/`、`http://localhost:8000/en/` を開けます。既存外部リンクの互換確認には `http://localhost:8000/ja/` も利用できます。Production code に build step はありません。

草稿の AES-GCM 暗号化には secure context が必要です。local development では `https://`、`http://localhost`、または `http://127.0.0.1` を使い、server が表示する `http://0.0.0.0` や LAN IP の HTTP URL は選びません。これら non-secure origin では Web Crypto が利用できず、下書きの保存・再読込は実行できません。

## 変更に応じた検証

変更範囲に近い focused test を先に実行し、広い gate は統合後に実行します。Pull Request 前の full gate は `npm run test:acceptance` です。実行できない項目がある場合は、理由と影響範囲を Pull Request に記録します。

### Command の役割

| Command | 確認内容 |
| --- | --- |
| `npm test` | Node unit / document test、public entry / Schema、source の Analytics 無効契約、manifest tuple、artifact staging の digest・fork・token failure path、`scripts/check-site.mjs` による JavaScript syntax、network API、legacy storage key、外部 runtime asset の static check |
| `npm run lint` | `site/assets/js/`、`scripts/`、`tests/` の Biome lint |
| `npm run test:e2e` | Desktop / mobile workflow、public entry の no-JavaScript 表示、UI semantic state、source の外部通信拒否、disabled / enabled / configuration error の privacy status、合成 token で作る enabled artifact の固定 Cloudflare request、PDF page size・pagination・抽出 text の Playwright acceptance。Live provider には依存しない |
| `npm run test:acceptance` | `npm test`、lint、E2E を順に実行する full gate |
| `npm run generate:doc-assets -- --output-dir <DIR> --source-sha <SHA>` | source checkout と独立した空の一時 directory に、三言語 screenshot、PDF、provenance manifest を生成する。SHA が checkout の HEAD と一致しない場合は fail する |
| `npm run verify:doc-assets -- --asset-root <DIR> --source-root <DIR> --source-sha <SHA>` | 一時 output の source SHA、site hash、PNG size、PDF page size と marker text、output hash を検証する |
| GitHub `Prepare release manifest` | Enabled Analytics の versioned `site/` から、provider raw value を runner 内だけで使用して manifest 用の非機密 source / adapter / artifact digest を導出 |
| GitHub `Pre-tag artifact gate` | Tag 作成前に immutable release SHA の version、main ancestry、#77 の online path contract、provider fingerprint、source / adapter / final artifact digest と prepared artifact semantic smoke を read-only・fail-closed で検証。raw provider value は GitHub runner 外へ出さない |

### 変更種別ごとの route

| 変更種別 | 開発中と統合後の確認 |
| --- | --- |
| Markdown / repository metadata | 関連する Node test、`npm test`、`npm run lint`、`git diff --check` |
| Public entry、canonical / hreflang、sitemap、JSON Schema | `node --test tests/public-entry.test.js`、関連 E2E、`npm run test:acceptance`、[受入チェックリスト](acceptance-checklist.md) の online smoke |
| State、template、UI、i18n、import / export、privacy / network | 関連する Node test と E2E の後、`npm run test:acceptance` |
| CSS、responsive、print、PDF | 関連する Node / E2E test、`npm run test:acceptance`、[受入チェックリスト](acceptance-checklist.md) の対象 page |
| Script、dependency、workflow、release gate | 変更対象の focused check、`npm run test:acceptance`、実際の CI / release dependency の review |
| `site/` または公開 sample data | 上記の test を実行する。日常開発と通常の Pull Request では screenshot / PDF sample を更新しない |
| 新 version の最終 release candidate | CI の一時 documentation artifact と対象 page の目視確認を実行 |

CI の `Quality` workflow も `npm test`、lint、Playwright E2E を実行します。Public entry と machine-readable contract、locale resolution、locale data isolation、invalid import protection、escape / URL protocol、mobile operation、network guard、PDF の詳細な release 判定は [受入チェックリスト](acceptance-checklist.md) に集約します。

## 公開文書 asset の更新

Screenshot と PDF sample は過去の公開 snapshot として扱い、日常開発、通常の feature Pull Request、`main` push、version / release date / workflow だけの変更では更新しません。UI、layout、template、font、公開 sample data を変更した場合だけ、同じ架空 data の provenance を更新して展示 sample を更新します。Tag workflow は immutable な tag から deploy するだけで、生成物を repository へ書き戻しません。

CI は checkout と独立した空の temporary directory で三言語 screenshot、PDF、manifest を生成して検証し、Actions artifact に保存します。生成先が source checkout または既存の展示物を上書きする path、空でない directory、source SHA が checkout と一致しない場合は fail します。失敗しても source や展示 sample は変更しません。

```bash
npm run generate:doc-assets -- --output-dir '<TEMPORARY_DIRECTORY>' --source-sha '<RELEASE_SHA>'
npm run verify:doc-assets -- --asset-root '<TEMPORARY_DIRECTORY>' --source-root '<CHECKOUT_DIRECTORY>' --source-sha '<RELEASE_SHA>'
```

既存の `docs/screenshots/*.png` と `output/pdf/*.pdf` は過去の公開 sample として保持します。過去 commit の binary blob や LFS 履歴は書き換えません。通常の clone、test、CI はこれらの実体を必要としません。

生成後は次を確認します。

- 一時 artifact の三言語 screenshot と、日本語 A4、中国語 A4、English Letter PDF を対象 commit から生成し、全 page の size と marker text を検証すること。
- manifest の source commit・site hash、Chromium version、output hash が一時生成物と一致すること。
- UI、layout、template、font、公開 sample data を変更して展示 sample を更新する場合は、三言語 screenshot と PDF を目視確認し、過去 sample と誤認しない provenance を記録すること。
- Fixture、sample、生成 asset に、実在する個人・organization・account と誤認される data を含めないこと。

## Release と責任範囲

- Version 公開の実行順、placeholder、command、証拠 template、失敗時の判断は [Version release playbook](release-playbook.md) を canonical とします。この節は仕組みの概要だけを示します。
- Pull Request と `main` の quality check は `.github/workflows/ci.yml` で実行します。通常の `main` push は application を deploy しません。
- Production release tag は leading zero、prerelease、build metadata を含まない安定版 `vMAJOR.MINOR.PATCH` だけを使用します。Tag と `package.json` の version は一致させ、tag の commit は `main` の履歴に含めます。
- `.github/workflows/deploy-pages.yml` は tag の exact ref を commit まで解決し、同じ full commit SHA を reusable `Quality` workflow と Pages artifact checkout に渡します。Quality が失敗した場合は artifact 作成と deploy を実行しません。Artifact は `site/` だけを含みます。
- Release の実行層は local sandbox、owner-approved trusted release host、GitHub runner、Pages deployment job の四つです。release host は認証済み `gh` session と GitHub API で identity / permission を確認し、OS credential API を直接呼びません。macOS Keychain は一例であり、Windows Credential Manager、Linux Secret Service 等も同じ安全な provider contract を満たします。Pages OIDC は release host の credential provider と独立します。
- AI agent environment に raw `GH_TOKEN` / `GITHUB_TOKEN` が直接ある場合、agent-assisted sensitive step は owner 管理の隔離 session へ deferred とします。これは human または CI の認証方法全体を禁止する規則ではありません。
- Repository、exact tag、full SHA、version の再照合、Pages settings、redeploy、rollback、final acceptance はそれぞれ個別の owner decision を要します。
- `.github/workflows/deploy-pages.yml` の `pages-production` concurrency group は deployment を直列化し、`cancel-in-progress: false` で実行中 deployment を自動 cancel しません。release host の local pre-check は race-free guarantee ではありません。
- Public release、tag、Pages settings、repository visibility を変更するには、owner の明示承認が必要です。Release tag は移動または削除せず、修正が必要な場合は新しい version を発行します。
- Release workflow の smoke は production URL、公開 path、version marker を bounded retry で確認します。Smoke failure は「deploy 済み・未受入」であり、自動 rollback を意味しません。
- 初回 Pages / HTTPS、RC screenshot の時点、annotated tag、manual existing-tag redeploy / rollback、README follow-up は playbook の順序に従います。
