# Contributing / コントリビューション

この repository は個人利用向け Resume Studio を保守するためのものです。Issue と Pull Request は日本語を主とし、必要に応じて短い English summary を付けてください。English のみの報告も受け付けます。必要な code comment は English を主にし、対象言語固有の説明はその言語または日本語で簡潔に書きます。

## 開発環境

```bash
npm ci
python3 -m http.server 8000 --directory site
```

`http://localhost:8000/` を開きます。Production は build 不要の HTML、CSS、ES Modules です。`file://` での直接実行は対象外です。

## 変更時の原則

- `site/` は static hosting でそのまま配信できる状態を維持する。
- `site/` source は Analytics 無効を維持し、外部 API、CDN、外部 font、analytics runtime を追加しない。唯一の例外は、`herehigher/resume` の検証済み stable tag の tagged manifest に従い、deployment-only adapter が Pages artifact へ標準 Cloudflare Web Analytics を追加する経路とする。別 provider、fork での注入、追加 tracking を導入しない。
- Analytics provider、injection template、endpoint、privacy / network policy の変更は、専用 Pull Request で review し、新しい version と immutable stable tag で公開する。Manifest structure または fingerprint semantics を変更するときは `schemaVersion` を増やす。既存 tag は tag 内の adapter / schema で manual redeploy できる互換性を維持するが、enabled tag の旧 token が利用不能なら hard failure とし、別 token へ置き換えない。
- Personal data を log、test fixture、screenshot、PDF sample、network request に含めない。架空の明示された sample data だけを使う。
- User input は HTML escape し、clickable link は `http://` と `https://` のみにする。
- `ja`、`zh-CN`、`en` の document section を独立して維持し、profile・連絡先・写真は三言語で共有する。
- 保存形式 `resume-studio-web-v1` を維持し、旧 `resume-studio-data-v1` を読み込み・移行・削除しない。
- 依頼と無関係な design、sample data、dependency を変更しない。

English summary: keep the source site static, analytics-disabled, and private-by-design. Only the official repository's validated stable-tag artifact may receive the tagged, deterministic Cloudflare Web Analytics adapter. Do not add custom events, user identifiers, or resume data to network requests. Use fictional fixtures only, preserve locale isolation and the v1 storage contract, and avoid unrelated changes.

## Test

Focused test の後、Pull Request 前に次を実行します。

```bash
npm test
npm run lint
npm run test:e2e
npm run test:acceptance
```

PDF や responsive layout を変更した場合は [release acceptance checklist](docs/acceptance-checklist.md) に従い、全対象 page を目視確認します。

## Issue と Pull Request

Issue には再現手順、期待結果、実際の結果、browser/OS を記載してください。Pull Request には目的、変更範囲、test evidence、未確認事項、screenshot/PDF の source SHA を記載します。

- Title/body: 日本語を主とし、English summary を補助として使用。
- Review comment: 必要な technical comment は English を主にしてよい。
- Secret、credential、access token、実在する履歴書 data、Analytics provider token の raw value を commit しない。Tagged manifest には provider token の SHA-256 fingerprint だけを記録し、実値は release 前の承認済み検証と公式 deployment の限定 step だけへ渡す。
- Public release、tag、Pages 設定、repository visibility の変更は、owner の明示承認なしに行わない。
- Owner の承認を得た version 公開は [Version release playbook](docs/release-playbook.md) の preflight、gate、証拠記録、失敗時判断に従う。

提出した contribution は [MIT License](LICENSE) の下で配布されます。
