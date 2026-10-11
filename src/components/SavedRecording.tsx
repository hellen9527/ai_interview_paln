import { useEffect, useState } from 'react';
import { AudioLines, Download, LoaderCircle, RefreshCw, Trash2 } from 'lucide-react';
import type { AudioAttachment } from '../types';
import { getAudio } from '../lib/audioStore';

type Playback = {
  status: 'loading' | 'ready' | 'missing' | 'error';
  url?: string;
  fileName?: string;
  message?: string;
};
export default function SavedRecording({
  audio,
  onRemove,
  removing = false,
}: {
  audio: AudioAttachment;
  onRemove: () => void;
  removing?: boolean;
}) {
  const [playback, setPlayback] = useState<Playback>({ status: 'loading' }),
    [retry, setRetry] = useState(0);
  const [mediaError, setMediaError] = useState(false);
  useEffect(() => {
    let active = true,
      url = '';
    setPlayback({ status: 'loading' });
    setMediaError(false);
    void getAudio(audio.key)
      .then((record) => {
        if (!active) return;
        if (!record) {
          setPlayback({ status: 'missing' });
          return;
        }
        if (record.bytes !== audio.bytes || record.mimeType !== audio.mimeType) {
          setPlayback({
            status: 'error',
            message: '本机录音与这条记录不一致，请使用你下载的原文件。',
          });
          return;
        }
        url = URL.createObjectURL(record.blob);
        setPlayback({ status: 'ready', url, fileName: record.fileName });
      })
      .catch((error) => {
        if (active)
          setPlayback({
            status: 'error',
            message: error instanceof Error ? error.message : '无法读取本机录音，请稍后重试。',
          });
      });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [audio.key, audio.bytes, audio.mimeType, retry]);
  return (
    <section className="saved-recording" aria-label="本次录音">
      <div className="row-between">
        <h3>
          <AudioLines size={18} />
          听听当时的表达
        </h3>
        <span className="badge badge-teal">仅此浏览器</span>
      </div>
      {playback.status === 'loading' && (
        <p className="inline-info" role="status">
          <LoaderCircle size={16} className="spin" />
          正在读取本机录音…
        </p>
      )}
      {playback.status === 'ready' && (
        <>
          <audio
            src={playback.url}
            controls
            aria-label="已保存的练习录音"
            onError={() => setMediaError(true)}
          />
          {mediaError && (
            <p className="error-message">
              当前浏览器无法播放这个格式，可以下载后使用本机播放器打开。
            </p>
          )}
          <div className="row-between">
            <span className="small muted">
              {(audio.bytes / 1024 / 1024).toFixed(2)} MB · 未上传云端
            </span>
            <a
              className="btn btn-secondary btn-sm"
              href={playback.url}
              download={playback.fileName}
            >
              <Download size={14} />
              下载录音
            </a>
          </div>
        </>
      )}
      {playback.status === 'missing' && (
        <p className="inline-info">
          没有找到这条录音。可能在另一台设备录制，或已被浏览器清理。JSON备份只包含文字和录音引用，无法恢复音频文件。
        </p>
      )}
      {playback.status === 'error' && (
        <p className="error-message" role="alert">
          {playback.message}
        </p>
      )}
      <div className="action-row">
        {['missing', 'error'].includes(playback.status) && (
          <button className="text-button" onClick={() => setRetry((n) => n + 1)}>
            <RefreshCw size={13} />
            重新读取
          </button>
        )}
        <button
          className="text-button danger"
          disabled={removing || playback.status === 'loading'}
          onClick={onRemove}
        >
          <Trash2 size={13} />
          {removing
            ? '正在删除…'
            : playback.status === 'missing'
              ? '移除失效引用'
              : '删除这条录音，保留文字'}
        </button>
      </div>
    </section>
  );
}
