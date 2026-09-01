# Privacy / 隐私 / プライバシー

Version 1.0 - Effective 2026-09-01

- [日本語](#privacy-ja)
- [简体中文](#privacy-zh-cn)
- [English](#privacy-en)

<a id="privacy-ja"></a>

## 日本語

### 保存する情報

Resume Studio は、現在の browser origin の `localStorage` に `resume-studio-web-v1` という key で下書きを保存します。一つの v1 state に profile、埋め込み写真、日本語・简体中文・English の文書、言語と用紙設定が含まれます。入力時の自動保存に加え、利用者は手動保存、JSON 書き出し・読込、browser の印刷機能による PDF 保存を実行できます。

### Network と外部送信

アプリの HTML、CSS、JavaScript、画像などを表示するため、同一 origin の静的 asset request は発生します。利用者が preview 内の `http://` または `https://` profile link を選んだ場合は、その link 先へ移動します。これらを除き、アプリは履歴書入力、写真、JSON を backend、analytics、外部 API、CDN、外部 font service へ自動送信しません。静的 hosting provider は接続時の通常の request 情報を自身の規約に従って扱う場合がありますが、履歴書本文を受け取る application backend はありません。

### 保持、削除、損失リスク

localStorage と export file は暗号化されません。共有端末、browser extension、端末への不正 access から内容を保護するのは利用者の責任です。browser data の消去、private browsing の終了、保存容量超過、browser による storage eviction で下書きを失う可能性があります。重要な下書きは JSON で安全な場所へ backup してください。

アプリ内の削除 UI は日本語画面の最下部にあります。確認して削除すると `resume-studio-web-v1` の三言語下書きと現在の画面入力をまとめて消去します。この操作は取り消せません。旧形式 `resume-studio-data-v1`、download 済み JSON/PDF、browser の download 履歴、別 origin/profile の data は削除しません。

JSON と PDF には氏名、連絡先、経歴、写真などの個人情報が含まれる場合があります。共有と保管は利用者自身で管理してください。

<a id="privacy-zh-cn"></a>

## 简体中文

### 保存的信息

Resume Studio 使用 key `resume-studio-web-v1`，把草稿保存在当前 browser origin 的 `localStorage` 中。一个 v1 state 包含 profile、嵌入照片、日本語、简体中文和 English 文档，以及语言与纸张设置。除输入时自动保存外，用户还可以手动保存、导出/导入 JSON，并通过 browser 打印功能保存 PDF。

### 网络与外部提交

为了显示应用的 HTML、CSS、JavaScript 和图片，会产生同一 origin 的静态 asset request。用户主动点击 preview 中的 `http://` 或 `https://` profile link 时会访问目标网站。除此之外，应用不会自动把简历输入、照片或 JSON 提交到 backend、analytics、外部 API、CDN 或外部 font service。静态 hosting provider 可能按其规则处理普通连接 request 信息，但本应用没有接收简历正文的 application backend。

### 保留、删除与丢失风险

localStorage 和 export file 不会被加密。用户需要自行防范共享设备、browser extension 或未授权设备访问。清除 browser data、结束 private browsing、超出存储容量，或 browser storage eviction 都可能使草稿丢失。请将重要草稿导出为 JSON 并安全 backup。

应用内删除 UI 位于日本語页面最下方。确认删除后，`resume-studio-web-v1` 中三种语言的草稿和当前画面输入会一起被清除，且无法撤销。该操作不会删除旧格式 `resume-studio-data-v1`、已经下载的 JSON/PDF、browser download history，也不会清除其他 origin/profile 的 data。

JSON 和 PDF 可能包含姓名、联系方式、经历及照片等个人信息。用户需自行负责共享与保管。

<a id="privacy-en"></a>

## English

### Data stored

Resume Studio stores the draft in `localStorage` for the current browser origin under the key `resume-studio-web-v1`. One v1 state contains the profile, embedded photo, Japanese, Simplified Chinese, and English documents, plus locale and paper settings. In addition to autosave while editing, the user can save manually, export/import JSON, and save a PDF through the browser's print function.

### Network and external submission

Same-origin static asset requests occur to display the app's HTML, CSS, JavaScript, and images. If the user selects an `http://` or `https://` profile link in the preview, the browser navigates to that target. Apart from those actions, the app does not automatically submit resume input, photos, or JSON to a backend, analytics service, external API, CDN, or external font service. A static hosting provider may process ordinary connection request information under its own terms, but there is no application backend that receives resume content.

### Retention, deletion, and loss risks

LocalStorage and exported files are not encrypted. The user is responsible for protecting content from shared-device access, browser extensions, and unauthorized device access. Clearing browser data, ending a private-browsing session, exceeding the storage quota, or browser storage eviction can remove a draft. Export important drafts as JSON and keep the backup secure.

The in-app deletion UI is at the bottom of the Japanese screen. After confirmation, it removes all three language drafts in `resume-studio-web-v1` and resets the current on-screen input. This cannot be undone. It does not remove the legacy `resume-studio-data-v1` key, downloaded JSON/PDF files, browser download history, or data belonging to another origin/profile.

JSON and PDF files may contain personal information such as a name, contact details, employment history, and photo. The user controls their storage and sharing.
