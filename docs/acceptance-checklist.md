# リリース受入チェックリスト / Release acceptance checklist

自動テストで検出しにくい文字切れ、改ページ、印刷ダイアログ差異を、リリース候補ごとに確認する。個人情報を含む実データは使用せず、テスト用データのみで実施する。Version 公開の実行順と証拠 template は [Version release playbook](release-playbook.md) に従う。

## 自動ゲート

公開の自動検証・再開・旧 tag の対応範囲は [リリース手順](release-playbook.md) を参照する。

- `npm ci`、`npm test`、`npm run lint`、`npx playwright install chromium`、`npm run test:e2e` が成功する。
- `main` の通常 push は `.github/workflows/ci.yml` の Quality だけを実行し、Pages を deploy しない。`Quality / quality` を main の必須 status check とし、失敗した Pull Request の merge を禁止する。
- Pages artifact は検証済み full commit SHA の `site/` だけを含み、deploy は artifact と Quality の両方に依存する。GitHub Actions の `github-pages` environment に結果と URL が表示される。
- `pages-production` concurrency group は deployment を直列化し、`cancel-in-progress: false` なので実行中の production deployment を自動 cancel しない。release host の local pre-check は競合を race-free にする保証ではない。
- Playwright の失敗時は GitHub Actions の `playwright-results` artifact で trace と screenshot を確認する。
- PDF ゲートは short（英語1ページ）、standard（日本語2ページ）、long（英語複数ページ）について、ページ数、用紙寸法、先頭・末尾の抽出テキストを確認する。
- `tests/public-entry.test.js` が root、`/zh-cn/`、`/en/` の public entry と `/ja/` 互換入口の metadata、canonical / hreflang、`sitemap.xml`、`resume-studio-web-v1.schema.json` と import example の代表的な正常・異常 case を検証する。
- Playwright が JavaScript 無効時の public entry と、document tab の `aria-selected` / roving tabindex、三言語 mobile switch の `aria-pressed` を検証する。

## 初回 Pages / HTTPS 設定

設定と tag 操作の直前確認、Actions 監視、manual redeploy / rollback は [release playbook](release-playbook.md) を使用する。

- [ ] Repository の `Settings` → `Pages` で Source が `GitHub Actions` になっている。
- [ ] Custom domain を使用しないことと、production URL が `https://herehigher.github.io/resume/` であることを確認した。
- [ ] 初回 deployment 後に HTTPS で接続でき、`Enforce HTTPS` の状態を確認した。
- [ ] 設定者、確認日時、Source、custom domain、HTTPS 状態を Issue または Pull Request に記録した。Secret / token は記録していない。
- [ ] `Deploy Pages` の workflow run URL、environment に表示された Pages URL、online smoke の結果を記録した。
- [ ] `main` の通常 commit で `Deploy Pages` が起動せず、対象 stable tag で validate → quality → artifact → deploy → smoke が起動した。
- [ ] `workflow_dispatch` で既存の accepted stable tag を指定し、同じ tag commit を再検証・再 deployment できることを確認した。

Smoke が失敗した場合、deployment 自体は完了しているため「deploy 済み・未受入」と記録する。CDN 反映など一時的な失敗は rerun または同じ既存 tag の manual redeploy で再確認する。同一 origin の file 欠落や version 不一致では tag を移動せず、修正版を新しい version として release する。

## ブラウザ表示

対象: 最新の Chrome/Chromium、デスクトップ 1440 × 1000、スマートフォン相当 390 × 844。

- [ ] `/`、`/zh-cn/`、`/en/` の public entry を直接開き、正しい言語の公開内容が表示される。既存外部リンク用の `/ja/` も直接開け、canonical が root に統合されている。
- [ ] デスクトップで入力欄とプレビューが同時に読め、横スクロールや操作不能なボタンがない。
- [ ] スマートフォンで三言語の代表入力、保存・再読込、「入力 / プレビュー」切替を実行し、データ書き出しを含む主要操作に到達できる。
- [ ] 日本語の履歴書 / 職務経歴書 tab で visual state、`aria-selected`、focusable tab が一致し、ArrowLeft / ArrowRight / Home / End で切り替えられる。
- [ ] 三言語のスマートフォン表示切替で visual state、editor / preview、`aria-pressed` が常に一致する。
- [ ] 保存・再読込、入力例からの復元、項目削除、JSON書き出し・読込後も三言語のデータが混ざらない。
- [ ] HTMLらしい入力が文字として表示され、画像・スクリプト・イベントハンドラとして実行されない。
- [ ] `http://` と `https://` だけがリンクになり、`javascript:`、`data:`、相対URL、`mailto:`、`ftp:` はクリックできない。
- [ ] Clone / fork または source build では、3 public entry、`/ja/` 互換入口、editor の5 HTML が `data-analytics-mode="disabled" data-analytics-provider="none"` を示し、Developer Tools の Network に同一 origin の公開 static file 以外の analytics / external runtime request、同一 origin POST、未知 path、WebSocket がない。
- [ ] 公式 Pages release では、3 public entry、`/ja/` 互換入口、editor の5 HTML の status tuple が tagged manifest と一致する。`disabled/none` なら beacon がなく、`enabled/cloudflare-web-analytics` なら `https://static.cloudflareinsights.com/beacon.min.js` への GET と `https://cloudflareinsights.com/cdn-cgi/rum` への標準 POST が各 page で確認できる。未対応 tuple は configuration error として不合格にする。
- [ ] Enabled の Cloudflare RUM request の URL と payload を確認し、履歴書入力、氏名・連絡先、写真、import / export JSON、localStorage の下書き、custom event、利用者単位 ID が含まれない。Page URL の query は `lang=ja`、`lang=zh-CN`、`lang=en` 以外を含まない。
- [ ] Repository を public にした後、未ログインまたは private window から右下の GitHub source link と三言語の privacy notice link を開ける。

