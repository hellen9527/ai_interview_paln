import assert from 'node:assert/strict';
import { once } from 'node:events';
import { get as httpGet, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createApp } from '../server/index.js';
import { readConfig, validBaseUrl } from '../server/config.js';
import type { AppOptions } from '../server/app.js';
import type { FetchImpl } from '../server/upstream.js';

const configured = {
  LLM_PROVIDER: 'deepseek',
  LLM_BASE_URL: 'https://api.example.test/v1',
  LLM_API_KEY: 'test-secret-do-not-expose',
  LLM_MODEL: 'test-model',
};
const intro = {
  profile: {
    name: 'Lin',
    title: 'ML engineer',
    experience: '3 years',
    summary: 'Search relevance.',
    facts: [
      { id: 'yes', text: 'Built a reranking evaluation set.', confirmed: true },
      { id: 'no', text: 'UNCONFIRMED_SENTINEL improved CTR by 99%.', confirmed: false },
    ],
  },
  duration: 60,
  role: 'NLP engineer',
};
const answer = {
  question: 'What is overfitting?',
  answer: 'The model fits training data but performs poorly on unseen data.',
  points: ['Generalization gap', 'Validation and regularization'],
  mode: 'independent',
};
const generatedFeedback = {
  summary: '定义正确，验证方法可以更具体。',
  strengths: ['说明了泛化差异。'],
  improvements: [
    {
      title: '补充验证',
      detail: '补充独立验证集和正则化。',
      quote: 'performs poorly on unseen data',
    },
  ],
  referenceAnswer:
    'Overfitting happens when a model learns training-specific patterns and generalizes poorly.',
  followUp: 'How would you detect overfitting?',
  contentLevel: 'developing',
};
const draftRequest = {
  kind: 'technical',
  question: 'How do you evaluate a retrieval system?',
  points: ['Representative queries', 'Offline and online evaluation'],
};
const generatedDraft = {
  text: 'I would start with representative queries and assess relevance before checking business impact.',
  missingFacts: [],
  factIds: [],
};

const completion = (content: unknown, extra: Record<string, unknown> = {}): Response =>
  Response.json({
    model: 'test-model-snapshot',
    choices: [{ message: { content: JSON.stringify(content) }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 123, completion_tokens: 45, total_tokens: 168 },
    ...extra,
  });

async function withApp(options: AppOptions, run: (url: string, server: Server) => Promise<void>) {
  const server = createApp(options).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    await run(url, server);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  }
}

const jsonPost = (url: string, body: unknown, extra: Record<string, string> = {}) =>
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...extra },
    body: JSON.stringify(body),
  });

test('health is honest without credentials and does not leak configuration secrets', async () => {
  await withApp({ env: {} }, async (url) => {
    const response = await fetch(`${url}/api/health`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.json();
    assert.equal(body.configured, false);
    assert.equal(body.asrConfigured, false);
    assert.equal(body.model, '');
    assert.ok(body.limitations.some((x: string) => x.includes('发音')));
  });
});

test('missing text model returns 503 and makes no external calls', async () => {
  let calls = 0;
  await withApp(
    {
      env: {},
      fetchImpl: (async () => {
        calls++;
        throw new Error('must not call');
      }) as FetchImpl,
    },
    async (url) => {
      const response = await jsonPost(`${url}/api/intro`, intro);
      assert.equal(response.status, 503);
      assert.equal((await response.json()).error.code, 'LLM_NOT_CONFIGURED');
      assert.equal(calls, 0);
    },
  );
});

test('intro filters unconfirmed facts, uses configured URL, and returns real usage', async () => {
  const mock = (async (url: string | URL | Request, init?: RequestInit) => {
    assert.equal(String(url), 'https://api.example.test/v1/chat/completions');
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, 'test-model');
    assert.equal(body.thinking.type, 'disabled');
    assert.equal(body.response_format.type, 'json_object');
    assert.equal(body.messages[1].content.includes('UNCONFIRMED_SENTINEL'), false);
    assert.equal(body.messages[1].content.includes('Built a reranking evaluation set.'), true);
    assert.match(body.messages[0].content, /Do not invent personal facts/);
    assert.equal(init?.redirect, 'error');
    return completion({ text: 'I am an ML engineer working on search relevance.' });
  }) as FetchImpl;
  await withApp({ env: configured, fetchImpl: mock }, async (url) => {
    const response = await jsonPost(`${url}/api/intro`, intro);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.model, 'test-model-snapshot');
    assert.equal(body.usage.total_tokens, 168);
    assert.equal(JSON.stringify(body).includes(configured.LLM_API_KEY), false);
  });
});

