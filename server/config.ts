export type Environment = Record<string, string | undefined>;

export interface ServiceConfig {
  provider: string;
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  asrBaseUrl: string;
  asrApiKey: string;
  asrModel: string;
  allowedOrigins: Set<string>;
  requestTimeoutMs: number;
  rateLimitMax: number;
  rateLimitWindowMs: number;
  jsonMode: boolean;
}

const loopback = new Set(['localhost', '127.0.0.1', '[::1]']);

export function isLoopbackHost(host: string): boolean {
  try {
    const parsed = new URL(`http://${host}`);
    return (
      !parsed.username &&
      !parsed.password &&
      parsed.pathname === '/' &&
      !parsed.search &&
      !parsed.hash &&
      loopback.has(parsed.hostname)
    );
  } catch {
    return false;
  }
}

/** Only administrator-owned environment variables select upstreams. */
export function validBaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'https:' || (url.protocol === 'http:' && loopback.has(url.hostname))) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

function integer(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return value && Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

export function readConfig(env: Environment = process.env): ServiceConfig {
  const allowedOrigins = new Set<string>();
  for (const entry of (env.ALLOWED_ORIGINS ?? '').split(',')) {
    try {
      const url = new URL(entry.trim());
      // No wildcard, credentials, paths, queries or opaque origins.
      if (
        ['http:', 'https:'].includes(url.protocol) &&
        !url.username &&
        !url.password &&
        url.pathname === '/' &&
        !url.search &&
        !url.hash
      )
        allowedOrigins.add(url.origin);
    } catch {
      /* Invalid entries never broaden access. */
    }
  }
  return {
    provider: (env.LLM_PROVIDER?.trim() || 'openai-compatible').slice(0, 80),
    llmBaseUrl: env.LLM_BASE_URL?.trim().replace(/\/+$/, '') || '',
    llmApiKey: env.LLM_API_KEY?.trim() || '',
    llmModel: env.LLM_MODEL?.trim().slice(0, 160) || '',
    asrBaseUrl: env.ASR_BASE_URL?.trim().replace(/\/+$/, '') || '',
    asrApiKey: env.ASR_API_KEY?.trim() || '',
    asrModel: env.ASR_MODEL?.trim().slice(0, 160) || '',
    allowedOrigins,
    requestTimeoutMs: integer(env.UPSTREAM_TIMEOUT_MS, 45_000, 100, 120_000),
    rateLimitMax: integer(env.API_RATE_LIMIT_MAX, 30, 1, 1_000),
    rateLimitWindowMs: 60_000,
    jsonMode: env.LLM_JSON_MODE !== 'false',
  };
}

export function llmConfigured(config: ServiceConfig): boolean {
  return Boolean(config.llmApiKey && config.llmModel && validBaseUrl(config.llmBaseUrl));
}

export function asrConfigured(config: ServiceConfig): boolean {
  return Boolean(config.asrApiKey && config.asrModel && validBaseUrl(config.asrBaseUrl));
}

export function endpoint(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}
