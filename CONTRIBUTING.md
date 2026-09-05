# コントリビューション

[開発規約](AGENTS.md)を守り、[開発ガイド](docs/development-guide.md)で環境と変更範囲に必要な確認を選びます。

Issue には再現手順、期待結果、実際の結果、browser / OS を記載してください。Issue・PR・review comment は日本語を主とし、必要なら短い English summary を添えます。

PR は具体的な問題と変更後の動作を先に説明し、関連 Issue、変更範囲、実施した test と CI 結果、未確認事項を記載します。目視が必要な変更では確認した言語・用紙・画面幅と結果を添え、生成物を使った場合はその source commit が分かる artifact をリンクします。自動 test と人の受入判断を混同しません。

[PR template](.github/pull_request_template.md)を利用できます。公開準備と production 操作は[リリース手順](docs/release-playbook.md)に従います。

提出した contribution は [MIT License](LICENSE) の下で配布されます。
