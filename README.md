# Resume Studio - 日本語ガイド

日本語（このページ） | [简体中文](README.zh-CN.md) | [English](README.en.md)

Resume Studio は、ブラウザ内で日本語・简体中文・English の履歴書を編集し、PDF と JSON に保存できる個人利用向け Web アプリです。本番コードは静的 HTML、CSS、ES Modules で構成され、履歴書の入力内容を backend や外部サービスへ自動送信しません。

## Web版

Web版は Issue #9 で公開予定です。公開先の動作確認が完了するまでは、下記のローカル起動方法を利用してください。

## 対応する文書と用紙

| 言語 | 文書 | 用紙 |
| --- | --- | --- |
| 日本語 | 履歴書、職務経歴書 | A4 |
| 简体中文 | 中文简历 | A4 |
| English | ATS-friendly resume | US Letter、A4 |

日本語・简体中文・English の言語別 document section は独立して保存され、互いに上書きされません。profile・連絡先・写真は三言語で共有されるため、どの言語で変更しても他の言語へ反映されます。入力例は保存済み下書きを変更せず一時表示でき、必要な場合だけ下書きとして採用できます。

## ローカルで起動する

Node.js はテストに使用しますが、アプリの実行に build は不要です。ES Modules を利用するため `file://` ではなく静的 Web server から `site/` を配信します。

```bash
python3 -m http.server 8000 --directory site
```

Chrome で `http://localhost:8000/` を開きます。

## README だけで使い始める

1. 右上の言語 selector で日本語、简体中文、English を選びます。URL の `?lang=ja`、`?lang=zh-CN`、`?lang=en` から直接開くこともできます。
2. 入力欄を編集すると preview がすぐ更新されます。まず確認したい場合は「入力例を表示」を選びます。入力例は保存済み下書きを上書きしません。
3. 入力内容は現在の browser profile の `localStorage` に自動保存されます。「下書きを保存」で手動保存し、「保存内容を再読込」で保存済み内容へ戻せます。
4. 「PDF出力」を選び、Chrome の印刷画面で「PDF に保存」を選びます。用紙と印刷設定は下記の制限事項を確認してください。
5. 右上のデータ menu から JSON を書き出すと backup できます。復元するときは「データを読み込む」で同じ形式の JSON を選びます。不正な file は既存下書きを置き換えません。
6. 保存データを削除するときは日本語画面の最下部で「保存した下書きを削除」を選び、確認 dialog で消去します。この操作は v1 形式の三言語すべての下書きと画面入力を削除します。

## 主な機能

- 独立した三言語 document section、共有 profile、言語切替
- 日本語の履歴書・職務経歴書切替
- 入力と同時に更新される preview
- 入力例の一時表示、採用、元の下書きへの復元
- 自動保存、手動保存、再読込
- JSON backup / restore
- `http://` と `https://` だけを有効にする profile link
- A4 / US Letter の PDF 出力と自動改ページ
- Desktop と mobile 幅の編集・preview 切替

## Screenshot と PDF sample

![日本語の編集画面とプレビュー](docs/screenshots/ja.png)

- [日本語 A4 PDF sample](output/pdf/ja-a4.pdf)
- [简体中文 A4 PDF sample](output/pdf/zh-CN-a4.pdf)
- [English US Letter PDF sample](output/pdf/en-letter.pdf)

すべて架空の入力例を使用しています。生成元と Chromium version は [asset manifest](docs/assets-manifest.json) に記録しています。

## データと privacy

- 保存 key は `resume-studio-web-v1` で、profile、写真、三言語の文書を現在の browser origin にまとめて保存します。
- 写真も JSON export も個人情報を含みます。localStorage と export file は暗号化されません。
- browser data の消去、private browsing の終了、保存容量不足、browser による storage eviction で下書きを失うことがあります。重要な下書きは JSON で backup してください。
- アプリ内削除は v1 state を消しますが、旧 `resume-studio-data-v1`、download 済み JSON/PDF、browser の download 履歴までは削除しません。
- アプリは同一 origin の静的 asset に加え、Cloudflare から標準 Web Analytics beacon を読み込み、集計 page view と表示性能を送信します。Cookie、localStorage、利用者単位 ID、custom event は使わず、履歴書入力、写真、JSON、local draft は送信しません。利用者が preview 内の profile link を選ぶと、その link 先へ移動します。

詳細は [Privacy / 日本語](PRIVACY.md#privacy-ja) を確認してください。

## 対応 browser と PDF の制限

- 自動受入の対象は最新 Chrome/Chromium、desktop `1440 x 1000`、mobile 相当 `390 x 844` です。
- Safari、Firefox、実 mobile device は未検証です。Chromium 系でも OS、font、印刷 engine により行送りや改ページが変わる場合があります。
- PDF 保存時は browser の header/footer を無効にし、background graphics を有効、scale を 100% 相当、CSS page size を優先してください。
- 日本語と中国語は A4、英語は US Letter または A4 を選べます。保存前に印刷 preview で文字切れ、不要な空白 page、用紙 size を確認してください。
- 極端に長い URL、改行できない単語、大量の文章では layout が変わる可能性があります。最終提出前の目視確認が必要です。

## 開発と検証

```bash
npm ci
npm run test:acceptance
```

本番 runtime に外部 API、CDN、外部 font、別の analytics を追加しないでください。標準 Cloudflare Web Analytics の集計 page view / performance 計測だけが限定的な例外です。詳しくは [開発ガイド](docs/development-guide.md)、[Contributing](CONTRIBUTING.md)、[release acceptance checklist](docs/acceptance-checklist.md) を参照してください。

## Repository information

- [Privacy](PRIVACY.md#privacy-ja)
- [Changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md)
- [MIT License](LICENSE)
