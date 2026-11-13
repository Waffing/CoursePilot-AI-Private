<div align="center">

# CoursePilot AI · 网课小助手

视频学习、模型答题与便捷控制，集中在一个可拖动的小窗口。

作者署名 **Waffing**

![版本](https://img.shields.io/badge/version-0.2.9.12-2563eb?style=flat-square)
![MIT](https://img.shields.io/badge/license-MIT-10b981?style=flat-square)
![JavaScript](https://img.shields.io/badge/JavaScript-UserScript-f2c94c?style=flat-square)
![浏览器](https://img.shields.io/badge/browser-Edge%20%7C%20Chrome-64748b?style=flat-square)

**[安装 0.2.9.12](https://raw.githubusercontent.com/Waffing/CoursePilot-AI-Private/main/course-helper.user.js)** · **[配图新手教程](docs/新手教程.md)** · **[更新内容](docs/更新说明-0.2.9.12.md)** · **[反馈问题](https://github.com/Waffing/CoursePilot-AI-Private/issues)**

</div>

## 先看效果

<table>
<tr><td width="50%" align="center"><strong>日常控制 · 状态与倍速</strong></td><td width="50%" align="center"><strong>深色主题 · 个性化设置</strong></td></tr>
<tr><td align="center" valign="top"><img src="docs/images/01-overview-light.png" width="390" alt="浅色主面板：状态、倍速和暂停恢复"></td><td align="center" valign="top"><img src="docs/images/03-preferences-dark.png" width="390" alt="深色面板和个性化设置"></td></tr>
</table>

最小化后仍可暂停、恢复并查看状态：

![迷你控制条](docs/images/04-mini-toolbar.png)

> 助手截图来自 0.2.9.9 的隔离演示环境，使用测试模型、测试用户和模拟网站响应；不包含真实登录信息，不代表真实账户验收。

## 三步开始

1. 安装 [暴力猴 Violentmonkey](https://violentmonkey.github.io/get-it/)，按浏览器选择官网提供的稳定版商店入口。
2. 点击 **[安装 0.2.9.12 完整脚本](https://raw.githubusercontent.com/Waffing/CoursePilot-AI-Private/main/course-helper.user.js)**。若没有安装页，在暴力猴新建脚本中粘贴 [Raw 完整内容](https://raw.githubusercontent.com/Waffing/CoursePilot-AI-Private/main/course-helper.user.js)，`Ctrl+S` 保存。
3. 登录课程网站并刷新，先暂停助手，在“答题”配置自己的模型接口、Key 和模型，测试连接后恢复。

第一次使用请按 **[配图新手教程](docs/新手教程.md)** 操作。已有版本在原脚本条目更新，以保留密钥和设置；同一浏览器只启用一份本脚本。

## 能做什么

| 场景 | 使用体验 |
| --- | --- |
| 连续视频 | 元数据就绪即请求播放；自然完成并收到网站成功回执后切课 |
| 视频倍速 | 优先读取原播放器档位，可手动选择；无法识别时提供 1× / 1.5× / 2× |
| 视频弹题 | 题框和文字变化立即触发识别，填选核对后立即提交，单独展示网站是否接受 |
| 题库练习 | 单选、多选、判断及支持图片的模型输入；练习按操作等待设置继续 |
| 请求稳定性 | 统一请求队列；答案默认 15 秒超时，取消旧请求后尝试备用模型，最多两次 |
| 多个标签页 | 一页运行、其他页等待，手动接管；保留最小提交记录避免重发 |
| 长时间使用 | 日志限制 300 条，答题历史每页 100 条，减少重复页面解析 |
| 操作便利 | 迷你控制条、主题、文字大小、设置备份、导入预览与脱敏诊断 |

0.2.9.12 修复智慧树“AI随堂练习明明可见却检测不到”的问题：根据当前官方公开组件确认，滚动容器使题目不再是列表直属子节点；新版兼容该包装层、嵌套选项和可见文字，增加明确失败原因与重新扫描。源码及分发控制器均通过 37 项隔离浏览器测试，另有 30 项 Node 回归通过；**尚未在用户真实登录课堂验收。**上一版的提交回执确认、继续学习和视频保存后切课流程继续保留。北部湾、超星和智慧树旧考试页逻辑继续保留。验证码、身份验证和登录由用户处理；没有伪造学习记录或保证脚本不可被检测的功能。

## 自动更新

脚本关联本仓库：`course-helper.meta.js` 提供版本信息，`course-helper.user.js` 提供完整更新。暴力猴／油猴启用脚本更新后，会按管理器的检查周期从 GitHub 获取新版本；也可在管理面板手动“检查更新”。

已有安装可在原脚本条目“检查更新”至 **0.2.9.12** 并刷新页面；非常旧的版本可从上方完整脚本更新原条目。安装名称、namespace 和模型存储键继续保留。**不再显示或请求旧公告**。

## 常用设置

| 设置 | 全新安装默认值 |
| --- | --- |
| 主题 / 密度 | 跟随系统 / 舒适 |
| 字号 / 面板宽度 / 不透明度 | 13 px / 360 px / 100% |
| 请求最小间隔 | 5 秒，含获取模型和测试连接 |
| 练习／试卷操作等待 | 3 秒；视频弹题与确认完成后切课无额外固定等待 |
| 视频倍速 | 北部湾沿用原设置；智慧树学习页保留网站播放器的当前速度 |

已有安装会继承配置。文字题答案缓存仅在页面会话内保留最近 100 条，图片题不缓存。设置导出排除密钥，换管理器或浏览器需要重新填写 Key。

<details>
<summary><strong>模型设置与多标签页接管截图</strong></summary>

![模型设置：示例域名不能用于真实调用](docs/images/02-model-settings.png)

![第二个标签页等待与接管](docs/images/05-tab-takeover.png)

</details>

## 文档与下载

- [从安装暴力猴到日常使用](docs/新手教程.md)：安装、模型配置、操作按钮、迁移和常见问题。
- [0.2.9.12 更新与验证说明](docs/更新说明-0.2.9.12.md)；历史验证报告仅适用于对应旧版本，不能作为当前智慧树实站验收证明。
- [0.2.9.9 历史交付包](artifacts/网课小助手-0.2.9.9.zip)、[0.2.9.8 回退脚本](rollback/0.2.9.8/course-helper.user.js)、[文件校验和](SHA256SUMS.txt)。

网络、模型服务、网站规则和浏览器策略仍影响运行效果，模型答案不保证正确。隔离测试与真实账户、真实管理器中的验收结果分别记录。

## 源码与构建

Node.js 20+，构建不需要安装 npm 依赖：

```sh
node src/build-adaptation.cjs
node --check course-helper.user.js
node --test tests/core.test.cjs tests/zhs-study.test.cjs tests/wisdom-receipts.test.cjs
```

`src/` 保留基础脚本、适配模块和构建器。打开 `tests/wisdom-study.html` 可运行智慧树连续学习的隔离浏览器回归（37 个场景；真实 DOM，模拟模型、媒体状态与网站回执），包含当前官方 `ElScrollbar` 包装结构。`tests/zhs-study.test.cjs` 仅保留旧适配函数的历史回归，正式脚本使用 `wisdom-study-controller.js` 与 `wisdom-study-runtime.js`。

请勿在 Issues 上传 API Key、完整浏览器配置或登录数据。可以使用“复制诊断”，检查内容后附上版本和复现步骤。

## 作者与授权

作者署名 **Waffing**，采用 [MIT License](LICENSE)。模型服务由使用者自行配置。