test('strict validation rejects caller endpoint overrides and bad durations before billing', async () => {
  let calls = 0;
  await withApp(
    {
      env: configured,
      fetchImpl: (async () => {
        calls++;
        return completion({ text: 'x' });
      }) as FetchImpl,
    },
    async (url) => {
      for (const value of [
        { ...intro, duration: 45 },
        { ...intro, baseUrl: 'https://attacker.test' },
        { ...intro, profile: {} },
      ]) {
        const response = await jsonPost(`${url}/api/intro`, value);
        assert.equal(response.status, 400);
        assert.equal((await response.json()).error.code, 'INVALID_INPUT');
      }
      assert.equal(calls, 0);
    },
  );
});

test('feedback preserves exact evidence, strips invented quotes, and labels text-only/assisted mode', async () => {
  const mock = (async () =>
    completion({
      ...generatedFeedback,
      improvements: [
        ...generatedFeedback.improvements,
        { title: '例子', detail: '举一个例子。', quote: 'I achieved 99% accuracy.' },
      ],
    })) as FetchImpl;
  await withApp({ env: configured, fetchImpl: mock }, async (url) => {
    const response = await jsonPost(`${url}/api/feedback`, { ...answer, mode: 'read' });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.improvements[0].quote, generatedFeedback.improvements[0].quote);
    assert.equal(body.improvements[1].quote, undefined);
    assert.match(body.summary, /未评测发音/);
    assert.match(body.summary, /不代表独立作答能力/);
    assert.equal(body.contentLevel, 'developing');
    assert.equal(body.score, undefined);
  });
});

test('invalid model output is rejected, not replaced with a fake success or speech score', async () => {
  await withApp(
    {
      env: configured,
      fetchImpl: (async () =>
        completion({ ...generatedFeedback, pronunciationScore: 90 })) as FetchImpl,
    },
    async (url) => {
      const response = await jsonPost(`${url}/api/feedback`, answer);
      assert.equal(response.status, 502);
      assert.equal((await response.json()).error.code, 'MODEL_OUTPUT_INVALID');
    },
  );
});

test('truncated model output is explicit and not billed again by automatic retries', async () => {
  let calls = 0;
  await withApp(
    {
      env: configured,
      fetchImpl: (async () => {
        calls++;
        return completion(
          {},
          { choices: [{ message: { content: '{"text":' }, finish_reason: 'length' }] },
        );
      }) as FetchImpl,
    },
    async (url) => {
      const response = await jsonPost(`${url}/api/intro`, intro);
      assert.equal(response.status, 502);
      assert.equal((await response.json()).error.code, 'UPSTREAM_TRUNCATED');
      assert.equal(calls, 1);
    },
  );
});

test('upstream auth errors never echo response content or secrets', async () => {
  await withApp(
    {
      env: configured,
      fetchImpl: (async () =>
        new Response(`Bearer ${configured.LLM_API_KEY}: private resume`, {
          status: 401,
        })) as FetchImpl,
    },
    async (url) => {
      const response = await jsonPost(`${url}/api/intro`, intro);
      assert.equal(response.status, 502);
      const body = await response.text();
      assert.equal(body.includes(configured.LLM_API_KEY), false);
      assert.equal(body.includes('private resume'), false);
      assert.equal(JSON.parse(body).error.code, 'UPSTREAM_AUTH_ERROR');
    },
  );
});

test('upstream timeout cancels the provider request', async () => {
  const mock = ((_url: unknown, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    })) as FetchImpl;
  await withApp(
    { env: { ...configured, UPSTREAM_TIMEOUT_MS: '100' }, fetchImpl: mock },
    async (url) => {
      const response = await jsonPost(`${url}/api/intro`, intro);
      assert.equal(response.status, 504);
      assert.equal((await response.json()).error.code, 'UPSTREAM_TIMEOUT');
    },
  );
});

test('follow-up validates and returns the model-generated question', async () => {
  await withApp(
    {
      env: configured,
      fetchImpl: (async () =>
        completion({
          question: 'How did you validate the result?',
          translation: '你如何验证结果？',
        })) as FetchImpl,
    },
    async (url) => {
      const response = await jsonPost(`${url}/api/followup`, {
        question: 'Explain your project.',
        answer: 'I built an evaluation set.',
      });
      assert.equal(response.status, 200);
      assert.match((await response.json()).question, /validate/);
    },
  );
});

