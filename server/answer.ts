import { ApiError } from './errors.js';
import type { AnswerInput, AnswerOutput } from './schemas.js';

const projectFields = [
  ['name', '请补充真实的项目名称。'],
  ['background', '请补充项目背景与要解决的问题。'],
  ['role', '请补充你个人承担的职责，不要将团队成果当作个人贡献。'],
  ['decision', '请补充实际采用的方案与选择理由。'],
  ['result', '请补充真实成果或验证方式；没有量化结果时可使用定性描述。'],
  ['reflection', '请补充真实的复盘、限制或改进方向。'],
] as const;

/** Conservative numeric guard for personal project drafts, not a semantic fact-checker. */
function numericValues(value: string): Set<string> {
  // Chinese resume text commonly places digits immediately after a Han character.
  const matches = value.normalize('NFKC').match(/\d+(?:[.,]\d+)*(?:%|[x×])?/gu) || [];
  return new Set(matches.map((match) => match.toLowerCase().replaceAll(',', '').replace('×', 'x')));
}

export function protectAnswer(input: AnswerInput, output: AnswerOutput): AnswerOutput {
  const confirmedFacts = input.facts.filter((fact) => fact.confirmed);
  const confirmedIds = new Set(confirmedFacts.map((fact) => fact.id));
  if (output.factIds.some((id) => !confirmedIds.has(id))) {
    throw new ApiError(
      502,
      'MODEL_FACT_REFERENCE_INVALID',
      '模型引用了未经确认或不存在的事实，已拒绝该练习稿。请核对资料后重试。',
    );
  }

  // Job descriptions and learning examples are deliberately excluded from personal evidence.
  if (input.kind === 'project' || input.project) {
    const project = input.project;
    const evidence = [
      ...confirmedFacts.map((fact) => fact.text),
      ...(project
        ? [
            project.name,
            project.background,
            project.role,
            project.decision,
            project.result,
            project.reflection,
            ...project.tags,
          ]
        : []),
    ].join('\n');
    const sourceNumbers = numericValues(evidence);
    if ([...numericValues(output.text)].some((number) => !sourceNumbers.has(number))) {
      throw new ApiError(
        502,
        'MODEL_FACTS_UNSUPPORTED',
        '项目练习稿出现了资料中没有依据的新数值，已拒绝该结果。请补充真实信息后重试。',
      );
    }
  }

  const missingProjectFields =
    input.kind === 'project'
      ? projectFields
          .filter(([field]) => !input.project?.[field]?.trim())
          .map(([, message]) => message)
      : [];
  return {
    text: output.text,
    // Always acknowledge absent project data even if the model forgets to do so.
    missingFacts: [...new Set([...missingProjectFields, ...output.missingFacts])].slice(0, 8),
    factIds: [...new Set(output.factIds)],
  };
}
