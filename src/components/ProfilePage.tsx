import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  FileText,
  Info,
  LoaderCircle,
  Plus,
  ShieldCheck,
  Trash2,
  Upload,
  UserRound,
} from 'lucide-react';
import type { Fact, PageProps, Plan, Profile } from '../types';

const emptyProfile = (): Profile => ({
  name: '',
  title: '',
  experience: '',
  summary: '',
  facts: [],
  resumeVersion: 0,
  projects: [],
});
const tracks = [
  ['nlp', 'NLP / 大语言模型'],
  ['retrieval', '信息检索'],
  ['rag', 'RAG 应用'],
  ['ml', '机器学习'],
  ['recommendation', '搜索 / 推荐'],
  ['cv', '计算机视觉'],
  ['speech', '语音算法'],
  ['video', '视频生成'],
] as const;

function candidateFacts(text: string): Fact[] {
  let paragraphs = text
    .split(/\n+/)
    .map((line) => line.replace(/^\s*[•·\-*]\s*/, '').trim())
    .filter((line) => line.length >= 6);
  if (paragraphs.length < 2 && text.length > 400)
    paragraphs = text
      .split(/(?<=[。！？；.!?;])\s+/)
      .map((line) => line.trim())
      .filter(Boolean);
  return [...new Set(paragraphs)]
    .slice(0, 40)
    .map((text) => ({ id: crypto.randomUUID(), text: text.slice(0, 800), confirmed: false }));
}

