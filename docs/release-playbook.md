# Version release playbook / バージョン公開手順

この playbook は Resume Studio の version release と GitHub Pages production deployment の canonical な操作手順です。Release ごとの合否判定は [受入チェックリスト](acceptance-checklist.md)、repository 全体の mandatory rules は [AGENTS.md](../AGENTS.md) に従います。

## 権限と release gate

- Public release、tag の作成・push、GitHub Pages settings、repository visibility の変更は、owner の明示承認がある場合だけ実行する。
- Production tag は安定版 `vMAJOR.MINOR.PATCH` のみとし、leading zero、prerelease、build metadata は使用しない。`package.json` の version と完全一致させる。
- Release commit は `main` の履歴に含め、Pull Request と `main` の `Quality / quality`、release workflow の validate → quality → artifact → deploy → smoke をすべて通す。
- Tag は immutable とする。作成済み tag を移動・上書き・削除しない。Release 内容の修正には Pull Request と新しい version を使用する。
- Command output や記録に token、secret、credential、実在する résumé data を含めない。

この文書の `<RELEASE_VERSION>`、`<RELEASE_DATE>`、`<RELEASE_TAG>`、`<RELEASE_SHA>`、`<PR_NUMBER>`、`<PR_URL>`、`<ISSUE_URL>`、`<WORKFLOW_RUN_URL>` は placeholder です。実値を別途確認して置き換え、`<` または `>` が残る command は実行しません。

## RC freeze と screenshot の時点

Release candidate（RC）は application version、`site/`、public sample、release notes、release 対象の文書と workflow が確定した時点で freeze します。Tag 前の Pull Request で、対象項目を `CHANGELOG.md` の `Unreleased` から `## [<RELEASE_VERSION>] - <RELEASE_DATE>` へ移し、release date を確定します。将来の変更を記録する空の `Unreleased` section は残します。Freeze 後は release 判定に必要な修正以外を混ぜません。

新 version の release では、version を含むすべての画面内容を確定した最終 RC commit を pin し、merge と tag の前に `npm run release:assets -- --source-sha '<RELEASE_SHA>'` を実行します。Git archive から一時 staging に三言語 screenshot、PDF、`docs/assets-manifest.json` の候補を生成し、既存 release asset check と PNG / PDF content check を通します。表示された source commit、site hash、7つの対象ファイルを owner が明示承認した場合だけ、同じ command に `--owner-approval` を付けて promote します。promote は全対象を backup してから行い、途中で失敗すれば元の tracked output を復元します。三言語 screenshot、PDF、`docs/assets-manifest.json` を Git LFS object として commit して目視確認します。生成後に `site/` または public sample が変わった場合は再生成します。その場合は新しい pinned commit を source にします。日常開発、通常の feature Pull Request、`main` push、Workflow / Markdown だけの変更では再生成しません。

Screenshot に誤りが見つかった場合は tag 前に RC を修正して再生成します。Tag 後は tag を動かさず、修正を新しい version として release します。

Official deployment で Analytics が enabled であることを示す screenshot は、deploy 後の Issue evidence として保存します。Source default が disabled であることを示す tag 内の生成 screenshot を置き換えたり、immutable tag へ書き戻したりしません。

## Preflight inputs と local gate

最初に次を Issue または手元の release note に用意します。

- Release version: `<RELEASE_VERSION>`（例: `0.1.0`）
- Release date: `<RELEASE_DATE>`（例: `2026-09-01`）
- Release tag: `<RELEASE_TAG>`（例: `v0.1.0`）
- Release Issue: `<ISSUE_URL>`
- Pull Request number: `<PR_NUMBER>`（v0.1.0 release PR は `34`）
- 対象 Pull Request: `<PR_URL>`
- Owner approval: 承認者と日時
- Pages Analytics manifest: `.github/pages-release-manifest.json` の mode / provider / fingerprint / source / artifact digest

Repository、account、作業 tree を確認します。Tag や deployment を変更しない read-only preflight です。

```bash
git remote get-url origin || { echo 'Unable to read origin; stop the release.' >&2; exit 1; }
gh auth status || { echo 'GitHub authentication is unavailable; stop the release.' >&2; exit 1; }
git status --short --branch || { echo 'Unable to read the working tree; stop the release.' >&2; exit 1; }
git fetch --tags origin main || { echo 'Unable to refresh origin/main and tags; stop the release.' >&2; exit 1; }
git log -1 --oneline origin/main || { echo 'Unable to read origin/main; stop the release.' >&2; exit 1; }
```

