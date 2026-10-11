import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import { existsSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import { z } from 'zod';
import {
  asrConfigured,
  endpoint,
  isLoopbackHost,
  llmConfigured,
  readConfig,
  type Environment,
} from './config.js';
import { ApiError } from './errors.js';
import { protectAnswer } from './answer.js';
import { extractResume, MAX_UPLOAD_BYTES, validateAudio } from './files.js';
import { answerPrompt, feedbackPrompt, followupPrompt, introPrompt } from './prompts.js';
import {
  answerInput,
  answerOutput,
  feedbackInput,
  feedbackOutput,
  followupInput,
  followupOutput,
  introInput,
  introOutput,
} from './schemas.js';
import { fetchJson, generate, type FetchImpl } from './upstream.js';

export interface AppOptions {
  env?: Environment;
  fetchImpl?: FetchImpl;
  now?: () => number;
  staticDir?: string | false;
}

export function createApp(options: AppOptions = {}) {
  const config = readConfig(options.env ?? process.env);
  const upstreamFetch = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', false);

  // This release is a local, single-user proxy. A public deployment requires authentication.
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const host = req.headers.host || '';
    if (!isLoopbackHost(host))
      return next(
        new ApiError(
          403,
          'HOST_FORBIDDEN',
          '本版本仅接受本机访问，公开部署前需增加鉴权和可信主机配置。',
        ),
      );
    const origin = req.headers.origin;
    if (origin) {
      let parsed: URL;
      try {
        parsed = new URL(origin);
      } catch {
        return next(new ApiError(403, 'ORIGIN_FORBIDDEN', '不允许来自该网页的请求。'));
      }
      const sameOrigin = parsed.origin === `${req.protocol}://${host}`;
      if (origin !== parsed.origin || (!sameOrigin && !config.allowedOrigins.has(origin))) {
        return next(
          new ApiError(
            403,
            'ORIGIN_FORBIDDEN',
            '不允许跨来源访问；开发时请在服务端明确配置ALLOWED_ORIGINS。',
          ),
        );
      }
      if (!sameOrigin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.vary('Origin');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      }
    } else if (req.headers['sec-fetch-site'] === 'cross-site') {
      return next(new ApiError(403, 'ORIGIN_FORBIDDEN', '不允许跨网站访问本机接口。'));
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // Bounded in-memory per-IP rate limiting; no persistence and no request-body logging.
  const buckets = new Map<string, { count: number; expires: number }>();
  const rateLimit: RequestHandler = (req, res, next) => {
    const time = now();
    for (const [key, bucket] of buckets) if (bucket.expires <= time) buckets.delete(key);
    const key = req.ip || req.socket.remoteAddress || 'local';
    const bucket = buckets.get(key) || { count: 0, expires: time + config.rateLimitWindowMs };
    bucket.count++;
    buckets.set(key, bucket);
    if (bucket.count > config.rateLimitMax) {
      res.setHeader('Retry-After', Math.max(1, Math.ceil((bucket.expires - time) / 1000)));
      return next(new ApiError(429, 'RATE_LIMITED', '请求过于频繁，请稍后再试。'));
    }
    next();
  };
  app.use('/api', rateLimit);
  // Character limits above are not byte limits: 60 × 800 Chinese facts need ~144KB.
  app.use(express.json({ limit: '256kb', strict: true }));

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: MAX_UPLOAD_BYTES,
      files: 1,
      fields: 0,
      parts: 1,
    },
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      configured: llmConfigured(config),
      provider: config.provider,
      model: config.llmModel,
      asrConfigured: asrConfigured(config),
      limitations: [
        '本地单用户版本：没有登录鉴权，不能直接公开部署。',
        'AI反馈仅评估文字内容；未接入专业发音评测，不产生口语分数。',
        '简历解析暂不支持扫描件OCR；模型输出仍需核对个人事实与技术准确性。',
        '未配置API时保留本地练习，不生成虚假的AI结果。',
      ],
    });
  });

  app.post('/api/intro', async (req, res) => {
    const input = introInput.parse(req.body);
    const { result, model, usage } = await generate(
      introPrompt(input),
      introOutput,
      config,
      upstreamFetch,
    );
    res.json({ ...result, model, ...(usage ? { usage } : {}) });
  });

  app.post('/api/feedback', async (req, res) => {
    const input = feedbackInput.parse(req.body);
    const { result, model, usage } = await generate(
      feedbackPrompt(input),
      feedbackOutput,
      config,
      upstreamFetch,
    );
    // Never display a fabricated quotation as evidence of something the candidate said.
    result.improvements = result.improvements.map((item) => {
      if (item.quote && !input.answer.includes(item.quote)) {
        const { quote: _quote, ...rest } = item;
        return rest;
      }
      return item;
    });
    const modeNote =
      input.mode === 'independent' ? '' : ' 本次使用了提示或参考稿，不代表独立作答能力。';
    result.summary += `（仅分析提交的文字内容，未评测发音或口语流利度。${modeNote}）`;
    res.json({ ...result, model, ...(usage ? { usage } : {}) });
  });

  app.post('/api/answer', async (req, res) => {
    const input = answerInput.parse(req.body);
    const { result, model, usage } = await generate(
      answerPrompt(input),
      answerOutput,
      config,
      upstreamFetch,
    );
    const protectedResult = protectAnswer(input, result);
    res.json({ ...protectedResult, model, ...(usage ? { usage } : {}) });
  });

  app.post('/api/followup', async (req, res) => {
    const input = followupInput.parse(req.body);
    const { result, model } = await generate(
      followupPrompt(input),
      followupOutput,
      config,
      upstreamFetch,
    );
    res.json({ ...result, model });
  });

  app.post('/api/resume', upload.single('file'), async (req, res) => {
    if (!req.file) throw new ApiError(400, 'FILE_REQUIRED', '请在file字段上传一份简历。');
    res.json(await extractResume(req.file));
  });

  const requireAsr: RequestHandler = (_req, _res, next) => {
    if (!asrConfigured(config))
      return next(
        new ApiError(
          501,
          'ASR_NOT_CONFIGURED',
          '尚未配置录音转写。可先自行输入文字；服务端需配置独立的ASR_BASE_URL、ASR_API_KEY、ASR_MODEL。',
        ),
      );
    next();
  };
  app.post('/api/transcribe', requireAsr, upload.single('audio'), async (req, res) => {
    if (!req.file) throw new ApiError(400, 'AUDIO_REQUIRED', '请在audio字段上传录音。');
    const audio = validateAudio(req.file);
    const form = new FormData();
    form.append('model', config.asrModel);
    form.append('response_format', 'json');
    form.append(
      'file',
      new Blob([new Uint8Array(req.file.buffer)], { type: audio.mimeType }),
      audio.fileName,
    );
    const response = await fetchJson(
      endpoint(config.asrBaseUrl, 'audio/transcriptions'),
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.asrApiKey}` },
        body: form,
      },
      config,
      upstreamFetch,
    );
    const parsed = z.object({ text: z.string().trim().min(1).max(50_000) }).safeParse(response);
    if (!parsed.success)
      throw new ApiError(
        502,
        'ASR_INVALID_RESPONSE',
        '转写服务未返回有效文字；请检查录音或手动输入。',
      );
    res.json({ text: parsed.data.text });
  });

  app.use('/api', (_req, _res, next) => next(new ApiError(404, 'NOT_FOUND', '接口不存在。')));
  const staticDir =
    options.staticDir === false
      ? false
      : options.staticDir || fileURLToPath(new URL('../dist/', import.meta.url));
  if (staticDir && existsSync(join(staticDir, 'index.html'))) {
    app.use(express.static(staticDir, { dotfiles: 'deny', index: false }));
    app.get(/^(?!\/api(?:\/|$)).*/, (req, res, next) => {
      if (extname(req.path)) {
        res.status(404).end();
        return;
      }
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(join(staticDir, 'index.html'), (error) => {
        if (error) next(error);
      });
    });
  }
  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof ApiError) {
      res.status(error.status).json({ error: { code: error.code, message: error.message } });
      return;
    }
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: '提交的数据不完整或超过长度限制，请检查必填字段与练习模式。',
        },
      });
      return;
    }
    if (error instanceof multer.MulterError) {
      const tooLarge = error.code === 'LIMIT_FILE_SIZE';
      res.status(tooLarge ? 413 : 400).json({
        error: {
          code: tooLarge ? 'FILE_TOO_LARGE' : 'INVALID_UPLOAD',
          message: tooLarge
            ? '文件超过10MB，请压缩或缩短后上传。'
            : '每次仅允许上传一个文件，请检查上传字段。',
        },
      });
      return;
    }
    const typed = error as { type?: string; status?: number };
    if (typed?.type === 'entity.too.large') {
      res
        .status(413)
        .json({ error: { code: 'BODY_TOO_LARGE', message: '提交内容过大，请精简后重试。' } });
      return;
    }
    if (typed?.type === 'entity.parse.failed') {
      res.status(400).json({ error: { code: 'INVALID_JSON', message: '请求必须为有效JSON。' } });
      return;
    }
    // Deliberately do not echo upstream errors, submitted data, parser internals or credentials.
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: '请求未能完成，请重试或检查服务端配置。' },
    });
  };
  app.use(errorHandler);
  return app;
}
