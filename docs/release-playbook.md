# Version release playbook / バージョン公開手順

この playbook は Resume Studio の version release と GitHub Pages production deployment の canonical な操作手順です。Release ごとの合否判定は [受入チェックリスト](acceptance-checklist.md)、repository 全体の mandatory rules は [AGENTS.md](../AGENTS.md) に従います。

## 権限と release gate

- Public release、tag の作成・push、GitHub Pages settings、repository visibility の変更は、owner の明示承認がある場合だけ実行する。
- Production tag は安定版 `vMAJOR.MINOR.PATCH` のみとし、leading zero、prerelease、build metadata は使用しない。`package.json` の version と完全一致させる。
- Release commit は `main` の履歴に含め、Pull Request と `main` の `Quality / quality`、release workflow の validate → quality → artifact → deploy → smoke をすべて通す。
- Tag は immutable とする。作成済み tag を移動・上書き・削除しない。Release 内容の修正には Pull Request と新しい version を使用する。
- Command output や記録に token、secret、credential、実在する résumé data を含めない。

この文書の `<RELEASE_VERSION>`、`<RELEASE_DATE>`、`<RELEASE_TAG>`、`<RELEASE_SHA>`、`<PR_URL>`、`<ISSUE_URL>`、`<WORKFLOW_RUN_URL>` は placeholder です。実値を別途確認して置き換え、`<` または `>` が残る command は実行しません。

## RC freeze と screenshot の時点

Release candidate（RC）は application version、`site/`、public sample、release notes、release 対象の文書と workflow が確定した時点で freeze します。Tag 前の Pull Request で、対象項目を `CHANGELOG.md` の `Unreleased` から `## [<RELEASE_VERSION>] - <RELEASE_DATE>` へ移し、release date を確定します。将来の変更を記録する空の `Unreleased` section は残します。Freeze 後は release 判定に必要な修正以外を混ぜません。

`site/` または public sample を変更した release では、version を含むすべての画面内容を確定した最終 RC で、merge と tag の前に `npm run generate:docs` を実行します。三言語 screenshot、PDF、`docs/assets-manifest.json` を同じ RC commit に含め、目視確認します。生成後に `site/` または public sample が変わった場合は再生成します。Workflow / Markdown だけの変更では再生成しません。

Screenshot に誤りが見つかった場合は tag 前に RC を修正して再生成します。Tag 後は tag を動かさず、修正を新しい version として release します。

## Preflight inputs と local gate

最初に次を Issue または手元の release note に用意します。

- Release version: `<RELEASE_VERSION>`（例: `0.1.0`）
- Release date: `<RELEASE_DATE>`（例: `2026-09-01`）
- Release tag: `<RELEASE_TAG>`（例: `v0.1.0`）
- Release Issue: `<ISSUE_URL>`
- 対象 Pull Request: `<PR_URL>`
- Owner approval: 承認者と日時

Repository、account、作業 tree を確認します。Tag や deployment を変更しない read-only preflight です。

```bash
git remote get-url origin
gh auth status
git status --short --branch
git fetch --tags origin main
git log -1 --oneline origin/main
```

期待する remote が `https://github.com/herehigher/resume.git`、active account が release 権限を持つ owner、作業 tree が意図した状態であることを確認します。認証出力を Issue に貼らず、token や credential は記録しません。

RC branch で dependency と version / release notes の整合を確認します。`package.json`、`site/assets/js/config.js` の `APP_VERSION`、`CHANGELOG.md` の対象 version は同じ `<RELEASE_VERSION>` でなければなりません。

```bash
npm ci
release_version='<RELEASE_VERSION>'
release_date='<RELEASE_DATE>'
test "$(node -p "require('./package.json').version")" = "$release_version"
grep --fixed-strings "export const APP_VERSION = '${release_version}';" site/assets/js/config.js
grep --fixed-strings "## [${release_version}] - ${release_date}" CHANGELOG.md
sed -n '1,80p' CHANGELOG.md
```

`CHANGELOG.md` の対象 section に今回の release notes が入り、日付が実際の release date と一致し、`Unreleased` が将来分として残っていることを確認します。Date が変わる場合は merge / tag 前に Pull Request を更新します。

`<RELEASE_TAG>` が stable tag であり、package version と一致することを目視で二重確認します。`site/` を変更した場合だけ、RC 上で次を実行して生成物を目視します。

```bash
npm run generate:docs
node --test tests/documentation.test.js
```

生成 asset を含む RC の最終状態で full gate を実行します。

```bash
npm run test:acceptance
git diff --check
git diff --check origin/main...HEAD
```

`git diff --check` は現在の unstaged working tree、`git diff --check origin/main...HEAD` は fetch 済み `origin/main` から HEAD までの committed Pull Request range を検査します。前者が clean でも後者の代わりにはなりません。両方の結果を記録します。

## Pull Request、Quality、merge