期待する remote が `https://github.com/herehigher/resume.git`、active account が release 権限を持つ owner、作業 tree が意図した状態であることを確認します。認証出力を Issue に貼らず、token や credential は記録しません。

Pinned `<RELEASE_SHA>` と `<RELEASE_TAG>` が決まったら、tag 作成直前に次の単一 command を実行します。これは tag、repository variable、Pages deployment を変更せず、remote tag query、main ancestry、`package.json` / `APP_VERSION` / `CHANGELOG.md`、tagged manifest、source / adapter / final artifact digest、prepared artifact の semantic smoke を fail-closed で検証します。enabled artifact では承認済み repository variable を stdout に出さずに読み、取得・network・digest のいずれかを確認できなければ失敗します。

```bash
case "$-" in *x*) echo 'Disable shell xtrace before release preflight.' >&2; exit 1 ;; esac
npm run release:preflight -- \
  --release-tag '<RELEASE_TAG>' \
  --release-sha '<RELEASE_SHA>'
```

成功時の version、release SHA、source / adapter / final artifact digest、provider fingerprint だけを evidence に記録します。手動の確認は owner approval、RC の目視確認、Quality run、release date、tag 作成前の最終照合に限定します。

RC branch で dependency と version / release notes の整合を確認します。`package.json`、`site/assets/js/config.js` の `APP_VERSION`、`CHANGELOG.md` の対象 version は同じ `<RELEASE_VERSION>` でなければなりません。

```bash
npm ci || { echo 'Dependency installation failed; stop the release.' >&2; exit 1; }
release_version='<RELEASE_VERSION>'
release_date='<RELEASE_DATE>'
case "$release_version$release_date" in *'<'*|*'>'*) echo 'Replace every release placeholder first.' >&2; exit 1 ;; esac
package_version="$(node -p "require('./package.json').version")" \
  || { echo 'Unable to read package version; stop the release.' >&2; exit 1; }
test "$package_version" = "$release_version" \
  || { echo 'package.json version does not match the release version.' >&2; exit 1; }
grep --fixed-strings "export const APP_VERSION = '${release_version}';" site/assets/js/config.js \
  || { echo 'APP_VERSION does not match the release version.' >&2; exit 1; }
grep --fixed-strings "## [${release_version}] - ${release_date}" CHANGELOG.md \
  || { echo 'CHANGELOG version or date does not match.' >&2; exit 1; }
sed -n '1,80p' CHANGELOG.md \
  || { echo 'Unable to inspect CHANGELOG; stop the release.' >&2; exit 1; }
```

`CHANGELOG.md` の対象 section に今回の release notes が入り、日付が実際の release date と一致し、`Unreleased` が将来分として残っていることを確認します。Date が変わる場合は merge / tag 前に Pull Request を更新します。

`<RELEASE_TAG>` が stable tag であり、package version と一致することを目視で二重確認します。新 version の最終 RC 上で次を実行し、生成物と Git LFS tracking を目視します。

```bash
npm run release:assets -- --source-sha '<RELEASE_SHA>' \
  || { echo 'Release asset staging failed; stop the release.' >&2; exit 1; }
# Displayed source commit, site hash, and all seven paths require owner approval before this step.
npm run release:assets -- --source-sha '<RELEASE_SHA>' --owner-approval \
  || { echo 'Owner-approved release asset promotion failed; original outputs were restored; stop the release.' >&2; exit 1; }
git add docs/assets-manifest.json docs/screenshots/*.png output/pdf/*.pdf \
  || { echo 'Unable to stage release assets; stop the release.' >&2; exit 1; }
git lfs ls-files \
  || { echo 'Unable to verify Git LFS assets; stop the release.' >&2; exit 1; }
npm run test:release-assets \
  || { echo 'Documentation verification failed; stop the release.' >&2; exit 1; }
```

生成 asset を含む RC の最終状態で full gate を実行します。

```bash
npm run test:acceptance || { echo 'Acceptance gate failed; stop the release.' >&2; exit 1; }
git diff --check || { echo 'Working tree diff check failed; stop the release.' >&2; exit 1; }
git diff --check origin/main...HEAD \
  || { echo 'Committed Pull Request range diff check failed; stop the release.' >&2; exit 1; }
```

