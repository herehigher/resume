# 開発規約

Repository 全体に適用し、作業場所に近い `AGENTS.override.md` / `AGENTS.md` を優先します。日本語・简体中文・English の個人向け履歴書 Web application です。

## 必須原則

- `site/` は標準 HTML / CSS / ES Modules で構成し、build なしで static server / GitHub Pages から動作させる。責務を分割し、循環依存を作らない。`file://` は対象外。
- 保存形式は `resume-studio-web-v3`。端末内草稿と JSON import/export は同じ単一の `version` を使う。対応中の旧 version は明示した key だけを read-only で読み、新 key への保存成功後に旧 raw と鍵を削除する。新 key への保存失敗時は旧草稿を保持する。対応範囲外や未設定の key は列挙・読込・変更・削除しない。暗号化草稿の保護を維持し、現在の草稿を意図的に削除する場合は利用者に確認する。
- Locale は `ja`、`zh-CN`、`en`。文書は言語ごとに独立し、profile・連絡先・写真は共有する。
- User input は HTML escape し、clickable link は `http://` / `https://` のみ。履歴書入力・写真・JSON・草稿を network request へ含めない。
- Source の Analytics は無効。外部 API、CDN、外部 font、追加 analytics runtime を導入しない。公式 CI の標準 Cloudflare Web Analytics 注入だけを例外とし、[公開手順](docs/release-playbook.md#analytics-の扱い)に従う。
- 実在する履歴書 data と実 credential / secret / access token を log、fixture、sample、生成物、公開文書、commit に含めない。検証には明確な架空 data を使う。公開 beacon site token は通常の site 設定として扱う。
- Desktop / smartphone の主要操作を維持し、PDF は対象言語・用紙で文字切れ、重なり、不要な空白・重複 page を防ぐ。
- 依頼と無関係な design、input data、dependency を変更しない。Test dependency は目的と更新方法が明確な場合だけ追加する。
- UI は対象言語で簡潔に記載する。Issue / PR / review comment は日本語を主とし、必要な code comment は英語を主とする。
- GitHub に公開されるテキスト（自動生成物を含む）は、意図しない mention が発生しないよう確認する。Command / test の生出力は原則掲載せず結果を要約し、掲載が必要な箇所は mention を無効化した上で fenced code block に隔離する。

## 作業の参照先

- Setup、変更に応じた test、PDF / responsive 目視、展示 sample: [開発ガイド](docs/development-guide.md)
- Issue / PR の提出: [CONTRIBUTING.md](CONTRIBUTING.md)
- 公開権限、準備・承認・公開・再開: [リリース手順](docs/release-playbook.md)

同じ規則を複数文書へ再掲せず、上記の正本を更新してください。