1. Pull Request は日本語を主とし、必要なら短い English summary を付ける。目的、変更範囲、focused test、`npm run test:acceptance`、working tree の `git diff --check`、committed range の `git diff --check origin/main...HEAD`、目視結果、未確認事項、screenshot / PDF の source SHA を記録する。
2. 同じ Pull Request で `CHANGELOG.md` の対象内容を `Unreleased` から `## [<RELEASE_VERSION>] - <RELEASE_DATE>` へ固化し、`package.json`、`APP_VERSION`、CHANGELOG version の一致と release notes / date を review する。
3. Review 指摘を解消し、Pull Request の `Quality / quality` が成功していることを確認する。失敗または未確認の gate がある間は merge しない。
4. Ruleset に従って `main` へ merge する。通常の `main` push では Pages deployment が起動しないことを確認する。
5. `main` の `Quality / quality` が成功した後、release 対象の full commit SHA を取得する。

```bash
git fetch --tags origin main
git rev-parse --verify 'origin/main^{commit}'
git log -1 --oneline origin/main
```

取得した full SHA を `<RELEASE_SHA>` として記録します。PR head SHA ではなく、merge 後の `origin/main` commit を使用します。

## 初回 Pages と HTTPS 設定

初回 release の tag push 前に、owner が GitHub の `Settings` → `Pages` を開き、Build and deployment の Source を `GitHub Actions` に設定します。Custom domain を使用しないことを確認します。これは外部状態を変える操作なので、実行直前に owner approval、repository、設定対象をもう一度確認します。

初回 deployment 後、production URL が `https://herehigher.github.io/resume/` であること、HTTPS で接続できること、`Enforce HTTPS` の状態を確認します。設定者、日時、Source、custom domain、HTTPS 状態を記録し、secret は記録しません。

## Annotated immutable tag の作成と push

以下は production release を開始する操作です。実行直前に、owner approval、`<RELEASE_TAG>`、`<RELEASE_SHA>`、package version、`origin/main` ancestry を読み上げて照合します。Placeholder が残っていれば停止します。

まず tag が local と remote のどちらにも存在しないことを確認します。既に存在する場合は tag を再作成・移動・削除せず、原因を調査します。

```bash
git rev-parse --verify --quiet 'refs/tags/<RELEASE_TAG>'
git ls-remote --tags origin 'refs/tags/<RELEASE_TAG>'
git merge-base --is-ancestor '<RELEASE_SHA>' origin/main
git show '<RELEASE_SHA>:package.json'
```

最初の 2 command は tag が存在しない場合に空または non-zero になります。3 番目が成功し、4 番目の version が `<RELEASE_VERSION>` と一致することを確認してから annotated tag を作成します。

```bash
git tag --annotate '<RELEASE_TAG>' '<RELEASE_SHA>' --message 'Resume Studio <RELEASE_TAG>'
git show --no-patch --decorate '<RELEASE_TAG>'
git rev-parse --verify '<RELEASE_TAG>^{commit}'
test "$(git rev-parse --verify '<RELEASE_TAG>^{commit}')" = '<RELEASE_SHA>'
```

表示された tag、version、full commit SHA を再確認します。正しければ owner の最終承認後、exact tag ref だけを push します。

```bash
git push origin 'refs/tags/<RELEASE_TAG>:refs/tags/<RELEASE_TAG>'
```

`--force`、tag update、tag delete は使用しません。

## Actions の監視と online acceptance

GitHub Actions の `Deploy Pages` run を開き、validate → quality → artifact → deploy → smoke の順に成功することを確認します。Artifact は検証済み `<RELEASE_SHA>` の `site/` だけで、`github-pages` environment に deployment result と URL が表示されます。Workflow run URL を `<WORKFLOW_RUN_URL>` として記録します。

Smoke 成功後も、private window の最新 Chrome / Chromium で `https://herehigher.github.io/resume/` を開き、[受入チェックリスト](acceptance-checklist.md) の online 項目を実施します。少なくとも root、`/ja/`、`/zh-cn/`、`/en/`、`sitemap.xml`、JSON Schema、import example、表示 version、canonical / hreflang、editor CTA、GitHub source link、Privacy link、許可された network request を確認します。

Smoke failure は deploy 後の未受入状態です。直前の正常な site が自動で復元されたとは判断しません。

## Evidence 記録 template

Issue または Pull Request に次を記録します。Placeholder を実値または `該当なし` に置き換え、token、secret、credential は貼りません。