test('answer drafting accepts all practice kinds without an existing answer', async () => {
  await withApp(
    { env: configured, fetchImpl: (async () => completion(generatedDraft)) as FetchImpl },
    async (url) => {
      for (const kind of ['technical', 'project', 'reverse', 'clarify', 'followup']) {
        const response = await jsonPost(`${url}/api/answer`, { ...draftRequest, kind });
        assert.equal(response.status, 200, kind);
        const body = await response.json();
        assert.equal(body.text, generatedDraft.text);
        assert.equal(body.model, 'test-model-snapshot');
        assert.deepEqual(body.factIds, []);
        assert.equal(body.usage.total_tokens, 168);
        if (kind === 'project') {
          assert.equal(body.missingFacts.length, 6);
          assert.ok(body.missingFacts.some((item: string) => item.includes('真实成果')));
        }
      }
    },
  );
});

test('answer drafting without credentials returns 503 without external requests', async () => {
  let calls = 0;
  await withApp(
    {
      env: {},
      fetchImpl: (async () => {
        calls++;
        return completion(generatedDraft);
      }) as FetchImpl,
    },
    async (url) => {
      const response = await jsonPost(`${url}/api/answer`, draftRequest);
      assert.equal(response.status, 503);
      assert.equal((await response.json()).error.code, 'LLM_NOT_CONFIGURED');
      assert.equal(calls, 0);
    },
  );
});

test('answer drafting filters unconfirmed facts and keeps job requirements separate from personal evidence', async () => {
  const job = { role: 'Search engineer', jd: 'TARGET_JD: requires five years of experience.' };
  const mock = (async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    const data = JSON.parse(body.messages[1].content);
    assert.deepEqual(data.facts, [intro.profile.facts[0]]);
    assert.deepEqual(data.job, job);
    assert.equal(body.messages[1].content.includes('UNCONFIRMED_SENTINEL'), false);
    assert.match(body.messages[0].content, /TARGET JOB, not the candidate/);
    return completion({ ...generatedDraft, factIds: ['yes', 'yes'] });
  }) as FetchImpl;
  await withApp({ env: configured, fetchImpl: mock }, async (url) => {
    const response = await jsonPost(`${url}/api/answer`, {
      ...draftRequest,
      job,
      facts: intro.profile.facts,
    });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).factIds, ['yes']);
  });
});

test('answer drafting rejects invented, unconfirmed and project IDs rather than presenting fake provenance', async () => {
  for (const factId of ['unknown', 'no', 'project-id']) {
    await withApp(
      {
        env: configured,
        fetchImpl: (async () => completion({ ...generatedDraft, factIds: [factId] })) as FetchImpl,
      },
      async (url) => {
        const response = await jsonPost(`${url}/api/answer`, {
          ...draftRequest,
          facts: intro.profile.facts,
          project: { id: 'project-id', name: 'Search evaluation' },
        });
        assert.equal(response.status, 502);
        const body = await response.json();
        assert.equal(body.error.code, 'MODEL_FACT_REFERENCE_INVALID');
        assert.equal(body.text, undefined);
      },
    );
  }
  await withApp(
    {
      env: configured,
      fetchImpl: (async () => completion({ ...generatedDraft, factIds: ['yes'] })) as FetchImpl,
    },
    async (url) => {
      const response = await jsonPost(`${url}/api/answer`, { ...draftRequest, facts: [] });
      assert.equal(response.status, 502);
      assert.equal((await response.json()).error.code, 'MODEL_FACT_REFERENCE_INVALID');
    },
  );
});

