import { useCallback, useEffect, useRef, useState, Component, type ReactNode } from 'react';
import {
  ArrowRight,
  AudioLines,
  Bell,
  BookOpen,
  Check,
  ChevronDown,
  Command,
  Download,
  GraduationCap,
  HelpCircle,
  LayoutDashboard,
  Map,
  Menu,
  MessageSquare,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  UserRound,
  X,
} from 'lucide-react';
import type { AppState, Health, Mode, Page, PageProps } from './types';
import {
  emptyState,
  getStats,
  initialState,
  parseState,
  STORAGE_KEY,
  uid,
  downloadFile,
} from './lib/store';
import { request } from './lib/api';
import { questions } from './data/questions';
import Dashboard from './components/Dashboard';
import Roadmap from './components/Roadmap';
import QuestionLibrary from './components/QuestionLibrary';
import ProjectsPage from './components/ProjectsPage';
import ProfilePage from './components/ProfilePage';
import Practice from './components/Practice';
import Reports from './components/Reports';
import SettingsPage from './components/SettingsPage';
import { Modal } from './components/UI';
const navigation = [
  { id: 'dashboard', label: '训练总览', icon: LayoutDashboard },
  { id: 'roadmap', label: '我的学习路线', icon: Map },
  { id: 'questions', label: '算法题库', icon: BookOpen },
  { id: 'projects', label: '项目故事', icon: MessageSquare },
  { id: 'reports', label: '练习与复盘', icon: TrendingUp },
] as const;
function initial() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return { state: raw ? parseState(raw) : initialState(), blocked: false };
  } catch {
    return { state: initialState(), blocked: true };
  }
}
function Workspace() {
  const [loaded] = useState(initial),
    [state, update] = useState<AppState>(loaded.state),
    [page, setPage] = useState<Page>('dashboard'),
    [health, setHealth] = useState<Health | null>(null),
    [storageBlocked, setStorageBlocked] = useState(loaded.blocked),
    [toast, setToast] = useState(''),
    [drawer, setDrawer] = useState(false),
    [modal, setModal] = useState<'search' | 'help' | 'simulation' | null>(null),
    [search, setSearch] = useState(''),
    [rounds, setRounds] = useState(5),
    [practice, setPractice] = useState({ target: 'intro', mode: 'read' as Mode, key: 0 }),
    [simulation, setSimulation] = useState<{
      queue: string[];
      index: number;
      before: string[];
    } | null>(null);
  const dirty = useRef(false),
    toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    main = useRef<HTMLDivElement>(null);
  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 4500);
  }, []);
  const checkHealth = useCallback(async () => {
    try {
      setHealth(await request<Health>('health'));
    } catch {
      setHealth(null);
    }
  }, []);
  useEffect(() => {
    void checkHealth();
    const unsaved = (event: Event) => {
      dirty.current = !!(event as CustomEvent<{ dirty: boolean }>).detail?.dirty;
    };
    window.addEventListener('interview-pal:unsaved', unsaved);
    return () => {
      window.removeEventListener('interview-pal:unsaved', unsaved);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [checkHealth]);
  useEffect(() => {
    if (storageBlocked) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      setStorageBlocked(true);
      notify('浏览器未能保存数据，请先到设置导出备份。');
    }
  }, [state, storageBlocked, notify]);
  useEffect(() => {
    function shortcuts(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setModal((m) => (m === 'search' ? null : 'search'));
      }
      if (e.key === 'Escape') setDrawer(false);
    }
    window.addEventListener('keydown', shortcuts);
    return () => window.removeEventListener('keydown', shortcuts);
  }, []);
  function canLeave() {
    if (dirty.current && !window.confirm('当前页面有未保存的修改，确定离开吗？')) return false;
    if (
      page === 'practice' &&
      !window.confirm('离开练习页？未保存的录音将清除，请先下载。文字草稿仍保留在本次浏览器会话。')
    )
      return false;
    dirty.current = false;
    return true;
  }
  function navigate(next: Page) {
    if (next === page) return;
    if (!canLeave()) return;
    if (simulation && next !== 'practice') setSimulation(null);
    setPage(next);
    setDrawer(false);
    window.scrollTo({ top: 0, behavior: 'instant' });
    setTimeout(() => main.current?.focus(), 0);
  }
  function startPractice(id: string, mode: Mode = 'independent', isSimulation = false) {
    if (isSimulation) {
      setModal('simulation');
      return;
    }
    if (!canLeave()) return;
    if (
      id === 'project-new' ||
      id === 'projects' ||
      (id.startsWith('project:') && !state.profile.projects.some((p) => 'project:' + p.id === id))
    ) {
      setPage('projects');
      setDrawer(false);
      return;
    }
    if (id === 'recommended')
      id = (
        questions.find(
          (q) =>
            q.category === state.plan.track && !state.attempts.some((a) => a.questionId === q.id),
        ) ??
        questions.find((q) => q.category === state.plan.track) ??
        questions[0]
      ).id;
    setSimulation(null);
    setPractice((p) => ({ target: id, mode, key: p.key + 1 }));
    setPage('practice');
    setDrawer(false);
    setModal(null);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function beginSimulation() {
    if (!canLeave()) return;
    const relevant = [
      ...questions.filter((q) => q.category === state.plan.track),
      ...questions.filter((q) => q.category !== state.plan.track),
    ];
    const queue = [
      'intro',
      ...relevant.slice(0, 2).map((q) => q.id),
      state.profile.projects[0] ? 'project:' + state.profile.projects[0].id : 'clarify',
      'reverse',
    ].slice(0, rounds);
    setSimulation({ queue, index: 0, before: state.attempts.map((a) => a.id) });
    setPractice((p) => ({ target: queue[0], mode: 'independent', key: p.key + 1 }));
    setPage('practice');
    setModal(null);
    setDrawer(false);
  }
  function nextQuestion() {
    if (!simulation) return;
    if (simulation.index === simulation.queue.length - 1) {
      const attemptIds = state.attempts
        .filter((a) => !simulation.before.includes(a.id))
        .map((a) => a.id);
      update((s) => ({
        ...s,
        sessions: [
          { id: uid(), date: new Date().toISOString(), attemptIds, completed: true },
          ...s.sessions,
        ],
      }));
      setSimulation(null);
      setPage('reports');
      notify('这一轮完成了。回看回答，选一个最值得改进的地方。');
    } else {
      const index = simulation.index + 1;
      setSimulation({ ...simulation, index });
      setPractice((p) => ({
        target: simulation.queue[index],
        mode: 'independent',
        key: p.key + 1,
      }));
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  const searchResults = questions
    .filter((q) =>
      [q.title, q.question, ...q.tags].join(' ').toLowerCase().includes(search.toLowerCase()),
    )
    .slice(0, 7);
  const props: PageProps = { state, update, navigate, notify, startPractice, health },
    stats = getStats(state),
    title =
      page === 'profile'
        ? '我的面试档案'
        : page === 'settings'
          ? '设置与数据'
          : page === 'practice'
            ? '练习工作台'
            : navigation.find((n) => n.id === page)?.label;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>
      {drawer && (
        <button className="drawer-scrim" aria-label="关闭导航" onClick={() => setDrawer(false)} />
      )}
      <aside className={'sidebar ' + (drawer ? 'is-open' : '')}>
        <button
          className="brand"
          onClick={() => navigate('dashboard')}
          aria-label="Interview Pal 训练总览"
        >
          <span className="brand-symbol">
            <AudioLines size={25} />
          </span>
          <span>
            Interview<span className="brand-light">Pal</span>
            <small>让你的能力，被世界听见</small>
          </span>
        </button>
        <div className="sidebar-caption">我的训练空间</div>
        <nav aria-label="主要导航">
          {navigation.map((n) => (
            <button
              key={n.id}
              className={'nav-item ' + (page === n.id ? 'active' : '')}
              aria-current={page === n.id ? 'page' : undefined}
              onClick={() => navigate(n.id)}
            >
              <n.icon size={19} />
              <span>{n.label}</span>
              {n.id === 'reports' && stats.due > 0 && (
                <span className="nav-count">{stats.due}</span>
              )}
              {page === n.id && <span className="nav-active-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-caption second-caption">实战准备</div>
        <button
          className={'nav-item ' + (simulation ? 'active' : '')}
          onClick={() => setModal('simulation')}
        >
          <AudioLines size={19} />
          <span>模拟面试</span>
          <span className="badge badge-teal small-badge">练习</span>
        </button>
        <button
          className={'nav-item ' + (page === 'profile' ? 'active' : '')}
          onClick={() => navigate('profile')}
        >
          <UserRound size={19} />
          <span>我的面试档案</span>
        </button>
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <span className="tip-star">
              <Sparkles size={19} />
            </span>
            <h3>不必完美，先开口。</h3>
            <p>每一次练习，都在为下一次面试积累底气。</p>
            <button onClick={() => navigate('roadmap')}>
              继续我的旅程
              <ArrowRight size={14} />
            </button>
          </div>
          <button className="nav-item settings-nav" onClick={() => navigate('settings')}>
            <Settings size={18} />
            <span>设置与数据</span>
          </button>
          <button className="user-card" onClick={() => navigate('profile')}>
            <span className="avatar">{(state.profile.name || 'P').slice(0, 1).toUpperCase()}</span>
            <span>
              <strong>{state.sample ? '体验者' : state.profile.name || '我的档案'}</strong>
              <small>{state.sample ? '示例计划 · 待个性化' : '个人训练空间'}</small>
            </span>
            <ChevronDown size={14} />
          </button>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              aria-label="打开导航"
              aria-expanded={drawer}
              onClick={() => setDrawer((s) => !s)}
            >
              <Menu size={21} />
            </button>
            <span className="breadcrumb-home">我的工作台</span>
            <span className="breadcrumb-slash">/</span>
            <strong>{title}</strong>
          </div>
          <div className="topbar-actions">
            <button className="global-search" onClick={() => setModal('search')}>
              <Search size={16} />
              <span>寻找下一次突破</span>
              <kbd>⌘ K</kbd>
            </button>
            <span className="topbar-divider" />
            <button
              className="icon-button notification-button"
              aria-label={`待复习 ${stats.due} 项`}
              onClick={() => navigate('reports')}
            >
              <Bell size={18} />
              {stats.due > 0 && <i />}
            </button>
            <button className="icon-button" aria-label="使用帮助" onClick={() => setModal('help')}>
              <HelpCircle size={18} />
            </button>
            <button
              className="avatar avatar-small"
              aria-label="打开我的档案"
              onClick={() => navigate('profile')}
            >
              {(state.profile.name || 'P').slice(0, 1).toUpperCase()}
            </button>
          </div>
        </header>
        <div
          ref={main}
          id="main-content"
          className={'content ' + (page === 'practice' ? 'content-practice' : '')}
          tabIndex={-1}
        >
          {storageBlocked && (
            <div className="storage-alert" role="alert">
              <ShieldCheck size={20} />
              <div>
                <strong>本地保存暂时不可用</strong>
                <p>原有数据没有被覆盖。请导出当前记录；若旧数据损坏，可先备份原文件，再重建。</p>
              </div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() =>
                  downloadFile('interview-pal-current.json', JSON.stringify(state, null, 2))
                }
              >
                导出当前记录
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  try {
                    downloadFile(
                      'interview-pal-recovery.txt',
                      localStorage.getItem(STORAGE_KEY) || '',
                    );
                  } catch {
                    notify('无法读取浏览器存储。');
                  }
                }}
              >
                备份原数据
              </button>
              <button
                className="text-button"
                onClick={() => {
                  if (window.confirm('用当前数据重新尝试保存？此操作会覆盖旧版本，请先备份。')) {
                    try {
                      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
                      setStorageBlocked(false);
                      notify('本地保存已恢复。');
                    } catch {
                      notify('仍无法保存，请检查浏览器存储设置。');
                    }
                  }
                }}
              >
                恢复保存
              </button>
            </div>
          )}
          {state.sample && page === 'practice' && (
            <div className="sample-banner">
              <Sparkles size={15} />
              <span>正在使用示例资料练习。请在真实面试前替换为自己的经历。</span>
              <button onClick={() => navigate('profile')}>
                建立我的档案
                <ArrowRight size={14} />
              </button>
            </div>
          )}
          {page === 'dashboard' && <Dashboard {...props} />}{' '}
          {page === 'roadmap' && <Roadmap {...props} />}{' '}
          {page === 'questions' && <QuestionLibrary {...props} />}{' '}
          {page === 'projects' && <ProjectsPage {...props} />}{' '}
          {page === 'profile' && <ProfilePage {...props} />}{' '}
          {page === 'reports' && <Reports {...props} />}{' '}
          {page === 'settings' && <SettingsPage {...props} recheck={checkHealth} />}{' '}
          {page === 'practice' && (
            <Practice
              key={practice.key}
              {...props}
              target={practice.target}
              initialMode={practice.mode}
              simulation={!!simulation}
              simulationIndex={simulation?.index ?? 0}
              simulationCount={simulation?.queue.length ?? 0}
              onNext={nextQuestion}
            />
          )}
          <footer className="app-footer">
            <span>
              Interview Pal <span>·</span> 为下一次机会，做好准备。
            </span>
            <span>
              <ShieldCheck size={12} />
              个人资料保存在此浏览器
            </span>
          </footer>
        </div>
      </div>
      <nav className="mobile-bottom-nav" aria-label="快捷导航">
        {navigation
          .filter((n) => n.id !== 'projects')
          .map((n) => (
            <button
              key={n.id}
              className={page === n.id ? 'active' : ''}
              onClick={() => navigate(n.id)}
            >
              <n.icon size={19} />
              <span>{n.label.replace('我的', '')}</span>
            </button>
          ))}
      </nav>
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          <span>{toast}</span>
          <button aria-label="关闭提示" onClick={() => setToast('')}>
            <X size={14} />
          </button>
        </div>
      )}
      {modal === 'search' && (
        <Modal title="找到下一次练习" onClose={() => setModal(null)}>
          <label className="search-field modal-search">
            <Search size={19} />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索检索、RAG、推荐、评估…"
            />
          </label>
          <div className="search-results">
            {searchResults.map((q) => (
              <button key={q.id} onClick={() => startPractice(q.id)}>
                <BookOpen size={18} />
                <span>
                  <strong>{q.title}</strong>
                  <small>{q.tags.join(' · ')}</small>
                </span>
                <ArrowRight size={16} />
              </button>
            ))}
            {!searchResults.length && (
              <p className="search-empty">暂时没有找到相关题目，试试“RAG”“检索”或“评估”。</p>
            )}
          </div>
          <p className="small muted">也可以在算法题库中按方向与难度筛选。</p>
        </Modal>
      )}
      {modal === 'help' && (
        <Modal title="从第一句，走向一场对话" onClose={() => setModal(null)}>
          <div className="help-steps">
            {[
              ['01', '建立档案', '上传简历或手动填写，只确认与你真实经历一致的事实。'],
              ['02', '循序渐进', '先听、再复述、最后脱稿。参考表达始终只是辅助。'],
              ['03', '保存与复习', '保存文字和反馈，次日换种问法再试一次。'],
            ].map(([n, t, d]) => (
              <div key={n}>
                <span>{n}</span>
                <div>
                  <h3>{t}</h3>
                  <p>{d}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="inline-info">
            <ShieldCheck size={18} />
            <span>
              本版本是个人本地训练工作台。录音只保留在当前页面；发音评分、实时通话和跨设备同步尚未开放。
            </span>
          </div>
          <button
            className="btn btn-primary full-width"
            onClick={() => {
              setModal(null);
              navigate('profile');
            }}
          >
            从我的档案开始
            <ArrowRight size={16} />
          </button>
        </Modal>
      )}
      {modal === 'simulation' && (
        <Modal title="给自己一次完整表达的机会" onClose={() => setModal(null)}>
          <div className="simulation-illustration">
            <AudioLines size={42} />
          </div>
          <p className="modal-lead">把准备过的内容，连成一场面试。</p>
          <p className="muted">
            从自我介绍到技术问题与项目，逐题录音或输入回答。每题保存后继续，最后统一复盘。
          </p>
          <div className="field">
            <label>本轮题目数量</label>
            <div className="segmented segmented-full">
              {[3, 5].map((n) => (
                <button
                  key={n}
                  className={rounds === n ? 'active' : ''}
                  onClick={() => setRounds(n)}
                >
                  {n} 题 · 约 {n * 3} 分钟
                </button>
              ))}
            </div>
          </div>
          <div className="simulation-summary">
            <span>
              训练方向<strong>{state.plan.role || '算法工程师'}</strong>
            </span>
            <span>
              辅助模式<strong>无稿回答</strong>
            </span>
          </div>
          <p className="inline-info">
            <HelpCircle size={17} />
            当前是逐题练习，实时语音通话将在后续版本接入。
          </p>
          <button className="btn btn-primary full-width" onClick={beginSimulation}>
            准备好了，开始练习
            <ArrowRight size={16} />
          </button>
        </Modal>
      )}
    </div>
  );
}
class AppBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    if (this.state.error)
      return (
        <div className="fatal-error">
          <h1>页面遇到了一点问题</h1>
          <p>已保存的数据仍在本地。可以先导出原始数据，再刷新重试。</p>
          <button
            className="btn btn-secondary"
            onClick={() => {
              try {
                downloadFile(
                  'interview-pal-recovery.json',
                  localStorage.getItem(STORAGE_KEY) || '{}',
                );
              } catch {}
            }}
          >
            <Download size={16} />
            导出备份
          </button>{' '}
          <button className="btn btn-primary" onClick={() => location.reload()}>
            刷新页面
          </button>
        </div>
      );
    return this.props.children;
  }
}
export default function App() {
  return (
    <AppBoundary>
      <Workspace />
    </AppBoundary>
  );
}
