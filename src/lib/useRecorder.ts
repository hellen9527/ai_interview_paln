import { useState, useRef, useEffect, useCallback } from 'react';
export function useRecorder() {
  const [recording, setRecording] = useState(false),
    [seconds, setSeconds] = useState(0),
    [blob, setBlob] = useState<Blob | null>(null),
    [error, setError] = useState('');
  const rec = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    active = useRef(true),
    starting = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      rec.current?.state === 'recording' && rec.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  const stop = useCallback(() => {
    if (rec.current && rec.current.state !== 'inactive') rec.current.stop();
    stream.current?.getTracks().forEach((t) => t.stop());
    setRecording(false);
  }, []);
  useEffect(() => {
    if (!recording) return;
    const id = setInterval(
      () =>
        setSeconds((s) => {
          if (s >= 299) {
            stop();
            return 300;
          }
          return s + 1;
        }),
      1000,
    );
    return () => clearInterval(id);
  }, [recording, stop]);
  const start = async () => {
    if (starting.current || recording) return;
    starting.current = true;
    setError('');
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
        throw Error('浏览器暂不支持录音，请使用 HTTPS 或 localhost，也可以上传录音。');
      const media = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      if (!active.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((m) =>
        MediaRecorder.isTypeSupported(m),
      );
      const recorder = new MediaRecorder(media, mime ? { mimeType: mime } : undefined);
      rec.current = recorder;
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      recorder.onstop = () => {
        media.getTracks().forEach((t) => t.stop());
        if (active.current) {
          setBlob(new Blob(chunks, { type: recorder.mimeType }));
          setRecording(false);
        }
      };
      recorder.onerror = () => {
        if (active.current) {
          setError('录音意外中断，请检查麦克风后重试。');
          setRecording(false);
        }
        media.getTracks().forEach((t) => t.stop());
      };
      setBlob(null);
      setSeconds(0);
      setRecording(true);
      recorder.start(1000);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.name === 'NotAllowedError'
            ? '麦克风权限未开启。请在浏览器设置中允许访问，或上传录音。'
            : e.message
          : '录音失败',
      );
    } finally {
      starting.current = false;
    }
  };
  return { recording, seconds, blob, error, start, stop, setBlob, setSeconds };
}
