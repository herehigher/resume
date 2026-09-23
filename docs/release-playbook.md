# リリース手順

対象：`herehigher/resume` → [Resume Studio](https://rs.herehigher.com/)。公開用 PR を1件用意し、必要な展示 asset・check・review を揃えたうえで、その PR の merge を本番公開の承認として扱います。

Public release、tag、Pages 設定、repository visibility の変更には owner の明示承認が必要です。通常公開では、version を更新した公開 PR を owner が merge する操作を、その merge 結果 commit の tag 作成と Pages 公開に対する明示承認とします。Merge 後に同じ対象への追加承認や ID・digest の転記は要求しません。Tag は移動・上書き・削除しません。

## 公開の全体像

「担当者」は開発者または依頼を受けた agent、「所有者」は production 公開を承認する人です。配布物は Pages に置く HTML / CSS / JavaScript 一式です。

| 順番 | 担当 | 操作 | 次へ進む条件 |
| --- | --- | --- | --- |
| 1 | 担当者 | 変更範囲と公開 version を決める | 安定版番号が決まっている |
| 2 | 担当者 | 公式 repository の候補 branch で version、CHANGELOG、公開内容を commit する | 候補 source が40桁の commit SHAで固定されている |
| 3 | CI・担当者 | 候補 asset を生成・取り込み、7 fileを目視して候補 branch へ commit する | 展示 asset が候補 version・site bytes・生成契約と一致する |
| 4 | 担当者・CI | 完成した公開 PR を1件作り、`Quality` と review を完了する | `quality` に含まれる fresh 検証と候補 artifact の照合が成功する |
| 5 | 所有者 | Version・変更内容・必要な目視結果を確認し、公開 PR を main へ merge して本番公開を承認する | 対象の merge 結果 commit が確定し、追加の公開承認なしで自動処理へ進める |
| 6 | CI | Main Quality の成功後に `Release eligibility` が Quality run、merged PR、version を照合する | 承認済み公開 PR の source だけが `Release Pages` へ渡る |
| 7 | CI | `Release Pages` が資格を再確認し、同じ commit の Quality 展示 asset を照合して配布物を生成・検査し、immutable tag を作成・deploy する | Tag、commit、配布物が一致する |
| 8 | CI・担当者 | 公開 URL の自動検査と summary を確認する | Deploy と online smoke が成功する |

通常公開で実行する full Quality 2回は、完成した公開 PR と merge 結果の main が対象です。候補生成 workflow は展示 asset だけを生成・検証し、product Quality や公開承認の代わりにはなりません。公開までの asset 生成は候補、最終 PR、main の3回です。

Version の基準は `package.json`。CHANGELOG の日付は RC を確定した日であり、実際の公開時刻は GitHub の実行記録を参照します。日付跨ぎだけで version や test をやり直しません。対象は GitHub が merged PR に記録した結果 commit であり、その後の main tip や PR head に切り替えません。

## 通常公開の実行手順

### 1. 事前確認

公開 version を決めたら、Version 更新前に `main` checkout で唯一の事前確認入口 `npm run release:preflight -- --target VERSION` を実行します。認証済み `gh` session、latest `origin/main` と同じ `main`、clean な tracked worktree、current version とそれより大きい stable SemVer の target version、remote tag、重複する open PR、untracked file を read-only で確認し、結果が `pass` になるまで次へ進みません。Untracked file は既定で停止し、利用者が必要性を確認した exact relative path だけ `--allow-untracked PATH` を繰り返して許可できます。`deferred` / `blocked` の扱いは「失敗したとき」を参照します。

### 2. Version と候補 branch

Repository root で `node scripts/set-release-version.mjs VERSION YYYY-MM-DD` を1回実行し、package、lock、APP_VERSION、CHANGELOG の差分を確認します。公開内容を公式 repository の候補 branch へ commit・push し、candidate SHA を40桁の commit SHAで固定します。この時点では公開 PR を作りません。

候補生成 workflow は main に存在する定義だけを使います。この経路を初めて導入するときは、導入 PR を main に merge してから、新しい候補生成と公開を始めます。

### 3. 候補 asset を生成・取り込み

固定した candidate SHA に対しては、候補 branch の clean な checkout で補助 CLI を実行します。これは official origin、candidate branch、40桁の HEAD、remote branch との一致を確認し、main の `Release candidate assets` を一度だけ起動します。起動ごとに予測不能な correlation ID を workflow の run title へ固定し、その ID の run だけを待機・照合します。反映待ち、複数一致、timeout は推測せず停止します。成功時に表示される run URL と promotion command をそのまま使います。補助 CLI は artifact を候補 checkout へ取り込まず、release state も保存しません。

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

通常公開では [Release Pages](https://github.com/herehigher/resume/actions/workflows/release.yml) を手動実行しません。Merge 結果 commit の main Quality が成功すると `Release eligibility` が公開資格を確認し、該当する公開 PR の場合だけ `Release Pages` を開始します。通常の main 更新は資格確認で終了し、`Release Pages` の run を作りません。公開時は immutable tag、同じ workflow run が準備した単一の artifact、deploy、online smoke へ進みます。Summary の tag、commit、run、公開 URL、結果、未確認事項を確認して完了です。

## 変更内容に応じた確認

| 変更 | 目視するもの |
| --- | --- |
| Version の更新 | 三言語の展示 screenshot にある version 表示と manifest。PDF の目視は PDF に影響する変更がなければ不要 |
| 文書、公開 script のみ | 原則不要。変更内容と CI 結果を確認 |
| 画面、文言、操作 | 対象言語と desktop / smartphone 相当幅の変更画面 |
| PDF、template、font、公開 sample | 対象言語・用紙の全 PDF page。文字切れ、重なり、改ページ、末尾欠落 |

詳しい確認条件と展示 sample の扱いは[開発ガイド](development-guide.md#表示pdf-の目視)を参照します。必要な結果と差異だけを PR / run に残し、自動 test、agent の目視、人の受入判断、未確認を分けます。確認用画像・PDF は CI artifact から取得します。通常の開発 PR では展示 sample を更新せず、安定版の公開 PR では tag 内の version と画面を一致させるため毎回 commit します。

## 自動で確認・記録すること

CI は保存・読込・言語分離・PDF・データ保護、version、source SHA、site bytes、asset の生成・semantic contract と各 artifact 自身の digest を検証します。公開後は主要 path の HTTP、version、locale、metadata、sitemap、Schema、架空 example と editor の基本操作を確認します。

PR の `quality` は manifest が示す候補 artifact を取得し、commit 済みの7 file が promotion 元 artifact の exact bytes と一致することを先に確認します。そのうえで、同じ job が fresh に生成した artifact を使い、version、site、generator、browser、PDF、screenshot の契約と照合します。別 run の Chromium rasterization bytes の完全一致は要求しません。Asset が未準備、不一致、失効している場合は `quality` を失敗させます。Version を変えない PR の展示 asset 変更も拒否します。

Merge 後の `Release eligibility` は official main Quality の完了・成功、full Quality、対象 SHA、対応する唯一の merged PR、PR base からの version 変更、current main version を照合します。照合不能な状態は失敗し、通常の main 更新と current main version に一致しない release は `Release Pages` を開始しません。`Release Pages` は渡された Quality run ID から同じ資格を再確認します。Prepare、publish、deploy は同じ workflow run の exact artifact を再検証して使い、承認後に rebuild や差し替えを行いません。Production lock の取得後にも current main version を確認し、新しい version の後から古い version を deploy しません。

Summary は tag、commit、artifact の識別情報・digest、run URL、公開 URL、結果、未確認事項を記録します。通常の公開で別の管理 Issue、手入力の hash 一覧、digest 転記用 PR は不要です。

## Analytics の扱い

Repository source、clone、fork は Analytics beacon を含みません。公式 hosted site では Cloudflare Pages の delivery layer が Cloudflare Web Analytics を挿入します。アプリは履歴書入力、写真、JSON、端末上の草稿を Analytics request に含めません。画面の説明は [PRIVACY.md](../PRIVACY.md) を参照します。

`PRODUCTION_ORIGIN` は GitHub Actions の repository variable と `scripts/deployment-path-contract.mjs` の両方で `https://rs.herehigher.com/` に固定します。公開 smoke は custom domain の root URL と app が管理する path / metadata / JSON contract を確認します。Analytics beacon の配信と provider-side processing は Cloudflare Pages の責任範囲です。

現行 `Release Pages` workflow はまだ GitHub Pages の deployment action を使い、この変更だけでは Cloudflare Pages の delivery-layer injection を実証しません。Transport の Direct Upload への切替は #251 の範囲です。切替後に pages.dev と custom domain の両方で hosted smoke と Analytics injection を確認するまで、production hosting contract の実測完了とは扱いません。

Artifact の整合性は引き続き source と配布物の SHA-256 digest で検証し、CI evidence に記録します。事前計算、manifest 回写、再 merge、承認後の再 build は行いません。

## 失敗したとき

| 状態 | 次の操作 |
| --- | --- |
| Release preflight: `deferred` | summary の `check` / `reason` に従って local、target、または重複 object を修正して再実行する。`pass` になるまで Version 更新へ進まない |
| Release preflight: `blocked` | `gh` / fetch / credential capability を復旧して再実行する。成功を推定せず、`pass` になるまで Version 更新へ進まない |
| 候補生成 workflow の失敗 | Candidate SHA と branch、generator、依存関係を確認する。候補内容を直した場合は新しい SHA、run、attempt で生成し直す |
| 候補生成 CLI の待機が中断 | 同じ clean な candidate checkout で、表示済みまたは Actions run URL の run ID と候補 SHA を明示して再開する。CLI は同じ repository、workflow、event、run が記録した main control ref、成功結果、attempt、artifact、manifest provenance を再照合する。再開時に current main が進んでいても、別の control ref へ置き換えない。例：`npm run release:candidate-assets -- --run-id RUN_ID --source-sha CANDIDATE_SHA` |
| 候補 artifact が失効・不一致 | 同じ固定 SHA で候補生成 workflow を再実行し、新しい run と attempt を指定して promotion する。別 artifact を代用しない |
| PR の Quality 失敗 | Product・test・generator、または release asset の source SHA、run、attempt、artifact、digest、7 fileの不一致を該当 step と summary で確認する。修正で candidate SHA が変わった場合は候補生成と promotion からやり直す |
| Release eligibility の失敗 | Quality run、repository・workflow・SHA、full Quality、merged PR、base / current version の照合結果を確認する。Release Pages を手動で迂回しない |
| Main Quality・公開準備の失敗 | Merge 後の一時的実行障害だけなら該当 run を再実行。内容・契約の不一致なら新しい修正 PR で直す |
| 準備済み artifact の失効・不一致 | 公開を停止。同じ release commit の Quality または Release Pages を再実行し、新しい run 内で準備からやり直す。別 artifact を黙って代用しない |
| Tag 作成後の deploy failure | 同じ tag / commit / artifact で再開。別 SHA の同名 tag は拒否 |
| Deploy 後の smoke failure | 「公開済み・確認未完了」。自動 rollback はない。一時障害は再検査、内容不良は新しい修正 version を公開する |
| 公開内容の修正 | 修正 PR と新しい version を用意。既存 tag を変更しない |

### 前のバージョンへ戻す

新しい release の deploy 後に一時障害が起きた場合は、同じ immutable tag・commit・artifact を持つ Release Pages run を再実行します。Artifact が失効している場合は、新しい Quality run が作った artifact から同じ source を再準備し、既存 tag が同じ commit を指すことを確認して deploy を再開します。内容不良は修正 PR と新しい version で直します。

現在の Release Pages workflow は、過去の tag を custom-domain root へ復旧する入口を持ちません。旧 `v0.2.2` の source は GitHub Pages `/resume/` の canonical / hreflang、旧 Analytics state と disclosure、schema v1 を含み、現行 root hosting・privacy・schema v4 contract に適合しません。古い tag とその code は変更せず保持しますが、新しい公開 artifact としては再配布しません。旧 source を root 向けに移行する正式な検証・受入れが必要な場合は、別途 migration を行い新しい version として公開します。

## 初回設定・設定変更時だけ行うこと

Pages の Source を GitHub Actions にし、公開先と HTTPS、job permissions、production 承認方法、Analytics の公開設定を用意します。Main の merge ruleset が要求する check は `quality` です。通常公開では設定を変更しません。現行 `github-pages` environment は main / stable tag の branch policy だけで required reviewer はないため、environment による承認待ちを前提にしません。公開 PR の merge が通常公開の承認です。Release Pages は承認済みの eligible Quality run だけを受け付け、legacy tag の復旧入力はありません。

Local の GitHub query / PR 操作には認証済み `gh` session を使います。Sandbox で credential provider を利用できない場合は、許可された sandbox 外の実行へ切り替えます。Token を抽出・export・複製せず、特定 OS の credential backend は要件にしません。

この手順は [#113 の固定原稿](https://github.com/herehigher/resume/issues/113) を実装に合わせて採用したものです。過去の障害・移行経緯は [#112](https://github.com/herehigher/resume/issues/112) を参照します。