`git diff --check` は現在の unstaged working tree、`git diff --check origin/main...HEAD` は fetch 済み `origin/main` から HEAD までの committed Pull Request range を検査します。前者が clean でも後者の代わりにはなりません。両方の結果を記録します。

### Pages Analytics manifest の PR 前開発検証

`site/` source、clone、fork は `disabled/none` で Analytics runtime を含みません。`.github/pages-release-manifest.json` は release tag に固定され、`(disabled, none, null)` または `(enabled, cloudflare-web-analytics, SHA-256 fingerprint)` のどちらかだけを許可します。Manifest は provider URL、script、command、環境変数名、自由記述 config を保持せず、source tree と最終 artifact tree の digest を固定します。

Enabled release では owner の明示承認後、PR 前にも `herehigher/resume` の実際の repository variable を読み、token を表示・記録せずに fingerprint と artifact digest を独立復元します。Shell xtrace が有効な端末、認証未確認、variable を読む権限がない状態では実行しません。この working tree 上の確認は manifest を review 可能にするための開発検証であり、merge 後の pinned `<RELEASE_SHA>` に対する最終 gate の代わりにはなりません。

```bash
case "$-" in *x*) echo 'Disable shell xtrace before reading the provider token.' >&2; exit 1 ;; esac
gh auth status || { echo 'GitHub authentication is unavailable; stop the release.' >&2; exit 1; }
verification_output="$(mktemp)" \
  || { echo 'Unable to create a private verification output.' >&2; exit 1; }
trap 'rm -f "$verification_output"' EXIT
analytics_token="$(gh variable get CLOUDFLARE_WEB_ANALYTICS_TOKEN --repo herehigher/resume)" \
  || { echo 'Unable to read the approved repository variable; stop the release.' >&2; exit 1; }
test -n "$analytics_token" \
  || { echo 'The approved repository variable is empty; stop the release.' >&2; exit 1; }
CLOUDFLARE_WEB_ANALYTICS_TOKEN="$analytics_token" GITHUB_OUTPUT="$verification_output" \
  node scripts/prepare-pages-artifact.mjs derive-cloudflare --source site \
  || { unset analytics_token; echo 'Artifact derivation failed; stop the release.' >&2; exit 1; }
unset analytics_token
node -e '
  const fs = require("node:fs");
  const manifest = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const output = Object.fromEntries(fs.readFileSync(process.argv[2], "utf8").trim().split("\n").map((line) => line.split("=", 2)));
  const expected = {
    provider_fingerprint: manifest.providerTokenSha256,
    source_digest: manifest.sourceTreeSha256,
    final_digest: manifest.artifactTreeSha256
  };
  for (const [key, value] of Object.entries(expected)) {
    if (output[key] !== value) throw new Error(`${key} mismatch`);
  }
  if (!/^[0-9a-f]{64}$/.test(output.adapter_digest || "")) throw new Error("adapter digest missing");
  process.stdout.write(`Verified source=${output.source_digest}, adapter=${output.adapter_digest}, artifact=${output.final_digest}\n`);
' .github/pages-release-manifest.json "$verification_output" \
  || { echo 'Tagged manifest does not reproduce; stop the release.' >&2; exit 1; }
```

Output に raw token は含めず、4 digest / fingerprint だけを evidence に記録します。Owner が variable access を承認していない、variable が読めない、または mismatch の場合は tag を作成しません。Analytics を使用しない判断へ変える場合は manifest を `disabled/none/null` と source-identical artifact digest に更新し、Pull Request の test と review をやり直します。Enabled のまま先に tag を作ることは禁止です。artifact の document allowlist は公開首頁、三言語 landing page、`/editor/` の5 HTMLだけとし、editor は `noindex,follow` でも disclosure と beacon contract の対象です。

## Pull Request、Quality、merge

