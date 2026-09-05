# Resume Studio - 日本語ガイド

日本語（このページ） | [简体中文](README.zh-CN.md) | [English](README.en.md)

Resume Studio は、ブラウザ内で日本語・简体中文・English の履歴書を編集し、PDF と JSON に保存できる個人利用向け Web アプリです。本番コードは静的 HTML、CSS、ES Modules で構成され、履歴書の入力内容を backend や外部サービスへ自動送信しません。

## Web版

Web版: [https://herehigher.github.io/resume/](https://herehigher.github.io/resume/)

## 対応する文書と用紙

| 言語 | 文書 | 用紙 |
| --- | --- | --- |
| 日本語 | 履歴書、職務経歴書 | A4 |
| 简体中文 | 中文简历 | A4 |
| English | ATS-friendly resume | US Letter、A4 |

日本語・简体中文・English の言語別 document section は独立して保存され、互いに上書きされません。profile・連絡先・写真は三言語で共有されるため、どの言語で変更しても他の言語へ反映されます。入力例は保存済み下書きを変更せず一時表示でき、必要な場合だけ下書きとして採用できます。

## ローカルで起動する

Node.js はテストに使用しますが、アプリの実行に build は不要です。ES Modules を利用するため `file://` ではなく静的 Web server から `site/` を配信します。Python 3 または Node.js と npx のどちらか一方を選び、両方を同時に実行する必要はありません。

Python 3:

```bash
python3 -m http.server 8000 --directory site
```

Node.js と npx:

```bash
npx --yes http-server site --port 8000
```

Chrome で `http://localhost:8000/` を開いて日本語 editor を直接始めるか、简体中文・English の紹介ページを選びます。editor は `http://localhost:8000/editor/` からも開けます。

下書きの AES-GCM 暗号化には secure context が必要です。`https://`、`http://localhost`、または `http://127.0.0.1` の URL を使用し、server が表示する `http://0.0.0.0` や LAN IP の URL は開かないでください。

## README だけで使い始める

1. 公開首頁の CTA から日本語 editor を直接開くか、简体中文・English の紹介ページから対応する editor を開きます。editor 内では右上の言語 selector を使え、`/editor/?lang=ja`、`/editor/?lang=zh-CN`、`/editor/?lang=en` から直接開くこともできます。
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

すべて架空の入力例を使用した過去の展示 sample です。生成時点の source と Chromium version は [asset manifest](docs/assets-manifest.json) に記録しています。

## データと privacy

- 保存 key は `resume-studio-web-v1` で、profile、写真、三言語の文書を現在の browser origin にまとめて保存します。
- 下書き本文は localStorage に AES-GCM で暗号化して保存します。JSON export と PDF は暗号化されず、写真その他の個人情報を含む場合があるため、安全に保管してください。
- browser data の消去、private browsing の終了、保存容量不足、browser による storage eviction で下書きを失うことがあります。重要な下書きは JSON で backup してください。
- アプリ内削除は v1 state を消しますが、旧 `resume-studio-data-v1`、download 済み JSON/PDF、browser の download 履歴までは削除しません。
- Repository の `site/`、clone、fork は Analytics 無効で、同一 origin の静的 asset 以外へ解析 request を送りません。`herehigher/resume` の検証済み stable tag だけは、tag に固定した manifest が有効な場合に deployment artifact へ標準 Cloudflare Web Analytics を決定的に追加します。Cookie、localStorage、利用者単位 ID、custom event は使わず、履歴書入力、写真、JSON、local draft は送信しません。画面の status 表示と Network panel で現在の mode を確認できます。

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

`site/` source に外部 API、CDN、外部 font、analytics を追加しないでください。唯一の例外は、公式 repository の検証済み stable tag から作る artifact に、tagged manifest と一致する標準 Cloudflare Web Analytics を deployment-only adapter が追加する経路です。詳しくは [開発ガイド](docs/development-guide.md)、[Contributing](CONTRIBUTING.md)、[release playbook](docs/release-playbook.md) を参照してください。

## Repository information

- [Privacy](PRIVACY.md#privacy-ja)
- [Changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md)
- [MIT License](LICENSE)
