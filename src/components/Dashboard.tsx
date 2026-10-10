import {
  ArrowUpRight,
  ArrowRight,
  AudioLines,
  BookOpen,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  Clock3,
  Flame,
  Headphones,
  Mic,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react';
import type { PageProps } from '../types';
import { getStats, labels, dateLabel } from '../lib/store';
import { Progress } from './UI';
export default function Dashboard({ state, navigate, startPractice, ...props }: PageProps) {
  const stats = getStats(state);
  const done = (id: string) =>
    state.attempts.some(
      (a) =>
        new Date(a.date).toDateString() === new Date().toDateString() &&
        (id === 'recommended' ? a.category === state.plan.track : a.questionId === id),
    );
  const days = state.plan.date
    ? Math.max(
        0,
        Math.ceil((new Date(state.plan.date + 'T23:59:59').getTime() - Date.now()) / 86400000),
      )
    : null;
  const tasks = [
    {
      id: 'intro',
      icon: Mic,
      title: '用 60 秒，介绍你的专业价值',
      text: '自我介绍 · 从关键词到自然表达',
      minutes: 8,
      color: 'teal',
    },
    {
      id: 'recommended',
      icon: BookOpen,
      title: '讲清一个技术选择',
      text: `专业知识 · ${labels[state.plan.track]}`,
      minutes: 7,
      color: 'blue',
    },
    {
      id: state.profile.projects[0] ? 'project:' + state.profile.projects[0].id : 'project-new',
      icon: BriefcaseBusiness,
      title: '让你的项目经得起追问',
      text: '项目经历 · 背景、选择与个人贡献',
      minutes: 10,
      color: 'orange',
    },
  ];
  const completed = tasks.filter((t) => done(t.id)).length;
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="live-dot" /> YOUR NEXT CHAPTER
          </div>
          <h1 className="page-title">
            让好技术，也能被听见<span className="title-dot">。</span>
          </h1>
          <p className="page-description">每天向前一点，把你会的，变成你说得清的。</p>
        </div>
        <button className="btn btn-secondary" onClick={() => navigate('profile')}>
          <Target size={16} />
          调整面试目标
        </button>
      </div>
      {state.sample && (
        <div className="sample-banner">
          <Sparkles size={15} />
          <span>你正在浏览示例计划。建立自己的资料后，开始专属训练。</span>
          <button onClick={() => navigate('profile')}>
            创建我的计划 <ArrowRight size={14} />
          </button>
        </div>
      )}
      <div className="dashboard-top">
        <section className="hero-card">
          <div className="hero-content">
            <span className="hero-label">
              <span />
              今日推荐 · 自我介绍
            </span>
            <h2>
              好的面试，
              <br />
              从自信开口开始。
            </h2>
            <p>
              把你的经历整理成一段清晰的介绍，
              <br />
              再一步步练到不需要看稿。
            </p>
            <button className="btn btn-dark" onClick={() => startPractice('intro', 'read')}>
              开始今天的练习
              <ArrowRight size={17} />
            </button>
            <div className="hero-foot">
              <Clock3 size={14} />约 8 分钟<span>·</span>
              <Headphones size={14} />
              建议佩戴耳机
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="float-pill pill-one">
              <span className="mini-check">
                <Check size={12} />
              </span>{' '}
              Think clearly.
            </div>
            <div className="voice-orb">
              <div className="voice-core">
                <AudioLines size={62} strokeWidth={1.25} />
              </div>
            </div>
            <div className="float-pill pill-two">
              Speak with confidence. <span>↗</span>
            </div>
            <div className="art-caption">YOUR VOICE. YOUR OPPORTUNITY.</div>
          </div>
        </section>
        <aside className="goal-card">
          <div className="row-between">
            <span className="eyebrow">MY INTERVIEW PLAN</span>
            <span className="icon-box icon-box-teal">
              <Target size={20} />
            </span>
          </div>
          <h3>{state.plan.role || '开启你的面试计划'}</h3>
          <p className="muted">{state.plan.company || '设置目标岗位，获得更相关的练习'}</p>
          <div className="goal-date">
            <strong>{days === null ? '—' : days}</strong>
            <span>{days === null ? '设置你的面试日期' : '天后 · 目标面试日期'}</span>
          </div>
          <div className="divider" />
          <div className="row-between small">
            <span>每日目标</span>
            <strong>{state.plan.minutes} 分钟</strong>
          </div>
          <div className="row-between small">
            <span>重点方向</span>
            <span className="badge badge-teal">{labels[state.plan.track]}</span>
          </div>
          <button className="text-button" onClick={() => navigate('roadmap')}>
            查看我的学习路线
            <ArrowUpRight size={15} />
          </button>
        </aside>
      </div>
      <div className="stat-grid">
        {[
          {
            icon: Flame,
            label: '已练习天数',
            value: stats.days,
            unit: '天',
            sub: '每次开口，都算进步',
            color: 'orange',
          },
          {
            icon: Clock3,
            label: '累计练习时间',
            value: stats.minutes,
            unit: '分钟',
            sub: '来自你保存的练习记录',
            color: 'blue',
          },
          {
            icon: AudioLines,
            label: '已保存回答',
            value: stats.attempts,
            unit: '次',
            sub: '可随时回来继续打磨',
            color: 'teal',
          },
          {
            icon: TrendingUp,
            label: '独立回答候选',
            value: stats.independent,
            unit: '项',
            sub: '还需通过变式与延迟复测',
            color: 'purple',
          },
        ].map((s) => (
          <div className="stat-card" key={s.label}>
            <div className="row-between">
              <span>{s.label}</span>
              <s.icon size={17} className={'text-' + s.color} />
            </div>
            <div className="stat-number">
              {s.value}
              <small>{s.unit}</small>
            </div>
            <p>{s.sub}</p>
          </div>
        ))}
      </div>
      <div className="dashboard-bottom">
        <section className="card daily-card">
          <div className="card-header">
            <div>
              <h2>今天，完成这三件事</h2>
              <p>循序渐进，让每次练习都有方向。</p>
            </div>
            <span className="badge">{completed} / 3 已练习</span>
          </div>
          <div className="task-list">
            {tasks.map((t, i) => (
              <button
                key={t.id}
                className="task-row"
                onClick={() =>
                  t.id === 'project-new' ? navigate('projects') : startPractice(t.id, 'keywords')
                }
              >
                <span className={`icon-box icon-box-${t.color}`}>
                  <t.icon size={21} />
                </span>
                <span className="task-copy">
                  <span className="task-title">{t.title}</span>
                  <span>{t.text}</span>
                </span>
                <span className="task-time">{t.minutes} 分钟</span>
                {done(t.id) ? (
                  <span className="task-check">
                    <Check size={16} />
                  </span>
                ) : (
                  <span className="task-order">0{i + 1}</span>
                )}
                <ChevronRight size={17} />
              </button>
            ))}
          </div>
          <div className="daily-footer">
            <Sparkles size={15} />
            <span>先把一件事说清楚，再多说一点。</span>
          </div>
        </section>
        <section className="card weekly-card">
          <div className="card-header">
            <div>
              <h2>你的练习节奏</h2>
              <p>用持续的练习，积累从容。</p>
            </div>
            <button
              className="icon-button"
              aria-label="查看复盘"
              onClick={() => navigate('reports')}
            >
              <ArrowUpRight size={18} />
            </button>
          </div>
          <div className="week-bars">
            {Array.from({ length: 7 }, (_, i) => {
              const d = new Date();
              d.setDate(d.getDate() - 6 + i);
              const n = state.attempts.filter(
                (a) => new Date(a.date).toDateString() === d.toDateString(),
              ).length;
              return (
                <div className={'week-day ' + (i === 6 ? 'is-today' : '')} key={i}>
                  <div className="bar-slot">
                    <div
                      className="week-bar"
                      style={{ height: n ? `${Math.min(90, 18 + n * 14)}px` : '5px' }}
                    />
                    <span>{n || ''}</span>
                  </div>
                  <small>{['日', '一', '二', '三', '四', '五', '六'][d.getDay()]}</small>
                </div>
              );
            })}
          </div>
          <div className="divider" />
          <p className="small muted">
            {state.attempts.length
              ? '下一次进步，从复习最近一次回答开始。'
              : '这里会记录你的真实练习。今天就是第一天。'}
          </p>
          <button className="text-button" onClick={() => navigate('reports')}>
            查看练习记录
            <ArrowRight size={14} />
          </button>
        </section>
      </div>
      <section className="bottom-note">
        <span className="note-icon">
          <Headphones size={19} />
        </span>
        <p>
          <strong>说得清楚，比说得复杂更重要。</strong>
          <span>不用追求完美口音，先让面试官听懂你的判断与贡献。</span>
        </p>
        <button onClick={() => startPractice('clarify', 'independent')}>
          练一句澄清表达
          <ArrowRight size={16} />
        </button>
      </section>
    </>
  );
}