```markdown
## Release evidence / リリース記録

- Version / tag: `<RELEASE_VERSION>` / `<RELEASE_TAG>`
- Release commit (full SHA): `<RELEASE_SHA>`
- Owner approval: `<APPROVER>` / `<APPROVED_AT>`
- Pull Request: `<PR_URL>`
- Release Issue: `<ISSUE_URL>`
- Quality on PR / main: `<RESULT_AND_RUN_URL>`
- `npm run test:acceptance`: `<RESULT>`
- Working tree `git diff --check`: `<RESULT>`
- Committed PR range `git diff --check origin/main...HEAD`: `<RESULT>`
- Version consistency (`package.json` / `APP_VERSION` / `CHANGELOG.md`): `<RESULT>`
- CHANGELOG release notes / date: `<RELEASE_VERSION>` / `<RELEASE_DATE>` / `<RESULT>`
- Visual acceptance: `<RESULT, OS, CHROME_VERSION, CHECKED_AT>`
- Screenshot / PDF source SHA: `<SHA_OR_NOT_APPLICABLE>`
- Pages Source / custom domain / HTTPS: `<SETTINGS_RESULT>`
- Deploy workflow: `<WORKFLOW_RUN_URL>`
- Environment URL: `https://herehigher.github.io/resume/`
- Online smoke / manual browser: `<RESULT>`
- Known differences / follow-up Issue: `<DETAILS_OR_NONE>`
- Final decision: `<ACCEPTED_OR_NOT_ACCEPTED>`
```

## Existing tag の manual redeploy / rollback

Manual redeploy は既存の immutable stable tag だけを対象にします。CDN の一時状態を再確認する場合は同じ tag、content defect から rollback する場合は直前に受入済みの tag を選びます。新しい未検証 ref、branch、SHA は入力しません。

実行前に owner approval、default branch、対象 tag の存在、package version、過去の受入記録を確認します。

```bash
git fetch --tags origin main
git rev-parse --verify 'refs/tags/<EXISTING_RELEASE_TAG>^{commit}'
git show '<EXISTING_RELEASE_TAG>:package.json'
git merge-base --is-ancestor '<EXISTING_RELEASE_TAG>^{commit}' origin/main
```

GitHub Actions の `Deploy Pages` → `Run workflow` で branch に default branch を選び、`release_tag` に `<EXISTING_RELEASE_TAG>` を入力します。CLI を使う場合も、実行直前に repository と tag を再確認します。

```bash
gh workflow run deploy-pages.yml --ref main --field release_tag='<EXISTING_RELEASE_TAG>'
```

Manual run も exact tag、version、main ancestry、Quality を再検証します。完了後は Actions、environment URL、online smoke、manual browser の証拠を新しい記録として残します。Rollback は tag を変更する操作ではなく、既存 tag の検証済み `site/` を再 deployment する操作です。

## 失敗時の判断

| 段階 | 公開状態 | 判断と次の操作 |
| --- | --- | --- |
| Pre-deploy / RC gate | 未 deploy | Tag を作成しない。Test、目視、version、文書、approval を修正して RC gate を最初から実行する。 |
| Validate | 未 deploy | Exact tag、stable version、package version、main ancestry を確認する。Tag push 後の内容不備では tag を動かさず、修正 PR と新 version を用意する。 |
| Quality | 未 deploy | Artifact と deploy は開始されない。Failure evidence を調査し、code / test defect は修正 PR と新 version で解決する。Runner の一時障害だけは同じ run を rerun する。 |
| Artifact | 未 deploy | `site/` artifact 作成の一時障害は rerun する。Source / workflow defect は修正 PR と新 version にする。 |
| Deploy | 不明または部分反映 | Actions と `github-pages` environment を確認し、未受入として扱う。一時障害は同じ run を rerunし、直前の受入済み tag への manual rollback も検討する。 |
| Post-deploy smoke | Deploy 済み・未受入 | 自動 rollback はない。Failure path と environment URL を確認し、一時障害は rerun、必要なら受入済み tag を manual redeploy する。 |
| HTTP 200 だが stale CDN content | Deploy 済み・未受入 | Built-in bounded retry の結果と response hash を確認する。反映待ちなら同じ run または同じ tag を再実行し、内容が一致するまで受入にしない。 |
| 同一 origin の content defect | Deploy 済み・未受入 | Tag を移動・削除しない。受入済み tag へ rollback し、修正 PR と新 version を release する。 |

判断に迷う場合は release を受入済みにせず、Issue に状態と証拠を残して owner の判断を待ちます。

## 初回成功後の README と Issue close

初回 deployment、online smoke、manual browser acceptance が成功するまでは、三言語 README の Web 版 URL を「検証済み」として掲載しません。成功後に docs-only follow-up Pull Request を作成し、`README.md`、`README.zh-CN.md`、`README.en.md` の Issue #9 placeholder を実 URLへ置き換えます。この通常の `main` commit では Pages deployment は起動しません。

README follow-up の merge、release evidence、Pages / HTTPS 設定記録、未解決 follow-up の有無を確認してから Issue を close します。

## English summary

Only an explicitly authorized owner may publish. Freeze the RC, generate screenshots after all site/version changes and before tagging, pass every Quality and acceptance gate, then create one immutable annotated `vMAJOR.MINOR.PATCH` tag on the verified main commit. Record the Actions, Pages, HTTPS, smoke, and browser evidence. Redeploy only an existing accepted tag; never move or delete a release tag, and ship content fixes under a new version.
