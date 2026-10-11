import type { Attempt, PracticeSnapshot } from '../types';

/** Old records keep their question text, but never inherit today's resume or rubric. */
export function snapshotForAttempt(attempt: Attempt): PracticeSnapshot | null {
  if (attempt.snapshot) return structuredClone(attempt.snapshot);
  if (!attempt.question?.trim()) return null;
  return {
    kind: 'followup',
    question: attempt.question,
    title: attempt.title,
    category: attempt.category,
    points: [],
  };
}
