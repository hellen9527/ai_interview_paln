import { useRef, useState } from 'react';
import {
  ArrowUpRight,
  CheckCircle2,
  CloudOff,
  Code2,
  Database,
  Download,
  ExternalLink,
  FileJson,
  Info,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
  Volume2,
} from 'lucide-react';
import type { PageProps } from '../types';
import { downloadFile, emptyState, parseState, STORAGE_KEY } from '../lib/store';
export default function SettingsPage({
  state,
  update,
  notify,
  health,
  recheck,
}: PageProps & { recheck: () => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null),
    [checking, setChecking] = useState(false),
    [importError, setImportError] = useState('');
  async function importData(file: File) {
    setImportError('');
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('备份文件请控制在 10MB 以内。');
      const next = parseState(await file.text());
      if (
        !window.confirm(
          `将恢复 ${next.attempts.length} 条练习记录，覆盖当前档案和计划。请先导出当前数据，确定继续吗？`,
        )
      )
        return;
      update(next);
      notify('备份已恢复。');
    } catch {
      setImportError('无法导入：请使用本应用导出的 v1 JSON 备份，文件不能超过 10MB。');
    } finally {
      if (input.current) input.current.value = '';
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">MAKE IT YOUR WORKSPACE</div>
          <h1 className="page-title">安心练习，自己掌控。</h1>
          <p className="page-description">管理服务连接、个人资料和你的每一份练习记录。</p>
        </div>
        <span className="badge">v0.1 · 本地训练版</span>
      </div>
      <div className="settings-layout">
        <div className="stack">
          <section className="card stack">
            <div className="card-header">
              <div>
                <h2>
                  <Code2 size={20} />
                  AI 教练连接
                </h2>
                <p>文本模型与语音服务独立配置，按需开启。</p>
              </div>
              <button
                className="btn btn-secondary btn-sm"
                disabled={checking}
                onClick={async () => {
                  setChecking(true);
                  await recheck();
                  setChecking(false);
                  notify('服务配置状态已刷新。');
                }}
              >
                <RefreshCw size={14} className={checking ? 'spin' : ''} />
                检查连接
              </button>
            </div>
            <div className="service-row">
              <span className="icon-box icon-box-teal">
                <KeyRound size={20} />
              </span>
              <div>
                <strong>文本生成与内容反馈</strong>
                <p>
                  {health?.configured
                    ? `${health.provider} · ${health.model}`
                    : '连接后可生成英文稿、分析回答并继续追问'}
                </p>
              </div>
              <span className={'badge ' + (health?.configured ? 'badge-teal' : 'badge-amber')}>
                {health?.configured ? '已配置' : health ? '待配置' : '服务不可达'}
              </span>
            </div>
            <div className="service-row">
              <span className="icon-box icon-box-blue">
                <Volume2 size={20} />
              </span>
              <div>
                <strong>语音转写</strong>
                <p>将录音转成文字后，确认术语再提交内容分析</p>
              </div>
              <span className={'badge ' + (health?.asrConfigured ? 'badge-teal' : '')}>
                {health?.asrConfigured ? '已配置' : '待配置'}
              </span>
            </div>
            <p className="small muted">
              “已配置”表示服务器已读取配置，并不代表模型调用成功。请实际生成一段文本验证。
            </p>
            <details className="setup-details">
              <summary>开发者：如何连接模型</summary>
              <p>
                在项目根目录将 <code>.env.example</code> 复制为 <code>.env</code>
                ，填写服务商参数，然后重启后端。
              </p>
              <pre>
                <code>
                  {
                    'LLM_BASE_URL=https://your-provider.example/v1\nLLM_API_KEY=your-server-side-key\nLLM_MODEL=your-enabled-model-id\n\n# 可选：兼容 multipart /audio/transcriptions 的服务\nASR_BASE_URL=https://your-asr-provider.example/v1\nASR_API_KEY=your-server-side-key\nASR_MODEL=your-enabled-asr-model'
                  }
                </code>
              </pre>
              <p className="small muted">
                模型 ID 以账号实际开通的服务为准。Doubao
                原生语音协议需要单独适配，不能直接填入兼容转写地址。
              </p>
              <a
                className="text-button"
                href="https://github.com/hellen9527/ai_interview_paln/blob/main/docs/DEVELOPMENT.md"
                target="_blank"
                rel="noreferrer"
              >
                查看开发接入文档
                <ExternalLink size={14} />
              </a>
            </details>
          </section>
          <section className="card stack">
            <div className="card-header">
              <div>
                <h2>
                  <Database size={20} />
                  你的数据，由你掌控
                </h2>
                <p>当前档案与文字记录仅保存在这个浏览器，不会跨设备同步。</p>
              </div>
            </div>
            <div className="data-summary">
              <div>
                <strong>{state.profile.facts.length}</strong>
                <span>个人事实</span>
              </div>
              <div>
                <strong>{state.profile.projects.length}</strong>
                <span>项目档案</span>
              </div>
              <div>
                <strong>{state.attempts.length}</strong>
                <span>练习记录</span>
              </div>
            </div>
            <div className="data-action">
              <div>
                <h3>导出完整备份</h3>
                <p>包含档案、计划、回答和反馈。不包含录音与 API Key。</p>
              </div>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  downloadFile('interview-pal-backup.json', JSON.stringify(state, null, 2));
                  notify('备份已导出，请妥善保存。');
                }}
              >
                <Download size={16} />
                导出 JSON
              </button>
            </div>
            <div className="data-action">
              <div>
                <h3>从备份恢复</h3>
                <p>导入后会替换当前浏览器中的数据。</p>
              </div>
              <input
                type="file"
                hidden
                ref={input}
                accept=".json,application/json"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void importData(f);
                }}
              />
              <button className="btn btn-secondary" onClick={() => input.current?.click()}>
                <Upload size={16} />
                导入备份
              </button>
            </div>
            {importError && (
              <p className="error-message" role="alert">
                {importError}
              </p>
            )}
            <div className="data-action danger-zone">
              <div>
                <h3>清除这个浏览器的训练数据</h3>
                <p>删除档案、计划、练习与会话草稿。建议先导出备份。</p>
              </div>
              <button
                className="btn btn-danger"
                onClick={() => {
                  if (!window.confirm('确定清除全部本地训练数据？此操作无法撤销，请先导出备份。'))
                    return;
                  try {
                    for (let i = sessionStorage.length - 1; i >= 0; i--) {
                      const key = sessionStorage.key(i);
                      if (key?.startsWith('pal-draft:')) sessionStorage.removeItem(key);
                    }
                    localStorage.removeItem(STORAGE_KEY);
                  } catch {}
                  update(emptyState());
                  notify('本地训练数据已清除。');
                }}
              >
                <Trash2 size={16} />
                清除数据
              </button>
            </div>
          </section>
        </div>
        <aside className="stack">
          <section className="card privacy-card">
            <span className="icon-box icon-box-teal">
              <ShieldCheck size={24} />
            </span>
            <h2>
              知道资料去向，
              <br />
              才能放心练习。
            </h2>
            <div className="privacy-item">
              <CheckCircle2 size={17} />
              <p>导入简历时，文件送到本地后端解析，原文件不持久保存。</p>
            </div>
            <div className="privacy-item">
              <CheckCircle2 size={17} />
              <p>点击生成或反馈时，相关文字会发送给你配置的模型服务商。</p>
            </div>
            <div className="privacy-item">
              <CheckCircle2 size={17} />
              <p>点击转写前，录音停留在当前页面；离开页面会清除，请及时下载。</p>
            </div>
            <div className="privacy-item">
              <CheckCircle2 size={17} />
              <p>API Key 仅保存在服务端环境变量，不写入浏览器或导出文件。</p>
            </div>
          </section>
          <section className="card scope-card">
            <span className="eyebrow">WHAT COMES NEXT</span>
            <h3>为真实面试，持续打磨。</h3>
            <p>独立发音评测、实时语音通话、账号同步与专家校准题库，都已纳入开发路线。</p>
            <a
              className="text-button"
              href="https://github.com/hellen9527/ai_interview_paln/blob/main/docs/ROADMAP.md"
              target="_blank"
              rel="noreferrer"
            >
              查看产品路线
              <ArrowUpRight size={15} />
            </a>
          </section>
        </aside>
      </div>
    </>
  );
}