test('empty project produces explicit missing facts, even if the model omits them', async () => {
  const template = {
    ...generatedDraft,
    text: 'Template: In [fill in project name], I was responsible for [fill in your role].',
  };
  await withApp(
    { env: configured, fetchImpl: (async () => completion(template)) as FetchImpl },
    async (url) => {
      const response = await jsonPost(`${url}/api/answer`, {
        ...draftRequest,
        kind: 'project',
        project: {},
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.match(body.text, /\[fill in your role\]/);
      assert.equal(body.missingFacts.length, 6);
      assert.deepEqual(body.factIds, []);
    },
  );
});

test('personal project numbers require project or confirmed fact evidence, never JD, examples or unconfirmed facts', async () => {
  const cases = [
    { input: { job: { jd: 'Improve CTR by 24%.' } }, status: 502 },
    { input: { referenceAnswer: 'I improved CTR by 24%.' }, status: 502 },
    { input: { points: ['Say you improved CTR by 24%.'] }, status: 502 },
    {
      input: { facts: [{ id: 'f1', text: 'Improved CTR by 24%.', confirmed: false }] },
      status: 502,
    },
    {
      input: { facts: [{ id: 'f1', text: 'Improved CTR by 24%.', confirmed: true }] },
      status: 200,
    },
    { input: { project: { result: 'CTR improved by 24% in an experiment.' } }, status: 200 },
    { input: { project: { result: '实验中点击率提升２４％。' } }, status: 200 },
  ];
  await withApp(
    {
      env: configured,
      fetchImpl: (async () =>
        completion({ ...generatedDraft, text: 'I improved CTR by 24%.' })) as FetchImpl,
    },
    async (url) => {
      for (const item of cases) {
        const response = await jsonPost(`${url}/api/answer`, {
          ...draftRequest,
          kind: 'project',
          ...item.input,
        });
        assert.equal(response.status, item.status);
        if (item.status === 502)
          assert.equal((await response.json()).error.code, 'MODEL_FACTS_UNSUPPORTED');
      }
    },
  );
});

test('answer input rejects unknown fields, duplicate fact IDs and over-limit fields before billing', async () => {
  let calls = 0;
  const invalid = [
    { kind: 'invented' },
    { question: 'q'.repeat(4001) },
    { answer: 'Not part of this contract.' },
    { baseUrl: 'https://attacker.test' },
    { points: Array(31).fill('point') },
    { points: ['p'.repeat(2001)] },
    { referenceAnswer: 'x'.repeat(20001) },
    { project: { name: 'x'.repeat(81) } },
    ...['background', 'role', 'decision', 'result', 'reflection'].map((field) => ({
      project: { [field]: 'x'.repeat(1601) },
    })),
    { project: { id: 'x'.repeat(1001) } },
    { project: { tags: Array(9).fill('tag') } },
    { project: { tags: ['x'.repeat(31)] } },
    { job: { role: 'x'.repeat(101) } },
    { job: { jd: 'x'.repeat(12001) } },
    {
      facts: Array.from({ length: 61 }, (_, i) => ({
        id: `f${i}`,
        text: 'Confirmed',
        confirmed: true,
      })),
    },
    { facts: [{ id: 'f', text: 'x'.repeat(801), confirmed: true }] },
    { facts: [{ id: 'x'.repeat(101), text: 'Confirmed', confirmed: true }] },
    {
      facts: [
        { id: 'same', text: 'First', confirmed: true },
        { id: 'same', text: 'Second', confirmed: false },
      ],
    },
  ];
  await withApp(
    {
      env: configured,
      fetchImpl: (async () => {
        calls++;
        return completion(generatedDraft);
      }) as FetchImpl,
    },
    async (url) => {
      for (const value of invalid) {
        const response = await jsonPost(`${url}/api/answer`, { ...draftRequest, ...value });
        assert.equal(response.status, 400);
        assert.equal((await response.json()).error.code, 'INVALID_INPUT');
      }
      assert.equal(calls, 0);
    },
  );
});

test('answer input accepts frontend project limits, 12k Chinese JD and all 60 confirmed facts', async () => {
  const project = {
    id: 'p'.repeat(1000),
    name: '项'.repeat(80),
    background: '背'.repeat(1600),
    role: '责'.repeat(1600),
    decision: '方'.repeat(1600),
    result: '果'.repeat(1600),
    reflection: '思'.repeat(1600),
    tags: Array(8).fill('算'.repeat(30)),
  };
  const job = { role: '角'.repeat(100), jd: '岗'.repeat(12000) };
  const facts = Array.from({ length: 60 }, (_, i) => ({
    id: `f${i}`,
    text: '实'.repeat(800),
    confirmed: true,
  }));
  await withApp(
    {
      env: configured,
      fetchImpl: (async (_url, init) => {
        const data = JSON.parse(JSON.parse(String(init?.body)).messages[1].content);
        assert.deepEqual(data.project, project);
        assert.deepEqual(data.job, job);
        assert.equal(data.facts.length, 60);
        return completion(generatedDraft);
      }) as FetchImpl,
    },
    async (url) => {
      const response = await jsonPost(`${url}/api/answer`, {
        ...draftRequest,
        kind: 'project',
        project,
        job,
        facts,
      });
      assert.equal(response.status, 200);
      assert.deepEqual((await response.json()).missingFacts, []);
    },
  );
});

test('answer output validates its full structured contract and rejects model overflow', async () => {
  const invalidOutputs = [
    { text: 'x' },
    { ...generatedDraft, score: 80 },
    { ...generatedDraft, text: 'x'.repeat(8001) },
    { ...generatedDraft, missingFacts: Array(9).fill('Missing fact') },
    { ...generatedDraft, missingFacts: ['x'.repeat(301)] },
    { ...generatedDraft, factIds: Array(61).fill('f') },
  ];
  let index = 0;
  await withApp(
    { env: configured, fetchImpl: (async () => completion(invalidOutputs[index++])) as FetchImpl },
    async (url) => {
      for (const _output of invalidOutputs) {
        const response = await jsonPost(`${url}/api/answer`, draftRequest);
        assert.equal(response.status, 502);
        const body = await response.json();
        assert.equal(body.error.code, 'MODEL_OUTPUT_INVALID');
        assert.equal(body.text, undefined);
      }
    },
  );
});

test('cross-origin localhost attacks are rejected before any upstream request', async () => {
  let calls = 0;
  await withApp(
    {
      env: configured,
      fetchImpl: (async () => {
        calls++;
        return completion({ text: 'x' });
      }) as FetchImpl,
    },
    async (url) => {
      const response = await jsonPost(`${url}/api/intro`, intro, {
        Origin: 'https://attacker.test',
      });
      assert.equal(response.status, 403);
      assert.equal((await response.json()).error.code, 'ORIGIN_FORBIDDEN');
      assert.equal(calls, 0);
      // Node fetch replaces Host; exercise the raw HTTP boundary with node:http.
      const hostileStatus = await new Promise<number | undefined>((resolve, reject) => {
        httpGet(`${url}/api/health`, { headers: { Host: 'attacker.test' } }, (response) => {
          response.resume();
          response.on('end', () => resolve(response.statusCode));
        }).on('error', reject);
      });
      assert.equal(hostileStatus, 403);
    },
  );
});

test('explicit development origin is allowed and wildcard origin is ignored', async () => {
  await withApp({ env: { ALLOWED_ORIGINS: 'http://localhost:5173,*' } }, async (url) => {
    const response = await fetch(`${url}/api/health`, {
      headers: { Origin: 'http://localhost:5173' },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    const denied = await fetch(`${url}/api/health`, { headers: { Origin: 'https://other.test' } });
    assert.equal(denied.status, 403);
  });
});

test('rate limiter enforces a per-IP window and permits requests after expiry', async () => {
  let time = 1_000;
  await withApp({ env: { API_RATE_LIMIT_MAX: '2' }, now: () => time }, async (url) => {
    assert.equal((await fetch(`${url}/api/health`)).status, 200);
    assert.equal((await fetch(`${url}/api/health`)).status, 200);
    const limited = await fetch(`${url}/api/health`);
    assert.equal(limited.status, 429);
    assert.equal((await limited.json()).error.code, 'RATE_LIMITED');
    time += 60_000;
    assert.equal((await fetch(`${url}/api/health`)).status, 200);
  });
});

test('resume text upload extracts UTF-8 without an AI key or a persistent file', async () => {
  await withApp({ env: {} }, async (url) => {
    const form = new FormData();
    form.append(
      'file',
      new Blob(['算法工程师\nSearch relevance'], { type: 'text/plain' }),
      'resume.txt',
    );
    const response = await fetch(`${url}/api/resume`, { method: 'POST', body: form });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      text: '算法工程师\nSearch relevance',
      fileName: 'resume.txt',
    });
  });
});

test('uploads reject fake PDF, unsupported files and files above 10MB', async () => {
  await withApp({ env: {} }, async (url) => {
    for (const [name, data, status] of [
      ['fake.pdf', 'not a PDF', 422],
      ['resume.html', '<script>evil</script>', 415],
      ['large.txt', 'x'.repeat(10 * 1024 * 1024 + 1), 413],
    ] as const) {
      const form = new FormData();
      form.append('file', new Blob([data]), name);
      const response = await fetch(`${url}/api/resume`, { method: 'POST', body: form });
      assert.equal(response.status, status);
      assert.ok((await response.json()).error.code);
    }
  });
});

test('ASR not configured returns 501 without claiming a transcript', async () => {
  await withApp({ env: {} }, async (url) => {
    const response = await fetch(`${url}/api/transcribe`, { method: 'POST' });
    assert.equal(response.status, 501);
    assert.equal((await response.json()).error.code, 'ASR_NOT_CONFIGURED');
  });
});

test('ASR uses separate configured credentials and forwards multipart audio', async () => {
  const env = {
    ...configured,
    ASR_BASE_URL: 'https://speech.example.test/v1',
    ASR_API_KEY: 'asr-only',
    ASR_MODEL: 'asr-model',
  };
  const mock = (async (url: unknown, init?: RequestInit) => {
    assert.equal(url, 'https://speech.example.test/v1/audio/transcriptions');
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer asr-only');
    assert.ok(init?.body instanceof FormData);
    assert.equal(init.body.get('model'), 'asr-model');
    assert.ok(init.body.get('file') instanceof Blob);
    return Response.json({ text: 'I work on machine learning.' });
  }) as FetchImpl;
  await withApp({ env, fetchImpl: mock }, async (url) => {
    const form = new FormData();
    const wav = Buffer.alloc(44);
    wav.write('RIFF', 0);
    wav.write('WAVE', 8);
    form.append('audio', new Blob([wav], { type: 'audio/wav' }), 'answer.wav');
    const response = await fetch(`${url}/api/transcribe`, { method: 'POST', body: form });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { text: 'I work on machine learning.' });
  });
});

test('invalid JSON and over-limit JSON return consistent safe error envelopes', async () => {
  await withApp({ env: {} }, async (url) => {
    const malformed = await fetch(`${url}/api/intro`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{wrong',
    });
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.json()).error.code, 'INVALID_JSON');
    const oversized = await jsonPost(`${url}/api/intro`, { text: 'x'.repeat(300_000) });
    assert.equal(oversized.status, 413);
    assert.equal((await oversized.json()).error.code, 'BODY_TOO_LARGE');
  });
});

