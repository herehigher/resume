# 開発規約

## 適用範囲と参照先

この `AGENTS.md` は repository 全体に適用する mandatory rules です。作業 directory までの経路に、より具体的な `AGENTS.override.md` または `AGENTS.md` がある場合は、その範囲ではより近い指示を優先します。

開発環境、repository / 文書構成、test、公開 asset 生成、release の運用は [開発ガイド](docs/development-guide.md) を参照してください。Issue / Pull Request と test evidence は [CONTRIBUTING.md](CONTRIBUTING.md)、release 前の目視確認は [受入チェックリスト](docs/acceptance-checklist.md) を正とします。

## プロジェクト概要

- 個人利用を前提とした、日本語・简体中文・English 対応の履歴書・職務経歴書作成 Web application です。
- 正式な実行・配布環境は GitHub Pages とし、`file://` での直接実行は対象外です。
- Production code は browser 標準の HTML、CSS、ES Modules で構成し、runtime framework や build を必須にしません。
- 公開用 file は `site/`、Node / Playwright test は `tests/`、検査・公開 asset 生成は `scripts/`、開発・受入資料は `docs/` に置きます。

Local 起動:

```bash
npm ci
python3 -m http.server 8000 --directory site
```

## Mandatory rules

1. ES Modules は責務ごとに分割し、循環依存を作らない。
2. `site/` は build なしで static server から配信できる状態を維持する。
3. Production runtime に外部 API、CDN、外部 font、analytics を追加しない。履歴書の入力 data を network へ送信しない。
4. 実在する résumé / application の personal data と secret / token を log、test fixture、sample、screenshot、PDF、公開文書、commit に含めない。Fixture、sample、生成 asset には、実在する個人・organization・account と誤認されない架空 data だけを使用する。この制約は repository owner 名や公開 source URL など、正当な公開 repository metadata を禁止するものではない。
5. 保存形式は `resume-studio-web-v1` を使用する。旧 `resume-studio-data-v1` は読み込み・移行・削除しない。
6. User input を HTML へ表示するときは必ず escape する。Clickable link は `http://` または `https://` のみにする。
7. 正式な locale identifier は `ja`、`zh-CN`、`en` とする。Locale-specific document section は独立して保存し、profile・連絡先・写真は三言語で共有する。
8. Desktop と smartphone の両方で主要操作が完了できる状態を維持する。
9. PDF layout は対象 locale と paper size ごとに確認し、文字切れ、重なり、意図しない空白・重複 page を防ぐ。
10. Test 専用の development dependency は、目的と更新方法が明確な場合に限り追加する。
11. 画面上の文言は対象言語で簡潔に書く。Issue と Pull Request は日本語を主とし、必要に応じて短い English summary を付ける。必要な technical comment は English を主とし、locale 固有の説明は対象言語または日本語で簡潔に書く。
12. Public release、tag、GitHub Pages settings、repository visibility の変更は、owner の明示承認なしに行わない。

## 変更後の検証

変更に近い focused test から始め、次の gate を変更範囲に応じて実行します。Pull Request 前には full gate の `npm run test:acceptance` を実行します。

| 対象 | 必須確認 |
| --- | --- |
| すべての変更 | Focused test、`npm test`、`npm run lint`、`git diff --check` |
| Application behavior、state、UI、i18n、import / export、privacy / network、PDF | `npm run test:e2e` |
| Pull Request 前 | `npm run test:acceptance` |
| `site/` または公開 sample data | `npm run generate:docs`、`node --test tests/documentation.test.js`、生成物の目視確認 |
| PDF / responsive layout または release candidate | [受入チェックリスト](docs/acceptance-checklist.md) による対象 page の目視確認 |

生成 command の役割と確認記録の残し方は [開発ガイド](docs/development-guide.md#変更に応じた検証) に従います。

## 変更範囲

- 依頼と無関係な design、input data、dependency を変更しない。
- 保存 data を意図的に削除する変更は、事前に利用者へ確認する。
- Public sample や生成 asset を変更するときは、Mandatory rule 4 の禁止対象を含まないことと provenance が更新されることを確認する。
