# Privacy / 隐私 / プライバシー

Version 1.2 - Effective 2026-09-23

- [日本語](#privacy-ja)
- [简体中文](#privacy-zh-cn)
- [English](#privacy-en)

<a id="privacy-ja"></a>

## 日本語

### 保存する情報

Resume Studio は、現在の browser origin の `localStorage` に `resume-studio-web-v4` という data version 別 key で下書きを保存します。下書き本文は Web Crypto の AES-GCM で暗号化し、保存値は envelope format、algorithm、nonce、ciphertext を含む内部用 envelope です。復号用 AES key は取り出せない `CryptoKey` として同じ version 別の IndexedDB に分けて保存し、localStorage には保存しません。一つの `version: 4` state に profile、埋め込み写真、日本語・简体中文・English の文書、言語と用紙設定が含まれ、JSON import/export も同じ data version を使います。`resume-studio-web-v3` だけを互換 key として read-only で読み、新 key への保存成功後にだけ旧 raw と鍵を自動削除します。保存失敗、競合、read-only fallback 時は旧草稿を保持します。対応範囲外の旧 key は列挙、読み込み、変更、削除しません。入力時の自動保存に加え、利用者は手動保存、JSON 書き出し・読込、browser の印刷機能による PDF 保存を実行できます。暗号 envelope の format version は data version とは独立しており、export されません。

暗号化保存には secure context が必要です。`https://`、`http://localhost`、または `http://127.0.0.1` 以外の non-secure HTTP origin では草稿の保存・再読込を拒否し、既存の保存データを変更しません。

現在形式と、最大直近3世代のうち明示的に対応した形式を読み込めます。将来版・非対応・過旧の JSON import は拒否し、既存の下書き、鍵、表示 preference を保持します。現在の v3 は v2 を対応範囲に含め、v1 は含めません。Web Locks を利用できない browser では競合を避けるため保存、削除、移行を停止します。内容の確認と JSON export は可能な範囲で残ります。

### Network と外部送信

Repository の `site/`、clone、fork に Analytics beacon は含まれません。公式 hosted site では Cloudflare Pages が delivery layer で Cloudflare Web Analytics を挿入します。アプリは履歴書入力、写真、import / export JSON、端末上の草稿を Analytics request に含めません。

公式 hosted site の Cloudflare Web Analytics は page view と performance 情報を集計します。Cloudflare は通常の接続情報（IP address や user agent など）と page、referrer、performance 情報を自身の規約に従って処理する場合があります。詳細は [Cloudflare Web Analytics](https://www.cloudflare.com/web-analytics/) を確認してください。preview 内の `http://` または `https://` profile link を利用者が選ぶと、その link 先へ移動します。アプリはこれら以外の analytics、外部 API、CDN、外部 font service を使用せず、履歴書本文を受け取る backend もありません。

### 保持、削除、損失リスク

localStorage の下書き本文は AES-GCM で暗号化されますが、export file は暗号化されません。鍵または browser data を消去、private browsing を終了、保存容量超過、または browser による storage eviction が起きると、下書きを復号できない・失う可能性があります。重要な下書きは JSON で安全な場所へ backup してください。この保護は same-origin script/XSS、悪意の browser extension、browser profile または端末の侵害を防ぐものではありません。

アプリ内の削除 UI は日本語画面の最下部にあります。確認して削除すると現在の `resume-studio-web-v4` の三言語下書きと現在の画面入力をまとめて消去します。旧 version の草稿は削除しません。この操作は取り消せません。無関係な storage 項目、download 済み JSON/PDF、browser の download 履歴、別 origin/profile の data は削除しません。

JSON と PDF には氏名、連絡先、経歴、写真などの個人情報が含まれる場合があります。共有と保管は利用者自身で管理してください。

<a id="privacy-zh-cn"></a>

## 简体中文

### 保存的信息

Resume Studio 使用按 data version 区分的 key `resume-studio-web-v4`，把草稿保存在当前 browser origin 的 `localStorage` 中。草稿正文通过 Web Crypto AES-GCM 加密；保存值是内部 envelope，包含 envelope format、algorithm、nonce 和 ciphertext。用于解密的 AES key 是不可导出的 `CryptoKey`，单独存放在同 version 的 IndexedDB，不存入 localStorage。一个 `version: 4` state 包含 profile、嵌入照片、日本語、简体中文和 English 文档以及语言与纸张设置；JSON 导入/导出使用同一个 data version。只将 `resume-studio-web-v3` 作为兼容旧 key 以 read-only 方式读取；只有成功保存到新 key 后，应用才会删除旧 raw 和密钥，保存失败、冲突或 read-only fallback 时会保留旧草稿。超出兼容范围的旧 key 不会被枚举、读取、修改或删除。用户可以自动或手动保存、导出/导入 JSON，并通过 browser 打印功能保存 PDF。加密 envelope 的 format version 与 data version 独立，且不会被导出。

加密保存需要安全上下文。在 `https://`、`http://localhost` 或 `http://127.0.0.1` 以外的非安全 HTTP origin 中，应用会拒绝保存和重新载入草稿，并且不会修改已有的保存数据。

应用可以读取当前格式，以及最近三代中被明确列为支持的格式。未来版本、不支持或过旧的 JSON import 会被拒绝，现有草稿、密钥和显示 preference 将被保留。当前 v3 支持 v2，不支持 v1。browser 无法使用 Web Locks 时，为避免冲突会停止保存、删除和迁移；在可行范围内仍可查看内容和导出 JSON。

### 网络与外部提交

Repository 的 `site/`、clone 和 fork 均不包含 Analytics beacon。官方托管站点由 Cloudflare Pages 在 delivery layer 注入 Cloudflare Web Analytics。应用不会把简历输入、照片、import / export JSON 或设备草稿放入 Analytics request。

官方托管站点的 Cloudflare Web Analytics 会汇总页面访问量与性能信息。Cloudflare 可能根据其自身条款处理普通连接信息（例如 IP address、user agent）以及 page、referrer 和 performance 信息。详情请参阅 [Cloudflare Web Analytics](https://www.cloudflare.com/web-analytics/)。用户主动选择 preview 中的 `http://` 或 `https://` profile link 时，browser 会访问目标网站。除此之外，本应用不使用其他 analytics、外部 API、CDN 或外部 font service，也没有接收简历正文的 backend。

### 保留、删除与丢失风险

localStorage 中的草稿正文使用 AES-GCM 加密，但 export file 不加密。清除密钥或 browser data、结束 private browsing、超出存储容量或 browser storage eviction 都可能使草稿无法解密或丢失。请将重要草稿导出为 JSON 并安全 backup。该保护不能防护同源 script/XSS、恶意 browser extension、browser profile 或设备被入侵。

应用内删除 UI 位于日本語页面最下方。确认删除后，当前 `resume-studio-web-v4` 中三种语言的草稿和当前画面输入会一起被清除，且无法撤销。旧 version 的草稿不会被删除。该操作不会删除无关的 storage 项、已经下载的 JSON/PDF、browser download history，也不会清除其他 origin/profile 的 data。

JSON 和 PDF 可能包含姓名、联系方式、经历及照片等个人信息。用户需自行负责共享与保管。

<a id="privacy-en"></a>

## English

### Data stored

Resume Studio stores the draft in `localStorage` for the current browser origin under the data-version-specific key `resume-studio-web-v4`. Draft content is encrypted with Web Crypto AES-GCM; the internal envelope contains an envelope format, algorithm, nonce, and ciphertext. The non-extractable decryption `CryptoKey` is kept in the matching version-specific IndexedDB database and never in localStorage. One `version: 4` state contains the profile, embedded photo, Japanese, Simplified Chinese, and English documents, plus locale and paper settings; JSON imports and exports use the same data version. Only `resume-studio-web-v3` is read as a compatible prior key in read-only mode. The old raw draft and encryption key are removed only after the new-key save succeeds; save failures, conflicts, and read-only fallback retain them. Out-of-range old keys are never enumerated, read, changed, or deleted. Users can save automatically or manually, import/export JSON, and save a PDF through browser printing. The encryption-envelope format version remains separate from the data version and is never exported.

Encrypted persistence requires a secure context. On non-secure HTTP origins other than `http://localhost` or `http://127.0.0.1`, the app refuses to save or reload drafts and does not change existing saved data.

The app can read the current format and explicitly supported formats from up to the previous three versions. Future, unsupported, or too-old JSON imports are rejected and retain the existing draft, key, and display preference. The current v3 includes v2 but not v1 in its compatibility range. When Web Locks are unavailable, saving, deletion, and migration stop to avoid conflicts. Viewing content and exporting JSON remain available where possible.

### Network and external submission

The repository `site/`, clones, and forks contain no Analytics beacon. Cloudflare Pages injects Cloudflare Web Analytics at the delivery layer on the official hosted site. The app never includes resume input, photos, imported or exported JSON, or on-device drafts in Analytics requests.

Cloudflare Web Analytics on the official hosted site aggregates page-view and performance information. Cloudflare may process ordinary connection details (such as IP address and user agent) and page, referrer, and performance information under its own terms. See [Cloudflare Web Analytics](https://www.cloudflare.com/web-analytics/) for details. If a user selects an `http://` or `https://` profile link in the preview, the browser navigates to that target. The app uses no other analytics, external APIs, CDNs, or external font services, and there is no backend that receives resume content.

### Retention, deletion, and loss risks

Draft content in localStorage is AES-GCM encrypted, but exported files are not encrypted. Clearing the key or browser data, ending a private-browsing session, exceeding storage quota, or browser storage eviction can make a draft undecryptable or remove it. Export important drafts as JSON and keep the backup secure. This protection does not defend against same-origin scripts/XSS, malicious browser extensions, or browser-profile or device compromise.

The in-app deletion UI is at the bottom of the Japanese screen. After confirmation, it removes all three language drafts in the current `resume-studio-web-v4` namespace and resets the current on-screen input. This cannot be undone. Drafts in old version namespaces are not removed. It does not remove unrelated storage entries, downloaded JSON/PDF files, browser download history, or data belonging to another origin/profile.

JSON and PDF files may contain personal information such as a name, contact details, employment history, and photo. The user controls their storage and sharing.
