import { useEffect, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  BriefcaseBusiness,
  Check,
  CircleHelp,
  FolderKanban,
  Lightbulb,
  Plus,
  ShieldCheck,
  Target,
  Trash2,
} from 'lucide-react';
import type { PageProps, Project } from '../types';

const newProject = (): Project => ({
  id: crypto.randomUUID(),
  name: '',
  background: '',
  role: '',
  decision: '',
  result: '',
  reflection: '',
  tags: [],
});
const dimensions: {
  key: 'background' | 'role' | 'decision' | 'result' | 'reflection';
  title: string;
  hint: string;
  placeholder: string;
}[] = [
  {
    key: 'background',
    title: '项目背景',
    hint: '什么问题值得被解决？',
    placeholder: '服务谁、解决什么问题、原来的方案有什么限制？只写你知道的背景。',
  },
  {
    key: 'role',
    title: '我的实际贡献',
    hint: '把 “we” 和 “I” 分清楚',
    placeholder: '你具体负责什么？哪些是你完成的，哪些由团队其他成员负责？',
  },
  {
    key: 'decision',
    title: '技术选择与难点',
    hint: '让面试官听见你的判断',
    placeholder: '为什么选择这个方案？调研或比较过什么？最大的难点是什么，如何解决？',
  },
  {
    key: 'result',
    title: '结果与验证',
    hint: '真实结果比漂亮数字更有说服力',
    placeholder: '如何判断项目有效？填写真实指标、测试方法或用户反馈。没有精确数字也可以诚实说明。',
  },
  {
    key: 'reflection',
    title: '复盘与更好的方案',
    hint: '如果重新来一次，你会改变什么？',
    placeholder: '有哪些限制或遗憾？未来会如何改进？区分已经做过的事和未来设想。',
  },
];

