# Resume Studio — 简体中文使用指南

Resume Studio 是无需登录的简历制作应用。可从[简体中文公开入口](/zh-cn/)了解功能，在[简体中文 editor](/editor/?lang=zh-CN)开始编辑。

## 文档与 PDF

- 日语支持履历书和职务经历书，简体中文与 English 各支持一份简历。各语言正文独立保存，不会自动翻译；姓名、联系方式、照片等 profile 信息共享。
- 编辑时通过预览检查内容和分页。日语、中文支持 A4，English 支持 Letter / A4。
- 在 editor 中使用打印操作，打开浏览器打印界面并选择保存为 PDF。请确认当前语言、文档和纸张，检查每一页有无文字截断或重叠。没有通过公开 API 生成 PDF 的功能。

## JSON 与本地草稿

- JSON 导出备份包含所有语言的文档、共享 profile、照片和设置。PDF 和 JSON 可能含有个人信息，请保存在用户指定的安全位置。
- 当前保存格式为 `version: 4`（`resume-studio-web-v4`）。可参考 [v4 JSON Schema](/schema/resume-studio-web-v4.schema.json)和[明确使用虚构数据的导入示例](/schema/resume-studio-web-v4.example.json)。Schema 定义导出文件格式，不是数据上传 API。
- Schema 中的 `x-resume-studio-uniqueBy: "id"` 是必需的自定义 applicator。指定的每个数组内，record ID 必须唯一。普通 JSON Schema validator 可能忽略未知 keyword，因此仅通过普通验证不代表可以导入。请同时支持该 applicator，并用 editor 的实际导入验证确认。保留数组顺序，不要擅自重写 ID 或分页引用。
- JSON 导入会替换当前内容。请先备份，再确认用户意图后操作。
- 草稿在同一站点、同一浏览器的本地自动加密保存。保存依赖 HTTPS 或 localhost 的 secure context 及浏览器支持。容量不足、保存失败、冲突或只读状态不代表已保存；请查看界面提示并导出 JSON。
- 没有账号同步或服务器备份。清除浏览器站点数据或更换设备可能丢失草稿。删除或替换当前草稿前，必须取得用户确认。

## 隐私与代理操作

简历输入、照片、JSON 和草稿在浏览器内处理，不会包含在应用的 network request 中。Source、clone、fork 不包含 Analytics beacon。官方托管站点由 Cloudflare Pages 的分发层注入 Web Analytics，但简历数据不会包含在 Analytics request 中。

本公开指南及 Content Signals 不构成上传、发送或共享用户私有数据的概括性授权。在用户明确授权具体操作前，代理不得将简历数据交给外部服务。

公开指南获取后的用途遵循与公开 HTML 相同的 Content-Signal。可通过 [robots.txt](/robots.txt)查看公开政策，通过 [sitemap](/sitemap.xml)发现三语言公开入口。这些意愿声明不改变现有 [MIT License](https://github.com/herehigher/resume/blob/main/LICENSE) 权利，也不是私有数据的访问控制。

本文位于独立的静态 Markdown URL。这不表示同一 HTML URL 支持通过 `Accept: text/markdown` 进行内容协商，也不表示已启用 Markdown for Agents。
