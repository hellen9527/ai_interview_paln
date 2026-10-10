import {
  ArrowRight,
  Check,
  Mic,
  BookOpen,
  BriefcaseBusiness,
  MessagesSquare,
  Headphones,
  Clock3,
  ArrowUpRight,
} from 'lucide-react';
import type { PageProps } from '../types';
import { Progress } from './UI';
export default function Roadmap({ state, startPractice, navigate }: PageProps) {
  const steps = [
    {
      id: 'intro',
      title: '介绍你自己',
      en: 'A confident introduction',
      description: '整理你的经历，练出30秒、60秒和90秒的自我介绍。',
      icon: Mic,
      tasks: ['确认个人事实', '逐句熟悉表达', '用关键词复述', '无稿回答与追问'],
      color: 'teal',
    },
    {
      id: 'recommended',
      title: '讲清技术原理',
      en: 'Explain what you know',
      description: '围绕岗位和简历，解释原理、取舍、限制与应用。',
      icon: BookOpen,
      tasks: ['理解问题意图', '回答关键要点', '补齐知识或表达', '挑战不同问法'],
      color: 'blue',
    },
    {
      id: state.profile.projects[0] ? 'project:' + state.profile.projects[0].id : 'projects',
      title: '讲透代表项目',
      en: 'Make your experience count',
      description: '让面试官听懂你的判断、个人贡献和验证过程。',
      icon: BriefcaseBusiness,
      tasks: ['补齐项目事实', '组织两分钟总述', '解释一个技术选择', '应对连续追问'],
      color: 'orange',
    },
    {
      id: 'reverse',
      title: '把对话接下去',
      en: 'Keep the conversation going',
      description: '练习澄清、行为故事和有价值的反问。',
      icon: MessagesSquare,
      tasks: ['请求重复与澄清', '分享合作或失败经历', '选择合适的反问', '听懂回答并跟进'],
      color: 'purple',
    },
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR PERSONAL LEARNING PATH</div>
          <h1 className="page-title">每一步，都离从容更近。</h1>
          <p className="page-description">按推荐顺序前进，也可以从你最想突破的地方开始。</p>
        </div>
        <button className="btn btn-secondary" onClick={() => navigate('profile')}>
          调整计划
          <ArrowUpRight size={16} />
        </button>
      </div>
      <div className="path-banner">
        <Headphones size={26} />
        <div>
          <h3>从看稿，到独立表达</h3>
          <p>跟读 → 关键词复述 → 无稿回答 → 新追问 → 延迟复习</p>
        </div>
        <span className="badge badge-teal">每天 {state.plan.minutes} 分钟</span>
      </div>
      <div className="roadmap-list">
        {steps.map((step, i) => {
          const records = state.attempts.filter((a) =>
            step.id === 'recommended'
              ? !['intro', 'reverse', 'clarify'].includes(a.questionId) &&
                !a.questionId.startsWith('project:')
              : a.questionId === step.id,
          );
          const hasRead = records.some((a) => a.mode === 'read'),
            hasKeywords = records.some((a) => a.mode === 'keywords'),
            hasFree = records.some((a) => a.mode === 'independent');
          const n = [hasRead, hasKeywords, hasFree].filter(Boolean).length;
          return (
            <article className="roadmap-card" key={step.id}>
              <div className="roadmap-number">0{i + 1}</div>
              <div className={`icon-box icon-box-${step.color}`}>
                <step.icon size={23} />
              </div>
              <div className="roadmap-main">
                <span className="eyebrow">{step.en}</span>
                <h2>{step.title}</h2>
                <p>{step.description}</p>
                <div className="roadmap-chips">
                  {['逐句跟读', '关键词复述', '无稿回答'].map((t, j) => (
                    <span key={t}>
                      {[hasRead, hasKeywords, hasFree][j] ? (
                        <Check size={13} />
                      ) : (
                        <span className="tiny-circle" />
                      )}
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <div className="roadmap-action">
                <span className="badge">{records.length ? '已经开始' : '准备开始'}</span>
                <button
                  className="btn btn-primary"
                  onClick={() =>
                    step.id === 'projects'
                      ? navigate('projects')
                      : startPractice(step.id, 'keywords')
                  }
                >
                  进入练习
                  <ArrowRight size={15} />
                </button>
                <small>{records.length} 次已保存回答</small>
              </div>
            </article>
          );
        })}
      </div>
      <div className="card review-schedule">
        <div>
          <h2>让练过的内容，真正留下来。</h2>
          <p>每次保存回答，系统会安排次日复练。掌握状态仍需要新问题和真人校准来验证。</p>
        </div>
        <button className="btn btn-secondary" onClick={() => navigate('reports')}>
          查看待复习内容
          <ArrowRight size={16} />
        </button>
      </div>
    </>
  );
}