export default function ProjectsPage({
  state,
  update,
  navigate,
  notify,
  startPractice,
}: PageProps) {
  const [selected, setSelected] = useState(state.profile.projects[0]?.id || '');
  const [draft, setDraft] = useState<Project | null>(state.profile.projects[0] || null);
  const [tagsText, setTagsText] = useState(state.profile.projects[0]?.tags.join(', ') || '');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const saved = state.profile.projects.find((project) => project.id === selected);
  const dirty =
    !!draft &&
    (creating ||
      JSON.stringify(draft) !== JSON.stringify(saved) ||
      tagsText !== (saved?.tags.join(', ') || ''));
  const completed = draft
    ? dimensions.filter((dimension) => draft[dimension.key].trim()).length
    : 0;

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('interview-pal:unsaved', { detail: { dirty } }));
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => {
      window.removeEventListener('beforeunload', warnBeforeLeaving);
      window.dispatchEvent(new CustomEvent('interview-pal:unsaved', { detail: { dirty: false } }));
    };
  }, [dirty]);

  useEffect(() => {
    if (creating) return;
    const current =
      state.profile.projects.find((project) => project.id === selected) ||
      state.profile.projects[0] ||
      null;
    setDraft(current);
    setTagsText(current?.tags.join(', ') || '');
    if (current?.id !== selected) setSelected(current?.id || '');
  }, [state.profile.projects, selected, creating]);

  function mayDiscard() {
    return !dirty || window.confirm('当前项目有未保存的修改，确定放弃这些修改吗？');
  }
  function selectProject(project: Project) {
    if (selected === project.id && !creating) return;
    if (!mayDiscard()) return;
    setCreating(false);
    setSelected(project.id);
    setDraft(project);
    setTagsText(project.tags.join(', '));
    setError('');
  }
  function addProject() {
    if (state.sample) {
      navigate('profile');
      return;
    }
    if (!mayDiscard()) return;
    const project = newProject();
    setCreating(true);
    setSelected(project.id);
    setDraft(project);
    setTagsText('');
    setError('');
  }
  function save() {
    if (!draft || state.sample) return;
    if (draft.name.trim().length < 2) {
      setError('给项目起一个至少 2 个字的名称，方便之后复习。');
      document.getElementById('project-name')?.focus();
      return;
    }
    const tags = [
      ...new Set(
        tagsText
          .split(/[,，、;；\n]/)
          .map((tag) => tag.trim())
          .filter(Boolean),
      ),
    ];
    if (tags.length > 8 || tags.some((tag) => tag.length > 30)) {
      setError('最多添加 8 个技术标签，每个标签不超过 30 个字。');
      return;
    }
    const clean: Project = {
      ...draft,
      name: draft.name.trim(),
      background: draft.background.trim(),
      role: draft.role.trim(),
      decision: draft.decision.trim(),
      result: draft.result.trim(),
      reflection: draft.reflection.trim(),
      tags,
    };
    update((previous) => ({
      ...previous,
      profile: {
        ...previous.profile,
        projects: previous.profile.projects.some((project) => project.id === clean.id)
          ? previous.profile.projects.map((project) => (project.id === clean.id ? clean : project))
          : [...previous.profile.projects, clean],
      },
      introStale: !!previous.intro || previous.introStale,
      introConfirmed: false,
    }));
    setDraft(clean);
    setTagsText(tags.join(', '));
    setCreating(false);
    setError('');
    notify('项目已保存。可以随时补充事实，或开始练习。');
  }
  function removeProject() {
    if (!draft || state.sample) return;
    if (creating) {
      if (!mayDiscard()) return;
      setCreating(false);
      setSelected(state.profile.projects[0]?.id || '');
      setError('');
      return;
    }
    if (!window.confirm(`删除项目「${draft.name}」？历史练习记录会保留，项目内容会从档案中移除。`))
      return;
    const remaining = state.profile.projects.filter((project) => project.id !== draft.id);
    update((previous) => ({
      ...previous,
      profile: {
        ...previous.profile,
        projects: previous.profile.projects.filter((project) => project.id !== draft.id),
      },
      introStale: !!previous.intro || previous.introStale,
      introConfirmed: false,
    }));
    setSelected(remaining[0]?.id || '');
    setDraft(remaining[0] || null);
    setTagsText(remaining[0]?.tags.join(', ') || '');
    setError('');
    notify('项目已删除，历史练习仍然保留。');
  }

  return (
    <div className="stack">
      <header className="page-heading">
        <div>
          <div className="eyebrow">PROJECT STORIES</div>
          <h1 className="page-title">你的项目，值得被讲清楚</h1>
          <p className="page-description">
            从“做过什么”，练到“为什么这样做”。把你的思考讲给面试官听。
          </p>
        </div>
        <button className="btn btn-primary" onClick={addProject}>
          <Plus size={17} /> {state.sample ? '建立我的项目档案' : '添加项目'}
        </button>
      </header>

      {state.sample && (
        <div className="card card-header">
          <div>
            <span className="badge badge-amber">示例项目</span>
            <p className="muted small">
              以下内容用于展示整理方法。建立个人计划后，用自己的经历替换它。
            </p>
          </div>
          <button className="btn btn-secondary" onClick={() => navigate('profile')}>
            去建立个人计划 <ArrowRight size={15} />
          </button>
        </div>
      )}

      <div className="grid-two">
        <div className="stack">
          <section className="card stack">
            <div className="card-header">
              <div>
                <div className="eyebrow">YOUR EXPERIENCE</div>
                <h2>
                  项目档案 <span className="muted">{state.profile.projects.length}</span>
                </h2>
              </div>
              <FolderKanban size={21} />
            </div>
            {state.profile.projects.length ? (
              <div className="stack">
                {state.profile.projects.map((project) => (
                  <button
                    key={project.id}
                    className={`project-card ${selected === project.id && !creating ? 'tab-active' : ''}`}
                    aria-pressed={selected === project.id && !creating}
                    onClick={() => selectProject(project)}
                  >
                    <div className="card-header">
                      <div className="icon-box icon-box-teal">
                        <BriefcaseBusiness size={20} />
                      </div>
                      <span className="badge">
                        {dimensions.filter((dimension) => project[dimension.key].trim()).length} / 5
                        项已整理
                      </span>
                    </div>
                    <h3>{project.name}</h3>
                    <p className="muted small">
                      {project.background
                        ? `${project.background.slice(0, 100)}${project.background.length > 100 ? '…' : ''}`
                        : '先写下问题背景，慢慢补齐你的项目故事。'}
                    </p>
                    <div className="card-header">
                      <span className="small muted">
                        {project.tags.slice(0, 3).join(' · ') || '待补充技术标签'}
                      </span>
                      <ArrowRight size={16} />
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <FolderKanban size={32} />
                <h3>从最熟悉的一个项目开始</h3>
                <p>不需要一开始就写得完整。记录背景和你的贡献，就能迈出第一步。</p>
                <button className="btn btn-secondary" onClick={addProject}>
                  <Plus size={16} /> 添加第一个项目
                </button>
              </div>
            )}
          </section>

          <section className="card stack">
            <div className="card-header">
              <div className="icon-box">
                <Lightbulb size={21} />
              </div>
              <span className="eyebrow">A GOOD STORY HAS DEPTH</span>
            </div>
            <h3>面试官想听见的不只是技术名词</h3>
            <div className="detail-list">
              <p>
                <Target size={16} /> 你理解了什么问题？
              </p>
              <p>
                <CircleHelp size={16} /> 为什么这个方案适合当时的约束？
              </p>
              <p>
                <BookOpen size={16} /> 你如何知道它真正有效？
              </p>
            </div>
            <p className="muted small">
              练习会从项目概述开始，再围绕你的选择、贡献和验证方法展开。暂时不知道的部分，可以诚实说出思考过程。
            </p>
          </section>
          <div className="fact-row">
            <ShieldCheck size={19} />
            <p className="muted small">
              不补造业绩，不虚构个人贡献。没有数据的地方可以留空；准备一个真实例子，也很有说服力。
            </p>
          </div>
        </div>

        <section className="card stack">
          {draft ? (
            <>
              <div className="card-header">
                <div>
                  <div className="eyebrow">{creating ? 'NEW PROJECT' : 'STORY WORKSPACE'}</div>
                  <h2>{creating ? '写下一个新的项目故事' : '让经历更有条理'}</h2>
                </div>
                <span className={`badge ${completed === 5 ? 'badge-teal' : ''}`}>
                  {completed} / 5 项已整理
                </span>
              </div>
              {error && (
                <p role="alert" className="badge badge-amber">
                  {error}
                </p>
              )}
              <fieldset
                disabled={state.sample}
                style={{ border: 0, padding: 0, margin: 0 }}
                className="stack"
              >
                <div className="field">
                  <label htmlFor="project-name">
                    项目名称 <span aria-hidden="true">*</span>
                  </label>
                  <input
                    className="input"
                    id="project-name"
                    value={draft.name}
                    maxLength={80}
                    placeholder="例如：企业知识库检索优化"
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  />
                  <span className="muted small">可使用匿名名称，避免泄露公司机密。</span>
                </div>
                <div className="field">
                  <label htmlFor="project-tags">技术标签</label>
                  <input
                    className="input"
                    id="project-tags"
                    value={tagsText}
                    maxLength={250}
                    placeholder="例如：RAG, Elasticsearch, PyTorch"
                    onChange={(event) => setTagsText(event.target.value)}
                  />
                  <span className="muted small">使用逗号分隔，最多 8 个。</span>
                </div>
                <div className="divider" />
                {dimensions.map((dimension, index) => (
                  <div className="field" key={dimension.key}>
                    <label htmlFor={`project-${dimension.key}`}>
                      <span className="muted small">0{index + 1}</span> {dimension.title}
                    </label>
                    <span className="muted small">{dimension.hint}</span>
                    <textarea
                      className="textarea"
                      id={`project-${dimension.key}`}
                      rows={dimension.key === 'decision' ? 5 : 4}
                      value={draft[dimension.key]}
                      maxLength={1600}
                      placeholder={dimension.placeholder}
                      onChange={(event) =>
                        setDraft({ ...draft, [dimension.key]: event.target.value })
                      }
                    />
                    <span className="muted small">{draft[dimension.key].length} / 1,600</span>
                  </div>
                ))}
              </fieldset>
              <div className="divider" />
              <div className="card-header">
                <button className="btn btn-ghost" disabled={state.sample} onClick={removeProject}>
                  <Trash2 size={15} /> {creating ? '取消新增' : '删除项目'}
                </button>
                <button
                  className="btn btn-secondary"
                  disabled={state.sample || !dirty}
                  onClick={save}
                >
                  <Check size={16} /> 保存项目
                </button>
              </div>
              <button
                className="btn btn-primary"
                disabled={dirty || !saved || !draft.background.trim() || !draft.role.trim()}
                onClick={() => startPractice(`project:${draft.id}`, 'keywords')}
              >
                开始项目追问练习 <ArrowRight size={16} />
              </button>
              <p className="muted small">
                {dirty
                  ? '先保存当前修改，再带着这些经历开始练习。'
                  : !draft.background.trim() || !draft.role.trim()
                    ? '补充项目背景和你的实际贡献后，就可以开始练习。'
                    : '先借助关键词梳理思路，再逐步练到独立回答。'}
              </p>
            </>
          ) : (
            <div className="empty-state">
              <BriefcaseBusiness size={38} />
              <h2>这里留给你的下一段故事</h2>
              <p>选择已有项目，或添加一个最能体现你能力的项目。</p>
              <button className="btn btn-primary" onClick={addProject}>
                <Plus size={16} /> 开始整理
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
