import { z } from 'zod';
import { ApiError } from './errors.js';
import { endpoint, llmConfigured, type ServiceConfig } from './config.js';

export type FetchImpl = typeof fetch;
const upstreamEnvelope = z.object({
  model: z.string().max(200).optional(),
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string().max(100_000).nullable() }),
        finish_reason: z.string().nullable().optional(),
      }),
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().int().nonnegative().optional(),
      completion_tokens: z.number().int().nonnegative().optional(),
      total_tokens: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

async function boundedJson(response: Response): Promise<unknown> {
  const limit = 512_000;
  if (Number(response.headers.get('content-length') || 0) > limit) {
    await response.body?.cancel();
    throw new ApiError(502, 'UPSTREAM_RESPONSE_TOO_LARGE', '模型响应过大，请缩短回答后重试。');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new ApiError(502, 'UPSTREAM_INVALID_RESPONSE', '模型服务没有返回有效内容。');
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw new ApiError(502, 'UPSTREAM_RESPONSE_TOO_LARGE', '模型响应过大，请缩短回答后重试。');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ApiError(502, 'UPSTREAM_INVALID_RESPONSE', '模型服务返回的格式无效，请重试。');
  }
}

export async function fetchJson(
  url: string,
  init: RequestInit,
  config: ServiceConfig,
  fetchImpl: FetchImpl,
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  try {
    const response = await fetchImpl(url, {
      ...init,
      signal: controller.signal,
      redirect: 'error',
    });
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 429)
        throw new ApiError(
          503,
          'UPSTREAM_BUSY',
          '模型服务繁忙或额度受限，请稍后重试并检查账户额度。',
        );
      if ([401, 403].includes(response.status))
        throw new ApiError(
          502,
          'UPSTREAM_AUTH_ERROR',
          '模型服务鉴权失败，请检查服务端 API Key、地域及模型权限。',
        );
      throw new ApiError(502, 'UPSTREAM_ERROR', '模型服务请求失败，请检查模型配置后重试。');
    }
    return await boundedJson(response);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted)
      throw new ApiError(504, 'UPSTREAM_TIMEOUT', '模型服务超时，未生成本次结果；请稍后重试。');
    throw new ApiError(502, 'UPSTREAM_UNAVAILABLE', '无法连接模型服务，请检查服务端配置和网络。');
  } finally {
    clearTimeout(timeout);
  }
}

export async function generate<T>(
  prompt: { system: string; data: unknown },
  schema: z.ZodType<T>,
  config: ServiceConfig,
  fetchImpl: FetchImpl,
): Promise<{
  result: T;
  model: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}> {
  if (!llmConfigured(config))
    throw new ApiError(
      503,
      'LLM_NOT_CONFIGURED',
      '尚未配置可用的文本模型。请在服务端 .env 设置 LLM_BASE_URL、LLM_API_KEY 和 LLM_MODEL。',
    );
  const body: Record<string, unknown> = {
    model: config.llmModel,
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: JSON.stringify(prompt.data) },
    ],
    stream: false,
    max_tokens: 3_000,
  };
  if (config.jsonMode) body.response_format = { type: 'json_object' };
  // Both documented providers expose this switch. Other compatible providers receive only standard fields.
  if (['deepseek', 'doubao', 'volcengine'].includes(config.provider.toLowerCase()))
    body.thinking = { type: 'disabled' };
  const raw = await fetchJson(
    endpoint(config.llmBaseUrl, 'chat/completions'),
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.llmApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    config,
    fetchImpl,
  );
  const envelope = upstreamEnvelope.safeParse(raw);
  if (!envelope.success)
    throw new ApiError(502, 'UPSTREAM_INVALID_RESPONSE', '模型服务返回的结构无效，请重试。');
  const choice = envelope.data.choices[0];
  if (choice.finish_reason === 'length')
    throw new ApiError(502, 'UPSTREAM_TRUNCATED', '模型回复被截断，请缩短输入后重试。');
  let parsed: unknown;
  try {
    const content = (choice.message.content || '')
      .trim()
      .replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i, '$1');
    parsed = JSON.parse(content);
  } catch {
    throw new ApiError(502, 'MODEL_OUTPUT_INVALID', '模型未返回完整的结构化结果，请重试。');
  }
  const checked = schema.safeParse(parsed);
  if (!checked.success)
    throw new ApiError(502, 'MODEL_OUTPUT_INVALID', '模型返回的练习内容不符合格式要求，请重试。');
  return {
    result: checked.data,
    model: envelope.data.model || config.llmModel,
    usage: envelope.data.usage,
  };
}
