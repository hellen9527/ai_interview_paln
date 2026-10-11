import { z } from 'zod';
import type { AppState } from '../types';
export const STORAGE_KEY = 'interview-pal:v1';
export const labels = {
  nlp: '自然语言处理',
  retrieval: '搜索与检索',
  rag: 'RAG / 大模型',
  ml: '机器学习',
  recommendation: '推荐算法',
  cv: '计算机视觉',
  speech: '语音算法',
  video: 'AI 视频',
};
export const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString();
export function initialState(): AppState {
  return {
    version: 1,
    sample: true,
    profile: {
      name: 'Alex',
      title: 'NLP 算法工程师',
      experience: '3 年',
      summary:
        '专注文本检索与大模型应用，希望能用英语清楚解释自己的技术选择。以下为可替换的示例资料。',
      resumeVersion: 1,
      facts: [
        { id: 'f1', text: '我是一名有三年工作经验的 NLP 算法工程师。', confirmed: true },
        { id: 'f2', text: '我参与过企业知识库检索项目，负责检索评估和错误分析。', confirmed: true },
        { id: 'f3', text: '我希望在国际化团队中继续从事检索与大模型应用。', confirmed: true },
      ],
      projects: [
        {
          id: 'knowledge-search',
          name: '企业知识库检索',
          background: '员工难以从分散的文档中找到相关信息。',
          role: '负责离线检索评估和错误案例分析。',
          decision: '比较关键词检索和向量检索，关注它们在不同查询类型下的表现。',
          result: '整理了检索失败案例；具体线上结果尚未确认。',
          reflection: '下一步需要明确线上验证方案和错误类别。',
          tags: ['RAG', '检索评估', '错误分析'],
        },
      ],
    },
    plan: {
      company: '我的目标公司',
      role: 'NLP / LLM Algorithm Engineer',
      date: inDays(14).slice(0, 10),
      minutes: 20,
      track: 'nlp',
    },
    intro:
      'Hi, I’m Alex, an NLP engineer with three years of experience.\nMy work focuses on information retrieval and language model applications.\nIn a recent knowledge search project, I worked on retrieval evaluation and error analysis.\nI’m looking for an opportunity to solve practical problems in an international team.',
    introConfirmed: true,
    introStale: false,
    bookmarks: [],
    attempts: [],
    completedTasks: [],
    sessions: [],
  };
}
export function emptyState(): AppState {
  const state = initialState();
  return {
    ...state,
    sample: false,
    profile: {
      name: '',
      title: '',
      experience: '',
      summary: '',
      facts: [],
      resumeVersion: 0,
      projects: [],
    },
    intro: '',
    introConfirmed: false,
    introStale: false,
    plan: { ...state.plan, company: '', role: '', date: '', track: 'nlp' },
  };
}
const text = z.string().max(50000),
  short = z.string().max(1000);
