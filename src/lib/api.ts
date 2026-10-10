export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export async function request<T>(path: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 65000);
  try {
    const form = body instanceof FormData;
    const res = await fetch(`/api/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: form ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : form ? body : JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok)
      throw new ApiError(
        data?.error?.code ?? 'REQUEST_FAILED',
        data?.error?.message ?? '服务暂时不可用，请稍后重试。',
      );
    return data as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (e instanceof Error && e.name === 'AbortError')
      throw new ApiError('TIMEOUT', '这次处理时间较长，草稿已保留，请重试。');
    throw new ApiError('OFFLINE', '无法连接服务。请确认本地服务已启动。');
  } finally {
    clearTimeout(timer);
  }
}
export function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : '操作失败，请重试。';
}