1. Pull Request は日本語を主とし、必要なら短い English summary を付ける。目的、変更範囲、focused test、`npm run test:acceptance`、working tree の `git diff --check`、committed range の `git diff --check origin/main...HEAD`、目視結果、未確認事項、screenshot / PDF の source SHA を記録する。
2. 同じ Pull Request で `CHANGELOG.md` の対象内容を `Unreleased` から `## [<RELEASE_VERSION>] - <RELEASE_DATE>` へ固化し、`package.json`、`APP_VERSION`、CHANGELOG version、Pages manifest の mode / provider / fingerprint / source / artifact digest の一致と release notes / date を review する。
3. Review 指摘を解消し、Pull Request の `Quality / quality` が成功していることを確認する。失敗または未確認の gate がある間は merge しない。
4. Ruleset に従って `main` へ merge する。通常の `main` push では Pages deployment が起動しないことを確認する。
5. Merge 後、review 済み Pull Request の `mergeCommit.oid` を GitHub から取得し、release 対象の full commit SHA として pin する。`origin/main` の当時の tip や PR head SHA から推測しない。

```bash
git fetch --tags origin main \
  || { echo 'Unable to refresh origin/main and tags; stop the release.' >&2; exit 1; }
pr_number='<PR_NUMBER>'
case "$pr_number" in ''|*[!0-9]*) echo 'PR number must contain digits only.' >&2; exit 1 ;; esac
if ! release_sha="$(gh pr view "$pr_number" --repo herehigher/resume \
  --json state,mergeCommit \
  --jq 'if .state == "MERGED" and .mergeCommit.oid != null then .mergeCommit.oid else empty end')"; then
  echo 'Unable to read the merged Pull Request; stop the release.' >&2
  exit 1
fi
test -n "$release_sha" || { echo 'Pull Request is not merged or has no merge commit; stop the release.' >&2; exit 1; }
case "$release_sha" in *[!0-9a-f]*) echo 'GitHub returned an invalid merge commit id.' >&2; exit 1 ;; esac
case "${#release_sha}" in 40|64) ;; *) echo 'GitHub returned an invalid merge commit length.' >&2; exit 1 ;; esac
git cat-file -e "${release_sha}^{commit}" \
  || { echo 'Pinned merge SHA is not a local commit; stop the release.' >&2; exit 1; }
git merge-base --is-ancestor --end-of-options "$release_sha" origin/main \
  || { echo 'Pinned merge SHA is not on origin/main; stop the release.' >&2; exit 1; }
git show --no-patch --oneline --end-of-options "$release_sha" \
  || { echo 'Unable to inspect the pinned merge SHA; stop the release.' >&2; exit 1; }
```

表示された commit が `<PR_URL>` の reviewed merge commit と一致することを確認し、`release_sha` の full value を `<RELEASE_SHA>` として記録します。`main` が後続 commit で ahead になっても `<RELEASE_SHA>` を tip へ置き換えず、この pinned merge SHA を tag 対象にします。

次に、pinned SHA 自身を head SHA とする `main` push の `Quality` run が成功していることを確認します。Query failure、空結果、SHA / conclusion 不一致では停止します。

```bash
if ! quality_result="$(gh run list --repo herehigher/resume --workflow ci.yml \
  --branch main --event push --commit "$release_sha" --status success --limit 1 \
  --json databaseId,headSha,conclusion,url \
  --jq '.[0] | [.databaseId, .headSha, .conclusion, .url] | @tsv')"; then
  echo 'Unable to query main Quality; stop the release.' >&2
  exit 1
fi
IFS=$'\t' read -r quality_run_id quality_sha quality_conclusion quality_url <<< "$quality_result"
test -n "$quality_run_id" \
  || { echo 'No successful main Quality run exists for the pinned SHA.' >&2; exit 1; }
test "$quality_sha" = "$release_sha" \
  || { echo 'Main Quality run SHA does not match the pinned SHA.' >&2; exit 1; }
test "$quality_conclusion" = 'success' \
  || { echo 'Main Quality run did not succeed.' >&2; exit 1; }
test -n "$quality_url" \
  || { echo 'Main Quality run URL is missing.' >&2; exit 1; }
if ! quality_job_count="$(gh run view "$quality_run_id" --repo herehigher/resume \
  --json jobs --jq '[.jobs[] | select(.name == "quality" and .conclusion == "success")] | length')"; then
  echo 'Unable to query the quality job; stop the release.' >&2
  exit 1
fi
test "$quality_job_count" = '1' \
  || { echo 'The pinned run does not contain exactly one successful quality job.' >&2; exit 1; }
printf 'Pinned main Quality: %s\n' "$quality_url"
```

この Quality URL と pinned `<RELEASE_SHA>` の組を evidence に記録します。

### Pinned release SHA の最終 artifact gate

