import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Download,
  Eye,
  EyeOff,
  FileText,
  Headphones,
  Info,
  LoaderCircle,
  MessageCircle,
  Mic,
  Pause,
  Play,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Square,
  Upload,
  Volume2,
} from 'lucide-react';
import type {
  PageProps,
  Mode,
  Feedback,
  PracticeSnapshot,
  Attempt,
  AudioAttachment,
} from '../types';
import { questions } from '../data/questions';
import { inDays, uid } from '../lib/store';
import { request, errorMessage } from '../lib/api';
import { useRecorder } from '../lib/useRecorder';
import { saveAudio, deleteAudio } from '../lib/audioStore';
import { Empty } from './UI';
const audioExtensionsByMime: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/m4a': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/x-mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/wave': 'wav',
  'audio/x-wav': 'wav',
  'audio/vnd.wave': 'wav',
  'audio/ogg': 'ogg',
  'application/ogg': 'ogg',
  'audio/flac': 'flac',
  'audio/x-flac': 'flac',
};
const allowedAudioExtensions = new Set(['wav', 'webm', 'mp3', 'm4a', 'mp4', 'ogg', 'oga', 'flac']);
export function supportsAudioUpload(file: File) {
  const mime = file.type.split(';')[0].trim().toLowerCase();
  if (mime && mime !== 'application/octet-stream') return Boolean(audioExtensionsByMime[mime]);
  return allowedAudioExtensions.has(file.name.split('.').at(-1)?.toLowerCase() || '');
}
export function audioFileName(blob: Blob) {
  if (blob instanceof File && blob.name) return blob.name;
  const extension = audioExtensionsByMime[blob.type.split(';')[0].trim().toLowerCase()];
  return extension ? `my-answer.${extension}` : 'my-answer.audio';
}
type Props = PageProps & {
  target: string;
  initialMode: Mode;
  simulation: boolean;
  simulationIndex: number;
  simulationCount: number;
  onNext: () => void;
  snapshot?: PracticeSnapshot;
};
export default function Practice({
  state,
  update,
  navigate,
  notify,
  health,
  target,
  initialMode,
  simulation,
  simulationIndex,
  simulationCount,
  onNext,
  startPractice,
  snapshot,
}: Props) {
  const project = snapshot
    ? snapshot.project
    : state.profile.projects.find((p) => 'project:' + p.id === target);
  const baseKind: PracticeSnapshot['kind'] =
    snapshot?.kind ??
    (target === 'intro'
      ? 'intro'
      : project
        ? 'project'
        : target === 'reverse'
          ? 'reverse'
          : target === 'clarify'
            ? 'clarify'
            : 'technical');
  const isIntro = baseKind === 'intro';
  const job = snapshot ? snapshot.job : { role: state.plan.role, jd: state.plan.jd || '' };
  const q =
    questions.find((q) => q.id === target) ??
    questions.find((q) => q.category === state.plan.track) ??
    questions[0];
  const context = useMemo(
    () =>
      snapshot
        ? {
            title: snapshot.title,
            question: snapshot.question,
            translation: snapshot.translation || '',
            reference: snapshot.reference || '',
            points: snapshot.kind === 'followup' ? [] : snapshot.points,
            followups: [],
          }
        : isIntro
          ? {
              title: '自我介绍',
              question: 'Could you tell me a little about yourself?',
              translation: '请介绍一下你自己，重点说说与你申请岗位相关的经历。',
              reference: state.intro,
              points: [
                '说明当前专业方向',
                '介绍一项与岗位相关的真实经历',
                '区分个人贡献和团队成果',
                '简洁说明下一步发展方向',
              ],
              followups: ['What part of your recent work are you most proud of?'],
            }
          : project
            ? {
                title: project.name,
                question:
                  'Walk me through a project you worked on. What was your contribution, and why did you choose that approach?',
                translation: '介绍一个你做过的项目，解释你的个人贡献与方案选择。',
                reference: '',
                points: [
                  `项目背景：${project.background || '待补充'}`,
                  `个人职责：${project.role || '待补充'}`,
                  `技术选择：${project.decision || '待补充'}`,
                  `真实结果：${project.result || '待补充，不可编造'}`,
                  `反思与改进：${project.reflection || '待补充'}`,
                ],
                followups: [
                  'What alternatives did you consider, and how did you evaluate them?',
                  'What would you do differently next time?',
                ],
              }
            : target === 'reverse'
              ? {
                  title: '反问面试官',
                  question: 'What would you like to know about this role or our team?',
                  translation: '你希望进一步了解这个岗位或团队的哪些方面？',
                  reference:
                    'What would success look like in the first three months of this role?\nWhat are the main technical challenges the team is working on?',
                  points: [
                    '结合岗位提出具体问题',
                    '问题适合当前面试阶段',
                    '避免假设公司的内部信息',
                    '准备根据回答继续追问',
                  ],
                  followups: ['Why is that information important to you?'],
                }
              : target === 'clarify'
                ? {
                    title: '澄清与恢复对话',
                    question: 'How would you evaluate it?',
                    translation: '信息不充分时，请先确认对方想问哪一种评估。',
                    reference:
                      'Could you clarify what you would like me to evaluate? Do you mean the offline model performance or the online business impact?',
                    points: [
                      '指出需要确认的范围',
                      '礼貌提出具体澄清问题',
                      '不在理解题意前猜测作答',
                    ],
                    followups: ['I mean the online business impact. How would you measure it?'],
                  }
                : {
                    title: q.title,
                    question: q.question,
                    translation: q.translation,
                    reference: q.answer,
                    points: q.points,
                    followups: q.followups,
                  },
    [isIntro, project, target, q, state.intro, snapshot],
  );
  const [mode, setMode] = useState<Mode>(simulation ? 'independent' : initialMode),
    [showTranslation, setShowTranslation] = useState(!simulation),
    [showReference, setShowReference] = useState(false),
    [assisted, setAssisted] = useState(initialMode !== 'independent' && !simulation),
    [answer, setAnswer] = useState(() => {
      try {
        return (
          sessionStorage.getItem(
            'pal-draft:' + target + ':' + encodeURIComponent(context.question),
          ) || ''
        );
      } catch {
        return '';
      }
    }),
    [draftIntro, setDraftIntro] = useState(state.intro),
    [duration, setDuration] = useState<30 | 60 | 90>(60),
    [sentence, setSentence] = useState(0),
    [feedback, setFeedback] = useState<Feedback | null>(null),
    [busy, setBusy] = useState(''),
    [error, setError] = useState(''),
    [saved, setSaved] = useState(false),
    [followup, setFollowup] = useState(''),
    [speaking, setSpeaking] = useState(false),
    [tab, setTab] = useState<'record' | 'text'>('record');
  const recorder = useRecorder(),
    started = useRef(Date.now()),
    alive = useRef(true),
    audioInput = useRef<HTMLInputElement>(null);
  const feedbackFor = useRef<{ answer: string; question: string; mode: Mode } | null>(null);
  const [preparingRecording, setPreparingRecording] = useState(false),
    [referenceDraft, setReferenceDraft] = useState('');
  const [answerDraft, setAnswerDraft] = useState<{
    text: string;
    missingFacts: string[];
    model: string;
  } | null>(null);
  const [draftConfirmed, setDraftConfirmed] = useState(false);
  const [draftError, setDraftError] = useState('');
  const [keepAudio, setKeepAudio] = useState(false);
  const [savedWithAudio, setSavedWithAudio] = useState(false);
  const [audioSaveFailure, setAudioSaveFailure] = useState<{
    selfReview: boolean;
    message: string;
  } | null>(null);
  const generation = useRef<{ sequence: number; controller?: AbortController }>({ sequence: 0 });
  const savingAudio = useRef(false);
  const pendingAudioReplacement = useRef(false);
  const actualQuestion = followup || context.question;
  const actualKind = followup ? 'followup' : baseKind;
  const isFollowup = actualKind === 'followup';
  const libraryQuestion = baseKind === 'technical';
  const sourceUrl = snapshot ? snapshot.sourceUrl : libraryQuestion ? q.sourceUrl : undefined;
  const category =
    snapshot?.category ??
    (isIntro ? 'intro' : project ? 'project' : baseKind === 'technical' ? q.category : baseKind);
  const draftKey = 'pal-draft:' + target + ':' + encodeURIComponent(actualQuestion);
  const practiceReference = referenceDraft || (!followup ? context.reference : '');
  const sentences = practiceReference.split(/(?<=[.!?])\s+|\n+/).filter(Boolean);
  const currentSentence = sentences[sentence] ?? sentences[0] ?? '';
  const audioUrl = useMemo(
    () => (recorder.blob ? URL.createObjectURL(recorder.blob) : ''),
    [recorder.blob],
  );
  useEffect(
    () => () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    },
    [audioUrl],
  );
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      generation.current.sequence += 1;
      generation.current.controller?.abort();
      window.speechSynthesis?.cancel();
    };
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(draftKey, answer);
    } catch {}
  }, [answer, draftKey]);
  useEffect(() => {
    const protectAudioWrite = (event: BeforeUnloadEvent) => {
      if (!savingAudio.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', protectAudioWrite);
    return () => window.removeEventListener('beforeunload', protectAudioWrite);
  }, []);
  useEffect(() => {
    if (recorder.recording && pendingAudioReplacement.current) {
      pendingAudioReplacement.current = false;
      clearAnswerForNewAudio();
    }
  }, [recorder.recording]);
  function confirmAudioReplacement() {
    if ((answer.trim() && !saved) || recorder.blob)
      return window.confirm(
        '替换录音会清空当前文字回答和反馈。请先保存需要保留的回答，并下载当前录音。继续吗？',
      );
    return true;
  }
  function clearAnswerForNewAudio() {
    setAnswer('');
    setFeedback(null);
    feedbackFor.current = null;
    setSaved(false);
    setKeepAudio(false);
    setSavedWithAudio(false);
    setAudioSaveFailure(null);
    setError('');
    started.current = Date.now();
  }
  async function beginRecording() {
    if (preparingRecording || busy || recorder.recording || !confirmAudioReplacement()) return;
    pendingAudioReplacement.current = true;
    setPreparingRecording(true);
    try {
      await recorder.start();
    } finally {
      if (alive.current) setPreparingRecording(false);
    }
  }
  function useReferenceDraft() {
    if (!feedback || !saved) return;
    if (
      !window.confirm(
        '请确认参考表达符合你的真实经历，没有新增未经确认的职责、指标或成果。确认后进入跟读，清除当前临时录音；已保存记录会保留，稿件只保留在本页。',
      )
    )
      return;
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    setReferenceDraft(feedback.referenceAnswer);
    setAnswerDraft(null);
    setDraftConfirmed(false);
    setSentence(0);
    setMode('read');
    setAssisted(true);
    setShowReference(false);
    setFeedback(null);
    feedbackFor.current = null;
    setAnswer('');
    setSaved(false);
    recorder.setBlob(null);
    recorder.setSeconds(0);
    setKeepAudio(false);
    setAudioSaveFailure(null);
    started.current = Date.now();
    notify('参考表达已载入，先逐句跟读，再用关键词复述。');
  }
  function cancelReferenceDraft() {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    setReferenceDraft('');
    setSentence(0);
    if (followup || !context.reference) setMode('keywords');
    setShowReference(false);
  }
  function cancelAnswerGeneration() {
    generation.current.sequence += 1;
    generation.current.controller?.abort();
    generation.current.controller = undefined;
    if (busy === 'answer') setBusy('');
    setDraftError('已停止等待，本次结果不会载入。已提交的模型请求仍可能产生费用。');
  }
  async function generateAnswer() {
    if (
      simulation ||
      (isIntro && !isFollowup) ||
      !health?.configured ||
      busy ||
      recorder.recording ||
      preparingRecording
    )
      return;
    generation.current.controller?.abort();
    const controller = new AbortController();
    const sequence = ++generation.current.sequence;
    generation.current.controller = controller;
    const timer = setTimeout(() => controller.abort(), 65000);
    const current = () => alive.current && generation.current.sequence === sequence;
    setBusy('answer');
    setDraftError('');
    setDraftConfirmed(false);
    try {
      const response = await fetch('/api/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          kind: actualKind,
          question: actualQuestion,
          points: isFollowup ? [] : context.points,
          referenceAnswer: isFollowup ? undefined : practiceReference || undefined,
          project,
          job,
          facts: snapshot ? [] : state.profile.facts.filter((fact) => fact.confirmed).slice(0, 60),
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error?.message || '参考稿生成失败，请稍后重试。');
      if (typeof result?.text !== 'string' || !result.text.trim() || result.text.length > 8000)
        throw new Error('模型没有返回可用参考稿，请重试。');
      if (current()) {
        setAnswerDraft({
          text: result.text,
          missingFacts: Array.isArray(result.missingFacts)
            ? result.missingFacts
                .filter((value: unknown): value is string => typeof value === 'string')
                .slice(0, 8)
            : [],
          model: typeof result.model === 'string' ? result.model : '',
        });
        setAssisted(true);
        setFeedback(null);
        feedbackFor.current = null;
        notify('参考稿已生成。先核对事实与技术内容，再开始跟读。');
      }
    } catch (reason) {
      if (current())
        setDraftError(
          reason instanceof Error && reason.name === 'AbortError'
            ? '生成等待超时。已有内容保留，可以重新生成。'
            : errorMessage(reason),
        );
    } finally {
      clearTimeout(timer);
      if (current()) {
        generation.current.controller = undefined;
        setBusy('');
      }
    }
  }
  function confirmAnswerDraft() {
    if (
      !answerDraft?.text.trim() ||
      !draftConfirmed ||
      busy ||
      recorder.recording ||
      preparingRecording
    )
      return;
    if (
      ((answer.trim() && !saved) || recorder.blob) &&
      !window.confirm(
        '载入稿件将开始一轮新的跟读，清空当前未保存的文字与临时录音。已保存记录会保留，继续吗？',
      )
    )
      return;
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    setReferenceDraft(answerDraft.text.trim());
    setAnswerDraft(null);
    setDraftConfirmed(false);
    setSentence(0);
    setMode('read');
    setAssisted(true);
    setShowReference(false);
    clearAnswerForNewAudio();
    recorder.setBlob(null);
    recorder.setSeconds(0);
    notify('参考稿已确认。跟读不会自动计为完成，录下或写出你的回答后再保存。');
  }
  function speak(text: string, rate = 1) {
    if (!('speechSynthesis' in window)) {
      notify('当前浏览器不支持示范朗读。');
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = rate;
    const voice = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith('en'));
    if (voice) utterance.voice = voice;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => {
      setSpeaking(false);
      notify('示范语音不可用，可稍后重试。');
    };
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }
  async function generateIntro() {
    setError('');
    setBusy('intro');
    try {
      const { name, title, experience, summary, facts } = state.profile;
      const r = await request<{ text: string; model: string }>('intro', {
        profile: { name, title, experience, summary, facts },
        duration,
        role: state.plan.role,
      });
      if (alive.current) {
        setDraftIntro(r.text);
        notify('英文稿已生成，请核对事实后再确认。');
      }
    } catch (e) {
      if (alive.current) setError(errorMessage(e));
    } finally {
      if (alive.current) setBusy('');
    }
  }
  async function analyze() {
    if (answer.length > 15000) {
      setError('回答文字超过15,000字符，请先精简或拆分后再获取反馈。');
      return;
    }
    const evaluationSnapshot = { answer, question: actualQuestion, mode };
    const assessmentQuestion =
      !isFollowup && baseKind === 'reverse' && job?.jd.trim()
        ? `${actualQuestion}\n\nTarget job description (user-provided context, not verified company facts):\n${job.jd.slice(0, 3000)}`
        : actualQuestion;
    setBusy('feedback');
    setError('');
    feedbackFor.current = null;
    try {
      const r = await request<Feedback>('feedback', {
        question: assessmentQuestion,
        answer: evaluationSnapshot.answer,
        points: isFollowup ? [] : context.points,
        mode: assisted && mode === 'independent' ? 'keywords' : mode,
        referenceAnswer: isFollowup ? undefined : practiceReference || undefined,
      });
      if (alive.current) {
        feedbackFor.current = evaluationSnapshot;
        setFeedback(r);
        setSaved(false);
      }
    } catch (e) {
      if (alive.current) setError(errorMessage(e));
    } finally {
      if (alive.current) setBusy('');
    }
  }
  async function transcribe() {
    if (!recorder.blob) return;
    setError('');
    setBusy('asr');
    try {
      const form = new FormData();
      form.append('audio', recorder.blob, audioFileName(recorder.blob));
      const r = await request<{ text: string }>('transcribe', form);
      if (alive.current) {
        setAnswer(r.text);
        setFeedback(null);
        feedbackFor.current = null;
        setSaved(false);
        setTab('text');
        notify('转写完成，请先确认技术术语是否准确。');
      }
    } catch (e) {
      if (alive.current) setError(errorMessage(e));
    } finally {
      if (alive.current) setBusy('');
    }
  }
  async function save(selfReview = false, textOnly = false) {
    if (savingAudio.current || busy || preparingRecording || recorder.recording || saved) return;
    if (answer.length > 15000) {
      setError('回答文字超过15,000字符，请先精简或拆分后再保存。');
      return;
    }
    if (
      !selfReview &&
      (!feedback ||
        !feedbackFor.current ||
        feedbackFor.current.answer !== answer ||
        feedbackFor.current.question !== actualQuestion ||
        feedbackFor.current.mode !== mode)
    ) {
      setError('回答或练习模式已有变化，请重新获取反馈后保存。');
      return;
    }
    const shouldSaveAudio = !textOnly && keepAudio && !!recorder.blob;
    if (!answer.trim() && !(selfReview && shouldSaveAudio)) {
      setError('请填写回答，或勾选保存当前录音后保存自主练习。仅保存文字时需要先有文字回答。');
      return;
    }
    const id = uid();
    const attempt: Attempt = {
      id,
      questionId: target,
      question: actualQuestion,
      title: followup ? `${context.title} · 追问` : context.title,
      category,
      date: new Date().toISOString(),
      answer,
      mode,
      feedback: selfReview ? undefined : (feedback ?? undefined),
      duration: Math.min(1800, Math.round((Date.now() - started.current) / 1000)),
      assisted: assisted || mode !== 'independent',
      selfReview,
      reviewDue: inDays(1),
      snapshot: {
        kind: actualKind,
        question: actualQuestion,
        title: followup ? `${context.title} · 追问` : context.title,
        category,
        translation: followup ? undefined : context.translation || undefined,
        points: isFollowup ? [] : [...context.points],
        reference: practiceReference || undefined,
        sourceUrl,
        project: project ? structuredClone(project) : undefined,
        job: job ? { ...job } : undefined,
      },
    };
    let attachment: AudioAttachment | undefined;
    savingAudio.current = true;
    setBusy('saving');
    setError('');
    setAudioSaveFailure(null);
    window.dispatchEvent(new CustomEvent('interview-pal:busy', { detail: { busy: true } }));
    try {
      if (shouldSaveAudio && recorder.blob)
        attachment = await saveAudio(id, recorder.blob, audioFileName(recorder.blob));
      if (!alive.current) {
        if (attachment) await deleteAudio(attachment.key).catch(() => {});
        return;
      }
      update((s) => ({ ...s, attempts: [{ ...attempt, audio: attachment }, ...s.attempts] }));
      setSaved(true);
      setSavedWithAudio(!!attachment);
      notify(
        attachment
          ? answer.trim()
            ? '回答与录音已保存，可在练习记录回放。'
            : '录音已保存为自主练习，未生成转写或评分。'
          : textOnly
            ? '仅文字记录已保存，录音尚未保存；仍可在本页下载。'
            : selfReview
              ? '已保存自主练习，明天再来复述一次。'
              : '反馈与回答已保存，已安排次日复习。',
      );
      try {
        sessionStorage.removeItem(draftKey);
      } catch {}
    } catch (reason) {
      if (alive.current)
        setAudioSaveFailure({
          selfReview,
          message: `录音未能保存，本次练习记录也尚未写入。${errorMessage(reason)} 当前录音仍保留在本页。`,
        });
    } finally {
      savingAudio.current = false;
      window.dispatchEvent(new CustomEvent('interview-pal:busy', { detail: { busy: false } }));
      if (alive.current) setBusy('');
    }
  }
  async function askFollowup() {
    setBusy('followup');
    setError('');
    try {
      const contextText = [
        !isFollowup ? context.points.join('\n') : '',
        isFollowup && project
          ? `User-provided project facts (not an answer rubric):\n${JSON.stringify(project)}`
          : '',
        job?.jd ? `Target job description (user-provided):\n${job.jd}` : '',
      ]
        .filter(Boolean)
        .join('\n\n')
        .slice(0, 20000);
      const r = await request<{ question: string }>('followup', {
        question: actualQuestion,
        answer,
        context: contextText,
      });
      if (alive.current) {
        setFollowup(r.question);
        setAnswerDraft(null);
        setDraftConfirmed(false);
        setDraftError('');
        setKeepAudio(false);
        setAudioSaveFailure(null);
        setReferenceDraft('');
        setSentence(0);
        setFeedback(null);
        feedbackFor.current = null;
        setAnswer('');
        setSaved(false);
        setMode('independent');
        setAssisted(false);
        setShowReference(false);
        recorder.setBlob(null);
        recorder.setSeconds(0);
        started.current = Date.now();
      }
    } catch (e) {
      if (alive.current) setError(errorMessage(e));
    } finally {
      if (alive.current) setBusy('');
    }
  }
  const needsConfirmation =
    isIntro &&
    !snapshot &&
    !isFollowup &&
    (!state.introConfirmed || state.introStale || !state.intro);
  return (
    <div className="practice-page">
      <div className="practice-breadcrumb">
        <button onClick={() => navigate('dashboard')}>
          <ArrowLeft size={16} />
          返回训练
        </button>
        <ChevronRight size={13} />
        <span>{simulation ? '模拟面试' : context.title}</span>
        <span className="badge badge-teal">
          {simulation ? `第 ${simulationIndex + 1} / ${simulationCount} 题` : '专注练习'}
        </span>
      </div>
      <div className="practice-layout">
        <aside className="practice-sidebar">
          <div className="eyebrow">PRACTICE WORKSPACE</div>
          <h2>{simulation ? '一次完整的表达练习' : context.title}</h2>
          <p>慢慢来，先把一个意思说清楚。</p>
          {!simulation && (
            <div className="mode-list">
              {[
                { id: 'read', name: '逐句跟读', desc: '熟悉词句与节奏', icon: Headphones },
                { id: 'keywords', name: '关键词复述', desc: '用自己的话连接要点', icon: FileText },
                { id: 'independent', name: '无稿回答', desc: '独立组织你的表达', icon: Mic },
              ].map((m, i) => (
                <button
                  className={'mode-item ' + (mode === m.id ? 'active' : '')}
                  key={m.id}
                  disabled={!!busy || preparingRecording || recorder.recording}
                  onClick={() => {
                    setMode(m.id as Mode);
                    setAssisted((previous) => previous || m.id !== 'independent');
                    setShowReference(false);
                    setFeedback(null);
                    feedbackFor.current = null;
                    setSaved(false);
                  }}
                >
                  <span className="mode-num">{i + 1}</span>
                  <span>
                    <strong>{m.name}</strong>
                    <small>{m.desc}</small>
                  </span>
                  {mode === m.id && <ChevronRight size={16} />}
                </button>
              ))}
            </div>
          )}
          {assisted && (
            <p className="small muted">
              本次已使用辅助，切换到无稿模式不会清除记录。新追问会开始新的尝试。
            </p>
          )}
          <div className="coach-note">
            <span>
              <Sparkles size={17} />
              小提示
            </span>
            <p>
              {simulation
                ? '把它当作一次真实对话。可以停顿，也可以礼貌地请求澄清。'
                : mode === 'read'
                  ? '每次只练一句，先听重音和停顿，再用自然的语速跟读。'
                  : mode === 'keywords'
                    ? '不用逐字背诵。先记住要表达的意思，再选择你熟悉的词。'
                    : '先用一句话回答核心问题，再补充理由、例子或限制。'}
            </p>
          </div>
          <div className="practice-privacy">
            <ShieldCheck size={15} />
            <span>
              录音默认暂存本页，可自主选择保存到此浏览器。只有点击转写，才发送给你配置的语音服务。
            </span>
          </div>
        </aside>
        <main className="practice-main">
          <div className="question-prompt">
            <div className="row-between">
              <span className="eyebrow">
                {isFollowup ? 'FOLLOW-UP QUESTION' : 'THE INTERVIEWER ASKS'}
              </span>
              <button
                className="icon-button"
                aria-label="播放问题"
                onClick={() => speak(followup || context.question)}
              >
                <Volume2 size={18} />
              </button>
            </div>
            <h1>{followup || context.question}</h1>
            {showTranslation && !followup && <p>{context.translation}</p>}
            <button className="text-button muted" onClick={() => setShowTranslation((s) => !s)}>
              {showTranslation ? <EyeOff size={14} /> : <Eye size={14} />}{' '}
              {showTranslation ? '隐藏中文提示' : '查看中文提示'}
            </button>
            {snapshot && (
              <p className="inline-info">
                <Info size={15} />
                按历史题目和可用上下文重练，不会混入当前简历的新经历。
              </p>
            )}
            {sourceUrl && (
              <p className="small muted">
                <a className="text-button" href={sourceUrl} target="_blank" rel="noreferrer">
                  {isFollowup ? '原题参考出处' : '题目参考出处'} <ArrowRight size={13} />
                </a>
                {!snapshot && !q.reviewed && <span> · 内容待专家审核</span>}
              </p>
            )}
            {baseKind === 'reverse' && job?.jd && (
              <details className="small muted">
                <summary>查看你提供的岗位描述</summary>
                <p style={{ whiteSpace: 'pre-wrap' }}>{job.jd}</p>
                <p>根据这些岗位信息组织问题，不假设公司的真实内部情况。</p>
              </details>
            )}
          </div>
          {!simulation && (!isIntro || isFollowup) && (
            <section className="card intro-editor stack">
              <div className="card-header">
                <div>
                  <div className="eyebrow">FIND YOUR WORDS</div>
                  <h2>知道意思，却不知道英语怎么说？</h2>
                  <p>可以先生成参考稿，核对并改成你的表达，再逐句练习。生成稿件不计为完成练习。</p>
                </div>
              </div>
              <div className="action-row">
                <button
                  className="btn btn-secondary"
                  disabled={
                    !health?.configured || !!busy || preparingRecording || recorder.recording
                  }
                  onClick={generateAnswer}
                >
                  {busy === 'answer' ? (
                    <LoaderCircle size={16} className="spin" />
                  ) : (
                    <Sparkles size={16} />
                  )}
                  {answerDraft ? '重新生成参考稿' : '生成英文参考稿'}
                </button>
                {busy === 'answer' && (
                  <button className="btn btn-ghost" onClick={cancelAnswerGeneration}>
                    取消等待
                  </button>
                )}
              </div>
              {!health?.configured && (
                <p className="inline-info">
                  <Info size={15} />
                  AI 教练尚未配置，暂时无法生成参考稿。你仍可自行回答，或使用已有题目参考表达。
                </p>
              )}
              {draftError && (
                <p className="error-message" role="alert">
                  {draftError}
                </p>
              )}
              {answerDraft && (
                <>
                  {!!answerDraft.missingFacts.length && (
                    <div className="inline-info">
                      <div>
                        <strong>这些信息仍需要你补充或核实</strong>
                        <ul>
                          {answerDraft.missingFacts.map((fact, index) => (
                            <li key={index}>{fact}</li>
                          ))}
                        </ul>
                        <p>不知道的内容可以删除或诚实说明。不要把建议方案写成已经完成的经历。</p>
                      </div>
                    </div>
                  )}
                  <div className="field">
                    <label htmlFor="generated-answer-draft">英文参考稿 · 可编辑</label>
                    <textarea
                      id="generated-answer-draft"
                      className="textarea english"
                      rows={9}
                      maxLength={8000}
                      value={answerDraft.text}
                      disabled={!!busy || recorder.recording || preparingRecording}
                      onChange={(event) => {
                        setAnswerDraft({ ...answerDraft, text: event.target.value });
                        setDraftConfirmed(false);
                      }}
                    />
                    <span className="small muted">
                      {answerDraft.text.length.toLocaleString()} / 8,000 ·{' '}
                      {answerDraft.model ? `模型：${answerDraft.model}` : 'AI 生成内容'} ·
                      不会自动覆盖你的回答。
                    </span>
                  </div>
                  <label className="fact-row" htmlFor="confirm-generated-answer">
                    <input
                      id="confirm-generated-answer"
                      type="checkbox"
                      checked={draftConfirmed}
                      disabled={!!busy || recorder.recording || preparingRecording}
                      onChange={(event) => setDraftConfirmed(event.target.checked)}
                    />
                    <span>
                      我已核对技术内容和个人事实，并处理缺失信息；稿件没有虚构职责、指标或成果。
                    </span>
                  </label>
                  <div className="action-row">
                    <button
                      className="btn btn-primary"
                      disabled={
                        !draftConfirmed ||
                        !answerDraft.text.trim() ||
                        !!busy ||
                        preparingRecording ||
                        recorder.recording
                      }
                      onClick={confirmAnswerDraft}
                    >
                      <Headphones size={16} />
                      确认稿件，开始逐句跟读
                    </button>
                    <button
                      className="btn btn-ghost"
                      disabled={!!busy}
                      onClick={() => {
                        setAnswerDraft(null);
                        setDraftConfirmed(false);
                        setDraftError('');
                      }}
                    >
                      放弃这份草稿
                    </button>
                  </div>
                  <p className="small muted">
                    查看参考稿会记为使用辅助。请再通过新追问和延迟复习检验独立表达。
                  </p>
                </>
              )}
            </section>
          )}
          {needsConfirmation && !simulation && (
            <section className="card intro-editor">
              <div className="card-header">
                <div>
                  <h2>先准备一段属于你的介绍</h2>
                  <p>
                    {state.introStale
                      ? '资料有更新，请重新核对这段介绍。'
                      : '可以自己写，也可以根据已确认事实生成。'}
                  </p>
                </div>
              </div>
              <div className="row-between">
                <div className="segmented">
                  {[30, 60, 90].map((n) => (
                    <button
                      key={n}
                      className={duration === n ? 'active' : ''}
                      disabled={!!busy || preparingRecording}
                      onClick={() => setDuration(n as 30 | 60 | 90)}
                    >
                      {n} 秒
                    </button>
                  ))}
                </div>
                <button
                  className="btn btn-secondary"
                  disabled={
                    !!busy || !health?.configured || !state.profile.facts.some((f) => f.confirmed)
                  }
                  onClick={generateIntro}
                >
                  {busy === 'intro' ? (
                    <LoaderCircle className="spin" size={16} />
                  ) : (
                    <Sparkles size={16} />
                  )}
                  生成英文稿
                </button>
              </div>
              <label className="field">
                <span>英文介绍</span>
                <textarea
                  className="textarea english"
                  rows={7}
                  value={draftIntro}
                  maxLength={5000}
                  disabled={!!busy || preparingRecording}
                  placeholder="Hi, I’m ... My work focuses on ..."
                  onChange={(e) => setDraftIntro(e.target.value)}
                />
              </label>
              <p className="small muted">
                只使用你真实做过的经历。没有配置模型时，可以自行填写并继续练习。
              </p>
              <div className="action-row">
                <button
                  className="btn btn-primary"
                  disabled={!draftIntro.trim() || !!busy}
                  onClick={() => {
                    update((s) => ({
                      ...s,
                      intro: draftIntro,
                      introConfirmed: true,
                      introStale: false,
                    }));
                    notify('已确认介绍，现在开始练习。');
                  }}
                >
                  内容符合我的经历
                  <Check size={16} />
                </button>
                <button className="btn btn-ghost" onClick={() => navigate('profile')}>
                  整理个人事实
                </button>
              </div>
            </section>
          )}
          {!simulation && mode === 'read' && sentences.length > 0 && !needsConfirmation && (
            <section className="reading-card">
              <div className="row-between">
                <span className="badge badge-teal">
                  句子 {sentence + 1} / {sentences.length}
                </span>
                {referenceDraft && (
                  <button
                    className="text-button"
                    disabled={!!busy || preparingRecording || recorder.recording}
                    onClick={cancelReferenceDraft}
                  >
                    取消使用此稿
                  </button>
                )}
                <button className="text-button" onClick={() => speak(currentSentence, 0.8)}>
                  <Volume2 size={15} />
                  慢速听一遍
                </button>
              </div>
              <p className="reading-sentence">{currentSentence}</p>
              <div className="row-between">
                <div className="wave-decoration" aria-hidden="true">
                  {[8, 16, 22, 12, 28, 18, 10, 20, 30, 14, 24, 12, 18, 8].map((h, i) => (
                    <i key={i} style={{ height: h }} />
                  ))}
                </div>
                <div className="action-row">
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      if (speaking) {
                        window.speechSynthesis.cancel();
                        setSpeaking(false);
                      } else speak(currentSentence);
                    }}
                  >
                    {speaking ? <Pause size={15} /> : <Play size={15} />}示范朗读
                  </button>
                  <button
                    className="icon-button"
                    aria-label="上一句"
                    disabled={sentence === 0}
                    onClick={() => setSentence((s) => s - 1)}
                  >
                    <ArrowLeft size={16} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="下一句"
                    disabled={sentence === sentences.length - 1}
                    onClick={() => setSentence((s) => s + 1)}
                  >
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            </section>
          )}
          {!simulation && mode === 'keywords' && (
            <div className="keyword-card">
              <div className="eyebrow">YOUR TALKING POINTS</div>
              <div className="keyword-list">
                {(isFollowup
                  ? ['先直接回应这道追问', '补充真实依据、限制或取舍']
                  : context.points
                ).map((point, i) => (
                  <span key={i}>
                    <small>0{i + 1}</small>
                    {point}
                  </span>
                ))}
              </div>
            </div>
          )}
          <section className="card response-card">
            <div className="card-header">
              <div>
                <h2>{recorder.recording ? '正在聆听，按照你的节奏来。' : '轮到你了。'}</h2>
                <p>
                  {mode === 'read'
                    ? '录下这句话，回听自己的表达。'
                    : project || baseKind === 'reverse'
                      ? '可以先用中文写清要点，也可以在上方生成并核对英文稿，再带着它练习。'
                      : '先表达出来，再一起打磨。'}
                </p>
              </div>
              <div className="segmented">
                <button
                  className={tab === 'record' ? 'active' : ''}
                  onClick={() => setTab('record')}
                >
                  <Mic size={14} />
                  录音
                </button>
                <button className={tab === 'text' ? 'active' : ''} onClick={() => setTab('text')}>
                  <FileText size={14} />
                  文字
                </button>
              </div>
            </div>
            {tab === 'record' ? (
              <>
                <div className={'record-area ' + (recorder.recording ? 'recording' : '')}>
                  <div className="record-wave" aria-hidden="true">
                    {[12, 22, 16, 36, 48, 28, 40, 20, 50, 34, 24, 42, 18, 30, 12].map((h, i) => (
                      <i key={i} style={{ height: h, animationDelay: `${i * 0.07}s` }} />
                    ))}
                  </div>
                  <button
                    className="record-button"
                    aria-label={recorder.recording ? '停止录音' : '开始录音'}
                    disabled={!!busy || preparingRecording}
                    onClick={recorder.recording ? recorder.stop : beginRecording}
                  >
                    {recorder.recording ? (
                      <Square size={24} fill="currentColor" />
                    ) : (
                      <Mic size={28} />
                    )}
                  </button>
                  <div className="record-time">
                    {Math.floor(recorder.seconds / 60)
                      .toString()
                      .padStart(2, '0')}
                    :{(recorder.seconds % 60).toString().padStart(2, '0')}
                  </div>
                  <p>
                    {recorder.recording ? '点击停止 · 最长 5 分钟' : '点击麦克风开始 · 最长 5 分钟'}
                  </p>
                </div>
                {recorder.error && (
                  <p className="error-message" role="alert">
                    {recorder.error}
                  </p>
                )}
                {audioUrl && (
                  <div className="audio-result">
                    <audio controls src={audioUrl} aria-label="我的录音" />
                    <div className="action-row">
                      <button
                        className="btn btn-secondary btn-sm"
                        disabled={
                          !health?.asrConfigured ||
                          !!busy ||
                          preparingRecording ||
                          recorder.recording
                        }
                        onClick={transcribe}
                      >
                        {busy === 'asr' ? (
                          <LoaderCircle size={14} className="spin" />
                        ) : (
                          <FileText size={14} />
                        )}
                        转成文字
                      </button>
                      <a
                        href={audioUrl}
                        download={recorder.blob ? audioFileName(recorder.blob) : 'my-answer.audio'}
                        className="btn btn-ghost btn-sm"
                      >
                        <Download size={14} />
                        下载录音
                      </a>
                    </div>
                  </div>
                )}
                <div className="record-alternative">
                  <input
                    ref={audioInput}
                    type="file"
                    hidden
                    accept=".wav,.webm,.mp3,.m4a,.mp4,.ogg,.oga,.flac,audio/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (!file || busy || preparingRecording || recorder.recording) return;
                      if (file.size > 10 * 1024 * 1024) {
                        setError('录音文件请控制在10MB以内。');
                        return;
                      }
                      if (!supportsAudioUpload(file)) {
                        setError(
                          '请上传WAV、WebM、MP3、M4A、OGG或FLAC音频。文件类型仍会由服务端检查。',
                        );
                        return;
                      }
                      if (!confirmAudioReplacement()) return;
                      clearAnswerForNewAudio();
                      recorder.setBlob(file);
                      recorder.setSeconds(0);
                      notify('新录音已载入，旧文字已清空。请转写或填写这次录音的回答。');
                    }}
                  />
                  <button
                    className="text-button"
                    disabled={!!busy || preparingRecording || recorder.recording}
                    onClick={() => audioInput.current?.click()}
                  >
                    <Upload size={14} />
                    上传已有录音
                  </button>
                  <span>录音默认仅保留在本页；下方可选择随练习保存。</span>
                </div>
                {!health?.asrConfigured && (
                  <p className="inline-info">
                    <Info size={15} />
                    语音转写尚未配置。可以先录音回听，再切换“文字”填写回答。
                  </p>
                )}
              </>
            ) : (
              <label className="field answer-field">
                <span>
                  你的回答 <small>可自行修正识别错误</small>
                </span>
                <textarea
                  className="textarea english"
                  placeholder={
                    project || baseKind === 'reverse'
                      ? '可以先用中文写出你的真实要点，也可以直接用英语回答。'
                      : 'Start with the key idea. Then explain your reasoning…'
                  }
                  value={answer}
                  maxLength={15000}
                  rows={7}
                  disabled={!!busy || preparingRecording}
                  onChange={(e) => {
                    setAnswer(e.target.value);
                    setFeedback(null);
                    feedbackFor.current = null;
                    setSaved(false);
                  }}
                />
                <span className="input-meta">
                  草稿保留在当前浏览器会话 · {answer.trim().split(/\s+/).filter(Boolean).length}{' '}
                  words
                </span>
              </label>
            )}
            {answer && tab === 'record' && (
              <button className="transcript-peek" onClick={() => setTab('text')}>
                <FileText size={15} />
                <span>
                  {answer.slice(0, 90)}
                  {answer.length > 90 ? '…' : ''}
                </span>
                <ChevronRight size={15} />
              </button>
            )}
            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
            {recorder.blob && (
              <div className="stack">
                <label className="fact-row" htmlFor="save-practice-audio">
                  <input
                    id="save-practice-audio"
                    type="checkbox"
                    checked={keepAudio}
                    disabled={!!busy || preparingRecording || recorder.recording || saved}
                    onChange={(event) => {
                      setKeepAudio(event.target.checked);
                      setAudioSaveFailure(null);
                    }}
                  />
                  <span>把这次录音保存在此浏览器，之后可在练习记录中回放</span>
                </label>
                <p className="small muted">
                  默认不保存录音。
                  {keepAudio
                    ? '勾选后，没有转写文字也能保存自主练习；这不会产生发音分数。'
                    : '未保存的录音会在离开本页后清除，请先下载需要保留的内容。'}
                </p>
                {saved && (
                  <p className="inline-info">
                    <CheckCircle2 size={15} />
                    {savedWithAudio
                      ? '这次录音已经随练习保存。'
                      : '本次仅保存了文字，录音未加入练习记录。'}
                  </p>
                )}
              </div>
            )}
            {audioSaveFailure && (
              <div className="stack">
                <p className="error-message" role="alert">
                  {audioSaveFailure.message}
                </p>
                <div className="action-row">
                  <button
                    className="btn btn-secondary"
                    disabled={!!busy || preparingRecording || recorder.recording}
                    onClick={() => void save(audioSaveFailure.selfReview)}
                  >
                    <RefreshCw size={15} />
                    重试录音保存
                  </button>
                  <button
                    className="btn btn-ghost"
                    disabled={!!busy || !answer.trim() || preparingRecording || recorder.recording}
                    onClick={() => void save(audioSaveFailure.selfReview, true)}
                  >
                    仅保存文字
                  </button>
                </div>
                {!answer.trim() && (
                  <p className="small muted">
                    当前没有文字回答，暂时无法仅保存文字；可以重试，或先下载录音。
                  </p>
                )}
              </div>
            )}
            <div className="response-actions">
              <button
                className="btn btn-primary"
                disabled={
                  !!busy ||
                  preparingRecording ||
                  answer.trim().length < 10 ||
                  !health?.configured ||
                  recorder.recording
                }
                onClick={analyze}
              >
                {busy === 'feedback' ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  <Sparkles size={16} />
                )}
                获取内容反馈
              </button>
              <button
                className="btn btn-secondary"
                disabled={
                  (!answer.trim() && !(keepAudio && recorder.blob)) ||
                  saved ||
                  !!busy ||
                  preparingRecording ||
                  recorder.recording
                }
                onClick={() => save(true)}
              >
                <Save size={16} />
                {busy === 'saving' ? '正在保存…' : saved ? '已保存' : '保存自主练习'}
              </button>
            </div>
            <p className="footnote">
              {health?.configured
                ? 'AI评估回答内容与结构。发音评测尚未接入，不生成发音分数。'
                : 'AI教练尚未连接。你可以自由跟读、录音与保存，或到设置查看接入说明。'}
            </p>
          </section>
          {feedback && (
            <section className="card feedback-card">
              <div className="card-header">
                <div>
                  <div className="eyebrow">MAKE THE NEXT TAKE BETTER</div>
                  <h2>{simulation ? '本题反馈已准备好。' : '这一次，先改好一个地方。'}</h2>
                </div>
                <span className="badge badge-teal">内容反馈</span>
              </div>
              {simulation ? (
                <p className="feedback-summary">
                  内容分析已完成。保存后继续下一题，结束这一轮后再统一查看反馈。
                </p>
              ) : (
                <>
                  <p className="feedback-summary">{feedback.summary}</p>
                  <div className="feedback-columns">
                    <div>
                      <h3>
                        <CheckCircle2 size={17} />
                        值得保留
                      </h3>
                      {feedback.strengths.map((s, i) => (
                        <p key={i}>{s}</p>
                      ))}
                    </div>
                    <div>
                      <h3>
                        <TargetIcon />
                        下一次这样改
                      </h3>
                      {feedback.improvements.map((s, i) => (
                        <div className="improvement" key={i}>
                          <strong>{s.title}</strong>
                          {s.quote && <blockquote>{s.quote}</blockquote>}
                          <p>{s.detail}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
              {!simulation && (
                <details
                  onToggle={(e) => {
                    if (e.currentTarget.open) setAssisted(true);
                  }}
                >
                  <summary>参考表达 · 保留你的真实意思</summary>
                  <p className="english reference-text">{feedback.referenceAnswer}</p>
                  <button className="text-button" onClick={() => speak(feedback.referenceAnswer)}>
                    <Volume2 size={15} />
                    听一遍
                  </button>
                  <p className="small muted">
                    核对个人事实、指标和技术准确性后再练习。先保存本次反馈，再将这段表达载入逐句跟读；使用稿件会记录为有辅助。
                  </p>
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={!saved || !!busy || preparingRecording || recorder.recording}
                    onClick={useReferenceDraft}
                  >
                    <Headphones size={15} />
                    用这段表达练习
                  </button>
                </details>
              )}
              <div className="action-row">
                <button
                  className="btn btn-primary"
                  disabled={saved || !!busy || preparingRecording || recorder.recording}
                  onClick={() => save(false)}
                >
                  <Check size={16} />
                  {saved ? '已保存本次反馈' : '保存反馈与回答'}
                </button>
                {!simulation && (
                  <button
                    className="btn btn-secondary"
                    disabled={!saved || !!busy || preparingRecording || recorder.recording}
                    onClick={askFollowup}
                  >
                    挑战一个新追问
                    <ArrowRight size={15} />
                  </button>
                )}
              </div>
              <p className="footnote">模型：{feedback.model} · 这是学习建议，不代表面试通过率。</p>
            </section>
          )}
          {!simulation && practiceReference && mode !== 'read' && (
            <div className="reference-panel">
              <button
                className="text-button"
                onClick={() => {
                  setShowReference((s) => !s);
                  setAssisted(true);
                }}
              >
                <BookIcon />
                {showReference ? '收起参考表达' : '卡住了？看一眼参考表达'}
                <ChevronRight size={15} />
              </button>
              {showReference && (
                <>
                  <p className="english reference-text">{practiceReference}</p>
                  <p className="small muted">本次回答将记录为使用过辅助，不计为独立回答。</p>
                  <button className="text-button" onClick={() => speak(practiceReference)}>
                    <Volume2 size={14} />
                    听参考表达
                  </button>
                </>
              )}
            </div>
          )}
          {simulation && (
            <div className="simulation-next">
              <span>本轮使用录音或文字回答，实时语音通话将在后续版本开放。</span>
              <button className="btn btn-dark" disabled={!saved} onClick={onNext}>
                {simulationIndex === simulationCount - 1 ? '结束并查看记录' : '下一题'}
                <ArrowRight size={16} />
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
function TargetIcon() {
  return <MessageCircle size={17} />;
}
function BookIcon() {
  return <FileText size={15} />;
}
