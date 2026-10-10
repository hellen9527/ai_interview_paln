import assert from 'node:assert/strict';
import test from 'node:test';
import { questions } from '../src/data/questions';
import { emptyState, getStats, initialState, parseState } from '../src/lib/store';
import type { AppState, Attempt, Feedback } from '../src/types';

const strongFeedback: Feedback = {
  summary: '回答覆盖核心概念，下一步换个问法复练。',
  strengths: ['区分了召回与排序。'],
  improvements: [],
  referenceAnswer: 'Retrieval finds candidates; ranking orders them.',
  followUp: 'What happens if recall is low?',
  contentLevel: 'strong',
  model: 'test-model',
};

function attempt(overrides: Partial<Attempt> = {}): Attempt {
  return {
    id: 'attempt-1',
    questionId: 'retrieval-bm25',
    title: 'BM25 的关键因素',
    category: 'retrieval',
    date: '2026-10-01T12:00:00.000Z',
    answer: 'BM25 uses term frequency, term rarity, and document length.',
    mode: 'independent',
    duration: 60,
    assisted: false,
    reviewDue: '2026-10-02T12:00:00.000Z',
    ...overrides,
  };
}

function withAttempts(attempts: Attempt[]): AppState {
  return { ...emptyState(), attempts };
}

test('emptyState removes sample identity, facts, projects, introduction, and target', () => {
  const state = emptyState();
  assert.equal(state.sample, false);
  assert.deepEqual(state.profile, {
    name: '',
    title: '',
    experience: '',
    summary: '',
    facts: [],
    resumeVersion: 0,
    projects: [],
  });
  assert.equal(state.intro, '');
  assert.equal(state.introConfirmed, false);
  assert.equal(state.introStale, false);
  assert.equal(state.plan.company, '');
  assert.equal(state.plan.role, '');
  assert.equal(state.plan.date, '');
  assert.deepEqual(state.attempts, []);
  assert.deepEqual(state.bookmarks, []);
  assert.deepEqual(state.completedTasks, []);
  assert.deepEqual(state.sessions, []);
});

test('state factories return independent editable data', () => {
  const first = emptyState();
  first.profile.facts.push({ id: 'personal-fact', text: '用户自己的事实', confirmed: true });
  first.bookmarks.push('retrieval-bm25');
  first.attempts.push(attempt());
  const second = emptyState();
  assert.deepEqual(second.profile.facts, []);
  assert.deepEqual(second.bookmarks, []);
  assert.deepEqual(second.attempts, []);
  assert.equal(
    initialState().profile.facts.some((f) => f.id === 'personal-fact'),
    false,
  );
});

test('parseState accepts valid backups without losing personal content or practice evidence', () => {
  const state = emptyState();
  state.profile.name = '李明';
  state.profile.summary = '检索、RAG 与评估。';
  state.profile.facts = [{ id: 'confirmed-fact', text: '负责检索评估', confirmed: true }];
  state.profile.resumeName = '个人简历.pdf';
  state.profile.resumeText = '项目经历\n检索评估';
  state.attempts = [attempt({ feedback: strongFeedback })];
  state.sessions = [
    {
      id: 'session-1',
      date: '2026-10-01T12:00:00.000Z',
      attemptIds: ['attempt-1'],
      completed: true,
    },
  ];
  state.bookmarks = ['retrieval-bm25'];
  assert.deepEqual(parseState(JSON.stringify(state)), state);
  assert.deepEqual(parseState(JSON.stringify(initialState())).sample, true);
});

test('parseState rejects malformed JSON and unsupported backup versions', () => {
  for (const raw of ['', '{broken', 'null', '[]', '"not a backup"']) {
    assert.throws(() => parseState(raw), `must reject ${JSON.stringify(raw)}`);
  }
  assert.throws(() => parseState(JSON.stringify({ ...emptyState(), version: 2 })));
});

test('parseState rejects malformed nested records instead of trusting imported data', () => {
  const state = emptyState();
  const invalidBackups: unknown[] = [
    { ...state, sample: 'false' },
    {
      ...state,
      profile: { ...state.profile, facts: [{ id: 'f', text: '事实', confirmed: 'yes' }] },
    },
    { ...state, profile: { ...state.profile, resumeVersion: -1 } },
    { ...state, plan: { ...state.plan, track: 'unknown-role' } },
    { ...state, plan: { ...state.plan, minutes: 0 } },
    { ...state, attempts: [attempt({ duration: -10 })] },
    { ...state, attempts: [{ ...attempt(), mode: 'mastered' }] },
    { ...state, attempts: [{ ...attempt(), assisted: 'false' }] },
    {
      ...state,
      attempts: [
        { ...attempt(), feedback: { ...strongFeedback, contentLevel: 'guaranteed-offer' } },
      ],
    },
    {
      ...state,
      sessions: [{ id: 's', date: '2026-10-01', attemptIds: 'attempt-1', completed: true }],
    },
    { ...state, profile: { ...state.profile, summary: 'x'.repeat(50_001) } },
  ];
  for (const [index, backup] of invalidBackups.entries()) {
    assert.throws(() => parseState(JSON.stringify(backup)), `invalid backup case ${index + 1}`);
  }
});

