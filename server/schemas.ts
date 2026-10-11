import { z } from 'zod';

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).default('');

export const introInput = z
  .object({
    profile: z
      .object({
        name: optionalText(100),
        title: optionalText(160),
        experience: optionalText(300),
        summary: optionalText(8_000),
        facts: z
          .array(z.object({ id: text(100), text: text(800), confirmed: z.boolean() }).strict())
          .max(60)
          .default([]),
      })
      .strict()
      .refine(
        (p) =>
          Boolean(
            p.name || p.title || p.experience || p.summary || p.facts.some((f) => f.confirmed),
          ),
        {
          message: '请填写个人资料或确认至少一条事实。',
        },
      ),
    duration: z.union([z.literal(30), z.literal(60), z.literal(90)]),
    role: text(300),
  })
  .strict();

export const feedbackInput = z
  .object({
    question: text(4_000),
    answer: text(20_000),
    points: z.array(text(2_000)).max(30),
    mode: z.enum(['read', 'keywords', 'independent']),
    referenceAnswer: z.string().trim().max(20_000).optional(),
  })
  .strict();

export const followupInput = z
  .object({
    question: text(4_000),
    answer: text(20_000),
    context: z.string().trim().max(20_000).optional(),
  })
  .strict();

const answerProject = z
  .object({
    id: optionalText(1_000),
    name: optionalText(80),
    background: optionalText(1_600),
    role: optionalText(1_600),
    decision: optionalText(1_600),
    result: optionalText(1_600),
    reflection: optionalText(1_600),
    tags: z.array(text(30)).max(8).default([]),
  })
  .strict();

export const answerInput = z
  .object({
    kind: z.enum(['technical', 'project', 'reverse', 'clarify', 'followup']),
    question: text(4_000),
    points: z.array(text(2_000)).max(30),
    referenceAnswer: z.string().trim().max(20_000).optional(),
    project: answerProject.optional(),
    job: z
      .object({ role: optionalText(100), jd: optionalText(12_000) })
      .strict()
      .optional(),
    facts: z
      .array(z.object({ id: text(100), text: text(800), confirmed: z.boolean() }).strict())
      .max(60)
      .refine((facts) => new Set(facts.map((fact) => fact.id)).size === facts.length, {
        message: '事实ID不能重复。',
      })
      .default([]),
  })
  .strict();

export const answerOutput = z
  .object({
    text: text(8_000),
    missingFacts: z.array(text(300)).max(8),
    factIds: z.array(text(100)).max(60),
  })
  .strict();

export const introOutput = z.object({ text: text(8_000) }).strict();
export const feedbackOutput = z
  .object({
    summary: text(2_000),
    strengths: z.array(text(1_000)).max(6),
    improvements: z
      .array(
        z
          .object({
            title: text(160),
            detail: text(1_500),
            quote: z.string().trim().max(1_000).optional(),
          })
          .strict(),
      )
      .max(5),
    referenceAnswer: text(12_000),
    followUp: text(2_000),
    contentLevel: z.enum(['strong', 'developing', 'needs-work']),
  })
  .strict();
export const followupOutput = z
  .object({ question: text(2_000), translation: text(2_000).optional() })
  .strict();

export type IntroInput = z.infer<typeof introInput>;
export type FeedbackInput = z.infer<typeof feedbackInput>;
export type FollowupInput = z.infer<typeof followupInput>;
export type AnswerInput = z.infer<typeof answerInput>;
export type AnswerOutput = z.infer<typeof answerOutput>;
