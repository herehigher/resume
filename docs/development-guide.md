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

## Data version と移行

JSON payload の `version` は、端末内草稿を復号した state と JSON import/export が共有する唯一の data format version です。現在の新規 state、公開 export、公開 JSON Schema は `version: 3` を使い、`schemaRevision` は持ちません。暗号化 envelope の format version は暗号化した bytes の格納方法を表す別契約で、履歴書 data の version とは独立して維持します。利用実績のない旧 `version: 1` は対応 list に含めず、import でも端末内草稿でも非対応として扱います。

対応可能な version の下限は `max(1, currentVersion - 3)` ですが、実際に移行できるのは migration registry に連続した step が明示されている version だけです。migration の既定値は固定し、日付・browser locale・random 値を使いません。

端末内草稿は `resume-studio-web-v{STATE_VERSION}` と、同じ名前を元にした Web Lock / IndexedDB を使います。起動時は current key を先に読みます。対応中の旧草稿がある場合は `COMPATIBLE_DRAFT_STORAGE_KEYS` に key を新しい順で明示し、read-only で読んで migration 後の state を current key へ保存します。新草稿の保存成功後にだけ元の raw と IndexedDB key を自動削除し、保存が失敗した場合は旧草稿を保持します。読込後の旧草稿の更新検知または cleanup の失敗時も旧草稿を保持し、移行完了として表示しません。対応外の key は list へ追加せず、列挙・読込・書込・削除をしません。現在の v3 は `resume-studio-web-v2` だけを互換対象にし、v1 は対象外です。

data format を更新するときは `STATE_VERSION` を増やし、直前 version だけを受け取る純粋 step と変更概要を追加します。続けて対応範囲内の旧草稿 key を明示 list に追加し、入力・期待出力 fixture、対応下限と境界 test、公開 schema/example の version とファイル名を同じ PR で更新します。4世代以上前になった step / fixture / key は registry と明示 list から外しますが、すでに対応外となった端末内 data には触れません。最後に migration / storage / import の対象 test、同一 context の競合 test、privacy canary と必要な表示・PDF 確認を実施します。

## Open Graph 共有画像

日本語・简体中文・English の公開入口で使う 1200 × 630 の共有画像は、repository root から次の command で3言語分をまとめて再生成します。

```bash
node scripts/render-open-graph-cards.mjs --locale all
```

正式な画像は `site/assets/social/` に出力され、同じ directory の `resume-studio-og.manifest.json` に生成 script、元の brand 画像、各生成画像の SHA-256 が記録されます。正式 asset と manifest の不整合を避けるため、同 directory へは必ず全 locale を一度に生成します。

1言語だけ確認する場合は、正式 asset を変更しない一時 directory を明示します。`--locale` は `ja`、`zh-CN`、`en` を受け付けます。

```bash
node scripts/render-open-graph-cards.mjs --locale zh-CN --output-dir /tmp/resume-studio-og-preview
```

生成 script は `site/assets/brand/resume-studio-marmot-logo.png` を直接埋め込みます。マーモットを描き直した画像へ置き換えず、生成後は対象言語の文言と contrast に加え、logo の歯・輪郭・三本線が変形、欠落、切断していないことを 1200 × 630 の実寸で確認します。

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
| `npm run test:e2e` | Desktop / mobile 操作、保存・言語・privacy・PDF の Chromium test と、mobile 改ページ操作・画面内 layout parity の WebKit test |
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

README の screenshot / PDF は安定版ごとの長期参照用展示物です。[Manifest](assets-manifest.json) に app version、生成 checkout の情報値、site hash、generator input hash、Chromium、架空 data の条件を記録します。通常の開発途中では現在の main と一致することを保証しませんが、安定版 tag ではその version の画面・site bytes・生成結果と一致させます。Screenshot に version が表示されるため、安定版の version 更新では展示 asset も更新します。文書 / workflow だけの変更では更新しません。

安定版の version、画面、layout、template、font、公開 sample data が変わり展示物を更新する場合は、対象画像・PDF と provenance を一緒に review します。`docs/screenshots/*.png` と `output/pdf/*.pdf` は Git LFS を維持します。取得・更新時だけ `git lfs install --local` と `git lfs pull` が必要で、通常の Node test / CI に展示 binary は不要です。既存リンクや LFS 履歴は維持し、期限付き Actions URL を README の長期リンクに使いません。

CI の確認用出力は一時 directory から Actions artifact に保存し、通常の開発 PR では source / 展示物へ promote しません。Version を変えずに展示 asset だけを変更した PR は拒否します。安定版の公開 PR だけは、その PR の Quality artifact を source 外へ展開し、`npm run promote:doc-assets -- --asset-root OUTPUT_DIRECTORY --source-root CHECKOUT --source-sha HEAD_SHA` で検証済み asset を取り込みます。SHA は候補 branch の HEAD 全40桁を指定し、`site/` に未 commit の変更を残しません。PR check は commit 済みの LFS object が promotion 元 artifact の exact bytes であることを確認します。Merge 後の公開準備は最終 main Quality に対し、各 file と manifest digest、候補 version、site・generator contract、PDF 全文・page、screenshot visual を再検査します。別 browser run の raw bytes 完全一致は要求せず、自動 commit も行いません。

手元で一時出力だけが必要な場合は `npm run generate:doc-assets -- --output-dir EMPTY_DIRECTORY --source-sha HEAD_SHA --quality-run-id LOCAL_POSITIVE_ID` で source 外の空 directory に生成し、`npm run verify:doc-assets -- --asset-root OUTPUT_DIRECTORY --source-root CHECKOUT --source-sha HEAD_SHA` で検証します。Local の ID は情報値にすぎず、その出力を公開 PR へ promote しません。公開用 manifest には Quality が実 run ID を設定します。PDF correctness は対象 source の E2E と一時出力で検証し、展示 asset の version 同期とは分けて扱います。