Main `Quality / quality` の成功確認後、tag preflight より前に、review 済み `<RELEASE_SHA>` そのものへ前節の `npm run release:preflight` を実行します。command は Git archive を一時領域へ展開して artifact を復元するため、PR 前の working tree、現在の `main` tip、別 commit を代用しません。remote main の明示 refspec 更新、manifest、provider variable、source / adapter / final artifact digest、semantic smoke の不一致はすべて tag 作成前の hard failure です。

Enabled の場合だけ owner が承認した実 repository variable を読みます。Token は command argument、stdout、evidence に出しません。Disabled の場合は provider variable を読まず、validated source digest が source-identical final digest と一致することを確認します。

前節の単一 preflight command を再実行し、手動では owner approval、RC の目視確認、pinned main Quality URL、release date、tag 作成直前の最終照合を確認します。成功 marker、pinned SHA、source / provider / adapter / final digest を evidence に記録します。この gate を通過しない限り tag を作成しません。

## 初回 Pages と HTTPS 設定

初回 release の tag push 前に、owner が GitHub の `Settings` → `Pages` を開き、Build and deployment の Source を `GitHub Actions` に設定します。Custom domain を使用しないことを確認します。これは外部状態を変える操作なので、実行直前に owner approval、repository、設定対象をもう一度確認します。

初回 deployment 後、production URL が `https://herehigher.github.io/resume/` であること、HTTPS で接続できること、`Enforce HTTPS` の状態を確認します。設定者、日時、Source、custom domain、HTTPS 状態を記録し、secret は記録しません。

## Annotated immutable tag の作成と push

以下は production release を開始する操作です。実行直前に、owner approval、`<RELEASE_TAG>`、`<RELEASE_SHA>`、package version、`origin/main` ancestry を読み上げて照合します。Placeholder が残っていれば停止します。

### Owner-approved trusted release host

Tag の作成・push は、owner-approved trusted release host で実行します。helper は認証済みの `gh` session と、その identity / `ADMIN` permission だけを確認し、OS の credential API を呼びません。agent-assisted な sensitive step で `GH_TOKEN` または `GITHUB_TOKEN` が直接 environment に存在する場合は、値を読まずに owner の隔離 session へ defer します。空の変数も fail-closed とします。この制約は、人間が owner-approved trusted release host で行う操作や、CI が自身の承認済み credential を使うことを禁止するものではありません。Pages の OIDC は独立した deployment 権限であり、この helper の credential 確認には使用しません。

Owner の隔離 session から helper を実行する場合は、pre-tag gate の成功 run ID と pinned tuple を渡します。

```bash
npm run release:publish-tag -- --owner-isolated-session \
  --release-tag '<RELEASE_TAG>' \
  --release-sha '<RELEASE_SHA>' \
  --pre-tag-gate-run '<PRE_TAG_GATE_RUN_ID>'
```

まず tag が local と remote のどちらにも存在しないことを確認します。既に存在する場合は tag を再作成・移動・削除せず、原因を調査します。Remote query の network、authentication、server error を「tag がない」と解釈してはいけません。

```bash
### RELEASE_TAG_PREFLIGHT_START
release_tag="${RELEASE_TAG:-<RELEASE_TAG>}"
release_sha="${RELEASE_SHA:-<RELEASE_SHA>}"
case "$release_tag$release_sha" in *'<'*|*'>'*) echo 'Replace every release placeholder first.' >&2; exit 1 ;; esac
case "$release_sha" in ''|*[!0-9a-f]*) echo 'Release SHA must be a full lowercase hexadecimal commit id.' >&2; exit 1 ;; esac
case "${#release_sha}" in 40|64) ;; *) echo 'Release SHA must be a full commit id.' >&2; exit 1 ;; esac
git merge-base --is-ancestor --end-of-options "$release_sha" origin/main \
  || { echo 'Pinned release SHA is not on origin/main; stop the release.' >&2; exit 1; }
package_json="$(git show --no-ext-diff --format= --no-textconv --end-of-options "${release_sha}:package.json")" \
  || { echo 'Unable to read package.json from the pinned release SHA.' >&2; exit 1; }
package_version="$(node -e 'const fs = require("node:fs"); const value = JSON.parse(fs.readFileSync(0, "utf8")).version; if (typeof value !== "string") process.exit(1); process.stdout.write(value);' <<< "$package_json")" \
  || { echo 'Pinned package.json has no valid string version.' >&2; exit 1; }
expected_tag="v${package_version}"
node -e 'process.exit(/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(process.argv[1]) ? 0 : 1)' "$expected_tag" \
  || { echo 'Pinned package version is not stable SemVer.' >&2; exit 1; }
test "$release_tag" = "$expected_tag" \
  || { echo 'Release tag does not exactly match the pinned package version.' >&2; exit 1; }
if git rev-parse --verify --quiet --end-of-options "refs/tags/${release_tag}" >/dev/null; then
  echo 'Release tag already exists locally; stop the release.' >&2
  exit 1
else
  local_tag_status=$?
  test "$local_tag_status" -eq 1 || { echo 'Unable to query the local tag; stop the release.' >&2; exit 1; }
fi
if ! remote_tag_result="$(git ls-remote --tags origin "refs/tags/${release_tag}")"; then
  echo 'Unable to query remote tags; stop the release.' >&2
  exit 1
fi
test -z "$remote_tag_result" || { echo 'Release tag already exists remotely; stop the release.' >&2; exit 1; }
printf 'Release tag preflight passed: %s -> %s\n' "$release_tag" "$release_sha"
### RELEASE_TAG_PREFLIGHT_END
```