## Public entry・SEO・Agent contract

対象: GitHub Pages へ deploy した release candidate の実 URL。Project site の場合は `/resume/` subpath を含めて確認する。

- [ ] Root を直接開き、JavaScript を無効にしても `lang`、title、description、H1、主要説明、`?lang=ja` 付き editor CTA、简体中文・Englishへの導線を読める。browser language による強制 redirect がない。
- [ ] Root、`/zh-cn/`、`/en/` の3 public entry は JavaScript を無効にしても対応する `lang`、title、description、H1、主要説明、editor CTA、JSON Schema link を読める。
- [ ] Root、`/zh-cn/`、`/en/` の canonical が実 deployment URL と一致し、`ja`、`zh-CN`、`en`、`x-default` の hreflang が3 page で reciprocal になっている。`/ja/` は root へ canonical 統合され、public hreflang cluster に含まれない。`/editor/` は `noindex,follow` で、public hreflang cluster に含まれない。
- [ ] `sitemap.xml` が HTTP 200 と XML content type で取得でき、root、`/zh-cn/`、`/en/` の3 canonical URL だけを含む。browser が XML を直接表示できない場合は response header と raw response body を evidence として確認する。
- [ ] `schema/resume-studio-web-v1.schema.json` と架空 example JSON が HTTP 200 で取得でき、example を editor へ import できる。browser が JSON を直接表示できない場合は response header と raw response body を evidence として確認する。
- [ ] Public JSON Schema が現在の runtime import contract と一致し、無効 version / locale / missing field / remote photo URL を拒否する。
- [ ] 3 public entry が、application は data を upload しないこと、export file は写真や個人情報を含み得ること、利用者の明示承認なしに Agent が upload / transmit / share してはいけないことを区別して説明する。
- [ ] Public entry から `/editor/` へ移動したとき、`?lang=ja`、`?lang=zh-CN`、`?lang=en` が正しく適用される。editor の brand は日本語では root、简体中文・Englishでは対応する紹介ページへ戻れる。
- [ ] 表示 locale は URL query、保存 preference、browser language、`ja` の順で決まり、draft の削除後も preference が維持される。preference の保存に失敗しても現在の表示は切り替わり、次回記憶されない可能性が通知される。
- [ ] Canonical / hreflang 以外の外部 runtime asset がなく、履歴書 data の network 送信も発生しない。

## PDF 目視確認

ブラウザの「PDF出力」から保存し、100%表示と印刷プレビューの両方で確認する。

| 言語 | 用紙 | データ量 | 確認事項 |
| --- | --- | --- | --- |
| 日本語 | A4 | short / standard / long | 履歴書2面と職務経歴書の見出し、表罫線、長文、資格URLが切れない |
| 简体中文 | A4 | short / standard / long | 时间轴、项目、技能、中文标点不重叠，末尾内容不丢失 |
| English | Letter / A4 | short / standard / long | ATS headings, bullets, date ranges, and final section remain selectable and readable |

- [ ] 意図しない空白ページ、重複ページ、途中で切れた行、ページ外にはみ出す文字がない。
- [ ] 写真あり・なしの両方で氏名、連絡先、見出しの位置が崩れない。
- [ ] 長いURL、長い会社名、長い単語、複数行の実績が枠内で折り返される。
- [ ] PDF内の氏名、見出し、先頭と末尾の本文を選択・コピーできる。
- [ ] A4 は 210 × 297 mm、US Letter は 8.5 × 11 inch として保存される。

## 判定記録

リリース候補の commit SHA、確認日、確認者、OS / Chrome バージョン、各項目の結果、既知の差異と関連issueをPRへ記録する。自動ゲートの evidence と、人が確認して受入と判断した evidence を区別する。未確認項目がある場合は理由と影響範囲を明記し、Pages settings、redeploy、rollback とは独立した owner decision として final acceptance を判断する。[Release evidence template](release-playbook.md#evidence-記録-template) の各 field を実値または `該当なし` で埋める。
