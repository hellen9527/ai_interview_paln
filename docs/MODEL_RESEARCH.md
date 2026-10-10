# 模型选择与官方资料核验

核验日期：2026-10-10。以下是官方文档核验，不是实际付费调用测试，也不是面试评分能力的验证。模型名、价格和可用地域可能变化，部署时以账户控制台为准。

## 可配置方案

| 方案                 | 服务端配置示例                                                                                                          | 核验结论                                                                                                                                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DeepSeek 官方 API    | `LLM_PROVIDER=deepseek`；`LLM_BASE_URL=https://api.deepseek.com`；`LLM_MODEL=deepseek-flash`                            | 官方当前建议使用 `deepseek-flash`。旧 `deepseek-v4-flash` 名称暂时兼容，但对应请求已转向 V4.1-Flash；不能把旧名称当作固定旧权重版本。支持 OpenAI 风格 `POST /chat/completions`。                        |
| 火山方舟 Doubao Mini | `LLM_PROVIDER=doubao`；`LLM_BASE_URL=https://ark.cn-beijing.volces.com/api/v3`；`LLM_MODEL=doubao-seed-2-0-mini-260428` | 官方模型目录列出这一具体 ID。“Doubao mini”只是简称，不能直接用作任意 API 的模型 ID。账户也可能需要填写已开通的 `ep-*` 接入点 ID。采用 OpenAI 兼容 Chat Completions；不要混用 Coding Plan 的地址与密钥。 |
| 其他兼容服务         | `LLM_PROVIDER=openai-compatible`；管理员填写 base URL、key 和模型                                                       | 仅支持该服务实际实现的 Chat Completions 协议；没有自动探测和自动切换模型，不向第三方试发用户资料。                                                                                                      |

后端不内置“最低价”“最佳效果”结论，不硬编码默认模型。未配置完整 API 时，AI 接口返回明确错误，前端仍可保留本地材料整理和练习。API Key 仅放在服务器 `.env`，不要使用 `VITE_` 前缀，也不要放进浏览器存储。

## 开放权重与商业 API 要分开

DeepSeek 官方 `deepseek-ai/DeepSeek-V4-Flash` 模型卡提供权重并标注 MIT 许可。这证明该发布版本有开放权重；它不意味着当前托管 API 别名、其他版本或整个商业服务都适用相同保证。首期使用 API；本项目没有打包权重，也没有实现本地大模型推理。

本次未找到足以确认 Doubao-Seed-2.0-mini 可下载官方权重及开放模型许可的一手证据。因此按托管商业 API 接入，不声称它是开源或可以本地部署。第三方平台能够调用一个模型，不等于模型权重开源。

## 结构化输出、成本与边界

- 使用 JSON 对象输出，并在服务器用 Zod 验证字段和长度；JSON 格式正确不代表技术内容一定正确。
- DeepSeek 文档要求 JSON mode 配合明确的 JSON 提示。已知 DeepSeek/Doubao 配置关闭思考模式，控制输出长度；其他兼容服务只发送标准参数。
- 默认 `LLM_JSON_MODE=true`。若管理员选用不支持 `response_format` 的兼容服务，可明确设为 `false`；仍执行结构校验，失败不生成假结果，也不自动重试增加费用。
- 价格有地域、缓存、输入输出、时段/模型版本等口径。本项目不展示未实测的单题价格或延迟承诺；接口返回供应商实际提供的 token usage（若有），供后续核算。
- 文本 LLM 负责简介整理、技术内容反馈和引导追问。它没有听到声音，不评发音，不给口语总分，不承诺“80分=能通过面试”。
- ASR 独立使用 `ASR_BASE_URL`、`ASR_API_KEY`、`ASR_MODEL`，仅适配 OpenAI 风格 `POST /audio/transcriptions`。DeepSeek/Doubao 文本 API Key 不能被假定自动具备这一接口；未配置时返回501。不是对火山自有语音协议的直接适配。

## 官方来源

1. DeepSeek API 基础地址、当前模型名与别名迁移：https://api-docs.deepseek.com/
2. DeepSeek V4.1-Flash 发布说明：https://api-docs.deepseek.com/news/news260910
3. DeepSeek JSON Output：https://api-docs.deepseek.com/guides/json_mode/
4. DeepSeek Thinking Mode：https://api-docs.deepseek.com/guides/thinking_mode
5. DeepSeek 官方模型卡和许可：https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash
6. 火山方舟模型目录：https://www.volcengine.com/docs/82379/1554680
7. 火山方舟 OpenAI SDK 兼容说明：https://www.volcengine.com/docs/82379/1330626
8. 火山方舟协议迁移说明：https://docs.volcengine.com/docs/82379/1355331
9. 火山官方 OpenViking 配置文档，包含具体 Mini ID 示例：https://github.com/volcengine/OpenViking/blob/main/docs/zh/guides/01-configuration.md
10. 价格复核入口：https://api-docs.deepseek.com/quick_start/pricing/ 与 https://www.volcengine.com/docs/ark/model-pricing

## 运行边界

本版 API 只绑定 `127.0.0.1`，拒绝非本机 Host；不提供账户鉴权，不可直接用反向代理公开。浏览器跨来源默认拒绝，开发直连可设置 `ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173`，使用同源 Vite 代理通常无需跨来源设置。

上传只在内存处理，不保存到服务器；仅TXT/PDF/DOCX、单文件10MB，扫描PDF不做OCR。DOCX限制归档条目与展开大小。PDF解析仍在当前Node进程中，公开服务前需把不可信文档解析放入隔离进程/容器并施加CPU和内存限制。

默认每IP每分钟30次请求（包括health），可通过 `API_RATE_LIMIT_MAX` 调整；默认上游超时45秒，可用 `UPSTREAM_TIMEOUT_MS` 调整。模型调用不会自动重试；错误不返回供应商原文、密钥或用户简历。公开部署前必须增加身份认证、按用户配额、服务端授权、上传隔离与持续依赖维护；仅CORS和本机绑定不能代替用户鉴权。
