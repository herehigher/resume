# リリース手順

対象：`herehigher/resume` → [Resume Studio](https://rs.herehigher.com/)。公開用 PR を1件用意し、必要な展示 asset・check・review を揃えたうえで、その PR の merge を本番公開の承認として扱います。

Public release、tag、Pages 設定、repository visibility の変更には owner の明示承認が必要です。通常公開では、version を更新した公開 PR を owner が merge する操作を、その merge 結果 commit の tag 作成と Pages 公開に対する明示承認とします。Merge 後に同じ対象への追加承認や ID・digest の転記は要求しません。Tag は移動・上書き・削除しません。

## 実行入口を選ぶ

| 状態 | 入口 | 実行者 | 完了の判定 |
| --- | --- | --- | --- |
| 新しい安定版を公開する | [通常公開](#通常公開の実行手順) | 担当者が準備し、owner が公開 PR を merge | 両公開 URL の smoke 成功と `release_accepted` |
| 切替後の確認が未完了、または intent が未解決 | [照合](#production-の状態を照合する) | Owner | Identity と smoke の再確認結果が terminal record になる |
| 受入済みの過去版に戻す | [Rollback](#前のバージョンへ戻す) | Owner | Target UUID と両公開 URL の smoke 成功、`rollback_completed` |
| Cloudflare の現在値と記録が異なる | [停止して調査](#停止して調査する) | Owner | Identity と記録の不一致が解消されるまで停止 |

通常公開の資格確認を手動の `Release production` 実行で迂回しません。未確認の状態を成功と推定して記録を修正しません。

## 公開対象

公開先は Cloudflare Pages の Pages.dev と `https://rs.herehigher.com/` です。Version の基準は `package.json`。CHANGELOG の日付は候補を確定した日で、実際の公開時刻は GitHub Actions の run を参照します。日付を跨いだだけで version や test をやり直しません。公開対象は GitHub が記録した PR の merge 結果 commit です。

## 通常公開の実行手順

**入力・開始条件：** 新しい stable SemVer の `VERSION`、候補に入れる変更、認証済み `gh`、公式 repository の最新 `main`、clean な tracked worktree を用意します。担当者が候補と PR を準備し、owner が最終 PR を確認して merge します。

### 1. 事前確認

公開 version を決めたら、Version 更新前に `main` checkout で唯一の事前確認入口 `npm run release:preflight -- --target VERSION` を実行します。

認証済み `gh` session、latest `origin/main` と同じ `main`、clean な tracked worktree、current version とそれより大きい stable SemVer の target version、remote tag、重複する open PR、untracked file を read-only で確認し、結果が `pass` になるまで次へ進みません。

Untracked file は既定で停止し、利用者が必要性を確認した exact relative path だけ `--allow-untracked PATH` を繰り返して許可できます。

`deferred` / `blocked` の扱いは[通常公開が失敗したとき](#通常公開が失敗したとき)を参照します。

### 2. Version と候補 branch

Repository root で `node scripts/set-release-version.mjs VERSION YYYY-MM-DD` を1回実行し、package、lock、APP_VERSION、CHANGELOG の差分を確認します。公開内容を公式 repository の候補 branch へ commit・push し、candidate SHA を40桁の commit SHAで固定します。この時点では公開 PR を作りません。

候補生成 workflow は main に存在する定義だけを使います。この経路を初めて導入するときは、導入 PR を main に merge してから、新しい候補生成と公開を始めます。

### 3. 候補 asset を生成・取り込み

固定した candidate SHA に対しては、候補 branch の clean な checkout で補助 CLI を実行します。

これは official origin、candidate branch、40桁の HEAD、remote branch との一致を確認し、main の `Release candidate assets` を一度だけ起動します。

起動ごとに予測不能な correlation ID を workflow の run title へ固定し、その ID の run だけを待機・照合します。

反映待ち、複数一致、timeout は推測せず停止します。

成功時に表示される run URL と promotion command をそのまま使います。

補助 CLI は artifact を候補 checkout へ取り込まず、release state も保存しません。

```bash
npm run release:candidate-assets
```

表示された promotion command は、固定済みの candidate SHA、run ID、attempt を含みます。同じ candidate SHA の clean checkout で実行します。

```bash
npm run promote:candidate-doc-assets -- \
  --source-sha CANDIDATE_SHA \
  --run-id RUN_ID \
  --run-attempt RUN_ATTEMPT
```

Promotion 入口は公式 repository、workflow、control SHA、source SHA、run ID、attempt、artifact ID、digest を照合します。Artifact が空、複数、失効、古い attempt、SHA 不一致の場合や、候補 asset に未 commit の変更がある場合は停止します。

反映するのは `docs/screenshots/{en,ja,zh-CN}.png` の3 file、`output/pdf/{en-letter,ja-a4,zh-CN-a4}.pdf` の3 file、`docs/assets-manifest.json` の計7 fileだけです。表示された file を目視・review し、候補 branch へ commit します。Manifest の `source.checkoutCommit` は生成元の情報値なので、asset を取り込んだ後の branch head に手作業で書き換えません。

候補内容を変更した場合は、新しい candidate SHA で workflow と promotion をやり直します。別 SHA の artifact を流用しません。

### 4. 完成した公開 PR

Version、CHANGELOG、公開内容、7 fileが揃った候補 branch から公開 PR を1件作ります。公開 PR の作成・更新には [contribution の安全な本文作成例](../CONTRIBUTING.md#issue-pr-の本文を安全に渡す) と同じ temporary file と `--body-file` を使います。実在する履歴書 data、credential、token、test の raw log は書かず、架空 data を使った検証結果の要約と未確認事項だけを記載します。

Asset-only の追補 commit に fast path は設けません。最終 PR head の `Quality` を成功させます。`quality` は候補 artifact と commit 済み7 fileの exact bytes、最終 PR の fresh evidence を照合します。Version を変えない PR で展示 asset を変更してはいけません。

### 5. 承認して公開を確認する

Version、変更内容、必要な目視結果、`Quality` を所有者が確認し、公開 PR を main へ merge します。この merge が、GitHub が記録した merge 結果 commit の tag 作成と Pages 公開に対する承認です。

通常公開では [Release production](https://github.com/herehigher/resume/actions/workflows/release.yml) を手動実行しません。

Merge 結果 commit の main Quality が成功すると `Release eligibility` が公開資格を確認し、該当する公開 PR の場合だけ `Release production` を開始します。

通常の main 更新は資格確認で終了し、`Release production` の run を作りません。

公開時は immutable tag、同じ workflow run が準備した単一の artifact、Cloudflare preview smoke、production Direct Upload、Pages.dev と custom domain の online smoke へ進みます。

成功後に GitHub Deployments の production 記録へ tag、SHA、site artifact digest、run、Cloudflare deployment ID / URL を保存し、Summary で各 URL、結果、未確認事項を確認します。

**成功判定：** 両公開 URL の application・online editor smoke が成功し、最新の production 記録が `release_accepted` なら完了です。

候補生成や Quality の失敗は該当 step を修正し、候補 source を変えた場合は新しい SHA で候補生成からやり直します。

Merge 後の一時的な実行障害は該当 run を再実行し、内容・契約の不一致は新しい修正 PR で直します。

切替後の smoke failure は[照合](#production-の状態を照合する)または[前の版への復旧](#前のバージョンへ戻す)に進みます。

## 変更内容に応じた確認

| 変更 | 目視するもの |
| --- | --- |
| Version の更新 | 三言語の展示 screenshot にある version 表示と manifest。PDF の目視は PDF に影響する変更がなければ不要 |
| 文書、公開 script のみ | 原則不要。変更内容と CI 結果を確認 |
| 画面、文言、操作 | 対象言語と desktop / smartphone 相当幅の変更画面 |
| PDF、template、font、公開 sample | 対象言語・用紙の全 PDF page。文字切れ、重なり、改ページ、末尾欠落 |

詳しい確認条件と展示 sample の扱いは[開発ガイド](development-guide.md#表示pdf-の目視)を参照します。必要な結果と差異だけを PR / run に残し、自動 test、agent の目視、人の受入判断、未確認を分けます。確認用画像・PDF は CI artifact から取得します。通常の開発 PR では展示 sample を更新せず、安定版の公開 PR では tag 内の version と画面を一致させるため毎回 commit します。

## Production の状態を照合する

**入口と入力：** Owner が `main` から [Reconcile Cloudflare production intent](https://github.com/herehigher/resume/actions/workflows/reconcile-production.yml) を起動します。

対象は未解決 intent または `*_unverified` の状態です。

[台帳の確認方法](#台帳の確認方法)で最後の event、対象 tag、current deployment ID を確認してから実行します。

入力値の推測や record の手修正はしません。

**操作：** Workflow は owner identity、production lock、台帳と Cloudflare current deployment を確認します。切替前なら元の identity を確認して失敗を terminal record に残します。切替後なら Pages.dev と custom domain の application・online editor smoke を再実行します。

**成功判定・失敗時：** 最新 event が `production_verified`、`release_accepted`、`rollback_completed` なら切替後の確認が完了です。

切替前なら `*_failed_before_*` と元の production identity を確認します。

Smoke が再び失敗すれば `*_unverified` が残ります。

恒久的な内容不良が `release_unverified` になった場合は[明示的な rollback](#前のバージョンへ戻す)を使います。

`rollback_unverified`、不明な current identity、記録の欠落は自動復旧せず[停止して調査](#停止して調査する)します。

## 通常公開が失敗したとき

| 状態 | 次の操作 |
| --- | --- |
| Preflight が `deferred` / `blocked` | Summary の理由を直して再実行。`pass` まで version を変更しない |
| 候補生成・promotion の失敗 | Candidate SHA、run ID、attempt、artifact provenance を確認。失効したら同じ SHA で再生成し、内容を直したら新しい SHA からやり直す |
| 候補 CLI の待機中断 | Clean な候補 checkout で `npm run release:candidate-assets -- --run-id RUN_ID --source-sha CANDIDATE_SHA`。表示済みの同じ run だけを再照合する |
| PR Quality の失敗 | 該当 step と summary を確認し、内容・7 file・候補 artifact を修正。Source SHA が変われば候補生成からやり直す |
| Merge 後の Quality・準備失敗 | 一時障害は該当 run を再実行。内容・契約の不一致は新しい修正 PR を作る |
| 資格・artifact・tag の不一致 | 手動 dispatch や別 artifact で迂回しない。修正 PR または同じ tag / commit の再開を、失敗した step に応じて選ぶ |
| Production 切替後の smoke failure | [照合](#production-の状態を照合する)。恒久的な `release_unverified` は[明示的な rollback](#前のバージョンへ戻す) |
| Record 書込み失敗・current identity の不一致 | [停止して調査](#停止して調査する)。SHA だけで accepted にしない |

## 前のバージョンへ戻す

**入口と入力：** Owner が `main` から [Roll back Cloudflare production](https://github.com/herehigher/resume/actions/workflows/rollback-production.yml) を実行します。

`target_tag` は台帳中の受入済み過去版を指定します。

通常時は `recover_unverified_release` を既定の `false` のままにします。

恒久的な公開 smoke failure で `release_unverified` の場合だけ、この option を `true` にして明示的に復旧を選びます。

未解決 intent と `rollback_unverified` は、この入口では拒否されます。

**操作：** Owner identity と `main`、`pages-production` lock、`production` environment を使います。

Workflow は台帳の完全性、Cloudflare の current UUID・URL・source SHA、target の受入済み UUID・URL・source SHA を確認します。

`release_unverified` からの復旧では現在の deployment がその未確認 release の記録と完全一致すること、上記 option が `true` であることを追加で要求します。

Rollback intent を記録してから Cloudflare Pages native rollback API を呼び、Pages.dev と custom domain の application・online editor smoke を実行します。

**成功判定：** API 応答 ID と project の current `latest_deployment.id` が accepted target UUID に完全一致し、両 URL の smoke が成功して最新台帳 event が `rollback_completed` なら完了です。Summary の from/to tag、UUID、run URL も確認します。

**失敗時：** 切替前なら `rollback_failed_before_switch` と元の production identity を確認します。切替後の smoke failure、ID 不一致、record 書込み障害は `rollback_unverified` または未解決 intent として後続の production 操作を止め、[照合](#production-の状態を照合する)します。自動でさらに戻しません。通常公開 run を再実行して既存 accepted tag を再配布しません。

この入口は ledger に受入済みの Cloudflare production deployment だけを許可します。

GitHub Pages 時代の `v0.2.2` は rollback 対象ではありません。

旧 source の canonical / hreflang、旧 Analytics state と disclosure、schema v1 は現行 root hosting・privacy・schema v4 contract に適合しません。

旧 tag と code は保持しますが、新しい公開 artifact として再配布しません。

## 停止して調査する

Cloudflare current deployment の ID・URL・source SHA と台帳が異なる場合、record が欠ける場合、または照合・rollback の intent が未解決のまま残る場合は production 操作を停止します。

Owner は該当 Actions run、[台帳](#台帳の確認方法)、Cloudflare project の current deployment を照合します。

推測で記録・tag・deployment を書き換えません。

切替後の release の upload identity を記録できなかった場合、SHA だけで accepted にしません。

Identity と記録を確定できなければ、この手順だけでは再開できません。

## 初回設定・設定変更時だけ行うこと

- Cloudflare Pages の Direct Upload project、production branch `main`、custom domain の DNS / HTTPS、Web Analytics 配信、GitHub Actions の account / project variables と API token secret を用意します。Git Integration による push deploy は使いません。通常公開では project 設定を変更しません。
- Main の merge ruleset が要求する check は `quality` です。Workflow の environment は `production`。公開 PR の owner merge が通常公開の承認です。
- GitHub Pages は停止済みで `github-pages` environment は削除済みです。旧 URL は 404、repository homepage は `https://rs.herehigher.com/`。設定の owner 記録は [#253](https://github.com/herehigher/resume/issues/253#issuecomment-5889977750) を参照します。
- Local の GitHub 操作には認証済み `gh` session を使います。Sandbox で credential provider を利用できない場合は許可された sandbox 外で実行し、token は抽出・export・複製しません。

原案は [#113](https://github.com/herehigher/resume/issues/113)、過去の障害・移行経緯は [#112](https://github.com/herehigher/resume/issues/112) にあります。

## 自動化の契約（参照）

- 候補生成 workflow は `main` の定義を使います。候補 branch、40桁の source SHA、run ID・attempt、artifact ID・digest を照合し、複数一致、失効、不一致は停止します。候補 workflow は product Quality や公開承認の代わりではありません。この経路の初導入時は、workflow の導入 PR を先に `main` へ merge します。
- 公開 PR と merge 結果の `main` で full Quality を実行します。PR の `quality` は commit 済み7 file と候補 artifact の exact bytes を照合し、fresh に生成した version・site・generator・browser・PDF・screenshot の契約も確認します。別 run の Chromium raster bytes の完全一致は要求しません。Version を変えない PR の展示 asset 変更は拒否します。
- `Release eligibility` は official main Quality、full Quality、merge 結果 SHA、唯一の merged PR、PR base からの version 変更、current main version を確認します。通常の main 更新では `Release production` を開始しません。公開時も後続の main tip や PR head に切り替えません。
- `Release production` は資格を再確認し、同じ run の exact artifact を prepare・publish・deploy に使います。`site/` の path、file type、symlink、relative path を検査して exact copy し、source SHA、version、source digest、artifact digest を記録します。Source と artifact の digest が異なれば停止します。承認後の rebuild・差替えはありません。
- Production lock 内で current Cloudflare deployment と受入済み台帳を照合し、切替前に durable intent を記録します。Preview branch への Direct Upload と smoke が成功してから production へ upload します。Cloudflare の production branch `main` は配信先の設定値で、公開 source は承認済み tag・SHA・artifact で固定します。
- 公開後は Pages.dev と custom domain の HTTP、version、locale、metadata、sitemap、Schema、架空 example、online editor を確認します。配信先で加工された response bytes と artifact digest の完全一致は要求しません。Summary には tag、SHA、artifact digest、run URL、公開 URL、結果、未確認事項を残します。
- GitHub Deployments の `production-records` 環境、`production-record` task が監査記録です。Workflow は Actions bot、record の ref / SHA、元 run / workflow / attempt、連続 sequence を検証します。欠落・重複・未解決 intent・外部変更は fail-closed です。Rollback 後に開始された release run より古い待機中 run も拒否します。

### 台帳の確認方法

Intent は本番変更前の開始記録、ledger は sequence 順の記録列です。認証済み `gh` で監査用 Deployment を読み、表示順に依存せず最大 sequence の event を確認します。`*_started` は未解決、`*_unverified` は切替後の確認未完了です。Cloudflare current ID と `currentDeploymentId` も照合します。固定 baseline の v0.4.1 / v0.4.2 はこの一覧には表示されません。

```bash
gh api --paginate 'repos/herehigher/resume/deployments?environment=production-records&per_page=100' \
  --jq '.[] | select(.task == "production-record") | (.payload | if type == "string" then fromjson else . end) | {sequence,event,tag,runId,currentDeploymentId}'
```

### 固定済み baseline

2026-09-30 に owner が [Accept existing Cloudflare production baseline](https://github.com/herehigher/resume/actions/runs/36651727138) で v0.4.1 と v0.4.2 の tag、source、artifact、Cloudflare identity、current v0.4.2 を受入れました。

固定 UUID は v0.4.1 が `6968466e-88e8-4156-94e7-39d81a45add8`、v0.4.2 が `571384f3-3869-46d3-9af3-80c364bc1ef2` です。Issue #252 の二つの comment は履歴証拠として保持し、通常公開では読み書きしません。旧 baseline workflow の再実行は現行 v0.4.2 と固定記録が一致するときの read-only 確認だけです。

### Analytics の扱い

Repository source、clone、fork は Analytics beacon を含みません。2026-09-29 の公式 current v0.4.2 Pages.dev と custom domain の root、`/editor/` response には Cloudflare Pages delivery layer の `beacon.min.js` と `data-cf-beacon` が各1件ありました。履歴書入力、写真、JSON、端末内草稿は Analytics request に含めません。利用者向け説明は [PRIVACY.md](../PRIVACY.md) を参照します。

`PRODUCTION_ORIGIN` は repository variable と `scripts/deployment-path-contract.mjs` の両方で `https://rs.herehigher.com/` に固定します。Smoke は app 管理の path・metadata・JSON・online editor を検証し、beacon の配信と provider-side processing は Cloudflare Pages の責任範囲です。#251 の live hosting 完了判定には、最初の正式 release run の preview・production smoke 成功が必要です。
