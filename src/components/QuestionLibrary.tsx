import { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Bookmark,
  Check,
  ChevronRight,
  Clock3,
  Search,
  SlidersHorizontal,
  BookOpen,
} from 'lucide-react';
import { questions } from '../data/questions';
import { labels } from '../lib/store';
import type { Category, PageProps } from '../types';
import { Empty } from './UI';
export default function QuestionLibrary({ state, update, startPractice, notify }: PageProps) {
  const [category, setCategory] = useState<Category | 'all'>('all'),
    [difficulty, setDifficulty] = useState('all'),
    [query, setQuery] = useState(''),
    [saved, setSaved] = useState(false);
  const results = useMemo(
    () =>
      questions.filter(
        (q) =>
          (category === 'all' || q.category === category) &&
          (difficulty === 'all' || q.difficulty === difficulty) &&
          (!saved || state.bookmarks.includes(q.id)) &&
          [q.title, q.question, ...q.tags].join(' ').toLowerCase().includes(query.toLowerCase()),
      ),
    [category, difficulty, query, saved, state.bookmarks],
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">KNOW IT. SAY IT.</div>
          <h1 className="page-title">技术底气，也要表达清楚。</h1>
          <p className="page-description">从原理到取舍，练习用英语解释你真正理解的技术。</p>
        </div>
        <span className="count-label">
          <BookOpen size={18} />
          {questions.length} 个题簇
        </span>
      </div>
      <div className="topic-tabs">
        <button
          className={category === 'all' ? 'topic-tab active' : 'topic-tab'}
          onClick={() => setCategory('all')}
        >
          全部方向
        </button>
        {Object.entries(labels).map(([k, v]) => (
          <button
            key={k}
            className={category === k ? 'topic-tab active' : 'topic-tab'}
            onClick={() => setCategory(k as Category)}
          >
            {v}
            {['cv', 'speech', 'video'].includes(k) && <small>扩展</small>}
          </button>
        ))}
      </div>
      <div className="library-toolbar">
        <label className="search-field">
          <Search size={17} />
          <input
            placeholder="搜索主题、技术或关键词…"
            aria-label="搜索题库"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd>/</kbd>
        </label>
        <select
          className="select"
          aria-label="难度"
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value)}
        >
          <option value="all">所有难度</option>
          {['基础', '进阶', '挑战'].map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
        <button
          className={'btn ' + (saved ? 'btn-active' : 'btn-secondary')}
          onClick={() => setSaved((s) => !s)}
        >
          <Bookmark size={16} />
          我的收藏{state.bookmarks.length > 0 && <span>{state.bookmarks.length}</span>}
        </button>
      </div>
      <div className="result-heading">
        <span>{results.length} 个相关题簇</span>
        <span>按主题练习 · 不必一口气做完</span>
      </div>
      {!results.length ? (
        <Empty
          title="换个关键词试试"
          description="尝试搜索 RAG、评估或检索，也可以清除筛选查看全部题目。"
          action="清除筛选"
          onAction={() => {
            setQuery('');
            setCategory('all');
            setDifficulty('all');
            setSaved(false);
          }}
        />
      ) : (
        <div className="question-grid">
          {results.map((q, i) => (
            <article className="question-card" key={q.id}>
              <div className="row-between">
                <span
                  className={
                    'badge ' +
                    (q.difficulty === '基础'
                      ? 'badge-teal'
                      : q.difficulty === '挑战'
                        ? 'badge-purple'
                        : 'badge-blue')
                  }
                >
                  {q.difficulty}
                </span>
                <button
                  aria-label={state.bookmarks.includes(q.id) ? '取消收藏' : '收藏题目'}
                  className={'icon-button ' + (state.bookmarks.includes(q.id) ? 'is-saved' : '')}
                  onClick={() => {
                    const exists = state.bookmarks.includes(q.id);
                    update((s) => ({
                      ...s,
                      bookmarks: exists
                        ? s.bookmarks.filter((id) => id !== q.id)
                        : [...s.bookmarks, q.id],
                    }));
                    notify(exists ? '已取消收藏' : '已加入收藏');
                  }}
                >
                  <Bookmark
                    size={17}
                    fill={state.bookmarks.includes(q.id) ? 'currentColor' : 'none'}
                  />
                </button>
              </div>
              <h3>{q.title}</h3>
              <p className="question-en">{q.question}</p>
              <div className="tag-list">
                {q.tags.slice(0, 3).map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </div>
              <div className="question-footer">
                <span>
                  <Clock3 size={14} />
                  {q.minutes} 分钟
                  {state.attempts.some((a) => a.questionId === q.id) && (
                    <Check size={14} className="text-teal" />
                  )}
                </span>
                <button onClick={() => startPractice(q.id, 'independent')}>
                  开始练习
                  <ArrowUpRight size={16} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      <p className="footnote">
        题目附原始论文或官方文档来源。当前为待专家复审的内容种子；参考答案供学习使用，支持不同合理解法。
      </p>
    </>
  );
}
