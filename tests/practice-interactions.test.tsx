import assert from 'node:assert/strict';
import { after, afterEach, beforeEach, test } from 'node:test';
import { useState } from 'react';
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';
import { IDBObjectStore } from 'fake-indexeddb';
import Practice from '../src/components/Practice';
import { clearAudio, getAudio, getAudioUsage } from '../src/lib/audioStore';
import { emptyState, parseState } from '../src/lib/store';
import { questions } from '../src/data/questions';
import type { AppState, Health } from '../src/types';

// This is a Node component test, not browser QA: no server, microphone, or real provider.
// Install the DOM before importing React DOM's event system. Keep Node's Blob/File so
// the actual IndexedDB adapter and URL.createObjectURL receive native binary objects.
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
for (const [name, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  Node: dom.window.Node,
  CustomEvent: dom.window.CustomEvent,
  MutationObserver: dom.window.MutationObserver,
  getComputedStyle: dom.window.getComputedStyle,
  sessionStorage: dom.window.sessionStorage,
  localStorage: dom.window.localStorage,
  IS_REACT_ACT_ENVIRONMENT: true,
}))
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });

const { render, fireEvent, waitFor, cleanup, act } = await import('@testing-library/react/pure');
const configured: Health = {
  configured: true,
  asrConfigured: false,
  provider: 'test',
  model: 'test-model',
};
const offline: Health = { configured: false, asrConfigured: false, provider: '', model: '' };

function mountPractice(options: { state?: AppState; target?: string; health?: Health } = {}) {
  const observed = { state: options.state || emptyState(), updates: 0, notices: [] as string[] };
  function Harness() {
    const [state, setState] = useState(observed.state);
    observed.state = state;
    return (
      <Practice
        state={state}
        update={(next) => {
          observed.updates++;
          setState(next);
        }}
        health={options.health || offline}
        target={options.target || questions[0].id}
        initialMode="independent"
        simulation={false}
        simulationIndex={0}
        simulationCount={1}
        navigate={() => {
          throw new Error('The test should remain in the practice workspace.');
        }}
        notify={(message) => observed.notices.push(message)}
        startPractice={() => {}}
        onNext={() => {}}
      />
    );
  }
  return { view: render(<Harness />), observed };
}

function deferredResponse() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function uploadAudio(view: ReturnType<typeof render>) {
  const input = view.container.querySelector<HTMLInputElement>('input[type="file"]');
  assert.ok(input);
  const bytes = new Uint8Array([82, 73, 70, 70, 11, 22, 33, 44]);
  const file = new File([bytes], 'my-interview.wav', { type: 'audio/wav' });
  fireEvent.change(input, { target: { files: [file] } });
  assert.ok(
    view.getByLabelText('我的录音').getAttribute('src'),
    'uploaded audio should remain available for local replay',
  );
  return { file, bytes };
}

function typeAnswer(view: ReturnType<typeof render>, answer: string) {
  fireEvent.click(view.getByRole('button', { name: '文字' }));
  fireEvent.change(view.getByRole('textbox'), { target: { value: answer } });
}

beforeEach(async () => {
  sessionStorage.clear();
  localStorage.clear();
  await clearAudio();
});
afterEach(() => cleanup());
after(() => dom.window.close());

