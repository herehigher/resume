# 開発ガイドと文書構成

この文書は、Resume Studio の開発方法、repository 構成、検証 command、公開文書 asset、release 運用をまとめます。Repository 全体の必須ルールは [AGENTS.md](../AGENTS.md)、Issue / Pull Request と test evidence は [CONTRIBUTING.md](../CONTRIBUTING.md)、release 前の目視確認は [受入チェックリスト](acceptance-checklist.md)、version 公開の操作手順は [release playbook](release-playbook.md) を正とします。

## Application 構成

- Production は browser 標準の HTML、CSS、ES Modules で動作し、build や runtime framework を必要としません。
- 正式な配布先は GitHub Pages です。Local development でも `file://` ではなく static server を使用します。
- 公開用 application file は `site/` に集約し、履歴書の入力 data は browser 内で扱います。
- `site/` source の runtime 通信は同一 origin の static asset と利用者が選択した profile link に限定し、Analytics は無効です。`herehigher/resume` の検証済み stable tag だけは、`.github/pages-release-manifest.json` が有効な場合に deployment-only adapter が staging artifact へ固定 Cloudflare beacon を追加します。Clone / fork は注入せず、未対応 configuration は失敗させます。
- Analytics provider、固定 injection template、endpoint、privacy / network policy を変える場合は、独立した Pull Request、version、immutable stable tag が必要です。Manifest structure または provider fingerprint の意味を変える場合は `schemaVersion` を増やします。既存 tag の manual redeploy は、その tag 自身に含まれる adapter と schema の契約を使用して互換性を保ちます。Enabled tag が固定した旧 token を利用できない場合は再構築を hard failure とし、同じ tag を新しい token へ移行しません。
- `site/index.html` は redirect を行わない既定言語（日本語）の公開紹介ページで、`/editor/?lang=ja` へ直接案内します。`/zh-cn/` と `/en/` は JavaScript が無効でも読める各言語の紹介ページで、それぞれ `/editor/?lang=zh-CN`、`/editor/?lang=en` へ案内します。`/ja/` は既存外部リンク向けの noindex 互換入口で、canonical を root に統合し、通常の導線・公開 hreflang cluster・sitemap から除外します。editor は `/editor/` にあり、`noindex,follow` として公開 hreflang cluster・sitemap から除外します。
- Root、`/zh-cn/`、`/en/` は canonical / reciprocal hreflang で関係を宣言し、`hreflang="ja"` と `x-default` は root を指します。`site/sitemap.xml` は index 対象の3 canonical URL だけを列挙します。
- 表示 locale は非機密の versioned localStorage key `resume-studio-locale-v1` に draft と分離して保存します。決定順は URL query、保存 preference、`navigator.languages`、`ja` です。import 内の `settings.locale` は document data として保持しますが、表示 preference は変更しません。`zh-TW` と `zh-Hant` は简体中文へ自動 mapping しません。
- 保存形式は `resume-studio-web-v1` です。日本語・简体中文・English の document section は独立し、profile・連絡先・写真は三言語で共有します。
- 公開 export contract は `site/schema/resume-studio-web-v1.schema.json`、架空の import example は同 directory の JSON file です。Application の runtime validator と public JSON Schema の契約を一致させます。