test('upstream URLs allow secure services and local development, never credential-bearing URLs', () => {
  assert.equal(validBaseUrl('https://api.example.test/v1'), true);
  assert.equal(validBaseUrl('http://127.0.0.1:8000/v1'), true);
  assert.equal(validBaseUrl('http://public.example.test/v1'), false);
  assert.equal(validBaseUrl('https://key:secret@example.test/v1'), false);
  assert.equal(validBaseUrl('https://example.test/?token=secret'), false);
  assert.equal(readConfig({ ALLOWED_ORIGINS: '*' }).allowedOrigins.size, 0);
});

test('built app and SPA routes are served on the API origin while unknown APIs stay JSON 404', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'interview-static-test-'));
  try {
    await mkdir(join(directory, 'assets'));
    await writeFile(
      join(directory, 'index.html'),
      '<!doctype html><title>Interview practice</title>',
    );
    await writeFile(join(directory, 'assets', 'main.js'), 'window.appLoaded = true;');
    await withApp({ env: {}, staticDir: directory }, async (url) => {
      for (const path of ['/', '/practice/nlp']) {
        const response = await fetch(`${url}${path}`);
        assert.equal(response.status, 200);
        assert.match(await response.text(), /Interview practice/);
      }
      assert.equal((await fetch(`${url}/assets/main.js`)).status, 200);
      assert.equal((await fetch(`${url}/assets/missing.js`)).status, 404);
      const missing = await fetch(`${url}/api/not-real`);
      assert.equal(missing.status, 404);
      assert.equal((await missing.json()).error.code, 'NOT_FOUND');
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

// Tiny, generated non-sensitive documents; no Python or third-party test fixture dependency at runtime.
const documentFixtures = {
  pdf: 'JVBERi0xLjMKJZOMi54gUmVwb3J0TGFiIEdlbmVyYXRlZCBQREYgZG9jdW1lbnQgKG9wZW5zb3VyY2UpCjEgMCBvYmoKPDwKL0YxIDIgMCBSCj4+CmVuZG9iagoyIDAgb2JqCjw8Ci9CYXNlRm9udCAvSGVsdmV0aWNhIC9FbmNvZGluZyAvV2luQW5zaUVuY29kaW5nIC9OYW1lIC9GMSAvU3VidHlwZSAvVHlwZTEgL1R5cGUgL0ZvbnQKPj4KZW5kb2JqCjMgMCBvYmoKPDwKL0NvbnRlbnRzIDcgMCBSIC9NZWRpYUJveCBbIDAgMCA1OTUuMjc1NiA4NDEuODg5OCBdIC9QYXJlbnQgNiAwIFIgL1Jlc291cmNlcyA8PAovRm9udCAxIDAgUiAvUHJvY1NldCBbIC9QREYgL1RleHQgL0ltYWdlQiAvSW1hZ2VDIC9JbWFnZUkgXQo+PiAvUm90YXRlIDAgL1RyYW5zIDw8Cgo+PiAKICAvVHlwZSAvUGFnZQo+PgplbmRvYmoKNCAwIG9iago8PAovUGFnZU1vZGUgL1VzZU5vbmUgL1BhZ2VzIDYgMCBSIC9UeXBlIC9DYXRhbG9nCj4+CmVuZG9iago1IDAgb2JqCjw8Ci9BdXRob3IgKGFub255bW91cykgL0NyZWF0aW9uRGF0ZSAoRDoyMDI2MTAxMTAxMTc0OSswOScwMCcpIC9DcmVhdG9yIChhbm9ueW1vdXMpIC9LZXl3b3JkcyAoKSAvTW9kRGF0ZSAoRDoyMDI2MTAxMTAxMTc0OSswOScwMCcpIC9Qcm9kdWNlciAoUmVwb3J0TGFiIFBERiBMaWJyYXJ5IC0gXChvcGVuc291cmNlXCkpIAogIC9TdWJqZWN0ICh1bnNwZWNpZmllZCkgL1RpdGxlICh1bnRpdGxlZCkgL1RyYXBwZWQgL0ZhbHNlCj4+CmVuZG9iago2IDAgb2JqCjw8Ci9Db3VudCAxIC9LaWRzIFsgMyAwIFIgXSAvVHlwZSAvUGFnZXMKPj4KZW5kb2JqCjcgMCBvYmoKPDwKL0ZpbHRlciBbIC9BU0NJSTg1RGVjb2RlIC9GbGF0ZURlY29kZSBdIC9MZW5ndGggMTE5Cj4+CnN0cmVhbQpHYXBRaDBFPUYsMFVcSDNUXHBOWVReUUtrP3RjPklQLDtXI1UxXjIzaWhQRU1fP0NXNEtJU2k8IVs3YCNPQl9xdWEuMmYiVTxKZFo+X1VcP29aWHR0ZTA5VUBlRGVwMzwpJiguLzs0V2VPQTVzMyEsISZhWVF+PmVuZHN0cmVhbQplbmRvYmoKeHJlZgowIDgKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDYxIDAwMDAwIG4gCjAwMDAwMDAwOTIgMDAwMDAgbiAKMDAwMDAwMDE5OSAwMDAwMCBuIAowMDAwMDAwNDAyIDAwMDAwIG4gCjAwMDAwMDA0NzAgMDAwMDAgbiAKMDAwMDAwMDczMSAwMDAwMCBuIAowMDAwMDAwNzkwIDAwMDAwIG4gCnRyYWlsZXIKPDwKL0lEIApbPGY2ZGVhOTgxZDU5NDZiMDRkNmU5OTE2ZGE1ZTA5NjdmPjxmNmRlYTk4MWQ1OTQ2YjA0ZDZlOTkxNmRhNWUwOTY3Zj5dCiUgUmVwb3J0TGFiIGdlbmVyYXRlZCBQREYgZG9jdW1lbnQgLS0gZGlnZXN0IChvcGVuc291cmNlKQoKL0luZm8gNSAwIFIKL1Jvb3QgNCAwIFIKL1NpemUgOAo+PgpzdGFydHhyZWYKOTk5CiUlRU9GCg==',
  docx: 'UEsDBBQAAAAIADgKS13mdcR+0gAAAIsBAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbH2QvVLDMAzHX8XnlasVGBh6SToAKzD0BXSOkvjw11luad++Sls6cIVR+n/8ZLebQ/BqT4Vdip1+NI3e9O32mImVKJE7Pdea1wBsZwrIJmWKooypBKwylgky2i+cCJ6a5hlsipViXdWlQ/ftK42481W9HWR9oRTyrNXLxbiwOo05e2exig77OPyirK4EI8mzh2eX+UEMGu4SFuVvwDX3Ic8ubiD1iaW+YxAXfKcywJDsLkjS/F9z5840js7SLb+05ZIsMbs4BW9uSkAXf+6H83f3J1BLAwQUAAAACAA4CktdXzOVUpUAAAAHAQAACwAAAF9yZWxzLy5yZWxzjc87DsIwDAbgq0Q+QJ0yMKCmXVi6Ii4QJW5T0TzkhNftycBAEQOjf//6LHfDw6/iRpyXGBS0jYSh70606lKD7JaURW2ErMCVkg6I2TjyOjcxUaibKbLXpY48Y9LmomfCnZR75E8DtqYYrQIebQvi/Ez0jx2naTF0jObqKZQfJ74aVdY8U1Fwj2zRvuOmsoB9h5sX+xdQSwMEFAAAAAgAOApLXcHJenyMAAAAwAAAABEAAAB3b3JkL2RvY3VtZW50LnhtbEWOSw7CMAxErxLlALiwYFH1I45SWpNGqu3IDhRuT1IWbN7IetKMu/FNm3uhWhTu/fnU+HHo9naR+UnI2RXN1u69X3NOLYDNK9JkJ0nIxT1Eacrl1AC76JJUZjSLHGiDS9NcgabIvlbeZfnUTBVakYfbFkRjXskhh8iI6hStLHdQdaUeTAd/FfB/b/gCUEsBAhQDFAAAAAgAOApLXeZ1xH7SAAAAiwEAABMAAAAAAAAAAAAAAIABAAAAAFtDb250ZW50X1R5cGVzXS54bWxQSwECFAMUAAAACAA4CktdXzOVUpUAAAAHAQAACwAAAAAAAAAAAAAAgAEDAQAAX3JlbHMvLnJlbHNQSwECFAMUAAAACAA4Cktdwcl6fIwAAADAAAAAEQAAAAAAAAAAAAAAgAHBAQAAd29yZC9kb2N1bWVudC54bWxQSwUGAAAAAAMAAwC5AAAAfAIAAAAA',
};

test('real PDF and DOCX files produce extracted resume text', async () => {
  await withApp({ env: {} }, async (url) => {
    for (const extension of ['pdf', 'docx'] as const) {
      const form = new FormData();
      form.append(
        'file',
        new Blob([Buffer.from(documentFixtures[extension], 'base64')]),
        `resume.${extension}`,
      );
      const response = await fetch(`${url}/api/resume`, { method: 'POST', body: form });
      assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
      assert.match((await response.json()).text, /Algorithm engineer resume/);
    }
  });
});

test('resume text longer than 50,000 characters is rejected explicitly', async () => {
  await withApp({ env: {} }, async (url) => {
    const form = new FormData();
    form.append('file', new Blob(['x'.repeat(50_001)]), 'resume.txt');
    const response = await fetch(`${url}/api/resume`, { method: 'POST', body: form });
    assert.equal(response.status, 422);
    assert.equal((await response.json()).error.code, 'RESUME_TOO_LONG');
  });
});

test('all 60 facts of 800 Chinese characters fit the HTTP body and input schema', async () => {
  let calls = 0;
  const facts = Array.from({ length: 60 }, (_, i) => ({
    id: `fact-${i}`,
    text: '算法'.repeat(400),
    confirmed: true,
  }));
  await withApp(
    {
      env: configured,
      fetchImpl: (async () => {
        calls++;
        return completion({ text: 'I work on algorithms.' });
      }) as FetchImpl,
    },
    async (url) => {
      const response = await jsonPost(`${url}/api/intro`, {
        ...intro,
        profile: { ...intro.profile, facts },
      });
      assert.equal(response.status, 200);
      assert.equal(calls, 1);
      for (const invalidFacts of [
        [...facts, { ...facts[0], id: 'extra' }],
        [{ ...facts[0], text: '算'.repeat(801) }],
      ]) {
        const invalid = await jsonPost(`${url}/api/intro`, {
          ...intro,
          profile: { ...intro.profile, facts: invalidFacts },
        });
        assert.equal(invalid.status, 400);
      }
      assert.equal(calls, 1);
    },
  );
});

test('12,000-character Chinese JD plus long answer is accepted for follow-up', async () => {
  const context = `岗位考察要点：技术选择\nTarget job description (user-provided):\n${'岗位'.repeat(6000)}`;
  const longAnswer = '这是我的项目解释。'.repeat(2000);
  await withApp(
    {
      env: configured,
      fetchImpl: (async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        const data = JSON.parse(body.messages[1].content);
        assert.equal(data.context, context);
        assert.equal(data.answer, longAnswer);
        return completion({
          question: 'What trade-off did you make?',
          translation: '你做了什么取舍？',
        });
      }) as FetchImpl,
    },
    async (url) => {
      const response = await jsonPost(`${url}/api/followup`, {
        question: 'Explain your project.',
        answer: longAnswer,
        context,
      });
      assert.equal(response.status, 200);
    },
  );
});

test('project rubric dimensions support frontend 1,600-character fields plus labels', async () => {
  await withApp(
    { env: configured, fetchImpl: (async () => completion(generatedFeedback)) as FetchImpl },
    async (url) => {
      const response = await jsonPost(`${url}/api/feedback`, {
        ...answer,
        points: ['项目背景：' + '算'.repeat(1600), '个人职责：' + '工'.repeat(1600)],
      });
      assert.equal(response.status, 200);
    },
  );
});

test('ASR provider errors and invalid responses never expose credentials or provider response bodies', async () => {
  const env = {
    ASR_BASE_URL: 'https://speech.example.test/v1',
    ASR_API_KEY: 'private-asr-key',
    ASR_MODEL: 'asr-model',
  };
  for (const mockResponse of [
    new Response('private-asr-key private-resume-text', { status: 403 }),
    new Response('private-asr-key private-resume-text', { status: 200 }),
  ]) {
    await withApp({ env, fetchImpl: (async () => mockResponse) as FetchImpl }, async (url) => {
      const wav = Buffer.alloc(44);
      wav.write('RIFF', 0);
      wav.write('WAVE', 8);
      const form = new FormData();
      form.append('audio', new Blob([wav]), 'answer.wav');
      const response = await fetch(`${url}/api/transcribe`, { method: 'POST', body: form });
      assert.equal(response.status, 502);
      const body = await response.text();
      assert.equal(body.includes('private-asr-key'), false);
      assert.equal(body.includes('private-resume-text'), false);
      assert.ok(JSON.parse(body).error.code);
    });
  }
});