test('cancelled answer generation cannot overwrite a later request, and confirmed drafts never complete practice', async (t) => {
  const stale = deferredResponse(),
    fresh = deferredResponse();
  t.after(async () => {
    // Always settle ignored-abort transports, including when an assertion fails.
    await act(async () => {
      stale.resolve(Response.json({ text: 'cleanup', missingFacts: [], model: 'test' }));
      fresh.resolve(Response.json({ text: 'cleanup', missingFacts: [], model: 'test' }));
    });
  });
  const requests: RequestInit[] = [];
  t.mock.method(globalThis, 'fetch', (_url: string | URL | Request, init?: RequestInit) => {
    assert.ok(init);
    requests.push(init);
    // Deliberately ignore abort to exercise stale-response protection even if transport
    // cancellation arrives too late or a provider keeps producing a response.
    return requests.length === 1 ? stale.promise : fresh.promise;
  });
  const state = emptyState();
  state.profile.projects = [
    {
      id: 'retrieval',
      name: '检索评估',
      background: '需要检查检索质量',
      role: '我负责离线评估',
      decision: '',
      result: '',
      reflection: '',
      tags: [],
    },
  ];
  const { view, observed } = mountPractice({
    state,
    target: 'project:retrieval',
    health: configured,
  });
  fireEvent.click(view.getByRole('button', { name: '生成英文参考稿' }));
  assert.equal(requests.length, 1, 'draft generation does not require a prior answer');
  assert.equal(JSON.parse(String(requests[0].body)).kind, 'project');
  fireEvent.click(view.getByRole('button', { name: '取消等待' }));
  assert.equal(requests[0].signal?.aborted, true);
  fireEvent.click(view.getByRole('button', { name: '生成英文参考稿' }));
  assert.equal(requests.length, 2);
  await act(async () =>
    stale.resolve(
      Response.json({
        text: 'STALE_CANCELLED_REFERENCE',
        missingFacts: [],
        factIds: [],
        model: 'old-model',
      }),
    ),
  );
  assert.equal(
    view.queryByText('STALE_CANCELLED_REFERENCE'),
    null,
    'cancelled content must never become visible',
  );
  assert.ok(
    view.getByRole('button', { name: '取消等待' }),
    'an old finally block must not clear the newer request state',
  );
  assert.equal(observed.updates, 0);

  const reference = 'I evaluated retrieval quality using examples from our knowledge base.';
  await act(async () =>
    fresh.resolve(
      Response.json({
        text: reference,
        missingFacts: ['具体结果仍需核实'],
        factIds: [],
        model: 'test-model',
      }),
    ),
  );
  assert.ok(view.getByText('具体结果仍需核实'));
  const editor = view.getByLabelText('英文参考稿 · 可编辑') as HTMLTextAreaElement;
  assert.equal(editor.value, reference);
  const confirm = view.getByRole('button', {
    name: '确认稿件，开始逐句跟读',
  }) as HTMLButtonElement;
  assert.equal(confirm.disabled, true, 'seeing model output is not factual confirmation');
  const consent = view.getByRole('checkbox', { name: /我已核对技术内容和个人事实/ });
  fireEvent.click(consent);
  assert.equal(confirm.disabled, false);
  fireEvent.change(editor, {
    target: { value: `${reference} I would verify the online impact separately.` },
  });
  assert.equal(confirm.disabled, true, 'editing the draft must invalidate previous confirmation');
  fireEvent.click(consent);
  fireEvent.click(confirm);
  assert.ok(view.container.querySelector('.reading-sentence')?.textContent?.includes(reference));
  assert.equal(view.queryByLabelText('英文参考稿 · 可编辑'), null);
  assert.match(view.container.textContent || '', /本次已使用辅助/);
  assert.equal(
    observed.updates,
    0,
    'generating, editing and confirming a script must not add progress',
  );
  assert.deepEqual(observed.state.attempts, []);
});

test('audio-only save preserves the recording after an IDB failure and adds history only after a successful retry', async (t) => {
  const { view, observed } = mountPractice();
  const { file, bytes } = uploadAudio(view);
  const audio = view.getByLabelText('我的录音');
  const originalUrl = audio.getAttribute('src');
  const checkbox = view.getByRole('checkbox', {
    name: /把这次录音保存在此浏览器/,
  }) as HTMLInputElement;
  assert.equal(checkbox.checked, false, 'audio retention must require opt-in');
  assert.equal(
    (view.getByRole('button', { name: '保存自主练习' }) as HTMLButtonElement).disabled,
    true,
  );
  fireEvent.click(checkbox);
  const failure = t.mock.method(IDBObjectStore.prototype, 'put', () => {
    throw new DOMException('test quota', 'QuotaExceededError');
  });
  fireEvent.click(view.getByRole('button', { name: '保存自主练习' }));
  await waitFor(() =>
    assert.ok(view.getByRole('alert').textContent?.includes('本次练习记录也尚未写入')),
  );
  assert.ok(failure.mock.callCount() > 0, 'the failure must occur in the real storage adapter');
  assert.equal(observed.updates, 0);
  assert.equal(observed.state.attempts.length, 0);
  assert.equal(
    view.getByLabelText('我的录音').getAttribute('src'),
    originalUrl,
    'failed storage must not discard the current recording',
  );
  assert.equal(
    (view.getByRole('button', { name: '仅保存文字' }) as HTMLButtonElement).disabled,
    true,
    'there is no text to fall back to',
  );
  assert.deepEqual(await getAudioUsage(), { bytes: 0, count: 0 });

  failure.mock.restore();
  fireEvent.click(view.getByRole('button', { name: '重试录音保存' }));
  await waitFor(() => assert.equal(observed.state.attempts.length, 1));
  const attempt = observed.state.attempts[0];
  assert.equal(attempt.answer, '');
  assert.equal(attempt.selfReview, true);
  assert.equal(attempt.feedback, undefined);
  assert.deepEqual(attempt.audio, {
    key: attempt.id,
    bytes: file.size,
    mimeType: 'audio/wav',
    fileName: file.name,
  });
  const stored = await getAudio(attempt.id);
  assert.ok(stored);
  assert.deepEqual(new Uint8Array(await stored.blob.arrayBuffer()), bytes);
  assert.equal(
    observed.updates,
    1,
    'retry must create one actual attempt, not duplicate failed ones',
  );
  assert.deepEqual(
    parseState(JSON.stringify(observed.state)).attempts,
    JSON.parse(JSON.stringify(observed.state)).attempts,
    'audio metadata and question snapshots must survive the real backup schema',
  );
});

