# 開発ガイドと文書構成

この文書は、Resume Studio の開発方法、repository 構成、公開文書と検証資料の役割をまとめます。実装時の必須ルールは [AGENTS.md](../AGENTS.md) を正とし、内容が競合する場合は `AGENTS.md` を優先します。

## 開発方針

- Production は browser 標準の HTML、CSS、ES Modules で構成し、build や runtime framework を必須にしません。
- 正式な配布先は GitHub Pages です。`file://` での直接実行は対象外です。
- 履歴書の入力内容を application backend、外部 API、analytics、CDN、外部 font service へ自動送信しません。
- 公開用 application file は `site/` に集約し、責務ごとの module 分割と循環依存の回避を優先します。
- 保存形式は `resume-studio-web-v1` を維持し、旧 `resume-studio-data-v1` は読み込み・移行・削除しません。
- 日本語・简体中文・English の document section は独立し、profile・連絡先・写真は三言語で共有します。

## Repository 構成

```text
resume/
├── site/                       # GitHub Pages へ配信する静的 application
│   ├── index.html              # HTML shell
│   └── assets/
│       ├── css/                # 基本、editor、responsive、print、locale template
│       └── js/                 # state、UI、template、i18n、utility
├── tests/                      # Node unit/document test と Playwright E2E/PDF test
├── scripts/                    # 静的検査と公開文書 asset generator
├── docs/                       # 開発・受入資料、asset manifest、screenshot
├── output/pdf/                 # README から参照する生成済み PDF sample
├── .github/workflows/          # CI と tag-based GitHub Pages deployment
├── README*.md                  # 中日英の公開利用ガイド
├── PRIVACY.md                  # 三言語 privacy notice
├── CONTRIBUTING.md             # Contribution 手順
├── CHANGELOG.md                # Release change log
├── LICENSE                     # MIT License
└── AGENTS.md                   # Agent と実装者が守る mandatory rules
```

## 文書の役割

| 文書 | 対象 | 役割 |
| --- | --- | --- |
| [README.md](../README.md) | 利用者 | Default の日本語利用ガイド、三言語入口、local start、PDF/JSON、制限 |
| [README.zh-CN.md](../README.zh-CN.md) | 中文利用者 | 简体中文 locale guide |
| [README.en.md](../README.en.md) | English users | English locale guide |
| [PRIVACY.md](../PRIVACY.md) | 利用者 | 保存、通信、削除、data loss risk |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | Contributor | Setup、変更原則、PR/Issue、test evidence |
| [acceptance-checklist.md](acceptance-checklist.md) | Reviewer | Release 前の browser/PDF/manual acceptance |
| [assets-manifest.json](assets-manifest.json) | Maintainer | Screenshot/PDF の source hash、browser、output hash |
| `AGENTS.md` | Agent・実装者 | Scope、security、storage、locale、検証の mandatory rules |

## Local development

Dependency を導入し、`site/` を static server から配信します。

```bash
npm ci
python3 -m http.server 8000 --directory site
```

Chrome で `http://localhost:8000/` を開きます。Production code に build step はありません。

## 変更後の検証

変更範囲に近い focused test を先に実行し、Pull Request 前に full acceptance を実行します。

```bash
npm test
npm run lint
npm run test:e2e
npm run test:acceptance
```

主な gate は次のとおりです。

- JavaScript module と HTML asset reference が有効であること。
- URL、保存設定、browser 言語、default の順で locale を解決すること。
- locale-specific document section が互いに上書きされないこと。
- JSON import failure が既存 draft を壊さないこと。
- User input を escape し、`http://` と `https://` 以外を clickable link にしないこと。
- Desktop/mobile workflow、PDF paper size、pagination、network guard が成功すること。
- PDF や responsive layout を変更した場合、[release acceptance checklist](acceptance-checklist.md) に従って目視確認すること。

## 公開文書 asset の更新

`site/` または公開 sample data を変更した場合は、screenshot、PDF、manifest を同じ commit で再生成します。

```bash
npm run generate:docs
node --test tests/documentation.test.js
```

生成後は次を確認します。

- `docs/screenshots/` の三言語 screenshot が同一 release candidate 由来であること。
- `output/pdf/` の日本語 A4、中国語 A4、English Letter を全 page render し、文字切れ、重なり、空白・重複 page、壊れた glyph がないこと。
- `docs/assets-manifest.json` の site hash、Chromium version、output hash が生成物と一致すること。
- Sample に実在する個人・organization・account と誤認される情報を含めないこと。

## Release と責任範囲

- Pull Request と `main` の quality check は `.github/workflows/` で実行します。
- GitHub Pages の公開、repository visibility、SemVer tag、online smoke test は release 作業として扱います。
- README の Online Demo URL は、実 deployment と HTTP/browser check が成功した URL だけを掲載します。
