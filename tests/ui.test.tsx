import assert from 'node:assert/strict';
import test from 'node:test';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Dashboard from '../src/components/Dashboard';
import Roadmap from '../src/components/Roadmap';
import QuestionLibrary from '../src/components/QuestionLibrary';
import ProjectsPage from '../src/components/ProjectsPage';
import Practice from '../src/components/Practice';
import Reports from '../src/components/Reports';
import ProfilePage from '../src/components/ProfilePage';
import SettingsPage from '../src/components/SettingsPage';
import { questions } from '../src/data/questions';
import { emptyState, initialState } from '../src/lib/store';
import type { AppState, Health, PageProps } from '../src/types';

const disconnected: Health = { configured: false, asrConfigured: false, provider: '', model: '' };
const connected: Health = {
  configured: true,
  asrConfigured: true,
  provider: 'test-provider',
  model: 'test-model',
};
const noSideEffects = () => {
  throw new Error('Rendering a page must not mutate state, navigate, or call a service.');
};

function pageProps(state: AppState, health: Health | null = disconnected): PageProps {
  return {
    state,
    health,
    update: noSideEffects,
    navigate: noSideEffects,
    notify: noSideEffects,
    startPractice: noSideEffects,
  };
}

function practice(props: PageProps, extra: Partial<React.ComponentProps<typeof Practice>> = {}) {
  return (
    <Practice
      {...props}
      target={questions[0].id}
      initialMode="independent"
      simulation={false}
      simulationIndex={0}
      simulationCount={3}
      onNext={noSideEffects}
      {...extra}
    />
  );
}

function plainText(html: string) {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&');
}

function button(html: string, accessibleText: string) {
  const found = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].find(
    (match) =>
      plainText(match[2]).includes(accessibleText) ||
      match[1].includes(`aria-label="${accessibleText}"`),
  );
  assert.ok(found, `Expected the ${accessibleText} action to be discoverable.`);
  return { disabled: /\bdisabled(?:\s|=|$)/.test(found[1]), html: found[0] };
}

test('all workspaces render from both sample and empty personal state without side effects', () => {
  for (const makeState of [initialState, emptyState]) {
    const state = makeState();
    const before = JSON.stringify(state);
    const props = pageProps(state);
    const pages: [string, ReactElement][] = [
      ['dashboard', <Dashboard {...props} />],
      ['roadmap', <Roadmap {...props} />],
      ['questions', <QuestionLibrary {...props} />],
      ['projects', <ProjectsPage {...props} />],
      ['profile', <ProfilePage {...props} />],
      ['reports', <Reports {...props} />],
      ['settings', <SettingsPage {...props} recheck={async () => noSideEffects()} />],
      ['technical practice', practice(props)],
      ['introduction setup', practice(props, { target: 'intro', initialMode: 'read' })],
    ];
    for (const [name, page] of pages) {
      const html = renderToStaticMarkup(page);
      assert.equal(
        (html.match(/<h1\b/g) || []).length,
        1,
        `${name} must provide one page-level heading, including empty state`,
      );
      assert.ok(html.includes('<button'), `${name} must offer a next action`);
      assert.doesNotMatch(
        html,
        /(?:>|\s)(?:NaN|undefined)(?:<|\s)/,
        `${name} must handle missing personal data`,
      );
      assert.equal(
        JSON.stringify(state),
        before,
        `${name} must not alter the user's saved evidence while rendering`,
      );
    }
  }
});

test('independent practice and simulation keep answer material out of the rendered document', () => {
  const state = initialState();
  state.intro = 'PRIVATE_REFERENCE_SENTINEL: I designed the evaluation workflow.';
  state.profile.projects[0].background = 'PRIVATE_PROJECT_BACKGROUND_SENTINEL';
  state.profile.projects[0].role = 'PRIVATE_PROJECT_CONTRIBUTION_SENTINEL';
  const props = pageProps(state, connected);
  for (const question of questions) {
    const html = renderToStaticMarkup(practice(props, { target: question.id }));
    const text = plainText(html);
    assert.ok(
      text.includes(question.question),
      `${question.id}: user must still receive the question`,
    );
    assert.ok(
      !text.includes(question.answer),
      `${question.id}: answer must not be pre-rendered, even inside collapsed UI`,
    );
    for (const point of question.points)
      assert.ok(
        !text.includes(point),
        `${question.id}: answer key is not an independent-mode prompt`,
      );
  }
  for (const target of ['intro', `project:${state.profile.projects[0].id}`]) {
    for (const simulation of [false, true]) {
      const text = plainText(
        renderToStaticMarkup(
          practice(props, { target, simulation, initialMode: simulation ? 'read' : 'independent' }),
        ),
      );
      assert.ok(
        !text.includes('PRIVATE_REFERENCE_SENTINEL'),
        'the personal introduction remains hidden until help is requested',
      );
      assert.ok(
        !text.includes('PRIVATE_PROJECT_BACKGROUND_SENTINEL'),
        'project source facts cannot become unseen-answer hints',
      );
      assert.ok(
        !text.includes('PRIVATE_PROJECT_CONTRIBUTION_SENTINEL'),
        'simulation must override assisted initial modes',
      );
    }
  }
  // Positive controls: the guard must not remove legitimate learning assistance.
  assert.ok(
    plainText(renderToStaticMarkup(practice(props, { initialMode: 'read' }))).includes(
      questions[0].answer.slice(0, 60),
    ),
  );
  assert.ok(
    plainText(renderToStaticMarkup(practice(props, { initialMode: 'keywords' }))).includes(
      questions[0].points[0],
    ),
  );
});

