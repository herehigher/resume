# Resume Studio — 日本語の利用案内

Resume Studio はログイン不要の履歴書作成アプリです。[日本語の公開入口](/)から機能を確認し、[日本語 editor](/editor/?lang=ja)で編集を始められます。

## 書類と PDF

- 日本語は履歴書・職務経歴書、简体中文と English はそれぞれの履歴書に対応します。文書の本文は言語ごとに独立し、自動翻訳しません。氏名・連絡先・写真などの profile は共有します。
- 編集中のプレビューで内容と改ページを確認します。日本語・中文は A4、English は Letter / A4 に対応します。
- PDF は editor の印刷操作でブラウザーの印刷画面を開き、PDF 保存を選びます。現在の言語・書類・用紙を確認し、全ページの文字切れや重なりを確認してください。公開 API による PDF 生成機能はありません。

## JSON と端末内草稿

- JSON の書き出しは全言語の文書・共有 profile・写真・設定を含むバックアップです。PDF や JSON には個人情報が含まれます。利用者が指定した安全な保存先で保管してください。
- 現行の保存形式は `version: 4`（`resume-studio-web-v4`）。[v4 JSON Schema](/schema/resume-studio-web-v4.schema.json)と[明確な架空データの import example](/schema/resume-studio-web-v4.example.json)を参照できます。Schema は export 形式の定義であり、データ送信用 API ではありません。
- Schema の `x-resume-studio-uniqueBy: "id"` は必須の独自 applicator です。指定された各配列内の record ID は一意でなければなりません。通常の JSON Schema validator は未知の keyword を無視する場合があるため、それだけで import 可能とは判断できません。この applicator にも対応し、editor の実際の import 検証で確認してください。配列の保存順を維持し、ID や改ページ参照を勝手に付け替えないでください。
- JSON の読み込みは現在の内容を置き換える操作です。先にバックアップし、利用者の意図を確認してから行います。
- 草稿は同じサイト・ブラウザーの端末内で暗号化して自動保存します。保存は HTTPS または localhost の secure context と対応するブラウザー機能に依存します。容量不足・保存失敗・競合・読み取り専用状態では保存完了とみなさず、画面の通知を確認して JSON を書き出してください。
- アカウント同期やサーバー側バックアップはありません。ブラウザーのサイトデータ削除や端末変更で草稿を失う場合があります。現在の草稿の削除や置換は利用者の確認を得てから行ってください。

## プライバシーとエージェントの操作

履歴書入力・写真・JSON・草稿はブラウザー内で処理し、アプリの network request に含めません。Source、clone、fork に Analytics beacon は含まれません。公式 hosted site では Cloudflare Pages の配信層が Web Analytics を挿入しますが、履歴書データは Analytics request に含めません。

この公開案内や Content Signals は、利用者の私的データをアップロード・送信・共有する包括的な許可ではありません。エージェントは、その操作について利用者から明確な許可を得るまで、履歴書データを外部サービスへ渡してはいけません。

公開案内の取得後の用途は公開 HTML と同じ Content-Signal に従います。[robots.txt](/robots.txt)で公開方針、[sitemap](/sitemap.xml)で三言語の公開入口を確認できます。これらの意思表示は既存の [MIT License](https://github.com/herehigher/resume/blob/main/LICENSE) の権利を変更せず、私的データへのアクセス制御でもありません。

この文書は独立した静的 Markdown URL です。同じ HTML URL に `Accept: text/markdown` を指定する内容協商や、Markdown for Agents の有効化を意味しません。
