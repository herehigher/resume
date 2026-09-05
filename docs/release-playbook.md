# リリース手順

対象：`herehigher/resume` → [Resume Studio](https://herehigher.github.io/resume/)。公開用 PR を1件用意し、配布物と検証結果を揃えてから本番公開を1回承認します。

Public release、tag、Pages 設定、repository visibility の変更には owner の明示承認が必要です。承認済みの同じ対象へ重ねて確認を要求しません。準備・一時出力・PR review に独立した承認は不要です。Tag は移動・上書き・削除しません。

## 1回の公開で行うこと

「担当者」は開発者または依頼を受けた agent、「所有者」は production 公開を承認する人です。配布物は Pages に置く HTML / CSS / JavaScript 一式です。

| 順番 | 担当 | 操作 | 次へ進む条件 |
| --- | --- | --- | --- |
| 1 | 担当者 | 変更範囲と公開 version を決める | 安定版番号が決まっている |
| 2 | 担当者 | Version 更新機能で関連 file を同期し、CHANGELOG をまとめ、公開 PR を1件作る | Version と変更内容が一致する |
| 3 | 担当者 | 必要な PR check と review を完了して main へ merge する | 対象の merge commit が確定する |
| 4 | 担当者 | 下記の公開入口で、その merged PR の準備を開始する | 対象 commit と version が表示される |
| 5 | CI | 同じ commit の成功済み main Quality を確認し、配布物を生成・検査する。確認用画像・PDF は Quality の出力を参照する | 検証結果と配布物が承認前に揃う |
| 6 | 担当者・所有者 | Version・変更内容・commit と必要な目視結果を確認し、本番公開を承認する | 必須確認の失敗・未確認がない |
| 7 | CI | 同じ commit の immutable tag を作成し、検証した配布物をそのまま deploy する | Tag、commit、配布物が一致する |
| 8 | CI・担当者 | 公開 URL の自動検査と summary を確認する | Deploy と smoke が成功する |

Version の基準は `package.json`。CHANGELOG の日付は RC を確定した日であり、実際の公開時刻は GitHub の実行記録を参照します。日付跨ぎだけで version や test をやり直しません。対象は PR の merge commit であり、その後の main tip や PR head に切り替えません。

## 公開入口

Version 更新は repository root で `node scripts/set-release-version.mjs VERSION YYYY-MM-DD` を1回実行します。Package、lock、APP_VERSION と CHANGELOG を同期するため、変更内容を確認して公開 PR に含めます。

[Release Pages](https://github.com/herehigher/resume/actions/workflows/release.yml) を main から実行します。通常の準備は `mode=prepare` と merged `pr_number` を指定し、他の入力は空欄にします。対象 SHA の main Quality が実行中・失敗・未存在なら準備を停止するので、その Quality を完了・再実行してから準備を再開します。

準備 summary の version / SHA、配布物、必要な画像・PDF を確認します。公開承認後は、summary が生成した公開 command を担当者がそのまま実行します。Command には `mode=publish`、`release_tag`、`prepared_run_id`、`prepared_artifact_id` が設定済みで、所有者による ID / digest の転記は不要です。GitHub の画面から実行する場合も同じ4項目を使います。

準備 artifact は30日間保持します。同じ run を再実行しても artifact ID は変わるため、新しい準備結果を確認してください。公開時は指定した run / artifact ID の保存済み bytes を再検証して配布し、失効した artifact の代わりを自動生成しません。確認用画像・PDF は Quality run の7日間保持 artifact です。必要な目視の前に失効した場合は、対象 Quality を再実行してから確認します。

## 変更内容に応じた確認

| 変更 | 目視するもの |
| --- | --- |
| Version、文書、公開 script のみ | 原則不要。変更内容と CI 結果を確認 |
| 画面、文言、操作 | 対象言語と desktop / smartphone 相当幅の変更画面 |
| PDF、template、font、公開 sample | 対象言語・用紙の全 PDF page。文字切れ、重なり、改ページ、末尾欠落 |

詳しい確認条件と展示 sample の扱いは[開発ガイド](development-guide.md#表示pdf-の目視)を参照します。必要な結果と差異だけを PR / run に残し、自動 test、agent の目視、人の受入判断、未確認を分けます。確認用画像・PDF は CI artifact から取得し、展示 sample を毎 version commit し直しません。

## 自動で確認・記録すること

CI は保存・読込・言語分離・PDF・データ保護、version、source SHA と artifact bytes の一致を検証します。公開後は主要 path の HTTP、version、locale、metadata、sitemap、Schema、架空 example と editor の基本操作を確認します。

Summary は tag、commit、artifact の識別情報・digest、run URL、公開 URL、結果、未確認事項を記録します。通常の公開で別の管理 Issue、手入力の hash 一覧、digest 転記用 PR は不要です。Third-party provider への実送信・受信の確認は deterministic mock / intercept test と区別します。[#108](https://github.com/herehigher/resume/issues/108) の live provider 契約は別途追跡し、自動 test 成功を包括的な実 provider 検証と呼びません。

## Analytics の扱い

Source は既定で無効です。公式 CI だけが設定 manifest の mode / provider に従って標準 Cloudflare Web Analytics を配布物へ追加し、公開画面で利用を明示します。公式以外の repository は disabled の source-identical artifact だけを許可します。

公開 beacon site token は repository variable `CLOUDFLARE_WEB_ANALYTICS_TOKEN` から渡す通常の site 設定です。存在、書式、安全な埋込みを検証し、専用の秘密管理・fingerprint・承認・ログ検査は設けません。GitHub 認証情報やアカウント操作用 API token は実 credential として保護します。

許可する外部 runtime は `https://static.cloudflareinsights.com/beacon.min.js` の GET と `https://cloudflareinsights.com/cdn-cgi/rum` の標準 POST です。履歴書入力・写真・import/export JSON・草稿・custom event・利用者単位 ID を送信する変更は認めません。Cookie、localStorage、fingerprinting を追加しません。固定 URL や HTML digest は第三者 script 内容を固定するものではありません。利用者向け説明は [PRIVACY.md](../PRIVACY.md) を参照します。

Artifact 全体の整合性は site token の秘密性と別に検証し、生成後の digest は CI evidence に記録します。事前計算、manifest 回写、再 merge、承認後の再 build は行いません。

## 失敗したとき

| 状態 | 次の操作 |
| --- | --- |
| PR・準備 check 失敗 | 修正して変更 commit を検証。一時的実行障害だけなら該当 run を再実行 |
| 準備済み artifact の失効・不一致 | 公開を停止。準備をやり直し、新しい対象の内容を確認する。別 artifact を黙って代用しない |
| Tag 作成後の deploy failure | 同じ tag / commit / artifact で再開。別 SHA の同名 tag は拒否 |
| Deploy 後の smoke failure | 「公開済み・確認未完了」。自動 rollback はない。一時障害は再検査、内容不良は受入済み版へ戻す |
| 公開内容の修正 | 修正 PR と新しい version を用意。既存 tag を変更しない |

### 前のバージョンへ戻す

新経路で作った版は、その版の未失効の prepare run / artifact ID と既存 tag を指定して publish を再実行します。保存済み artifact が失効していれば、元の merged PR から再度 prepare し、結果を確認してから公開します。

旧形式は受入済み `v0.2.0` / `v0.2.2` に限定し、`mode=prepare`、`release_tag` を指定、`pr_number` は空欄にします。小さな互換 adapter が当時の mode / provider を読み、現在の公開 site 設定で配布物を準備します。古い公開 bytes の完全再現とは区別し、承認前に再検証します。旧版の Quality には確認用画像・PDF artifact がない場合があります。必要な目視証拠は別途用意し、未確認のまま公開しません。

放棄済み `v0.2.1` と互換 adapter 未対応の `v0.1.0` はこの復旧入口の対象外です。どの経路でも既存 tag を移動せず、所有者の指示・承認の範囲で再配布し、smoke の成功を確認します。

## 初回設定・設定変更時だけ行うこと

Pages の Source を GitHub Actions にし、公開先と HTTPS、job permissions、production 承認方法、Analytics の公開設定を用意します。通常公開では設定を変更しません。現行 `github-pages` environment は main / stable tag の branch policy だけで required reviewer はないため、environment による承認待ちを前提にしません。公開入口の明示操作を承認の実行とします。

Local の GitHub query / PR 操作には認証済み `gh` session を使います。Sandbox で credential provider を利用できない場合は、許可された sandbox 外の実行へ切り替えます。Token を抽出・export・複製せず、特定 OS の credential backend は要件にしません。

この手順は [#113 の固定原稿](https://github.com/herehigher/resume/issues/113) を実装に合わせて採用したものです。過去の障害・移行経緯は [#112](https://github.com/herehigher/resume/issues/112) を参照します。
