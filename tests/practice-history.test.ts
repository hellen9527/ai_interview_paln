import assert from 'node:assert/strict';
import test from 'node:test';
import type { Attempt, PracticeSnapshot } from '../src/types';
import {
  emptyState,
  initialState,
  latestAttempts,
  getStats,
  parseState,
  reviewKey,
} from '../src/lib/store';
import { snapshotForAttempt } from '../src/lib/practice';
const question = 'Why did you choose a bi-encoder?';
const base: Attempt = {
  id: 'record-1',
  questionId: 'project:archived',
  question,
  title: '旧项目 · 追问',
  category: 'project',
  date: '2026-10-01T04:00:00.000Z',
  answer: '',
  mode: 'independent',
  assisted: false,
  selfReview: true,
  duration: 30,
  reviewDue: '2026-10-02T04:00:00.000Z',
};
const snapshot: PracticeSnapshot = {
  kind: 'followup',
  question,
  title: base.title,
  category: 'project',
  points: [],
  reference: 'I compared retrieval latency and quality.',
  project: initialState().profile.projects[0],
  job: { role: 'Previous target', jd: 'The original role involved retrieval evaluation.' },
};

test('legacy v1 backup remains loadable; new snapshot and audio-only evidence survive round-trip', () => {
  assert.deepEqual(parseState(JSON.stringify(initialState())), initialState());
  const state = emptyState();
  state.attempts = [
    {
      ...base,
      snapshot,
      audio: { key: base.id, bytes: 1024, mimeType: 'audio/webm', fileName: 'answer.webm' },
    },
  ];
  assert.deepEqual(parseState(JSON.stringify(state)), state);
  assert.equal(getStats(state).independent, 0, 'audio alone must not count as assessed content');
});
test('exact history replay clones historical context and never fills missing evidence from current facts', () => {
  const restored = snapshotForAttempt({ ...base, snapshot });
  assert.deepEqual(restored, snapshot);
  assert.notEqual(restored, snapshot);
  restored!.project!.name = 'changed';
  assert.notEqual(restored!.project!.name, snapshot.project!.name);
  const legacy = snapshotForAttempt(base)!;
  assert.equal(legacy.question, question);
  assert.deepEqual(legacy.points, []);
  assert.equal(legacy.project, undefined);
  assert.equal(legacy.job, undefined);
  assert.equal(legacy.reference, undefined);
  assert.equal(snapshotForAttempt({ ...base, question: undefined }), null);
});
test('different follow-up questions keep separate review slots while repeating the exact question replaces its due date', (t) => {
  t.mock.method(Date, 'now', () => Date.parse('2026-10-11T04:00:00.000Z'));
  const original = { ...base, id: 'original', question: 'Walk me through your project.' };
  const followup = { ...base, id: 'followup' };
  const repeated = {
    ...base,
    id: 'repeat',
    snapshot,
    date: '2026-10-11T04:00:00.000Z',
    reviewDue: '2026-10-12T04:00:00.000Z',
  };
  const state = { ...emptyState(), attempts: [repeated, original, followup] };
  assert.notEqual(reviewKey(original), reviewKey(followup));
  assert.equal(reviewKey(followup), reviewKey(repeated));
  assert.equal(latestAttempts(state).length, 2);
  assert.equal(getStats(state).due, 1);
});
test('backup validation rejects dangerous links, mismatched question snapshots and cross-record audio references', () => {
  const invalid = [
    { ...base, snapshot: { ...snapshot, sourceUrl: 'javascript:alert(1)' } },
    { ...base, snapshot: { ...snapshot, question: 'Another question' } },
    {
      ...base,
      audio: { key: 'someone-else', bytes: 10, mimeType: 'audio/webm', fileName: 'answer.webm' },
    },
    {
      ...base,
      audio: {
        key: base.id,
        bytes: 11 * 1024 * 1024,
        mimeType: 'audio/webm',
        fileName: 'answer.webm',
      },
    },
  ];
  assert.throws(() =>
    parseState(
      JSON.stringify({ ...emptyState(), attempts: [base, { ...base, answer: 'duplicate' }] }),
    ),
  );
  for (const attempt of invalid)
    assert.throws(() => parseState(JSON.stringify({ ...emptyState(), attempts: [attempt] })));
});
