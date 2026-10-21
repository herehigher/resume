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

Root は日本語の公開入口、`/zh-cn/` と `/en/` は対応言語の入口です。`/ja/` は canonical を root に統合した互換入口です。Editor は `/editor/` にあり `noindex,follow`。Sitemap / hreflang は3公開入口だけを対象にします。`robots.txt` はクロールを許可し、正式な sitemap を参照します。`404.html` は三言語の公開入口を案内します。

表示 locale の決定順は URL query、`resume-studio-locale-v1` の保存 preference、`navigator.languages`、`ja`。Import 内の locale は文書 data で、表示 preference を変更しません。`zh-TW` / `zh-Hant` を简体中文へ自動変換しません。


## 公開コンテンツの用途方針と Content Signals

所有者は2026-10-21（JST）の作業チャットで三用途をすべて yes とする方針を明示しました。[承認記録](https://github.com/herehigher/resume/issues/297#issuecomment-6311994936)に基づき、`search=yes, ai-input=yes, ai-train=yes` を採用します。Issue の初期案にあった `ai-train=no` は採用しません。

| 用途 | 意味・期待する扱い | 代表的なアクセス |
| --- | --- | --- |
| `search=yes` | 検索 index の作成、リンク・短い抜粋による発見を許容 | 一般検索の Googlebot / Bingbot、AI 検索の OAI-SearchBot / PerplexityBot |
| `ai-input=yes` | AI 回答時の取得・引用・grounding を許容 | ChatGPT-User 等の利用者操作の agent、生成 AI 検索の回答用取得 |
| `ai-train=yes` | モデルの学習・fine-tuning のための取得を許容 | GPTBot / ClaudeBot 等の学習クローラー |

Crawler 名は用途を確認する代表例です。同じ事業者の検索・学習・ユーザー操作を同一視せず、提供者の最新仕様と Cloudflare の検出分類を確認します。特定の User-Agent 文字列だけでは送信元を認証できません。`ai-input=yes` は利用者の編集内容を外部へ送る機能の追加ではありません。

### 宣言の管理元と適用範囲

Repository の `site/robots.txt` と `site/_headers` を宣言の管理元とし、`scripts/content-policy-contract.mjs` で相互の一致を検査します。Robots は全 crawler に `Allow: /` と三用途の yes、正式 sitemap を宣言します。訓練 bot の個別 `Disallow` は設けません。Pages の `/*` response header は HTML 入口・互換入口・editor・実際の404応答だけでなく、Schema / code / assets にも同じ三用途の yes を明示します。Directory URL、拡張子なし URL、`index.html` 別名を含め、ルートごとの宣言漏れを防ぎます。Pages の redirect は header より先に適用されるため、転送先の最終応答を照合します。

この意思表示は公開配信するコンテンツの取得後の用途に関する preference です。Software、関連文書、公開 Schema、架空 example、assets に適用される [MIT License](../LICENSE) や既に付与した権利を変更・撤回せず、追加のライセンス制限を設けません。Robots / Content Signals は私的データのアクセス制御でも、完全な学習防止を保証する仕組みでもありません。端末内の履歴書入力・写真・JSON・草稿は公開コンテンツに含まず、既存どおり network request へ含めません。Editor の `noindex,follow` は HTML meta と `/editor/*` の `X-Robots-Tag` で保持し、三言語の公開入口だけを sitemap / hreflang の対象にします。

[Markdown for Agents](https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/) はこの変更で有効化しません。2026-07-13 の[公式変更](https://developers.cloudflare.com/changelog/post/2026-07-13-markdown-for-agents-header-preservation/)以降、origin の `Content-Signal` が変換後も優先されます。Origin に header がない場合の既定値も三用途すべて yes ですが、既定値に依存せず Pages 側で明示します。将来有効化する際も HTML と `Accept: text/markdown` の応答で同じ三用途・editor の noindex、変換時の `Vary: Accept` を確認します。

### Cloudflare 設定の確認と差分案（未実施）

Issue の2026-10-21の観察記録では逐 crawler の阻止スイッチはすべてオフ、Bot Preference Sync はオフでした。この記録は現在の全 WAF ルールや実際の到達性の検証結果ではありません。今回の接続での WAF / bot management 再読込は read scope 不足（403）のため未確認です。設定変更や権限拡張をこの PR で実施しません。

所有者が設定を変更する場合だけ、[公開手順](release-playbook.md)に従い、次の差分を review・承認してから適用します。

- 対象 host は `rs.herehigher.com`。宣言の Pages artifact は同じ project の preview / Pages.dev にも適用しますが、Cloudflare zone 全体や他の subdomain の方針を変更しません。
- 逐 crawler の期待値は検索・利用者操作・学習のすべて「この方針を理由に block しない」です。現在も全オフなら差分はありません。既存の特定 bot / block-all AI ルールがあれば、元の rule ID・expression・action・順序・有効状態を記録し、`http.host eq "rs.herehigher.com"` の範囲だけでその用途制限を除く案を作ります。他 host の元の block は保持します。全 AI の一括ブロックを追加せず、検索を通すために他の安全規則を一括 Skip しません。
- [AI Crawl Control と WAF](https://developers.cloudflare.com/ai-crawl-control/configuration/ai-crawl-control-with-waf/)では block が zone の custom rule として通常末尾に追加されます。先行する Skip / Redirect / Transform や既存の block-all、他の WAF / Bot / rate limit rule との実行順・影響を確認します。Crawler switch の許可は他の安全ルールを上書きする allow ではありません。検出済み bot の実ログ・診断と最終 HTTP 応答で扱いを確認し、単なる User-Agent の偽装試験を実 crawler の到達確認とは扱いません。
- [Bot Preference Sync / managed robots](https://developers.cloudflare.com/bots/additional-configurations/managed-robots-txt/)はオフを維持します。将来使う際は repository と edge のどちらが宣言を生成するか先に決め、重複・矛盾した Content Signals や crawler block の注入を防ぎます。
- 復元時は変更した host 限定 rule だけを保存済みの ID・expression・action・順序・有効状態へ戻します。Pages 内容の復旧は既存の rollback / reconciliation を使い、zone 全体の設定を推測で復元しません。

### 検証と公開後の受入

`node --test tests/deployment-smoke.test.js tests/site-artifact.test.js tests/documentation.test.js` で、source / artifact の robots と `_headers` の一致、宣言の欠落・矛盾・重複、変換の有無と header 保持を検査します。`npm test` では network / storage の既存 privacy 契約も検査します。公開 smoke は HTML と404だけでなく robots / Schema / assets の Content-Signal も検査し、三言語の入口・日本語互換入口・editor に `Accept: text/markdown` を送り、HTML のままなら既存 HTML 契約、Markdown なら明示 policy と `Vary: Accept` を要求します。サービスは test から有効化しません。

受入済み `0.4.1`・`0.4.2`・`0.4.3` の online rollback / reconciliation は元の九経路のままで、当時なかった Content-Signal や editor response header を要求しません。将来版の online smoke と準備中の source / artifact には省略を許さず、現行 package version のままでも新しい宣言を検査します。

この実装 PR 時点では Cloudflare preview / 正式公開 / Agent Readiness・AI Crawl Control の公開後再診断は未実施です。正規公開後に Pages.dev と custom domain の HTML / Markdown / robots・404・editor の応答、管理された宣言の重複や矛盾、用途別 crawler の診断結果を記録します。対象 SHA・host・実行日時・判定と実際の応答を照合してから Issue の公開後受入を完了とし、自動 test の成功だけで完了扱いにしません。

## Data version と移行

JSON payload の `version` は、端末内草稿を復号した state と JSON import/export が共有する唯一の data format version です。現在の新規 state、公開 export、公開 JSON Schema は `version: 4` を使い、`schemaRevision` は持ちません。暗号化 envelope の format version は暗号化した bytes の格納方法を表す別契約で、履歴書 data の version とは独立して維持します。利用実績のない旧 `version: 1` は対応 list に含めず、import でも端末内草稿でも非対応として扱います。

対応可能な version の下限は `max(1, currentVersion - 3)` ですが、実際に移行できるのは migration registry に連続した step が明示されている version だけです。migration の既定値は固定し、日付・browser locale・random 値を使いません。

端末内草稿は `resume-studio-web-v{STATE_VERSION}` と、同じ名前を元にした Web Lock / IndexedDB を使います。起動時は current key を先に読みます。対応中の旧草稿がある場合は `COMPATIBLE_DRAFT_STORAGE_KEYS` に key を新しい順で明示し、read-only で読んで migration 後の state を current key へ保存します。新草稿の保存成功後にだけ元の raw と IndexedDB key を自動削除し、保存が失敗した場合は旧草稿を保持します。読込後の旧草稿の更新検知または cleanup の失敗時も旧草稿を保持し、移行完了として表示しません。対応外の key は list へ追加せず、列挙・読込・書込・削除をしません。現在の v4 は `resume-studio-web-v3` だけを互換対象にし、v2 以下は対象外です。

data format を更新するときは `STATE_VERSION` を増やし、直前 version だけを受け取る純粋 step と変更概要を追加します。続けて対応範囲内の旧草稿 key を明示 list に追加し、入力・期待出力 fixture、対応下限と境界 test、公開 schema/example の version とファイル名を同じ PR で更新します。4世代以上前になった step / fixture / key は registry と明示 list から外しますが、すでに対応外となった端末内 data には触れません。最後に migration / storage / import の対象 test、同一 context の競合 test、privacy canary と必要な表示・PDF 確認を実施します。

公開 Schema の `x-resume-studio-uniqueBy: "id"` は Resume Studio の必須 applicator です。対象 array の record `id` は一意でなければならず、runtime validator と Schema contract test は同じ規則で拒否します。汎用 JSON Schema validator を使う consumer は、この applicator を有効にして export を検証してください。

## 項目の順序契約

追加可能な項目は保存済みの配列順を編集・preview・PDF・JSON の唯一の順序にします。中文・English の既存 v4 草稿も読み込み時には並べ替えず、その配列順で表示するため、以前の自動日付順とは異なる場合があります。

共通入口は `store.reorderList(target, operation)` です。`target.key` と移動範囲・対象文書は `state/list-order.js` の `LIST_ORDER_REGISTRY` で14種類を明示します。`ja.careerDetails` は `careerId` で会社ごとの独立リストを選びます。操作は `{ type: 'move', from, to }`（移動後の index）または `{ type: 'sort', direction: 'newest' | 'oldest' }`。操作は同期で boolean を返します。接続側は戻り値が true のときだけ再描画し、既存 editor の `scheduleSave` または `store.save()` で保存します。保存待ちの後続入力・再移動を古い state で上書きしません。

日付のある12種類は年月を検証し、単一日付は `date`、期間は終了年月を優先します。終了が空で開始が有効なら「至今」、有効な終了だけでも整列対象とします。同じ終了では開始年月を同方向で比較し、不明な開始は後ろ、不明な終了は全体の末尾、同順位は元の順序を保ちます。空でない不正な終了を「至今」とは扱いません。日付編集後に自動整列しません。

実際の順序変更だけが対象言語・文書の A4／LETTER の sections・records を同じ state 更新で空にし、全ての初期化済み改ページコントローラーの一時フィードバックと旧 undo を失効させます。共有リンクの場合は全言語・全文書・全用紙を空にします。無変化の操作は state・通知・保存・改ページに触れません。UI 接続後の三言語・全用紙の統合受入は親 Issue の受入条件に従います。

### 共通の折りたたみ・キーボード操作

`createSortableLists({ store, locale, announce })`（`ui/sortable-lists.js`）は14種類の登録済みリストだけを扱います。`registerList({ target, container, toolbar, itemLabel, getSummary, render, scheduleSave, isBlocked })` で editor adapter を登録し（controller 内で同じ target の有効 binding は一つ）、`sync([{ element, body, actions }], { change })` へ現在の直属行・既存の本文 node・既存操作 button を渡します。見出しと操作入口だけを追加し、入力欄や削除確認 callback を作り直しません。入力時の摘要は state から純粋な文字列を返す `getSummary` で更新します。

`move(from, to)` と手柄の上下キー／操作入口の上・下 button は `store.reorderList` を呼びます。実変更時だけ `render({ from, to })` が対象リストを同期再描画して `sync` を呼び、その後に従来の `scheduleSave` を呼びます。移動先の手柄へ focus と番号を戻し、対象範囲に実際の改ページがあったときだけ解除を通知します。`isBlocked` は後続のドラッグ等の adapter 側処理、import pending と composition は共通側で検査します。本文の方向キーは取り扱いません。

勤務先と中英文職歴の折りたたみは既存 record ID、ID のない行は一時配列で保持します。追加／削除した adapter は更新後の `sync` に `{ change: { type: 'insert' | 'remove', index } }` を渡します。移動は共通側で同じ一時配列を移動します。匿名行の不明な構造変更は全展開へ戻し、同じ本文を identity として推測しません。会社詳細の状態は `careerId` ごとに分離し、親行の折りたたみは詳細を変えません。親の再描画で詳細 binding を破棄・再登録しても同じ controller 内の状態は保持し、会社削除時には消します。

`replace`・import・reload・sample・restore・reset で旧状態を破棄します。再描画前の古い行では移動できず、単なる保存完了では折りたたみを変更しません。import の保存失敗では草稿と fold を維持し、pending 解除後に移動操作を復帰させます。`list.destroy()` は行装飾と listener を外し既存操作を元へ戻し、controller の `destroy()` は全登録と一時状態を破棄します。controller を維持した普通の再描画と破棄を区別してください。fold 情報は v4・JSON・保存に入りません。reorder 通知の読み取り専用 `target`・`operation`・`permutation` は移動に伴う一時状態の同期だけに使い、保存 data に入りません。別 controller からの移動・日付整列でも位置 permutation と同じ fold を動かし、無関係なリストを無効にしません。日付整列の UI と三言語 editor は `createEditorLists`（`ui/editor-lists.js`）を通して同じ controller へ接続します。本コンポーネントの browser test は test 内で架空 adapter を組み立て、公開 product route は追加しません。

### 共通の pointer drag

`ui/sortable-drag.js` は手柄から6px以上動いたときだけ同階層を折りたたみます。編集パネルの scroll と必要な一時 spacer で元の viewport anchor を維持し、次の frame でコンパクト行の配置を確定します。その後の pointer move または実際の auto scroll から落点を選び、折りたたみ自体では移動しません。本文の touch-action は変更せず、手柄だけ `none` にします。

実フォームと row の DOM 順序を維持し、摘要だけの浮層・固定高さの占位・heading の短い譲り animation を表示します。落点は transform を持たない直属 row の矩形から計算するため、途中の animation で揺れません。リスト外で離せば取消、元の位置なら無変更です。実際の移動は既存 `move` へ同期で渡し、保存と改ページ解除を確定してから再描画後の row へ着地します。transaction は animation event を待ちません。

Escape とリスト外 drop は元のコンパクト行へ戻ります。pointercancel・capture 喪失・blur・import・store 更新・再描画・view 切替・印刷・破棄では安全を優先して即時に浮層／占位／capture／animation を除去します。単なる save 通知は継続できます。reduced motion は移動・拡大 animation を止め、静的な占位と既存の移動結果の強調を残します。手柄の上下キーと操作 menu の上／下へ移動が同じ transaction の代替です。

Browser test は架空 adapter で desktop Chromium、mobile Chromium／WebKit の長いカード・連続移動・首尾・auto scroll・取消・無 ID／重複・nested isolation を確認します。Chromium の touch は CDP の native input、WebKit の touch／pen 経路は synthetic PointerEvents と区別し、実機の指／pen や性能測定を実施したとは扱いません。

### 三言語の統合受入

同じ順序操作を全リスト・全ブラウザーで繰り返す代わりに、リスクごとに以下の層で確認します。自動 test と人の目視受入は別に記録します。

| リスク | Test と確認内容 | Locale / browser |
| --- | --- | --- |
| 14配列の移動範囲・12日付リストの同日／至今／空／不正年月・無変更 | `tests/list-order.test.js` の各KEYのmove／bounds／date sortingと`period dates rank Present...`／`single dates retain ties...` | 三言語・共有links、Node |
| 実フォームadapterの追加・空行移動・編集・上下移動・削除・日付sort接続 | `issue-275-integration-acceptance.spec.js` の`275 KEY: product CRUD...`。14 targetで実際のadd／入力／move／delete、日付12 targetは2方向buttonと表示年月、ja.education／en.experienceはsort後のpointer dragとCustom復帰 | 三言語・nested detail・共有links、desktop Chromium |
| 有ID／無ID・nested detail・共有linksの暗号化保存／再読込／JSON往復 | 同suiteの`product CRUD, encrypted reload and JSON roundtrip`：ja.education／ja.careers／ja.careerDetails／zh-CN.experience／en.experience／profile.links。完全な変更後配列の永続化後にrefresh | desktop Chromiumの代表6構造、三言語mobile Chromium／WebKitの職歴・links代表 |
| focus・fold・keyboard・composition・重複内容・差し替え／失敗import | `sortable-lists.spec.js` の`shared compact rows...`／`anonymous duplicate rows...`／`company and independent detail folds...`。`editor-list-integration.spec.js` の`product lists use array order and one-time sorting`、会社構成copy・共有linksの固有test | 三言語labels、desktop Chromium・mobile Chromium／WebKit。共通のDOM transactionは代表browser |
| drag閾値・連続移動・首尾・auto scroll・取消後の遅延no-save・motion | `sortable-lists.spec.js` の`pointer drag preserves forms...`／`cancel, no-op, updates and view changes...`／`native Chromium touch...`／`pen and touch pointer paths...`。時計を進めた取消後も保存なし。`275 LOCALE: product long-card drag...`は三言語desktop・English mobile代表 | desktop Chromium・mobile Chromiumのnative CDP touch・mobile WebKitのsynthetic touch／pen |
| 改ページ解除・無変更時保持・非表示controllerの旧undo失効 | `list-order.spec.js` の`reorder invalidates all initialized pagination feedback and detached undo callbacks`：ja.education／ja.careers／ja.careerDetails／zh-CN.experience／en.experience／profile.linksごとに四controllerを初期化し、no-change保持と旧undoを確認。sharedは他の三hostをhiddenにする。issue-275の`already sorted ties...`三言語代表と`cancellations preserve...`はlive previewの改ページclass保持も確認。全14のscopeはNodeで確認 | 三言語、desktop／mobile Chromium |
| 操作後のpreview／PDF順序・末尾・重複・空白／サイズ | issue-275の`275 LOCALE TYPE PAPER LENGTH: reordered preview and every PDF page retain unique markers`はfixtureとmoveから独立に期待を作り、移動結果を先に確認。`list-order.spec.js` の`LOCALE PAPER saved array order survives encrypted reload, preview and PDF`は日付逆順のimportを自動sortしない別前提 | 日本語A4両書類・中文A4・English A4／Letter、desktop Chromium。import順previewはmobile Chromiumも確認 |

```bash
CI=1 npx playwright test tests/e2e/issue-275-integration-acceptance.spec.js tests/e2e/editor-list-integration.spec.js tests/e2e/list-order.spec.js tests/e2e/sortable-lists.spec.js
```

Quality は並べ替え受入の成功時 screenshot／preview／PDF／evidence を生成・uploadしません。必須の自動PDF断言はmemory内の生成・解析で続け、失敗時の screenshot／traceとrelease用artifactは保持します。人の確認は機能実装または関連する表示・印刷変更のPRで対象commit・言語・用紙・画面幅と結果を一度記録し、毎CI後の目視を義務にしません。実機の指／penや性能測定を、自動のnative Chromium touchや合成WebKit PointerEventsの確認として報告しません。

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

Quality は scope、unit/static/lint、browser、documentation-assets を分離し、必須 check `quality` が結果を集約します。Browser は desktop/mobile Chromium を3分片、desktop/mobile WebKit を1 jobで実行し、各 runner は2 workers・retryなしです。全分片を完走させ、分片ごとの blob report と失敗時 screenshot/trace を7日間保存します。通常の docs-only PR は scope 内の文書検証だけを実行します。Main push と明示 SHA の workflow call は常に full gate を実行し、scope failure、取消、意図しない skip は集約で拒否します。

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

CI の確認用出力は一時 directory から Actions artifact に保存し、通常の開発 PR では source / 展示物へ promote しません。Version を変えずに展示 asset だけを変更した PR は拒否します。安定版は公開 PR を作る前に、公式候補 branch の commit を40桁の SHAで固定し、main の `Release candidate assets` workflow で候補 asset を生成します。候補 branch の clean checkout で `npm run promote:candidate-doc-assets -- --source-sha SOURCE_SHA --run-id RUN_ID --run-attempt RUN_ATTEMPT` を実行し、検証済みの screenshot 3件、PDF 3件、manifest の7 fileだけを取り込みます。候補の `site/`・package・generator input は commit 済みでなければならず、変更した場合は新しい固定 SHA から生成し直します。

候補生成は product Quality や公開承認ではありません。完成した公開 PR の Quality は unit/static、lint、browser/PDF acceptance と、documentation-assets job 内の fresh asset 生成・検証、commit 済み LFS object と候補 artifact の exact bytes、version、site、generator/browser、PDF、screenshot の semantic contract を照合します。Asset が先に upload されても、consumer は `quality` 集約の成功を確認するまで採用しません。Merge 後の公開準備は最終 main Quality に対し、各 file と manifest digest、候補 version、site・generator contract、PDF 全文・page、screenshot visual を再検査します。別 browser run の raw bytes 完全一致は要求せず、自動 commit も行いません。

失敗 job だけの再実行では、同じ固定 source SHA の成功済み job と Quality asset を前 attempt から再利用できます。全 job 再実行では同一 run の SHA 名 artifact を新しい生成物で置き換え、manifest は実際に生成した attempt を記録します。候補 asset の厳密な run/attempt/ID/digest 検証は維持します。

Documentation asset manifest の current schema は v4 です。Producer kind、workflow、control SHA、実際の source SHA、run ID、attempt を記録し、artifact ID と archive digest は GitHub API の identity と照合します。Upload 後に決まる値を同じ artifact 内の manifest へ書き戻しません。Release comparison は既存 v3 manifest を従来の Quality producer として read-only で受け取りますが、候補 producer としては扱わず、v3 を更新・再保存しません。この schema は履歴書 data format の `version` とは別契約です。

手元で一時出力だけが必要な場合は `npm run generate:doc-assets -- --output-dir EMPTY_DIRECTORY --source-sha HEAD_SHA --quality-run-id LOCAL_POSITIVE_ID` で source 外の空 directory に生成し、`npm run verify:doc-assets -- --asset-root OUTPUT_DIRECTORY --source-root CHECKOUT --source-sha HEAD_SHA` で検証します。Local の ID と既定 producer 情報は検証用の情報値にすぎず、その出力を公開 PR へ promote しません。公開用 manifest には候補生成または Quality の実 workflow、control/source SHA、run、attempt を設定します。PDF correctness は対象 source の E2E と一時出力で検証し、展示 asset の version 同期とは分けて扱います。

`scripts/prepare-site-artifact.mjs validate --source SITE_DIRECTORY` は source tree を単独で検査する CLI です。Release workflow は `prepare --source SITE_DIRECTORY --output EMPTY_OUTPUT_DIRECTORY` を実行し、この command 内で source を検査してから source 外の新規 directory へ exact copy します。CLI は symlink、非 canonical relative path、unsupported file type、HTML path 不一致、source と重なる output、既存 output を拒否し、source / artifact の SHA-256 tree digest を `GITHUB_OUTPUT` へ記録します。公開 evidence は authorized source SHA、package version、source digest、artifact digest だけを持ちます。

## 配信応答の回帰確認

`node scripts/validate-deployment-smoke.mjs --directory ARTIFACT_DIRECTORY --package-version VERSION` は公開前の artifact の本文を確認します。HTTP 応答や Pages の routing の検証にはなりません。

公開環境では既存の release workflow が `--base-url HTTPS_ORIGIN_ROOT --release-sha SOURCE_SHA --package-version VERSION` で同じ CLI を実行します。公開入口・互換入口・三言語 editor・sitemap・robots・Schema・example・version asset の HTTP 200、Content-Type、本文を検査し、ランダムな未存在 path、nested path、未実装の `llms.txt` / `.well-known/ai-plugin.json`、存在しない Schema / asset は HTTP 404 と三言語の案内を要求します。発見用 path を実装する際は、その成功契約へ移します。

現在の trusted tooling から過去版へ rollback / reconciliation する際、受入済み `0.4.1`・`0.4.2`・`0.4.3` の online smoke は当時の配信契約を維持し、未提供の robots / 404 / stylesheet 契約を要求しません。それ以外の version と、準備中の source / artifact には新しい契約を適用します。任意の skip option はありません。

通常の local static server は 404 ページの表示確認にだけ使い、Cloudflare Pages preview の確認済みとは扱いません。Preview、正式公開後の custom domain と Pages.dev、Agent Readiness の再診断は実行した環境・source SHA・結果を記録し、未実施なら未確認と明記します。Preview と本番公開の実行権限は[リリース手順](release-playbook.md)に従います。
