import { useMemo, useState } from 'react';
import {
  ArrowRight,
  AudioLines,
  BookOpen,
  CalendarDays,
  Check,
  Clock3,
  Download,
  FileText,
  Filter,
  History,
  MessageCircle,
  Target,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import type { Attempt, PageProps } from '../types';
import { dateLabel, downloadFile, getStats, latestAttempts } from '../lib/store';
import { Empty, Modal } from './UI';
const modeName = { read: '逐句跟读', keywords: '关键词复述', independent: '无稿回答' };
export default function Reports({ state, update, startPractice, notify }: PageProps) {
  const [filter, setFilter] = useState('all'),
    [selected, setSelected] = useState<Attempt | null>(null);
  const stats = getStats(state);
  const due = latestAttempts(state).filter((a) => new Date(a.reviewDue).getTime() <= Date.now());
  const attempts = useMemo(
    () =>
      state.attempts.filter(
        (a) =>
          filter === 'all' ||
          (filter === 'independent' && a.mode === 'independent' && !a.assisted) ||
          (filter === 'feedback' && !!a.feedback),
      ),
    [state.attempts, filter],
  );
  function exportReport() {
    const lines = [
      '# Interview Pal 练习记录',
      `导出时间：${new Date().toLocaleString('zh-CN')}`,
      ...attempts.flatMap((a) => [
        `\n## ${a.title}`,
        `时间：${new Date(a.date).toLocaleString('zh-CN')} · ${modeName[a.mode]} · ${a.assisted ? '使用辅助' : '无辅助'}`,
        `\n问题：${a.question || a.title}`,
        `\n回答：\n${a.answer}`,
        a.feedback
          ? `\n反馈：${a.feedback.summary}\n\n${a.feedback.improvements.map((i) => `- ${i.title}：${i.detail}`).join('\n')}`
          : '\n自主练习 · 未进行AI内容评估',
      ]),
    ];
    downloadFile('interview-pal-practice.md', lines.join('\n'), 'text/markdown;charset=utf-8');
    notify('练习记录已导出。');
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">PROGRESS YOU CAN HEAR</div>
          <h1 className="page-title">把每次开口，变成下一步。</h1>
          <p className="page-description">回看真实回答，找出最值得改进的一个地方。</p>
        </div>
        <button
          className="btn btn-secondary"
          disabled={!state.attempts.length}
          onClick={exportReport}
        >
          <Download size={16} />
          导出练习记录
        </button>
      </div>
      <div className="stat-grid report-stats">
        {[
          { label: '已保存回答', value: stats.attempts, unit: '次', icon: AudioLines },
          { label: '累计练习', value: stats.minutes, unit: '分钟', icon: Clock3 },
          { label: '独立回答候选', value: stats.independent, unit: '项', icon: TrendingUp },
          { label: '完成模拟轮次', value: state.sessions.length, unit: '轮', icon: MessageCircle },
        ].map((s) => (
          <div className="stat-card" key={s.label}>
            <div className="row-between">
              <span>{s.label}</span>
              <s.icon size={18} className="text-teal" />
            </div>
            <div className="stat-number">
              {s.value}
              <small>{s.unit}</small>
            </div>
          </div>
        ))}
      </div>
      <section className="review-banner">
        <div className="icon-box icon-box-teal">
          <CalendarDays size={25} />
        </div>
        <div>
          <span className="eyebrow">SPACED PRACTICE</span>
          <h2>
            {due.length ? `${due.length} 个问题，值得再说一次。` : '练完之后，给记忆一点时间。'}
          </h2>
          <p>
            {due.length
              ? '这次先不看稿，用自己的话重新组织。'
              : '保存回答后，次日会提醒你回来复练。每题按最近一次练习安排。'}
          </p>
        </div>
        {due.length > 0 && (
          <button
            className="btn btn-primary"
            onClick={() => startPractice(due[0].questionId, 'independent')}
          >
            开始复习
            <ArrowRight size={16} />
          </button>
        )}
      </section>
      <section className="card history-card">
        <div className="card-header">
          <div>
            <h2>我的练习记录</h2>
            <p>你的进步，藏在一次次具体的回答里。</p>
          </div>
          <select
            className="select"
            aria-label="筛选练习记录"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">全部记录</option>
            <option value="independent">独立 · 无辅助</option>
            <option value="feedback">有 AI 内容反馈</option>
          </select>
        </div>
        {attempts.length ? (
          <div className="history-list">
            {attempts.map((a) => (
              <button className="history-row" key={a.id} onClick={() => setSelected(a)}>
                <span className={'history-icon ' + (a.feedback ? 'has-feedback' : '')}>
                  <FileText size={19} />
                </span>
                <span className="history-copy">
                  <strong>{a.title}</strong>
                  <span>
                    {dateLabel(a.date)} · {modeName[a.mode]}
                    {a.assisted ? ' · 使用辅助' : ''}
                  </span>
                </span>
                <span className={'badge ' + (a.feedback ? 'badge-teal' : '')}>
                  {a.feedback ? '已获得内容反馈' : '自主练习'}
                </span>
                <ArrowRight size={16} />
              </button>
            ))}
          </div>
        ) : (
          <Empty
            title={state.attempts.length ? '这个筛选下还没有记录' : '第一次开口，就是进步的起点'}
            description="保存你的回答后，在这里查看反馈、安排复习，并听见自己的成长。"
            action="从自我介绍开始"
            onAction={() => startPractice('intro', 'read')}
          />
        )}
      </section>
      <p className="footnote">
        <Target size={14} />
        独立回答候选表示：曾有无辅助回答获得较好的内容反馈，仍需要新问题与延迟复测验证。它不是发音分数或面试通过率。
      </p>
      {selected && (
        <Modal title={selected.title} wide onClose={() => setSelected(null)}>
          <div className="attempt-meta">
            <span className="badge">{modeName[selected.mode]}</span>
            <span className="badge">{selected.assisted ? '使用过辅助' : '未使用辅助'}</span>
            <span className="small muted">{new Date(selected.date).toLocaleString('zh-CN')}</span>
          </div>
          {selected.question && (
            <div className="report-question">
              <span className="eyebrow">THE QUESTION</span>
              <p>{selected.question}</p>
            </div>
          )}
          <div className="report-answer">
            <span className="eyebrow">YOUR ANSWER</span>
            <p className="english preserve-lines">{selected.answer}</p>
          </div>
          {selected.feedback ? (
            <div className="report-feedback">
              <h3>这次的内容反馈</h3>
              <p>{selected.feedback.summary}</p>
              <h4>值得保留</h4>
              <ul>
                {selected.feedback.strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
              <h4>下次改进</h4>
              {selected.feedback.improvements.map((s, i) => (
                <div className="improvement" key={i}>
                  <strong>{s.title}</strong>
                  {s.quote && <blockquote>{s.quote}</blockquote>}
                  <p>{s.detail}</p>
                </div>
              ))}
              <details>
                <summary>查看参考表达</summary>
                <p className="english preserve-lines">{selected.feedback.referenceAnswer}</p>
              </details>
              <p className="small muted">模型：{selected.feedback.model} · 仅评估内容与结构</p>
            </div>
          ) : (
            <p className="inline-info">这是一次自主练习，没有 AI 内容评估。</p>
          )}
          <div className="modal-actions">
            <button
              className="btn btn-ghost danger"
              onClick={() => {
                if (!window.confirm('删除这条练习记录？此操作无法撤销。')) return;
                update((s) => ({
                  ...s,
                  attempts: s.attempts.filter((a) => a.id !== selected.id),
                  sessions: s.sessions.map((session) => ({
                    ...session,
                    attemptIds: session.attemptIds.filter((id) => id !== selected.id),
                  })),
                }));
                setSelected(null);
                notify('练习记录已删除。');
              }}
            >
              <Trash2 size={15} />
              删除记录
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                const id = selected.questionId;
                setSelected(null);
                startPractice(id, 'independent');
              }}
            >
              重练这个主题
              <ArrowRight size={16} />
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