test('after recording persistence fails, explicit text-only fallback saves no audio and keeps the failure distinction visible', async (t) => {
  const { view, observed } = mountPractice();
  uploadAudio(view);
  const originalUrl = view.getByLabelText('我的录音').getAttribute('src');
  fireEvent.click(view.getByRole('checkbox', { name: /把这次录音保存在此浏览器/ }));
  const answer = 'I would inspect data leakage before trusting the validation metrics.';
  typeAnswer(view, answer);
  const failure = t.mock.method(IDBObjectStore.prototype, 'put', () => {
    throw new DOMException('test abort', 'AbortError');
  });
  fireEvent.click(view.getByRole('button', { name: '保存自主练习' }));
  await waitFor(() => assert.ok(view.getByRole('alert').textContent?.includes('录音未能保存')));
  assert.equal(observed.state.attempts.length, 0);
  const failedWrites = failure.mock.callCount();
  fireEvent.click(view.getByRole('button', { name: '仅保存文字' }));
  await waitFor(() => assert.equal(observed.state.attempts.length, 1));
  assert.equal(
    failure.mock.callCount(),
    failedWrites,
    'text-only fallback must not retry recording storage',
  );
  assert.equal(observed.state.attempts[0].answer, answer);
  assert.equal(observed.state.attempts[0].audio, undefined);
  assert.deepEqual(await getAudioUsage(), { bytes: 0, count: 0 });
  assert.ok(observed.notices.some((message) => message.includes('仅文字记录已保存，录音尚未保存')));
  assert.ok(view.getByText('本次仅保存了文字，录音未加入练习记录。'));
  fireEvent.click(view.getByRole('button', { name: '录音' }));
  assert.equal(
    view.getByLabelText('我的录音').getAttribute('src'),
    originalUrl,
    'the recording must remain downloadable after text-only fallback',
  );
  assert.deepEqual(
    parseState(JSON.stringify(observed.state)).attempts,
    JSON.parse(JSON.stringify(observed.state)).attempts,
  );
});

test('saving a typed answer without opting in never persists the accompanying recording', async (t) => {
  const { view, observed } = mountPractice();
  uploadAudio(view);
  typeAnswer(view, 'I would split the data before fitting preprocessing steps.');
  const unexpectedWrite = t.mock.method(IDBObjectStore.prototype, 'put', () => {
    throw new Error('Audio storage must not run without opt-in.');
  });
  fireEvent.click(view.getByRole('button', { name: '保存自主练习' }));
  await waitFor(() => assert.equal(observed.state.attempts.length, 1));
  assert.equal(observed.state.attempts[0].audio, undefined);
  assert.equal(unexpectedWrite.mock.callCount(), 0);
  assert.deepEqual(await getAudioUsage(), { bytes: 0, count: 0 });
  assert.equal(
    observed.state.attempts[0].snapshot?.question,
    questions[0].question,
    'the saved text remains tied to the actual practice question',
  );
  assert.deepEqual(
    parseState(JSON.stringify(observed.state)).attempts,
    JSON.parse(JSON.stringify(observed.state)).attempts,
  );
});
