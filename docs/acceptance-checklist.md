# v0.1 リリース受入チェックリスト / Release acceptance checklist

自動テストで検出しにくい文字切れ、改ページ、印刷ダイアログ差異を、リリース候補ごとに確認する。個人情報を含む実データは使用せず、テスト用データのみで実施する。

## 自動ゲート

- `npm ci`、`npm test`、`npm run lint`、`npx playwright install chromium`、`npm run test:e2e` が成功する。
- Tag（`v*`）の Pages リリースは、再利用可能な `Quality` workflow が成功し、対象commitが main の履歴に含まれる場合だけ deploy job へ進む。失敗したリリース候補は公開しない。
- 現在の非公開リポジトリで Pages を利用できない場合、公開または対応プランへの変更後に Pages の Source を GitHub Actions に設定する。それまでは deploy が成功しないため、サイトは公開されない。
- 利用可能になった時点で `Quality / quality` を main の必須ステータスチェック（required status check）に設定し、失敗したPRのマージも禁止する。
- Playwright の失敗時は GitHub Actions の `playwright-results` artifact で trace と screenshot を確認する。
- PDF ゲートは short（英語1ページ）、standard（日本語2ページ）、long（英語複数ページ）について、ページ数、用紙寸法、先頭・末尾の抽出テキストを確認する。

## ブラウザ表示

対象: 最新の Chrome/Chromium、デスクトップ 1440 × 1000、スマートフォン相当 390 × 844。

- [ ] `ja`、`zh-CN`、`en` の各URLを直接開き、正しい言語と入力データが表示される。
- [ ] デスクトップで入力欄とプレビューが同時に読め、横スクロールや操作不能なボタンがない。
- [ ] スマートフォンで三言語の代表入力、保存・再読込、「入力 / プレビュー」切替を実行し、データ書き出しを含む主要操作に到達できる。
- [ ] 保存・再読込、入力例からの復元、項目削除、JSON書き出し・読込後も三言語のデータが混ざらない。
- [ ] HTMLらしい入力が文字として表示され、画像・スクリプト・イベントハンドラとして実行されない。
- [ ] `http://` と `https://` だけがリンクになり、`javascript:`、`data:`、相対URL、`mailto:`、`ftp:` はクリックできない。
- [ ] Developer Tools の Network で、許可された同一オリジン静的ファイル以外のHTTP(S)要求およびWebSocket接続がない。同一オリジンのPOST、fetch/XHR、未知のpathも許可しない。

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

リリース候補の commit SHA、確認日、確認者、OS / Chrome バージョン、各項目の結果、既知の差異と関連issueをPRへ記録する。未確認項目がある場合は理由と影響範囲を明記し、リリース可否を判断する。