実装時の privacy、network、storage compatibility、escape、locale、release authority の制約は [AGENTS.md](../AGENTS.md#mandatory-rules) を参照してください。

## Repository 構成

```text
resume/
├── site/                       # GitHub Pages へ配信する static application
│   ├── index.html              # 日本語・x-default public homepage
│   ├── editor/index.html       # noindex editor shell
│   ├── ja/index.html           # noindex 日本語 compatibility entry（canonical は root）
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
git lfs install --local
git lfs pull
npm ci
python3 -m http.server 8000 --directory site
```

Git LFS client が未導入の場合は先にインストールします。`git lfs pull` により release screenshot と PDF sample の実体を取得します。

Chrome で editor の `http://localhost:8000/editor/`、public entry の `http://localhost:8000/`、`http://localhost:8000/zh-cn/`、`http://localhost:8000/en/` を開けます。既存外部リンク向けの `http://localhost:8000/ja/` は root へ canonical を統合した互換入口です。Production code に build step はありません。

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
| `npm run release:assets -- --source-sha <SHA>` | 指定 commit の Git archive から一時候補として三言語 screenshot、PDF sample、provenance manifest を生成・検査し、source SHA・site hash・対象7ファイルと SHA-256 を表示する |
| `npm run test:release-assets` | Release asset が最終 RC の `site/` と一致し、既存の文書・画像・PDF 検査を通ることを確認 |
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
| 新 version の最終 release candidate | Tag 作成前の release Pull Request で公開文書 asset を再生成し、次節の provenance / visual check を実行 |

CI の `Quality` workflow も `npm test`、lint、Playwright E2E を実行します。Public entry と machine-readable contract、locale resolution、locale data isolation、invalid import protection、escape / URL protocol、mobile operation、network guard、PDF の詳細な release 判定は [受入チェックリスト](acceptance-checklist.md) に集約します。

## 公開文書 asset の更新

Screenshot と PDF sample は release の snapshot として扱い、日常開発、通常の feature Pull Request、`main` push では更新しません。新 version の `site/`、public sample、version 表示を確定して最終 release candidate を freeze した後、tag 作成前の release Pull Request でだけ screenshot、PDF、manifest を同じ commit に更新します。Tag workflow は immutable な tag から deploy するだけで、生成物を repository へ書き戻しません。

Release asset は working tree から直接順次上書きしません。Pinned RC の clean export を一時 staging にして全 output を検査し、source SHA、site hash、対象 file list を表示します。Approval A の後だけ screenshot 3件、PDF 3件、manifest 1件をまとめて promote します。途中の生成・検査・promotion が失敗した場合は既存 tracked output を維持または復元し、partial update を残しません。実装済み interface の具体的な invocation 以外をこの文書から推測して実行しません。

```bash
npm run release:assets -- --source-sha '<RELEASE_SHA>'
# 表示された bundle path、source SHA、site hash、7つの対象ファイルと SHA-256 を owner が目視確認する。
# 明示承認後は同じ bundle だけを再検証して promote する。
npm run release:assets -- --bundle '<BUNDLE_PATH>' --owner-approval
git add docs/assets-manifest.json docs/screenshots/*.png output/pdf/*.pdf
npm run test:release-assets
git lfs ls-files
```

`docs/screenshots/*.png` と `output/pdf/*.pdf` は `.gitattributes` により Git LFS で管理します。Clone 後に実体を取得するには Git LFS client が必要です。過去 commit の binary blob は履歴を書き換えず、LFS 設定を導入する commit 以降を LFS object とします。

生成後は次を確認します。

- `docs/screenshots/` の三言語 screenshot が同一 release candidate 由来であること。
- `output/pdf/` の日本語 A4、中国語 A4、English Letter を全 page render し、文字切れ、重なり、空白・重複 page、壊れた glyph がないこと。
- Git archive は tracked commit だけを入力にするため、ignored / untracked file は候補生成に入らない。stage は permission-restricted owner temporary bundle を保持して候補を目視可能にし、promote は同じ bundle の source commit・site hash・対象7ファイルの SHA-256 を再表示・再検証する。owner approval がない限り tracked output は変えないこと。
- `docs/assets-manifest.json` の source commit・site hash、Chromium version、output hash が生成物と一致すること。promote 中の copy failure では対象7ファイルを backup から復元すること。成功後の backup / bundle cleanup failure は復元 failure ではないため、保持された path を記録して cleanup 状態を確認すること。
- Fixture、sample、生成 asset に、実在する個人・organization・account と誤認される data を含めないこと。

## Release と責任範囲

- Version 公開の実行順、placeholder、command、証拠 template、失敗時の判断は [Version release playbook](release-playbook.md) を canonical とします。この節は仕組みの概要だけを示します。
- Pull Request と `main` の quality check は `.github/workflows/ci.yml` で実行します。通常の `main` push は application を deploy しません。
- Production release tag は leading zero、prerelease、build metadata を含まない安定版 `vMAJOR.MINOR.PATCH` だけを使用します。Tag と `package.json` の version は一致させ、tag の commit は `main` の履歴に含めます。
- `.github/workflows/deploy-pages.yml` は tag の exact ref を commit まで解決し、同じ full commit SHA を reusable `Quality` workflow と Pages artifact checkout に渡します。Quality が失敗した場合は artifact 作成と deploy を実行しません。Artifact は `site/` だけを含みます。
- Release の実行層は local sandbox、owner-approved trusted release host、GitHub runner、Pages deployment job の四つです。release host は認証済み `gh` session と GitHub API で identity / permission を確認し、OS credential API を直接呼びません。macOS Keychain は一例であり、Windows Credential Manager、Linux Secret Service 等も同じ安全な provider contract を満たします。Pages OIDC は release host の credential provider と独立します。
- AI agent environment に raw `GH_TOKEN` / `GITHUB_TOKEN` が直接ある場合、agent-assisted sensitive step は owner 管理の隔離 session へ deferred とします。これは human または CI の認証方法全体を禁止する規則ではありません。
- Approval A（clean staged release assets の promotion）と Approval B（repository / exact tag / full SHA / version の再照合後の remote push）は別です。Pages settings、redeploy、rollback、final acceptance も個別の owner decision を要します。
- `.github/workflows/deploy-pages.yml` の `pages-production` concurrency group は deployment を直列化し、`cancel-in-progress: false` で実行中 deployment を自動 cancel しません。release host の local pre-check は race-free guarantee ではありません。
- Public release、tag、Pages settings、repository visibility を変更するには、owner の明示承認が必要です。Release tag は移動または削除せず、修正が必要な場合は新しい version を発行します。
- Release workflow の smoke は production URL、公開 path、version marker を bounded retry で確認します。Smoke failure は「deploy 済み・未受入」であり、自動 rollback を意味しません。
- 初回 Pages / HTTPS、RC screenshot の時点、annotated tag、manual existing-tag redeploy / rollback、README follow-up は playbook の順序に従います。
