# Resume Studio

ブラウザ上で履歴書・職務経歴書を作成し、PDFとして保存するWebアプリです。

現在は、日本語の編集・プレビュー機能をWeb向けのモジュール構成で提供しています。

## 現在の機能

- 日本語の履歴書・職務経歴書の切り替え
- 入力内容のリアルタイムプレビュー
- 学歴、職歴、資格、勤務先の追加と削除
- GitHub、LinkedIn、ポートフォリオ、資格確認URL
- 証明写真の登録とトリミング
- ブラウザへの自動保存、手動保存、再読み込み
- 保存済み下書きを変更しない入力例
- A4 PDF出力とスマートフォン向け表示

## 起動方法

ES Modulesを使用するため、`site/` を静的Webサーバーから配信します。

```bash
python3 -m http.server 8000 --directory site
```

ブラウザで `http://localhost:8000/` を開きます。正式な公開環境はGitHub Pagesです。

## データとプライバシー

- 入力情報は外部へ送信されません。
- 下書きはブラウザの `localStorage` に保存されます。
- 保存キーは `resume-studio-web-v1` です。
- 旧版の `resume-studio-data-v1` は読み込み、移行、削除を行いません。
- ブラウザデータを消去すると下書きも削除されます。

## プロジェクト構成

```text
resume/
├── site/
│   ├── index.html
│   └── assets/
│       ├── css/
│       └── js/
├── tests/
├── scripts/
├── package.json
├── README.md
└── AGENTS.md
```

`site/` はビルドなしでそのまま静的ホスティングできます。本番コードに外部API、CDN、外部フォント、アクセス解析は使用していません。

## テスト

```bash
npm test
```

状態モデル、保存、旧版データの無視、危険な写真URLの拒否、JavaScript構文、HTMLシェルと参照アセットを確認します。

## 対応環境

最新版のGoogle Chromeを推奨します。PDFの仕上がりは印刷プレビューで確認してください。