test('sample identity is disclosed and cannot be edited into a personal profile by accident', () => {
  const sample = pageProps(initialState());
  const personal = pageProps(emptyState());
  const sampleProfile = renderToStaticMarkup(<ProfilePage {...sample} />);
  const personalProfile = renderToStaticMarkup(<ProfilePage {...personal} />);
  const sampleProjects = renderToStaticMarkup(<ProjectsPage {...sample} />);
  assert.match(plainText(sampleProfile), /示例档案/);
  assert.match(plainText(sampleProjects), /示例项目/);
  assert.match(plainText(renderToStaticMarkup(<Dashboard {...sample} />)), /示例计划/);
  assert.ok(
    (sampleProfile.match(/<fieldset\b[^>]*\bdisabled=/g) || []).length >= 2,
    'sample identity and target must remain read-only until explicit reset',
  );
  assert.equal(
    button(sampleProfile, '清空示例，建立我的计划').disabled,
    false,
    'the safe route to a personal workspace stays available',
  );
  assert.equal(
    button(sampleProfile, '保存资料与计划').disabled,
    true,
    'sample identity cannot silently become saved personal evidence',
  );
  assert.match(
    sampleProjects,
    /<fieldset\b[^>]*\bdisabled=/,
    'sample project claims remain read-only',
  );
  assert.doesNotMatch(
    personalProfile,
    /<fieldset\b[^>]*\bdisabled=/,
    'a new personal workspace must be editable',
  );
  assert.ok(
    !personalProfile.includes('value="Alex"'),
    'empty personal state must not retain the fictional name',
  );
  assert.ok(
    !plainText(renderToStaticMarkup(<ProjectsPage {...personal} />)).includes(
      initialState().profile.projects[0].name,
    ),
    'sample projects cannot leak into an empty personal workspace',
  );
});

test('unconfigured AI and ASR are disclosed while local practice remains usable', (t) => {
  // A nonempty draft isolates capability gating from the separate empty-answer guard.
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: () =>
        'I would evaluate retrieval quality on a held-out dataset before measuring online impact.',
    },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'sessionStorage', previous);
    else Reflect.deleteProperty(globalThis, 'sessionStorage');
  });

  for (const health of [null, disconnected]) {
    const html = renderToStaticMarkup(practice(pageProps(emptyState(), health)));
    assert.equal(
      button(html, '获取内容反馈').disabled,
      true,
      'a completed answer still cannot call an unconfigured model',
    );
    assert.equal(
      button(html, '开始录音').disabled,
      false,
      'local recording must not require a paid model connection',
    );
    assert.equal(
      button(html, '保存自主练习').disabled,
      false,
      'users can keep their work without generated assessment',
    );
    assert.match(plainText(html), /AI教练尚未连接/);
    assert.match(plainText(html), /语音转写尚未配置/);
  }
  const llmOnly = renderToStaticMarkup(
    practice(pageProps(emptyState(), { ...connected, asrConfigured: false })),
  );
  assert.equal(
    button(llmOnly, '获取内容反馈').disabled,
    false,
    'text feedback works independently of ASR',
  );
  assert.match(plainText(llmOnly), /语音转写尚未配置/);
  const fullyConfigured = renderToStaticMarkup(practice(pageProps(emptyState(), connected)));
  assert.ok(!plainText(fullyConfigured).includes('语音转写尚未配置'));
  assert.match(
    plainText(fullyConfigured),
    /发音评测尚未接入，不生成发音分数/,
    'connecting transcription must not imply validated pronunciation scoring',
  );
  const intro = renderToStaticMarkup(
    practice(pageProps(emptyState()), { target: 'intro', initialMode: 'read' }),
  );
  assert.equal(
    button(intro, '生成英文稿').disabled,
    true,
    'no configured model must not produce a pretend introduction',
  );
});

test('untrusted resume facts, job descriptions and project names stay escaped text', () => {
  const state = emptyState();
  const payload =
    '</textarea><script>window.__interviewLeak=1</script><img src=x onerror="alert(1)">';
  const attributePayload = '" autofocus onfocus="alert(1)';
  state.profile.name = attributePayload;
  state.profile.summary = payload;
  state.profile.facts = [{ id: 'untrusted-fact', text: payload, confirmed: false }];
  state.plan.jd = payload;
  state.profile.projects = [
    {
      id: 'untrusted-project',
      name: payload,
      background: payload,
      role: payload,
      decision: '',
      result: '',
      reflection: '',
      tags: [attributePayload],
    },
  ];
  const props = pageProps(state);
  for (const page of [<ProfilePage {...props} />, <ProjectsPage {...props} />]) {
    const html = renderToStaticMarkup(page);
    assert.ok(
      html.includes('&lt;script&gt;'),
      'uploaded markup remains visible for review as text',
    );
    assert.doesNotMatch(
      html,
      /<script\b|<img\b/i,
      'resume content must not create executable elements',
    );
    const tagsWithoutValues = (html.match(/<[^>]+>/g) || [])
      .map((tag) => tag.replace(/"[^"]*"|'[^']*'/g, '""'))
      .join('\n');
    assert.doesNotMatch(
      tagsWithoutValues,
      /\s(?:onerror|onfocus)=/i,
      'quoted text must not become an event-handler attribute',
    );
  }
  const html = renderToStaticMarkup(<ProfilePage {...props} />);
  assert.ok(
    html.includes('value="&quot; autofocus onfocus=&quot;alert(1)"'),
    'quotes in names must not break out of input values',
  );
  assert.ok(
    !/<input\b[^>]*\bid="confirm-untrusted-fact"[^>]*\bchecked=/.test(html),
    'rendering imported HTML must not implicitly confirm the fact',
  );
});