test('getStats only counts unique questions with independent, unassisted, strong feedback as candidates', () => {
  const state = withAttempts([
    attempt({ id: 'pass-1', questionId: 'qualifying', feedback: strongFeedback }),
    attempt({ id: 'pass-2', questionId: 'qualifying', feedback: strongFeedback }),
    attempt({ id: 'read', questionId: 'read-only', mode: 'read', feedback: strongFeedback }),
    attempt({ id: 'keywords', questionId: 'prompted', mode: 'keywords', feedback: strongFeedback }),
    attempt({ id: 'helped', questionId: 'assisted', assisted: true, feedback: strongFeedback }),
    attempt({ id: 'unassessed', questionId: 'no-feedback' }),
    attempt({ id: 'self-review', questionId: 'self-review-only', selfReview: true }),
    attempt({
      id: 'developing',
      questionId: 'developing',
      feedback: { ...strongFeedback, contentLevel: 'developing' },
    }),
    attempt({
      id: 'needs-work',
      questionId: 'needs-work',
      feedback: { ...strongFeedback, contentLevel: 'needs-work' },
    }),
    attempt({ id: 'pass-3', questionId: 'another-qualifying', feedback: strongFeedback }),
  ]);
  assert.equal(getStats(state).independent, 2);
  assert.equal(
    getStats(state).attempts,
    10,
    'excluded candidates still count as practice attempts',
  );
});

test('getStats returns zero progress for a fresh personal workspace', () => {
  assert.deepEqual(getStats(emptyState()), {
    attempts: 0,
    minutes: 0,
    days: 0,
    independent: 0,
    due: 0,
  });
});

test('due reviews use the latest attempt per question, not old overdue records or array order', (t) => {
  const now = Date.parse('2026-10-10T12:00:00.000Z');
  t.mock.method(Date, 'now', () => now);
  const records = [
    // A has been practised again: its new future due date replaces the old overdue date.
    attempt({
      id: 'a-new',
      questionId: 'a',
      date: '2026-10-09T12:00:00.000Z',
      reviewDue: '2026-10-12T12:00:00.000Z',
    }),
    // B becomes due at exactly the reference time.
    attempt({
      id: 'b-old',
      questionId: 'b',
      date: '2026-10-01T12:00:00.000Z',
      reviewDue: '2026-10-20T12:00:00.000Z',
    }),
    attempt({
      id: 'c-new',
      questionId: 'c',
      date: '2026-10-08T12:00:00.000Z',
      reviewDue: '2026-10-09T12:00:00.000Z',
    }),
    attempt({
      id: 'a-old',
      questionId: 'a',
      date: '2026-10-01T12:00:00.000Z',
      reviewDue: '2026-10-02T12:00:00.000Z',
    }),
    attempt({
      id: 'b-new',
      questionId: 'b',
      date: '2026-10-09T12:00:00.000Z',
      reviewDue: '2026-10-10T12:00:00.000Z',
    }),
    attempt({
      id: 'c-old',
      questionId: 'c',
      date: '2026-10-01T12:00:00.000Z',
      reviewDue: '2026-10-02T12:00:00.000Z',
    }),
    attempt({
      id: 'd',
      questionId: 'd',
      date: '2026-10-09T12:00:00.000Z',
      reviewDue: '2026-10-15T12:00:00.000Z',
    }),
  ];
  assert.equal(getStats(withAttempts(records)).due, 2, 'only B and C are due');
  assert.equal(
    getStats(withAttempts([...records].reverse())).due,
    2,
    'import order must not change the result',
  );
  assert.deepEqual(
    records.map((a) => a.id),
    ['a-new', 'b-old', 'c-new', 'a-old', 'b-new', 'c-old', 'd'],
    'statistics must not reorder the stored history',
  );
});

test('the question bank has unique IDs and complete, valid learning records', () => {
  assert.ok(questions.length >= 24, 'keep the initial learning coverage');
  assert.equal(new Set(questions.map((q) => q.id)).size, questions.length);
  const fields = [
    'id',
    'category',
    'title',
    'question',
    'translation',
    'difficulty',
    'minutes',
    'tags',
    'answer',
    'points',
    'followups',
    'sourceUrl',
    'reviewed',
  ].sort();
  const categories = new Set([
    'nlp',
    'retrieval',
    'rag',
    'ml',
    'recommendation',
    'cv',
    'speech',
    'video',
  ]);
  const difficulties = new Set(['基础', '进阶', '挑战']);
  for (const q of questions) {
    assert.deepEqual(Object.keys(q).sort(), fields, `${q.id}: unexpected or missing fields`);
    for (const key of ['id', 'title', 'question', 'translation', 'answer', 'sourceUrl'] as const) {
      assert.equal(typeof q[key], 'string', `${q.id}.${key}`);
      assert.ok(q[key].trim().length > 0, `${q.id}.${key} is empty`);
    }
    assert.ok(categories.has(q.category), `${q.id}: category`);
    assert.ok(difficulties.has(q.difficulty), `${q.id}: difficulty`);
    assert.ok(Number.isInteger(q.minutes) && q.minutes > 0, `${q.id}: practice duration`);
    for (const key of ['tags', 'points', 'followups'] as const) {
      assert.ok(Array.isArray(q[key]) && q[key].length > 0, `${q.id}.${key}`);
      assert.ok(
        q[key].every((value) => typeof value === 'string' && value.trim().length > 0),
        `${q.id}.${key}: empty or invalid item`,
      );
    }
    assert.equal(new URL(q.sourceUrl).protocol, 'https:', `${q.id}: source protocol`);
    assert.equal(q.reviewed, false, `${q.id}: seeds must not claim expert review`);
  }
});
