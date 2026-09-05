# 開発ガイド

Repository 原則は [AGENTS.md](../AGENTS.md)、PR の提出方法は [CONTRIBUTING.md](../CONTRIBUTING.md)、公開と再開は[リリース手順](release-playbook.md)を正本とします。

## Setup と構成

```bash
npm ci
python3 -m http.server 8000 --directory site
```

`http://localhost:8000/` から公開入口、`http://localhost:8000/editor/` から editor を開きます。草稿の AES-GCM 暗号化には secure context が必要です。HTTPS、`localhost`、`127.0.0.1` を使い、`http://0.0.0.0`、LAN IP の HTTP、`file://` では保存・再読込を検証しません。

| 場所 | 内容 |
| --- | --- |
| `site/` | Build 不要の配信 source。`assets/js/` は state、UI、template、i18n、utility |
| `site/schema/` | 公開 v1 JSON Schema と架空 import example |
| `tests/` | Node の契約・動作 test と Playwright の desktop / mobile / PDF test |
| `scripts/` | Static check、公開 artifact の準備・検証、画像・PDF 検証出力 |
| `.github/workflows/` | Quality と公開 workflow |
| `docs/`、`output/pdf/` | 開発資料と長期参照する展示 sample |

Root は日本語の公開入口、`/zh-cn/` と `/en/` は対応言語の入口です。`/ja/` は canonical を root に統合した互換入口です。Editor は `/editor/` にあり `noindex,follow`。Sitemap / hreflang は3公開入口だけを対象にします。

表示 locale の決定順は URL query、`resume-studio-locale-v1` の保存 preference、`navigator.languages`、`ja`。Import 内の locale は文書 data で、表示 preference を変更しません。`zh-TW` / `zh-Hant` を简体中文へ自動変換しません。

## 変更に応じた検証

変更に近い focused test から始め、PR の必要な CI が成功してから merge します。成功済みの同じ内容に local / CI の full gate を反復要求せず、変更・失敗・証拠不足がある場合に追加確認します。

| 変更 | 必要な確認 |
| --- | --- |
| 文書のみ | `node --test tests/documentation.test.js`、関連 lint、`git diff --check`。Browser / PDF full gate は不要 |
| App、state、storage、import/export、UI、i18n、privacy、PDF | 対象 test と PR CI の unit / static / lint / E2E。表示・PDF 変更は下記の目視も実施 |
| Release infrastructure、workflow、生成 script | 実際の CLI 入口を実行する integration test、workflow 検査、必要な artifact test。Docs-only と扱わない |
| 最終 merged release SHA | Full gate を1回。再利用時は repository、SHA、workflow、成功結果を確認する。PR head の結果で代用しない |

| Command | 役割 |
| --- | --- |
| `npm test` | Unit / document / 公開契約 / JavaScript syntax / network と storage の static check |
| `npm run lint` | JavaScript と test / script の Biome lint |
| `npm run test:e2e` | Desktop / mobile 操作、保存・言語・privacy・PDF の Chromium test |
| `npm run test:acceptance` | Unit / static、lint、E2E をまとめて実行する診断用 full gate |

CI は文書だけの変更でも Quality の結果を返します。確認を実行せず required check を pending のまま残す path filter は使いません。GitHub の branch protection は別設定です。Playwright の失敗証拠は Actions artifact に残します。

Local で複数 worktree の E2E を実行する場合、既定 port 4183 / 4184 の利用を直列化し、`CI=1` で別 checkout の server を誤って再利用しないようにします。依存関係は `package-lock.json` で固定し、更新は dependency の目的を確認した PR で行います。

## 表示・PDF の目視

対象変更に応じ、最新 Chrome / Chromium の desktop 1440 × 1000 と smartphone 相当 390 × 844 で確認します。

- 対象言語の入力、preview、保存・再読込、JSON 読込・書出しへ到達でき、横 overflow や操作不能な button がない。
- 文書 tab、言語切替、mobile 入力 / preview の表示・選択状態・keyboard focus が一致する。
- PDF は対象 locale / paper の全 page を100%表示と印刷 previewで確認し、文字切れ、重なり、末尾欠落、空白・重複 page がない。写真あり・なし、長い URL・単語・組織名も確認する。

| Locale | Paper | Data |
| --- | --- | --- |
| `ja` | A4 | short / standard / long、履歴書・職務経歴書 |
| `zh-CN` | A4 | short / standard / long、中文句読点と改ページ |
| `en` | Letter / A4 | short / standard / long、bullets と末尾 section |

確認結果は PR に対象 commit、条件、結果と差異を簡潔に残します。自動 test、agent の目視、人の受入判断、未確認を区別し、未実施の確認を完了と記録しません。

## 展示 sample と検証出力

README の screenshot / PDF は長期参照する展示物です。[Manifest](assets-manifest.json) に生成時の source commit、site hash、Chromium、架空 data の条件があり、現在 version の画面を保証するものではありません。Version / 日付 / 文書 / workflow の変更だけでは更新しません。

画面、layout、template、font、公開 sample data が変わり展示物を更新する場合だけ、対象画像・PDF と provenance を一緒に review します。`docs/screenshots/*.png` と `output/pdf/*.pdf` は Git LFS を維持します。取得・更新時だけ `git lfs install --local` と `git lfs pull` が必要で、通常の Node test / CI に展示 binary は不要です。既存リンクや LFS 履歴は維持し、期限付き Actions URL を README の長期リンクに使いません。

CI の確認用出力は一時 directory から Actions artifact に保存し、source / 展示物へ promote しません。生成 command の実際の入力は[リリース手順](release-playbook.md)の準備入口に集約します。PDF correctness は対象 source の E2E と一時出力で検証し、展示物の更新頻度と分けて扱います。