Pinned SHA の `package.json` から version を読み、workflow validator と同じ stable SemVer 規則で `expected_tag` を導出します。`release_tag` と完全一致しない場合は停止します。Local query は missing tag の status `1` だけを許可します。Remote query は command 自体の成功を先に要求し、その成功 output が空であることを別に検査します。成功 marker、package version、`<RELEASE_VERSION>` が一致することを確認し、同じ shell session で annotated tag を作成します。

```bash
test "$release_tag" = "$expected_tag" \
  || { echo 'Validated tag state is missing; stop the release.' >&2; exit 1; }
git tag --annotate "$release_tag" "$release_sha" --message "Resume Studio ${release_tag}" \
  || { echo 'Annotated tag creation failed; stop the release.' >&2; exit 1; }
git show --no-patch --decorate --end-of-options "$release_tag" \
  || { echo 'Unable to inspect the new annotated tag; stop the release.' >&2; exit 1; }
tag_commit="$(git rev-parse --verify --end-of-options "${release_tag}^{commit}")" \
  || { echo 'Unable to peel the new tag to a commit; stop the release.' >&2; exit 1; }
test "$tag_commit" = "$release_sha" \
  || { echo 'New tag does not resolve to the pinned release SHA; do not push it.' >&2; exit 1; }
```

表示された tag、version、full commit SHA を再確認します。正しければ owner の最終承認後、exact tag ref だけを push します。

