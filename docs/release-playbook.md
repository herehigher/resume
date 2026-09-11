# リリース手順

対象：`herehigher/resume` → [Resume Studio](https://herehigher.github.io/resume/)。公開用 PR を1件用意し、必要な展示 asset・check・review を揃えたうえで、その PR の merge を本番公開の承認として扱います。

Public release、tag、Pages 設定、repository visibility の変更には owner の明示承認が必要です。通常公開では、version を更新した公開 PR を owner が merge する操作を、その merge 結果 commit の tag 作成と Pages 公開に対する明示承認とします。Merge 後に同じ対象への追加承認や ID・digest の転記は要求しません。Tag は移動・上書き・削除しません。

## 1回の公開で行うこと

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

## 公開入口

Version 更新前に、latest `origin/main` の clean な `main` checkout で唯一の事前確認入口 `npm run release:preflight -- --target VERSION` を実行します。これは `herehigher/resume` へアクセスできる認証済み `gh` session、現在の `package.json` と target の stable SemVer、remote tag、同じ target / release branch の open PR、tracked / untracked worktree を read-only で確認します。明示的に `origin/main` を fetch し、stale な main や feature branch は最新 SHA とともに停止します。untracked file は既定で停止し、利用者が必要性を確認した exact relative path だけ `--allow-untracked PATH` を繰り返して許可できます。command は version、asset、index、tag、PR、remote を変更せず、credential や token も読み出しません。GitHub / fetch の capability が利用できない場合も `blocked` の summary で停止します。

Version 更新は preflight 成功後に repository root で `node scripts/set-release-version.mjs VERSION YYYY-MM-DD` を1回実行します。Package、lock、APP_VERSION と CHANGELOG を同期するため、変更内容を確認して公開 PR に含めます。Version 更新を commit・push すると、Quality は候補 code から一時的な展示 asset を生成して upload します。Product・test の `Quality` と asset 更新状態の `Release assets current` は別 check です。古い asset は後者だけを失敗させ、原因を混同しません。

公開 PR の複数行本文も [contribution の安全な本文作成例](../CONTRIBUTING.md#issue-pr-の本文を安全に渡す) と同じ temporary file を使います。`body_file` は `mktemp` が返した file とし、本文の here-document は必ず `<<'EOF'` で引用します。本文に実在する履歴書 data、credential、token、test の raw log は書かず、架空 data を使った検証結果の要約と未確認事項だけを記載します。

```bash
body_file="$(mktemp)"
trap 'rm -f "$body_file"' EXIT
node scripts/write-github-body-file.mjs --output "$body_file" <<'EOF'
## 架空の公開 PR 本文

- `literal --body`
- $(not-a-command)
- "double quotes" and 'single quotes'
- [Issue #123](https://github.com/OWNER/REPOSITORY/issues/123) と [PR #456](https://github.com/OWNER/REPOSITORY/pull/456)
EOF

gh pr create --base main --title '架空の release PR title' --body-file "$body_file"
gh pr edit RELEASE_PR_NUMBER --body-file "$body_file"
```

`gh` の認証設定、owner approval、PR の merge、tag 作成、push はこの手順の本文作成とは別であり、この例は実行しません。

候補 branch の clean checkout で、PR の Quality が成功した後に `npm run promote:pr-doc-assets -- --pr PR_NUMBER` を実行します。run ID が分かっている場合は `--quality-run-id QUALITY_RUN_ID` を使います（両方は指定しません）。この入口は公式 repository の current `refs/pull/PR_NUMBER/merge`、成功した Quality run、`documentation-assets-MERGE_SHA` artifact、manifest の run ID と merge SHA を一意に照合します。空・複数・失効・不一致は停止します。候補 branch の HEAD は PR head SHA、`site/`・package・generator input は commit 済みでなければならず、temporary worktree で既存の `promote:doc-assets` 検証を実行してから、候補 branch には `docs/screenshots/{en,ja,zh-CN}.png`、`output/pdf/{en-letter,ja-a4,zh-CN-a4}.pdf`、`docs/assets-manifest.json` の7 fileだけを反映します。temporary artifact directory / worktree は成功・失敗のどちらでも削除されます。表示された7 file を目視・review して同じ公開 PR へ commit します。入口は GitHub read API、artifact download、PR merge ref の fetch だけを使い、owner approval、PR merge、tag 作成、push は行いません。再実行した `Release assets current` は manifest の Quality run ID から元の artifact を再取得し、commit 済み LFS file と manifest が promotion 元の exact bytes であることを先に確認します。そのうえで version、site hash、generator・browser・三言語の出力契約、PDF 全文・page、screenshot visual を現在の Quality evidence と照合します。Version を変えない PR で展示 asset を変更した場合は拒否します。別 run の Chromium rasterization bytes は完全一致を要求しません。CI 自身に repository 書込権限は与えません。

Manifest の `source.checkoutCommit` は asset を生成した checkout の情報値であり、asset を取り込んだ後の最終 tag commit を表しません。`source.qualityRunId` と組み合わせ、公開 PR の check が repository 内の該当 Actions artifact を取得できて exact bytes が一致した場合にだけ promotion provenance として採用します。Merge 後の公開準備は失効し得る過去の artifact へ再依存せず、承認済み commit の展示 asset と最終 main Quality を candidate version、`siteHash`、generator input hash、PDF 全文・page contract、screenshot の visual comparison で再検証します。

通常公開では [Release Pages](https://github.com/herehigher/resume/actions/workflows/release.yml) を手動実行しません。公開 PR の merge 結果 commit に対する main Quality が成功すると、workflow がその Quality run ID と SHA を照合し、PR の base から version が変わったこと、対応する merged PR が1件であること、同じ version が現在も main の version であることを確認して自動的に準備・tag・deploy へ進みます。Repository で許可された merge commit・squash・rebase のいずれでも、GitHub が記録する merged PR の base / result SHA を基準にします。Version が変わらない通常の main 更新や、古い release commit の Quality 再実行では公開 job を開始しません。

Analytics 有効時は、生成した配布物で実際の provider script を動かす互換性検査も準備に含まれます。未知の payload 契約や予期しない通信は公開を失敗させます。準備後の publish と deploy は、同じ workflow run が出力した exact artifact ID の保存済み bytes をそれぞれ再検証して使い、承認後の再 build や別 artifact への差し替えを行いません。Production lock の取得後にも current main version を再確認し、並行した新 version の後から旧 version を deploy しません。

準備 artifact は30日間保持します。同じ run 全体を再実行した場合は新しい artifact ID になりますが、その再実行内でも prepare・publish・deploy は同じ ID を引き継ぎます。確認用画像・PDF は Quality run の7日間保持 artifact です。公開 PR の merge 前に失効した場合は候補 branch の Quality を再実行し、新しい artifact を再度取り込んで `source.qualityRunId` を更新します。Merge 後の公開準備は過去の promotion artifact の保持期間に依存しません。

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

Summary は tag、commit、artifact の識別情報・digest、run URL、公開 URL、結果、未確認事項を記録します。通常の公開で別の管理 Issue、手入力の hash 一覧、digest 転記用 PR は不要です。アプリの deterministic mock test と、準備時の実 provider script による互換性検査を区別します。後者は架空 data の操作・再読込・移動を行い、headless browser で自然には発生しないページ非表示は明示的に模擬します。RUM を送信前に intercept するため、Cloudflare 側の受信成功を検証しません。観測範囲は summary と準備 artifact に同梱した `provider-compatibility.json` に記録し、自動 test 成功を包括的な実 provider 検証と呼びません。

## Analytics の扱い

Source は既定で無効です。公式 CI だけが設定 manifest の mode / provider に従って標準 Cloudflare Web Analytics を配布物へ追加し、公開画面で利用を明示します。公式以外の repository は disabled の source-identical artifact だけを許可します。

公開 beacon site token は repository variable `CLOUDFLARE_WEB_ANALYTICS_TOKEN` から渡す通常の site 設定です。存在、書式、安全な埋込みを検証し、専用の秘密管理・fingerprint・承認・ログ検査は設けません。GitHub 認証情報やアカウント操作用 API token は実 credential として保護します。

許可する外部 runtime は `https://static.cloudflareinsights.com/beacon.min.js` の GET と `https://cloudflareinsights.com/cdn-cgi/rum` の標準 POST です。履歴書入力・写真・import/export JSON・草稿・custom event・利用者単位 ID を送信する変更は認めません。Cookie、localStorage、fingerprinting を追加しません。固定 URL や HTML digest は第三者 script 内容を固定するものではありません。利用者向け説明は [PRIVACY.md](../PRIVACY.md) を参照します。

Field の根拠と互換性検査の範囲は [provider contract](cloudflare-analytics-contract.md) にまとめています。

Artifact 全体の整合性は site token の秘密性と別に検証し、生成後の digest は CI evidence に記録します。事前計算、manifest 回写、再 merge、承認後の再 build は行いません。

## 失敗したとき

| 状態 | 次の操作 |
| --- | --- |
| Release preflight: `deferred` | summary の `check` / `reason` に従って local、target、または重複 object を修正して再実行する。`pass` になるまで Version 更新へ進まない |
| Release preflight: `blocked` | `gh` / fetch / credential capability を復旧して再実行する。成功を推定せず、`pass` になるまで Version 更新へ進まない |
| PR の Quality 失敗 | Product・test・generator 自体の失敗として修正 commit を検証。Asset の promotion を先に繰り返さない |
| PR の Release assets current 失敗 | Version 更新 PR なら Quality artifact を目視して promotion する。Version を変えず展示 asset を変更していた場合はその変更を分離する。不一致の一覧が version・site・生成契約・manifest digest のどれかを確認する |
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
