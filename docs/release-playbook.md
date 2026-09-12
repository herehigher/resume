# リリース手順

対象：`herehigher/resume` → [Resume Studio](https://herehigher.github.io/resume/)。公開用 PR を1件用意し、必要な展示 asset・check・review を揃えたうえで、その PR の merge を本番公開の承認として扱います。

Public release、tag、Pages 設定、repository visibility の変更には owner の明示承認が必要です。通常公開では、version を更新した公開 PR を owner が merge する操作を、その merge 結果 commit の tag 作成と Pages 公開に対する明示承認とします。Merge 後に同じ対象への追加承認や ID・digest の転記は要求しません。Tag は移動・上書き・削除しません。

## 公開の全体像

「担当者」は開発者または依頼を受けた agent、「所有者」は production 公開を承認する人です。配布物は Pages に置く HTML / CSS / JavaScript 一式です。

| 順番 | 担当 | 操作 | 次へ進む条件 |
| --- | --- | --- | --- |
| 1 | 担当者 | 変更範囲と公開 version を決める | 安定版番号が決まっている |
| 2 | 担当者 | Version 更新機能で関連 file を同期し、CHANGELOG をまとめ、公開 PR を1件作る | Version と変更内容が一致する |
| 3 | CI・担当者 | Quality が生成した画像・PDFを公開 PR へ取り込み、再実行した check と review を完了する | 展示 asset が候補 version・site bytes・生成契約と一致し、各 file の digest が自身の manifest と一致する |
| 4 | 所有者 | Version・変更内容・必要な目視結果を確認し、公開 PR を main へ merge して本番公開を承認する | 対象の merge 結果 commit が確定し、追加の公開承認なしで自動処理へ進める |
| 5 | CI | Merge 結果 commit の main Quality 成功を待ち、PR の base からの version 変更と merged PR を照合する | 通常の main 更新ではなく、承認済み公開 PR の source だと確認できる |
| 6 | CI | 同じ commit の Quality 展示 asset を照合し、配布物を生成・検査して immutable tag を作成・deploy する | Tag、commit、配布物が一致する |
| 7 | CI・担当者 | 公開 URL の自動検査と summary を確認する | Deploy と smoke が成功する |

Version の基準は `package.json`。CHANGELOG の日付は RC を確定した日であり、実際の公開時刻は GitHub の実行記録を参照します。日付跨ぎだけで version や test をやり直しません。対象は GitHub が merged PR に記録した結果 commit であり、その後の main tip や PR head に切り替えません。

## 通常公開の実行手順

### 1. 事前確認

公開 version を決めたら、Version 更新前に `main` checkout で唯一の事前確認入口 `npm run release:preflight -- --target VERSION` を実行します。認証済み `gh` session、latest `origin/main` と同じ `main`、clean な tracked worktree、current version とそれより大きい stable SemVer の target version、remote tag、重複する open PR、untracked file を read-only で確認し、結果が `pass` になるまで次へ進みません。Untracked file は既定で停止し、利用者が必要性を確認した exact relative path だけ `--allow-untracked PATH` を繰り返して許可できます。`deferred` / `blocked` の扱いは「失敗したとき」を参照します。

### 2. Version と公開 PR

Repository root で `node scripts/set-release-version.mjs VERSION YYYY-MM-DD` を1回実行し、package、lock、APP_VERSION、CHANGELOG の差分を確認して1件の公開 PR に含めます。

公開 PR の作成・更新には [contribution の安全な本文作成例](../CONTRIBUTING.md#issue-pr-の本文を安全に渡す) と同じ temporary file と `--body-file` を使います。実在する履歴書 data、credential、token、test の raw log は書かず、架空 data を使った検証結果の要約と未確認事項だけを記載します。

### 3. 展示 asset を取り込む

Version 更新を push し、PR の `Quality` が成功したら、候補 branch の clean checkout で `npm run promote:pr-doc-assets -- --pr PR_NUMBER` を実行します。run ID を直接指定する場合は、代わりに `--quality-run-id QUALITY_RUN_ID` を使います。この入口は公式 repository の current PR merge ref、成功した Quality run、artifact、manifest を一意に照合し、空・複数・失効・不一致では停止します。

反映するのは `docs/screenshots/{en,ja,zh-CN}.png` の3 file、`output/pdf/{en-letter,ja-a4,zh-CN-a4}.pdf` の3 file、`docs/assets-manifest.json` の計7 fileだけです。表示された file を目視・review し、同じ公開 PR へ commit します。Manifest の `source.checkoutCommit` は生成元の情報値なので、asset を取り込んだ後の PR head に手作業で書き換えません。

Asset-only の追補 commit に fast path は設けません。最終 PR head の `Quality` と `Release assets current` をどちらも成功させます。Version を変えない PR で展示 asset を変更してはいけません。判断の経緯は [#178](https://github.com/herehigher/resume/issues/178) を参照します。

### 4. 承認して公開を確認する

Version、変更内容、必要な目視結果、`Quality` と `Release assets current` を所有者が確認し、公開 PR を main へ merge します。この merge が、GitHub が記録した merge 結果 commit の tag 作成と Pages 公開に対する承認です。

通常公開では [Release Pages](https://github.com/herehigher/resume/actions/workflows/release.yml) を手動実行しません。Merge 結果 commit の main Quality が成功すると、immutable tag、同じ workflow run が準備した単一の artifact、deploy、online smoke へ自動的に進みます。Summary の tag、commit、run、公開 URL、結果、未確認事項を確認して完了です。

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

PR の `Release assets current` は manifest が示す Quality artifact を再取得し、commit 済みの7 file が promotion 元 artifact の exact bytes と一致することを先に確認します。そのうえで、最終 PR head の Quality が fresh に生成した artifact を使い、version、site、generator、browser、PDF、screenshot の契約と照合します。別 run の Chromium rasterization bytes の完全一致は要求しません。Version を変えない PR の展示 asset 変更は拒否します。

Merge 後の Release Pages は merge 結果 commit の main Quality、PR の base からの version 変更、対応する merged PR、current main version を照合します。通常の main 更新や古い release commit の Quality 再実行からは公開を開始しません。Prepare、publish、deploy は同じ workflow run の exact artifact を再検証して使い、承認後に rebuild や差し替えを行いません。Production lock の取得後にも current main version を確認し、新しい version の後から古い version を deploy しません。

Summary は tag、commit、artifact の識別情報・digest、run URL、公開 URL、結果、未確認事項を記録します。通常の公開で別の管理 Issue、手入力の hash 一覧、digest 転記用 PR は不要です。

## Analytics の扱い

Source は既定で無効です。公式 CI だけが設定 manifest の mode / provider に従って標準 Cloudflare Web Analytics を配布物へ追加し、公開画面で利用を明示します。公式以外の repository は disabled の source-identical artifact だけを許可します。

公開 beacon site token は repository variable `CLOUDFLARE_WEB_ANALYTICS_TOKEN` から渡す通常の site 設定です。存在、書式、安全な埋込みを検証し、専用の秘密管理・fingerprint・承認・ログ検査は設けません。GitHub 認証情報やアカウント操作用 API token は実 credential として保護します。

許可する外部 runtime は `https://static.cloudflareinsights.com/beacon.min.js` の GET と `https://cloudflareinsights.com/cdn-cgi/rum` の標準 POST です。履歴書入力・写真・import/export JSON・草稿・custom event・利用者単位 ID を送信する変更は認めません。Cookie、localStorage、fingerprinting を追加しません。固定 URL や HTML digest は第三者 script 内容を固定するものではありません。利用者向け説明は [PRIVACY.md](../PRIVACY.md) を参照します。

Analytics 有効時は、準備した配布物で実 provider script の互換性を検査します。架空 data の操作・再読込・移動を行い、headless browser で自然には発生しないページ非表示は明示的に模擬します。未知の payload 契約や予期しない通信は公開を失敗させます。RUM は送信前に intercept するため、Cloudflare 側の受信成功は検証しません。観測範囲は summary と準備 artifact 内の `provider-compatibility.json` に記録します。

Field の根拠と互換性検査の範囲は [provider contract](cloudflare-analytics-contract.md) にまとめています。

Artifact 全体の整合性は site token の秘密性と別に検証し、生成後の digest は CI evidence に記録します。事前計算、manifest 回写、再 merge、承認後の再 build は行いません。

## 失敗したとき

| 状態 | 次の操作 |
| --- | --- |
| Release preflight: `deferred` | summary の `check` / `reason` に従って local、target、または重複 object を修正して再実行する。`pass` になるまで Version 更新へ進まない |
| Release preflight: `blocked` | `gh` / fetch / credential capability を復旧して再実行する。成功を推定せず、`pass` になるまで Version 更新へ進まない |
| PR の Quality 失敗 | Product・test・generator 自体の失敗として修正 commit を検証。Asset の promotion を先に繰り返さない |
| PR の Release assets current 失敗 | Version 更新 PR なら Quality artifact を目視して promotion する。Version を変えず展示 asset を変更していた場合はその変更を分離する。不一致の一覧が version・site・生成契約・manifest digest のどれかを確認する |
| PR の Quality artifact が失効 | 候補 branch の Quality を再実行し、新しい artifact を目視して promotion command を再実行する。新しい run ID を記録した manifest を同じ公開 PR へ取り込む |
| Main Quality・公開準備の失敗 | Merge 後の一時的実行障害だけなら該当 run を再実行。内容・契約の不一致なら新しい修正 PR で直す |
| 準備済み artifact の失効・不一致 | 公開を停止。同じ release commit の Quality または Release Pages を再実行し、新しい run 内で準備からやり直す。別 artifact を黙って代用しない |
| Tag 作成後の deploy failure | 同じ tag / commit / artifact で再開。別 SHA の同名 tag は拒否 |
| Deploy 後の smoke failure | 「公開済み・確認未完了」。自動 rollback はない。一時障害は再検査、内容不良は受入済み版へ戻す |
| 公開内容の修正 | 修正 PR と新しい version を用意。既存 tag を変更しない |

### 前のバージョンへ戻す

新経路で作った版は、失敗した Release Pages run を再実行します。Artifact が失効している場合は、その release 結果 commit が現在の main version と一致する間に main Quality を再実行すると、新しい Release Pages run が準備から開始し、既存 tag が同じ commit を指すことを確認して deploy を再開します。Main が次の version へ進んだ後はこの標準入口から旧版を再配布しません。

旧形式で current adapter に適合する受入済み tag は `v0.2.2` だけです。所有者が [Release Pages](https://github.com/herehigher/resume/actions/workflows/release.yml) を main から `recovery_tag=v0.2.2` で手動実行する操作を、その復旧公開の承認とします。小さな互換 adapter が当時の mode / provider を読み、現在の公開 site 設定で配布物を準備し、同じ run 内で検証・tag 照合・deploy まで進みます。古い公開 bytes の完全再現とは区別し、実行前に必要な目視証拠を別途確認します。

放棄済み `v0.2.1`、source の hreflang contract が current adapter と異なる `v0.2.0`、互換 adapter 未対応の `v0.1.0` はこの復旧入口の対象外です。どの経路でも既存 tag を移動せず、所有者の指示・承認の範囲で再配布し、smoke の成功を確認します。

## 初回設定・設定変更時だけ行うこと

Pages の Source を GitHub Actions にし、公開先と HTTPS、job permissions、production 承認方法、Analytics の公開設定を用意します。Main の merge ruleset は `quality` と `Release assets current` の両方を required check にします。通常公開では設定を変更しません。現行 `github-pages` environment は main / stable tag の branch policy だけで required reviewer はないため、environment による承認待ちを前提にしません。通常公開は version を更新した公開 PR の merge、旧版復旧は `recovery_tag` を指定した手動実行を、それぞれ承認の実行とします。

Local の GitHub query / PR 操作には認証済み `gh` session を使います。Sandbox で credential provider を利用できない場合は、許可された sandbox 外の実行へ切り替えます。Token を抽出・export・複製せず、特定 OS の credential backend は要件にしません。

この手順は [#113 の固定原稿](https://github.com/herehigher/resume/issues/113) を実装に合わせて採用したものです。過去の障害・移行経緯は [#112](https://github.com/herehigher/resume/issues/112) を参照します。