```bash
test "$release_tag" = "$expected_tag" \
  || { echo 'Validated tag state is missing; do not push.' >&2; exit 1; }
test "$(git rev-parse --verify --end-of-options "${release_tag}^{commit}")" = "$release_sha" \
  || { echo 'Tag commit changed or cannot be verified; do not push.' >&2; exit 1; }
git push origin "refs/tags/${release_tag}:refs/tags/${release_tag}" \
  || { echo 'Exact tag push failed; inspect the remote before retrying.' >&2; exit 1; }
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
- Immutable tag / validated release SHA: `<RELEASE_TAG>` / `<RELEASE_SHA>`
- Owner approval: `<APPROVER>` / `<APPROVED_AT>`
- Pull Request: `<PR_URL>`
- Release Issue: `<ISSUE_URL>`
- Quality on PR: `<RESULT_AND_RUN_URL>`
- Reviewed PR merge SHA pin: `<PR_URL>` / `<RELEASE_SHA>`
- Main `Quality / quality` for pinned SHA: `<RELEASE_SHA>` / `<RESULT_AND_RUN_URL>`
- `npm run test:acceptance`: `<RESULT>`
- Working tree `git diff --check`: `<RESULT>`
- Committed PR range `git diff --check origin/main...HEAD`: `<RESULT>`
- Version consistency (`package.json` / `APP_VERSION` / `CHANGELOG.md`): `<RESULT>`
- CHANGELOG release notes / date: `<RELEASE_VERSION>` / `<RELEASE_DATE>` / `<RESULT>`
- Pages Analytics mode / provider / fingerprint: `<MODE>` / `<PROVIDER>` / `<SHA256_OR_NONE>`
- Pages source / adapter / final artifact digest: `<SOURCE_SHA256>` / `<ADAPTER_SHA256>` / `<ARTIFACT_SHA256>`
- Final pinned artifact gate: `<RELEASE_SHA>` / `<RESULT>`
- Visual acceptance: `<RESULT, OS, CHROME_VERSION, CHECKED_AT>`
- Screenshot / PDF source SHA: `<SHA_OR_NOT_APPLICABLE>`
- Pages Source / custom domain / HTTPS: `<SETTINGS_RESULT>`
- Deploy workflow attempt / accepted run: `<ATTEMPT_RUN_URL>` / `<ACCEPTED_RUN_URL>`
- Workflow source SHA / validated release SHA: `<WORKFLOW_SOURCE_SHA>` / `<RELEASE_SHA>`
- Recovery PR / rerun chain: `<PR_OR_RUN_CHAIN_OR_NONE>`
- Environment URL: `https://herehigher.github.io/resume/`
- Online smoke / manual browser: `<RESULT>`
- Known differences / follow-up Issue: `<DETAILS_OR_NONE>`
- Final decision: `<ACCEPTED_OR_NOT_ACCEPTED>`
```

## Existing tag の manual redeploy / rollback

Manual redeploy は既存の immutable stable tag だけを対象にします。CDN の一時状態を再確認する場合は同じ tag、content defect から rollback する場合は直前に受入済みの tag を選びます。新しい未検証 ref、branch、SHA や Analytics override は入力しません。同じ tag は自身の tagged manifest を再利用し、mode、provider、fingerprint、artifact digest を変更できません。

実行前に owner approval、default branch、対象 tag の存在、package version、過去の受入記録を確認します。

```bash
git fetch --tags origin main \
  || { echo 'Unable to refresh existing release tags; stop the redeploy.' >&2; exit 1; }
existing_tag='<EXISTING_RELEASE_TAG>'
case "$existing_tag" in *'<'*|*'>'*) echo 'Replace the existing tag placeholder first.' >&2; exit 1 ;; esac
existing_sha="$(git rev-parse --verify --end-of-options "refs/tags/${existing_tag}^{commit}")" \
  || { echo 'Existing release tag cannot be resolved; stop the redeploy.' >&2; exit 1; }
existing_package_json="$(git show --no-ext-diff --format= --no-textconv --end-of-options "${existing_sha}:package.json")" \
  || { echo 'Unable to inspect package.json for the existing tag.' >&2; exit 1; }
existing_package_version="$(node -e 'const fs = require("node:fs"); const value = JSON.parse(fs.readFileSync(0, "utf8")).version; if (typeof value !== "string") process.exit(1); process.stdout.write(value);' <<< "$existing_package_json")" \
  || { echo 'Existing tag package.json has no valid string version.' >&2; exit 1; }
expected_existing_tag="v${existing_package_version}"
node -e 'process.exit(/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(process.argv[1]) ? 0 : 1)' "$expected_existing_tag" \
  || { echo 'Existing tag package version is not stable SemVer.' >&2; exit 1; }
test "$existing_tag" = "$expected_existing_tag" \
  || { echo 'Existing tag does not match its package version; stop the redeploy.' >&2; exit 1; }
git merge-base --is-ancestor --end-of-options "$existing_sha" origin/main \
  || { echo 'Existing release tag is not on origin/main; stop the redeploy.' >&2; exit 1; }
```

GitHub Actions の `Deploy Pages` → `Run workflow` で branch に default branch を選び、`release_tag` に `<EXISTING_RELEASE_TAG>` を入力します。CLI を使う場合も、実行直前に repository と tag を再確認します。

```bash
gh workflow run deploy-pages.yml --ref main --field "release_tag=${existing_tag}" \
  || { echo 'Manual redeploy dispatch failed; inspect Actions before retrying.' >&2; exit 1; }
```

Manual run も exact tag、version、main ancestry、Quality、tagged manifest、最終 artifact digest を再検証します。Enabled tag は fingerprint と一致する provider token を保持している場合だけ決定的に再構築できます。旧 token が利用不能または variable が変更されていれば redeploy は失敗し、同じ tag を別 token で再構築しません。修正には新しい version/tag を使用します。完了後は Actions、environment URL、online smoke、manual browser の証拠を新しい記録として残します。Rollback は tag を変更する操作ではなく、既存 tag の検証済み `site/` を再 deployment する操作です。

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
