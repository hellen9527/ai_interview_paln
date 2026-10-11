# 迁移到本地 ChatGPT / Codex 继续开发

更新日期：2026-10-11。项目：Interview Pal v0.2。仓库：https://github.com/hellen9527/ai_interview_paln ，分支：`main`。

## 需要迁移什么

| 内容                                 | 去哪里取                                                     | 本地如何处理                                                                                             |
| ------------------------------------ | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| 代码和 Git 历史                      | 克隆整个 GitHub 仓库                                         | 包括 src、server、tests、docs、根目录配置、package.json、package-lock.json、.env.example，不要只复制前端 |
| 产品设计与开发进度                   | README.md 和 docs/                                           | 优先读本文、HANDOFF、PRODUCT_SPEC、PAGE_DESIGN、DESIGN_SYSTEM、DEVELOPMENT、ACCEPTANCE、ROADMAP          |
| 模型配置和 API Key                   | 用户自己的服务商账号或已有 .env                              | 按 .env.example 创建本机 .env，不提交 Git，也不贴入接手提示词。本轮未配置真实 LLM/ASR 密钥               |
| 个人文字资料与练习记录（如有）       | 原应用设置页“导出文字备份”                                   | 下载 JSON，在本地应用设置页导入；这部分不随 GitHub 同步                                                  |
| 希望保留的录音（如有）               | 原应用复盘中每条已保存录音的下载入口；尚未保存的在练习页下载 | 单独下载音频。JSON不含音频本体，导入不会自动恢复旧录音关联；目前没有跨设备完整录音恢复工具               |
| 原始简历、岗位 JD 和调研附件（如有） | 用户自己保留的源文件                                         | 放在个人文件夹，不要提交到仓库；服务端提取简历后没有建立原文件档案库                                     |

不需要复制 node_modules、dist、临时缓存或正在运行的开发进程；本地重新安装和构建即可。当前没有服务器数据库需要导出，也没有模型权重需要迁移：应用调用模型 API，迁移开发环境不等于部署本地大模型。

如果没有实际填写个人资料或保存录音，只需克隆仓库、补本地配置、提供下面的提示词。

## 本地启动

准备 Git 与 Node.js 22.12+，在希望存放项目的位置执行：

```bash
git clone https://github.com/hellen9527/ai_interview_paln.git
cd ai_interview_paln
npm ci
```

将 `.env.example` 复制为 `.env`，也可以使用文件管理器：

```bash
# macOS / Linux
cp .env.example .env
```

```powershell
# Windows PowerShell
Copy-Item .env.example .env
```

如已克隆过仓库，先检查 `git status`，有未提交内容先保留，再使用 `git pull --ff-only`，不要直接覆盖已有工作。

主要配置项：

- 文本模型：`LLM_PROVIDER`、`LLM_BASE_URL`、`LLM_API_KEY`、`LLM_MODEL`。
- 可选转写：`ASR_BASE_URL`、`ASR_API_KEY`、`ASR_MODEL`，与文本模型分开配置。
- 用户偏好低成本的 DeepSeek Flash / Doubao Mini 类服务。具体模型 ID、账号可用性及兼容协议，按服务商当前官方资料核实；不要求改用 OpenAI 模型，也不需要为这次迁移额外购买 OpenAI API。
- 没有密钥仍可整理资料、录音回听和保存自主练习，AI 生成/评价和外部转写不会假装成功。

```bash
npm test
npm run build
npm run dev
```

开发地址：`http://127.0.0.1:5173`。开发命令同时启动前端和本地 API。运行构建后的版本时，先停止开发进程，再执行 `npm start`，访问 `http://127.0.0.1:3001`。

长期练习固定使用同一浏览器和地址。localhost、127.0.0.1、不同端口各自保存资料；从5173切到3001时，文字需导出/导入，音频也不会自动跟随。导入会替换当前文字工作区，先备份原有内容。

## 让本地助手访问项目