const feedback = z.object({
  summary: text,
  strengths: z.array(text).max(20),
  improvements: z.array(z.object({ title: short, detail: text, quote: text.optional() })).max(20),
  referenceAnswer: text,
  followUp: text,
  contentLevel: z.enum(['strong', 'developing', 'needs-work']),
  model: short,
});
const projectSchema = z.object({
  id: short,
  name: z.string().max(80),
  background: z.string().max(1600),
  role: z.string().max(1600),
  decision: z.string().max(1600),
  result: z.string().max(1600),
  reflection: z.string().max(1600),
  tags: z.array(z.string().max(30)).max(8),
});
const snapshotSchema = z.object({
  kind: z.enum(['intro', 'technical', 'project', 'reverse', 'clarify', 'followup']),
  question: z.string().min(1).max(4000),
  title: short,
  category: short,
  translation: z.string().max(4000).optional(),
  points: z.array(z.string().max(2000)).max(30),
  reference: z.string().max(20000).optional(),
  sourceUrl: z
    .string()
    .url()
    .refine((value) => /^https?:\/\//.test(value))
    .optional(),
  project: projectSchema.optional(),
  job: z.object({ role: z.string().max(100), jd: z.string().max(12000) }).optional(),
});
const audioSchema = z.object({
  key: z.string().min(1).max(1000),
  bytes: z
    .number()
    .int()
    .positive()
    .max(10 * 1024 * 1024),
  mimeType: z.string().max(200),
  fileName: z.string().min(1).max(180),
});
export const stateSchema = z.object({
  version: z.literal(1),
  sample: z.boolean(),
  profile: z.object({
    name: z.string().max(40),
    title: z.string().max(100),
    experience: z.string().max(30),
    summary: z.string().max(2000),
    facts: z
      .array(
        z.object({ id: z.string().max(100), text: z.string().max(800), confirmed: z.boolean() }),
      )
      .max(60),
    resumeVersion: z.number().int().nonnegative(),
    resumeName: short.optional(),
    resumeText: text.optional(),
    projects: z
      .array(
        z.object({
          id: short,
          name: z.string().max(80),
          background: z.string().max(1600),
          role: z.string().max(1600),
          decision: z.string().max(1600),
          result: z.string().max(1600),
          reflection: z.string().max(1600),
          tags: z.array(z.string().max(30)).max(8),
        }),
      )
      .max(50),
  }),
  plan: z.object({
    company: z.string().max(100),
    role: z.string().max(100),
    date: z
      .string()
      .refine((v) => v === '' || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)))),
    minutes: z.number().int().min(5).max(120),
    track: z.enum(['nlp', 'retrieval', 'rag', 'ml', 'recommendation', 'cv', 'speech', 'video']),
    jd: z.string().max(12000).optional(),
  }),
  intro: text,
  introConfirmed: z.boolean(),
  introStale: z.boolean(),
  bookmarks: z.array(short).max(1000),
  attempts: z
    .array(
      z
        .object({
          id: short,
          questionId: short,
          question: text.optional(),
          snapshot: snapshotSchema.optional(),
          audio: audioSchema.optional(),
          title: short,
          category: short,
          date: z.iso.datetime(),
          answer: z.string().max(15000),
          mode: z.enum(['read', 'keywords', 'independent']),
          feedback: feedback.optional(),
          duration: z.number().min(0).max(1800),
          assisted: z.boolean(),
          selfReview: z.boolean().optional(),
          reviewDue: z.iso.datetime(),
        })
        .refine((a) => !a.audio || a.audio.key === a.id, '录音引用必须属于这条练习记录。')
        .refine(
          (a) => !a.snapshot || !a.question || a.snapshot.question === a.question,
          '题目快照与记录不一致。',
        ),
    )
    .max(5000)
    .refine(
      (attempts) => new Set(attempts.map((a) => a.id)).size === attempts.length,
      '练习记录ID不能重复。',
    ),
  completedTasks: z.array(short).max(10000),
  sessions: z
    .array(
      z.object({
        id: short,
        date: z.iso.datetime(),
        attemptIds: z.array(short),
        completed: z.boolean(),
      }),
    )
    .max(1000),
});
export function parseState(raw: string): AppState {
  return stateSchema.parse(JSON.parse(raw));
}
export function loadState(): AppState {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    return s ? parseState(s) : initialState();
  } catch {
    return initialState();
  }
}
export function dateLabel(value: string) {
  return new Date(value).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}
export function reviewKey(attempt: AppState['attempts'][number]) {
  return JSON.stringify([
    attempt.questionId,
    (attempt.snapshot?.question ?? attempt.question ?? '').trim(),
  ]);
}
export function latestAttempts(state: AppState) {
  const latest = new Map<string, AppState['attempts'][number]>();
  for (const attempt of state.attempts) {
    const key = reviewKey(attempt);
    const old = latest.get(key);
    if (!old || new Date(attempt.date) > new Date(old.date)) latest.set(key, attempt);
  }
  return [...latest.values()];
}
export function getStats(state: AppState) {
  const days = new Set(state.attempts.map((a) => new Date(a.date).toLocaleDateString('en-CA')));
  return {
    attempts: state.attempts.length,
    minutes: Math.round(state.attempts.reduce((s, a) => s + a.duration, 0) / 60),
    days: days.size,
    independent: new Set(
      state.attempts
        .filter(
          (a) => a.mode === 'independent' && !a.assisted && a.feedback?.contentLevel === 'strong',
        )
        .map(reviewKey),
    ).size,
    due: latestAttempts(state).filter((a) => new Date(a.reviewDue).getTime() <= Date.now()).length,
  };
}
export function downloadFile(name: string, contents: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
