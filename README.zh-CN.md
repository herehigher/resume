# Resume Studio - 简体中文指南

[日本語](README.md) | [English](README.en.md)

Resume Studio 是一款个人使用的静态 Web 应用，可在浏览器中编辑日本語、简体中文和 English 简历，并保存为 PDF 或 JSON。正式代码由静态 HTML、CSS 和 ES Modules 组成，不会自动把简历输入提交到 backend 或外部服务。

## 在线版

在线版：[https://herehigher.github.io/resume/](https://herehigher.github.io/resume/)

## 支持的文档和纸张

| 语言 | 文档 | 纸张 |
| --- | --- | --- |
| 日本語 | 履歴書、職務経歴書 | A4 |
| 简体中文 | 中文简历 | A4 |
| English | ATS-friendly resume | US Letter、A4 |

日本語、简体中文和 English 的各语言 document section 相互独立，不会彼此覆盖。profile、联系方式和照片由三种语言共享，因此在任一语言中修改都会反映到其他语言。填写示例只会临时显示，不会修改已保存的草稿；只有主动采用示例时才会保存。

## 在本地启动

Node.js 仅用于测试，应用本身不需要 build。因为使用 ES Modules，请通过静态 Web server 提供 `site/`，不要用 `file://` 直接打开。请选择 Python 3 或 Node.js 加 npx 中的一种方式，无需同时运行两者。

Python 3：

```bash
python3 -m http.server 8000 --directory site
```

Node.js 和 npx：

```bash
npx --yes http-server site --port 8000
```

使用 Chrome 打开 `http://localhost:8000/` 可直接开始日语 editor，或选择简体中文、English 介绍页；也可打开 editor：`http://localhost:8000/editor/`。

草稿的 AES-GCM 加密需要 secure context。请使用 `https://`、`http://localhost` 或 `http://127.0.0.1`；不要打开 server 显示的 `http://0.0.0.0` 或 LAN IP URL。

## 只通过 README 开始使用

1. 从公开首页直接开始日语 editor，或从简体中文、English 介绍页进入对应 editor。editor 内可使用右上角的语言 selector，也可以直接打开 `/editor/?lang=ja`、`/editor/?lang=zh-CN`、`/editor/?lang=en`。
2. 修改输入栏后，preview 会立即更新。若想先了解成品，可选择“查看填写示例”。示例不会覆盖已保存的草稿。
3. 输入会自动保存到当前 browser profile 的 `localStorage`。可用“保存草稿”手动保存，并用“重新载入草稿”恢复已保存内容。
4. 选择“导出 PDF”，在 Chrome 打印界面选择“另存为 PDF”。纸张和打印选项请参照下面的限制说明。
5. 从右上角数据 menu 导出 JSON 可创建 backup。恢复时选择“导入数据”并载入同一格式的 JSON。无效 file 不会替换现有草稿。
6. 如需删除数据，请先切换到日本語，在页面最下方选择“保存した下書きを削除”，再在确认 dialog 中清除。该操作会删除 v1 格式的三种语言草稿和当前画面输入。

## 主要功能

- 相互独立的三语言 document section、共享 profile 和语言切换
- 日本語的履歴書 / 職務経歴書切换
- 输入时实时更新的 preview
- 示例临时查看、采用和恢复原草稿
- 自动保存、手动保存和重新载入
- JSON backup / restore
- 只允许 `http://` 和 `https://` 的 profile link
- A4 / US Letter PDF 和自动分页
- Desktop 与 mobile 宽度下的编辑 / preview 切换

## 界面截图和 PDF 示例

![简体中文编辑界面和预览](docs/screenshots/zh-CN.png)

- [日本語 A4 PDF 示例](output/pdf/ja-a4.pdf)
- [简体中文 A4 PDF 示例](output/pdf/zh-CN-a4.pdf)
- [English US Letter PDF 示例](output/pdf/en-letter.pdf)

这些历史展示示例均使用虚构数据。生成时的 source 和 Chromium version 记录在 [asset manifest](docs/assets-manifest.json) 中。

## 数据和隐私

- 保存 key 为 `resume-studio-web-v1`，会把 profile、照片和三种语言文档一起保存到当前 browser origin。
- 草稿正文以 AES-GCM 加密后保存在 localStorage。导出的 JSON 和 PDF 不加密，并可能包含照片等个人信息，请安全保管。
- 清除 browser data、结束 private browsing、存储容量不足或 browser storage eviction 都可能导致草稿丢失。重要草稿请导出 JSON backup。
- 应用内删除只清除 v1 state，不会删除旧 `resume-studio-data-v1`、已下载的 JSON/PDF 或 browser download history。
- Repository 中的 `site/`、clone 和 fork 默认禁用 Analytics，不会向同一 origin 静态 asset 以外的地址发送统计请求。只有 `herehigher/resume` 的已验证 stable tag，才可在 tagged manifest 启用时由 deployment-only adapter 向 artifact 确定性加入标准 Cloudflare Web Analytics。它不使用 Cookie、localStorage、用户级 ID 或 custom event，也不会发送简历输入、照片、JSON 或设备草稿。可通过页面 status 与 Network panel 核查当前 mode。

详情请阅读 [隐私说明 / 简体中文](PRIVACY.md#privacy-zh-cn)。

## 支持的浏览器和 PDF 限制

- 自动验收覆盖最新 Chrome/Chromium、desktop `1440 x 1000` 和 mobile 等效尺寸 `390 x 844`。
- Safari、Firefox 和真实 mobile device 尚未验证。即使使用 Chromium，OS、font 和打印 engine 也可能改变换行及分页。
- 保存 PDF 时请关闭 browser header/footer，开启 background graphics，使用约 100% scale，并优先采用 CSS page size。
- 日本語和简体中文使用 A4；English 可选 US Letter 或 A4。保存前请在打印 preview 检查文字裁切、多余空白页和纸张尺寸。
- 极长 URL、无法换行的单词或大量文本可能改变 layout，正式提交前需要目视检查。

## 开发与验证

```bash
npm ci
npm run test:acceptance
```

请勿向 `site/` source 加入外部 API、CDN、外部 font 或 analytics。唯一例外是 deployment-only adapter 根据 tagged manifest，为官方 repository 的已验证 stable tag artifact 加入标准 Cloudflare Web Analytics。详情参见 [Contributing](CONTRIBUTING.md) 和 [release playbook](docs/release-playbook.md)。

## 仓库资料

- [Privacy](PRIVACY.md#privacy-zh-cn)
- [Changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md)
- [MIT License](LICENSE)