export default function ProfilePage({ state, update, navigate, notify }: PageProps) {
  const [profile, setProfile] = useState<Profile>(state.profile);
  const [plan, setPlan] = useState<Plan>(state.plan);
  const [pastedText, setPastedText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setProfile(state.profile);
  }, [state.profile]);
  useEffect(() => {
    setPlan(state.plan);
  }, [state.plan]);

  const confirmed = profile.facts.filter((fact) => fact.confirmed).length;
  const dirty =
    JSON.stringify(profile) !== JSON.stringify(state.profile) ||
    JSON.stringify(plan) !== JSON.stringify(state.plan);
  const hasUnsavedChanges = dirty || !!pastedText.trim() || busy;
  const patchProfile = <K extends keyof Profile>(key: K, value: Profile[K]) =>
    setProfile((previous) => ({ ...previous, [key]: value }));

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('interview-pal:unsaved', { detail: { dirty: hasUnsavedChanges } }),
    );
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => {
      window.removeEventListener('beforeunload', warnBeforeLeaving);
      window.dispatchEvent(new CustomEvent('interview-pal:unsaved', { detail: { dirty: false } }));
    };
  }, [hasUnsavedChanges]);

  function createPlan() {
    if (
      !window.confirm(
        '开始后会清空示例人物、项目、自我介绍和练习记录，保留应用设置。现在建立你自己的面试计划吗？',
      )
    )
      return;
    update((previous) => ({
      ...previous,
      sample: false,
      profile: emptyProfile(),
      plan: { company: '', role: '', date: '', minutes: 20, track: 'nlp', jd: '' },
      intro: '',
      introConfirmed: false,
      introStale: false,
      bookmarks: [],
      attempts: [],
      completedTasks: [],
      sessions: [],
    }));
    setPastedText('');
    setError('');
    notify('新的面试计划已建立。先告诉我们你的目标岗位。');
  }

  function save() {
    if (state.sample) return;
    if (!plan.role.trim()) {
      setError('请填写目标岗位，例如 NLP 算法工程师。');
      document.getElementById('plan-role')?.focus();
      return;
    }
    if (profile.facts.some((fact) => !fact.text.trim())) {
      setError('有一条事实仍然是空白，请补充或删除后保存。');
      return;
    }
    const cleanProfile: Profile = {
      ...profile,
      name: profile.name.trim(),
      title: profile.title.trim(),
      experience: profile.experience.trim(),
      summary: profile.summary.trim(),
      facts: profile.facts.map((fact) => ({ ...fact, text: fact.text.trim() })),
    };
    const contentChanged =
      JSON.stringify(cleanProfile) !== JSON.stringify(state.profile) ||
      plan.role !== state.plan.role ||
      plan.company !== state.plan.company ||
      plan.jd !== state.plan.jd;
    update((previous) => ({
      ...previous,
      profile: cleanProfile,
      plan: {
        ...plan,
        role: plan.role.trim(),
        company: plan.company.trim(),
        jd: plan.jd?.trim() || '',
      },
      introStale: contentChanged && !!previous.intro ? true : previous.introStale,
      introConfirmed: contentChanged ? false : previous.introConfirmed,
    }));
    setError('');
    notify('个人资料与面试计划已保存。');
  }

  function canReplaceFacts() {
    return (
      !profile.facts.length ||
      window.confirm(
        '导入内容会替换下方全部事实条目，原有项目会保留，自我介绍需要重新确认。继续导入吗？',
      )
    );
  }

  function importText(text: string, name: string) {
    const facts = candidateFacts(text);
    if (!facts.length)
      throw new Error('没有提取到可用段落。请粘贴包含工作、技术或项目经历的文字。');
    const next: Profile = {
      ...profile,
      resumeName: name,
      resumeText: text,
      resumeVersion: profile.resumeVersion + 1,
      facts,
    };
    update((previous) => ({ ...previous, profile: next, introStale: true, introConfirmed: false }));
    setError('');
    notify(`已导入 ${facts.length} 条候选事实，请逐条核对并确认。`);
  }

  async function uploadFile(file?: File) {
    if (!file || state.sample || busy) return;
    setError('');
    if (!/\.(txt|pdf|docx)$/i.test(file.name)) {
      setError('支持 TXT、PDF 和 DOCX 文件，请换一种文件格式。');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('文件超过 10 MB，请压缩或导出为更小的文件后重试。');
      return;
    }
    if (!canReplaceFacts()) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await fetch('/api/resume', { method: 'POST', body: form });
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          typeof body.error === 'string'
            ? body.error
            : body.error?.message || '简历解析失败，请稍后重试。',
        );
      if (typeof body.text !== 'string' || !body.text.trim())
        throw new Error('未识别到文字。扫描件请先转为文字，或直接粘贴简历内容。');
      importText(body.text, file.name);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '上传失败，请检查服务连接后重试。');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function importPasted() {
    if (state.sample || busy) return;
    if (pastedText.trim().length < 12) {
      setError('请至少粘贴 12 个字的经历描述。');
      return;
    }
    if (!canReplaceFacts()) return;
    try {
      importText(pastedText.trim(), '手动粘贴的简历');
      setPastedText('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '导入失败。');
    }
  }

  function removeSource() {
    if (!window.confirm('移除简历导入记录和提取原文？已整理的事实、项目与自我介绍仍会保留。'))
      return;
    update((previous) => ({
      ...previous,
      profile: { ...previous.profile, resumeName: undefined, resumeText: undefined },
    }));
    notify('简历导入记录已移除，整理后的事实仍保留。');
  }

  function removeFacts() {
    if (!window.confirm('删除全部事实条目及由它们整理的自我介绍？项目和训练历史仍会保留。')) return;
    update((previous) => ({
      ...previous,
      profile: { ...previous.profile, facts: [] },
      intro: '',
      introConfirmed: false,
      introStale: false,
    }));
    notify('事实条目与关联自我介绍已清空。');
  }

  return (
    <div className="stack">
      <header className="page-heading">
        <div>
          <div className="eyebrow">YOUR STORY, YOUR WORDS</div>
          <h1 className="page-title">把你的经历，变成面试的底气</h1>
          <p className="page-description">从真实经历出发，为你的下一次英文面试建立专属档案。</p>
        </div>
        <span className="badge badge-teal">
          <ShieldCheck size={15} /> 事实由你确认
        </span>
      </header>

      {state.sample && (
        <div className="card">
          <div className="card-header">
            <div>
              <span className="badge badge-amber">当前为示例档案</span>
              <h3>准备好讲述你自己的故事了吗？</h3>
              <p className="muted small">
                先清空示例，再开始填写。示例人物和项目不会进入你的个人经历。
              </p>
            </div>
            <button className="btn btn-primary" onClick={createPlan}>
              清空示例，建立我的计划 <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}
      {error && (
        <div className="card" role="alert">
          <span className="badge badge-amber">
            <Info size={15} /> 需要处理
          </span>
          <p>{error}</p>
        </div>
      )}

      <div className="grid-two">
        <section className="card stack">
          <div className="card-header">
            <div>
              <div className="eyebrow">01 / ABOUT YOU</div>
              <h2>个人资料</h2>
            </div>
            <div className="icon-box icon-box-teal">
              <UserRound size={21} />
            </div>
          </div>
          <fieldset
            disabled={state.sample || busy}
            style={{ border: 0, margin: 0, padding: 0 }}
            className="stack"
          >
            <div className="form-grid">
              <div className="field">
                <label htmlFor="profile-name">你的称呼</label>
                <input
                  className="input"
                  id="profile-name"
                  value={profile.name}
                  maxLength={40}
                  placeholder="例如：Alex"
                  onChange={(event) => patchProfile('name', event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="profile-experience">工作年限</label>
                <input
                  className="input"
                  id="profile-experience"
                  value={profile.experience}
                  maxLength={30}
                  placeholder="例如：3 年 / 应届毕业生"
                  onChange={(event) => patchProfile('experience', event.target.value)}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="profile-title">当前职位 / 专业方向</label>
              <input
                className="input"
                id="profile-title"
                value={profile.title}
                maxLength={100}
                placeholder="例如：NLP 算法工程师"
                onChange={(event) => patchProfile('title', event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="profile-summary">
                用中文介绍一下你自己 <span className="muted small">可选</span>
              </label>
              <textarea
                className="textarea"
                id="profile-summary"
                rows={5}
                maxLength={2000}
                value={profile.summary}
                placeholder="你擅长的技术、做过的项目、毕业学校，以及希望面试官记住的事。暂时不用考虑英文怎么说。"
                onChange={(event) => patchProfile('summary', event.target.value)}
              />
              <span className="muted small">
                {profile.summary.length} / 2,000 · 只填写真实经历，暂不确定的内容可以留空。
              </span>
            </div>
          </fieldset>
          <div className="divider" />
          <div>
            <div className="eyebrow">02 / NEXT OPPORTUNITY</div>
            <h2>这次，为哪个机会做准备？</h2>
          </div>
          <fieldset
            disabled={state.sample || busy}
            style={{ border: 0, margin: 0, padding: 0 }}
            className="stack"
          >
            <div className="form-grid">
              <div className="field">
                <label htmlFor="plan-role">
                  目标岗位 <span aria-hidden="true">*</span>
                </label>
                <input
                  className="input"
                  id="plan-role"
                  required
                  value={plan.role}
                  maxLength={100}
                  placeholder="例如：NLP Engineer"
                  onChange={(event) => setPlan({ ...plan, role: event.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="plan-company">
                  目标公司 <span className="muted small">可选</span>
                </label>
                <input
                  className="input"
                  id="plan-company"
                  value={plan.company}
                  maxLength={100}
                  placeholder="还没确定也没关系"
                  onChange={(event) => setPlan({ ...plan, company: event.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="plan-track">主攻方向</label>
                <select
                  className="select"
                  id="plan-track"
                  value={plan.track}
                  onChange={(event) =>
                    setPlan({ ...plan, track: event.target.value as Plan['track'] })
                  }
                >
                  {tracks.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="plan-date">
                  预计面试日期 <span className="muted small">可选</span>
                </label>
                <input
                  className="input"
                  id="plan-date"
                  type="date"
                  value={plan.date}
                  onChange={(event) => setPlan({ ...plan, date: event.target.value })}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="plan-minutes">每天留一点时间给自己</label>
              <select
                className="select"
                id="plan-minutes"
                value={plan.minutes}
                onChange={(event) => setPlan({ ...plan, minutes: Number(event.target.value) })}
              >
                {[10, 15, 20, 30, 45, 60].map((minutes) => (
                  <option key={minutes} value={minutes}>
                    每天 {minutes} 分钟
                  </option>
                ))}
              </select>
              <span className="muted small">这是你的练习目标，可以随时调整。</span>
            </div>
            <div className="field">
              <label htmlFor="plan-jd">
                目标岗位描述（JD） <span className="muted small">可选</span>
              </label>
              <textarea
                className="textarea"
                id="plan-jd"
                rows={7}
                maxLength={12000}
                value={plan.jd || ''}
                onChange={(event) => setPlan({ ...plan, jd: event.target.value })}
                placeholder="粘贴职位介绍、工作职责、技术要求和任职资格。中英文都可以，之后更换目标岗位时也能更新。"
              />
              <span className="muted small">
                {(plan.jd || '').length.toLocaleString()} / 12,000 ·
                保存后与简历复用，无需在每次练习时重复填写。岗位要求不代表你已经具备对应经历。
              </span>
            </div>
          </fieldset>
        </section>

        <section className="card stack">
          <div className="card-header">
            <div>
              <div className="eyebrow">03 / YOUR RESUME</div>
              <h2>一份简历，贯穿整段练习</h2>
            </div>
            <div className="icon-box">
              <FileText size={21} />
            </div>
          </div>
          <p className="muted">
            导入中文或英文简历。我们会读取文字，并按段落列出候选事实，等你核对后再用于训练。
          </p>
          <div className="upload-zone" aria-busy={busy}>
            <Upload size={30} />
            <h3>
              {busy ? '正在读取简历…' : profile.resumeName ? '更新你的简历' : '从你已有的经历开始'}
            </h3>
            <p className="muted small">支持 PDF、DOCX、TXT · 最大 10 MB</p>
            <input
              hidden
              ref={fileRef}
              id="resume-file"
              type="file"
              accept=".pdf,.docx,.txt"
              onChange={(event) => void uploadFile(event.target.files?.[0])}
            />
            <button
              className="btn btn-secondary"
              disabled={state.sample || busy}
              onClick={() => fileRef.current?.click()}
            >
              {busy ? <LoaderCircle size={16} className="spin" /> : <Upload size={16} />}
              {busy ? '正在解析' : profile.resumeName ? '上传新版本' : '选择简历文件'}
            </button>
            <p className="muted small">扫描件可能无法读取，可改用下方文本导入。</p>
          </div>
          {profile.resumeName && (
            <div className="card">
              <div className="card-header">
                <div>
                  <span className="badge badge-teal">版本 {profile.resumeVersion}</span>
                  <p>
                    <FileText size={15} /> {profile.resumeName}
                  </p>
                  <span className="muted small">原文已提取 · 请核对下方事实</span>
                </div>
                <button
                  className="btn btn-ghost"
                  disabled={state.sample || busy}
                  title="移除导入记录，保留已整理事实"
                  onClick={removeSource}
                >
                  <Trash2 size={16} /> 移除文件记录
                </button>
              </div>
            </div>
          )}
          <div className="divider" />
          <div className="field">
            <label htmlFor="resume-paste">或者，直接粘贴经历要点</label>
            <textarea
              className="textarea"
              id="resume-paste"
              rows={6}
              maxLength={50000}
              disabled={state.sample || busy}
              value={pastedText}
              onChange={(event) => setPastedText(event.target.value)}
              placeholder={
                '例如：\n计算机专业毕业，3 年 NLP 工作经验。\n负责公司内部知识库检索模块。\n使用过 PyTorch、Elasticsearch 和向量检索。'
              }
            />
            <span className="muted small">
              按段落拆分，最多提取 40 条；长段落最多保留 800 字，请检查遗漏。
            </span>
          </div>
          <button
            className="btn btn-secondary"
            disabled={state.sample || busy || !pastedText.trim()}
            onClick={importPasted}
          >
            整理为待确认事实 <ArrowRight size={16} />
          </button>
          <div className="fact-row">
            <ShieldCheck size={18} />
            <p className="muted small">
              请先去除电话、住址等无关隐私。文件发送到当前应用服务解析，原文件不持久保存；提取原文与资料保存在此浏览器。
            </p>
          </div>
        </section>
      </div>

      <section className="card stack">
        <div className="card-header">
          <div>
            <div className="eyebrow">04 / FACT CHECK</div>
            <h2>你的经历，由你说了算</h2>
            <p className="muted small">
              这里是候选事实清单。核对内容并勾选确认；修改文字后，需要再次确认。
            </p>
          </div>
          <span className="badge badge-teal">
            <CheckCircle2 size={15} /> 已确认 {confirmed} / {profile.facts.length}
          </span>
        </div>
        {profile.facts.length ? (
          <div className="stack">
            {profile.facts.map((fact, index) => (
              <div className="fact-row" key={fact.id}>
                <input
                  id={`confirm-${fact.id}`}
                  type="checkbox"
                  disabled={state.sample || busy}
                  checked={fact.confirmed}
                  aria-label={`确认第 ${index + 1} 条事实`}
                  onChange={(event) =>
                    patchProfile(
                      'facts',
                      profile.facts.map((item) =>
                        item.id === fact.id ? { ...item, confirmed: event.target.checked } : item,
                      ),
                    )
                  }
                />
                <div className="field" style={{ flex: 1 }}>
                  <label htmlFor={`fact-${fact.id}`} className="small">
                    事实 {String(index + 1).padStart(2, '0')}{' '}
                    <span className="muted">· {fact.confirmed ? '已确认' : '待你确认'}</span>
                  </label>
                  <textarea
                    id={`fact-${fact.id}`}
                    className="textarea"
                    rows={2}
                    maxLength={800}
                    disabled={state.sample || busy}
                    value={fact.text}
                    onChange={(event) =>
                      patchProfile(
                        'facts',
                        profile.facts.map((item) =>
                          item.id === fact.id
                            ? { ...item, text: event.target.value, confirmed: false }
                            : item,
                        ),
                      )
                    }
                  />
                </div>
                <button
                  className="btn btn-ghost"
                  disabled={state.sample || busy}
                  aria-label={`删除第 ${index + 1} 条事实`}
                  onClick={() =>
                    patchProfile(
                      'facts',
                      profile.facts.filter((item) => item.id !== fact.id),
                    )
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <ShieldCheck size={30} />
            <h3>先记录真实，再练习表达</h3>
            <p>上传简历，或者手动添加你希望在面试中讲述的经历。</p>
          </div>
        )}
        <div className="card-header">
          <button
            className="btn btn-secondary"
            disabled={state.sample || busy || profile.facts.length >= 60}
            onClick={() =>
              patchProfile('facts', [
                ...profile.facts,
                { id: crypto.randomUUID(), text: '', confirmed: false },
              ])
            }
          >
            <Plus size={16} /> 添加一条事实
          </button>
          {!!profile.facts.length && (
            <button className="btn btn-ghost" disabled={state.sample || busy} onClick={removeFacts}>
              <Trash2 size={15} /> 删除全部事实与自我介绍
            </button>
          )}
        </div>
      </section>

      <div className="card card-header">
        <p className="muted small">
          {dirty
            ? '有尚未保存的修改，离开页面前请保存。'
            : pastedText.trim()
              ? '粘贴的内容尚未导入，离开页面前请先整理为事实。'
              : '资料保存在当前浏览器，可在设置中导出备份。'}
          {state.introStale && ' 简历、事实或目标岗位已更新，自我介绍需要重新确认。'}
        </p>
        <div className="card-header">
          <button className="btn btn-secondary" onClick={() => navigate('projects')}>
            整理项目经历 <ArrowRight size={16} />
          </button>
          <button
            className="btn btn-primary"
            disabled={state.sample || busy || !dirty}
            onClick={save}
          >
            <Check size={16} /> 保存资料与计划
          </button>
        </div>
      </div>
    </div>
  );
}