在支持本地文件访问的 ChatGPT 本地项目中关联仓库文件夹；使用 Codex IDE 扩展时打开该文件夹；已安装 Codex CLI 时可在仓库根目录运行 `codex`。仅粘贴 GitHub 链接不能保证新会话拥有本地读写和终端能力，先让它确认能读到 package.json。

官方说明：https://learn.chatgpt.com/docs/projects 。具体入口以本机客户端和账号提供的本地项目或 IDE/CLI 为准。

不要依赖新会话自动拥有这里的全部历史。以仓库代码、版本记录和交接文档作为上下文；缺少某个插件时，说明缺什么能力，再采用本机可用方式。

## 可直接复制的接手提示词

```text
请接手当前本地文件夹里的 Interview Pal 项目并继续开发，不要从零重建。
GitHub：https://github.com/hellen9527/ai_interview_paln ，分支 main。

产品目标：帮助英语口语较弱、准备外企面试的算法工程师。流程是简历/事实整理 → 英文自我介绍 → 技术问答 → 项目深挖 → 面试反问 → 后续实时语音模拟。界面要精美、中文引导清楚，达到成熟产品体验；真实区分已实现、模拟验证和待开发能力。

先读取 README.md、docs/LOCAL_MIGRATION.md、docs/HANDOFF.md、docs/PRODUCT_SPEC.md、docs/PAGE_DESIGN.md、docs/DESIGN_SYSTEM.md、docs/DEVELOPMENT.md、docs/ACCEPTANCE.md、docs/ROADMAP.md，再检查 package.json、git status 和相关代码。模型接入时读 docs/MODEL_RESEARCH.md 并核对服务商当前官方资料。无法访问本地文件或终端时请明确说明。

当前基线 v0.2：React 19 + TypeScript + Vite，Express 本地服务；8个页面、24个算法题库种子；简历提取、事实确认、简介生成、三种练习模式、反馈/追问、作答前参考稿生成、历史实际问题与上下文快照复练、主动选择后保存IndexedDB录音。文字在localStorage，备份格式仍为version 1，新增字段可选兼容旧数据。录音默认不保留，单段10MB、合计100MB；JSON不含音频本体。

2026-10-11基线是64项自动测试通过，类型检查和构建通过。LLM/ASR是mock协议测试，jsdom/SSR/fake-indexeddb不是实际浏览器、麦克风或模型验证。尚无真实密钥测试、账户体系、云端记录、跨设备音频同步、支付、专业发音评分或实时通话。

用户偏好低成本DeepSeek Flash、Doubao Mini类服务，使用可配置API，不擅自换供应商或假设模型ID有效。密钥只放服务端.env，不进入前端、日志、Git或聊天。文本模型与ASR分开接入；不能仅凭文字编造发音分数或宣称80分过关。不编造用户经历、职责和成果，参考稿由用户核对。

这次先完成本地接管：检查工作区并保留已有修改，安装依赖，运行测试和构建，启动应用。然后按ACCEPTANCE做真实浏览器和录音流程验收，检查桌面与移动布局并修复具体问题，保持现有视觉体系。模型配置齐备后做脱敏样本的真实LLM/ASR验证；缺密钥就列出缺失项，继续其他可完成工作。之后基于ROADMAP提出下一批优先级，不直接扩做全部功能。

请实际推进代码和文档，完成后报告改动、验证结果和剩余限制。不要丢弃用户未提交的修改，不强制推送覆盖他人工作，不未经要求把本地服务开放到公网。
```

## 接管完成的判断

1. 本地助手能读到当前仓库与交接文档，并说明实际分支和工作区状态。
2. npm ci、npm test、npm run build 成功，或对本地差异给出可复现错误；64项只是交付时基线，后续测试数量可变化。
3. 页面可访问；未配置模型时如实显示状态。真实浏览器验证结果另行记录。
4. 如迁移个人资料，核对文字备份已导入；单独下载的录音继续独立保管，不能误认为JSON恢复了录音。
5. 从现有设计和ROADMAP继续推进，持续更新HANDOFF和ACCEPTANCE。
