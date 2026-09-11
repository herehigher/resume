# コントリビューション

[開発規約](AGENTS.md)を守り、[開発ガイド](docs/development-guide.md)で環境と変更範囲に必要な確認を選びます。

Issue には再現手順、期待結果、実際の結果、browser / OS を記載してください。Issue・PR・review comment は日本語を主とし、必要なら短い English summary を添えます。

PR は具体的な問題と変更後の動作を先に説明し、関連 Issue、変更範囲、実施した test と CI 結果、未確認事項を記載します。目視が必要な変更では確認した言語・用紙・画面幅と結果を添え、生成物を使った場合はその source commit が分かる artifact をリンクします。自動 test と人の受入判断を混同しません。

[PR template](.github/pull_request_template.md)を利用できます。公開準備と production 操作は[リリース手順](docs/release-playbook.md)に従います。

## Issue / PR の本文を安全に渡す

複数行の Markdown を shell の `--body` 引数や command substitution に書かず、temporary file を `gh` の `--body-file` に渡します。下の here-document は `<<'EOF'` の引用により本文を shell 評価せず、helper は標準入力の bytes をそのまま file へ書きます。`body_file` は `mktemp` が返す temporary file だけにし、実在する履歴書 data、credential、token は本文や temporary file に書きません。

```bash
body_file="$(mktemp)"
trap 'rm -f "$body_file"' EXIT
node scripts/write-github-body-file.mjs --output "$body_file" <<'EOF'
## 架空の本文

- `literal --body`
- $(not-a-command)
- "double quotes" and 'single quotes'
- [Issue #123](https://github.com/OWNER/REPOSITORY/issues/123) と [PR #456](https://github.com/OWNER/REPOSITORY/pull/456)
EOF

gh issue create --title '架空の Issue title' --body-file "$body_file"
gh pr create --base main --title '架空の PR title' --body-file "$body_file"
gh pr edit PR_NUMBER --body-file "$body_file"
```

PR では既存の [PR template](.github/pull_request_template.md) を起点にする場合も、同じ temporary file へ原文のまま書いてから編集します。

```bash
node scripts/write-github-body-file.mjs --output "$body_file" < .github/pull_request_template.md
```

`gh pr create` と `gh pr edit` のどちらにも同じ `--body-file` を使います。Issue / PR link は本文 file に Markdown link として書き、完了条件を満たした PR だけ `Closes #NUMBER` を含めます。公開テキストには test の raw log を転記せず、結果の要約と未確認事項だけを記載します。

提出した contribution は [MIT License](LICENSE) の下で配布されます。
