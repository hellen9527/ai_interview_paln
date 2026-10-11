import type { AudioAttachment } from '../types';

export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
export const MAX_TOTAL_AUDIO_BYTES = 100 * 1024 * 1024;
const DB_NAME = 'interview-pal-audio';
const STORE = 'recordings';
export interface StoredAudio extends AudioAttachment {
  blob: Blob;
  createdAt: string;
}
export class AudioStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AudioStorageError';
  }
}
function storageError(reason?: DOMException | null): AudioStorageError {
  return new AudioStorageError(
    reason?.name === 'QuotaExceededError'
      ? '浏览器可用空间不足，录音没有保存。请下载录音，或到设置清理旧录音后重试。'
      : '本机录音存储不可用，录音没有保存或删除。请保留本页录音并下载，稍后重试。',
  );
}
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new AudioStorageError('当前浏览器不支持本机录音存储，请下载录音保存。'));
      return;
    }
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, 1);
    } catch {
      reject(storageError());
      return;
    }
    let rejected = false;
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE))
        request.result.createObjectStore(STORE, { keyPath: 'key' });
    };
    request.onerror = () => reject(storageError(request.error));
    request.onblocked = () => {
      rejected = true;
      reject(
        new AudioStorageError('录音库正被另一个页面占用，请关闭其他 Interview Pal 页面后重试。'),
      );
    };
    request.onsuccess = () => {
      if (rejected) {
        request.result.close();
        return;
      }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}
function transaction<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore, result: (value: T) => void, fail: (error: Error) => void) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let tx: IDBTransaction;
    let value: T;
    let failure: Error | undefined;
    try {
      tx = db.transaction(STORE, mode);
    } catch {
      db.close();
      reject(storageError());
      return;
    }
    const fail = (error: Error) => {
      failure = error;
      try {
        tx.abort();
      } catch {
        db.close();
        reject(error);
      }
    };
    tx.oncomplete = () => {
      db.close();
      resolve(value);
    };
    tx.onabort = () => {
      db.close();
      reject(failure ?? storageError(tx.error));
    };
    tx.onerror = () => {
      failure ??= storageError(tx.error);
    };
    try {
      run(
        tx.objectStore(STORE),
        (next) => {
          value = next;
        },
        fail,
      );
    } catch {
      fail(storageError());
    }
  });
}
export async function saveAudio(
  key: string,
  blob: Blob,
  fileName: string,
): Promise<AudioAttachment> {
  if (!key || key.length > 1000) throw new AudioStorageError('录音记录标识无效。');
  if (!(blob instanceof Blob) || blob.size === 0)
    throw new AudioStorageError('录音为空，无法保存。');
  if (blob.size > MAX_AUDIO_BYTES)
    throw new AudioStorageError('单条录音不能超过10MB，请先下载或缩短后再保存。');
  const cleanName = (fileName || 'my-answer.audio')
    .replace(/[\\/\u0000-\u001f\u007f]/g, '_')
    .slice(0, 180);
  const attachment: AudioAttachment = {
    key,
    bytes: blob.size,
    mimeType: blob.type || 'application/octet-stream',
    fileName: cleanName,
  };
  const record: StoredAudio = { ...attachment, blob, createdAt: new Date().toISOString() };
  const db = await openDatabase();
  return transaction<AudioAttachment>(db, 'readwrite', (store, result, fail) => {
    // This read and the subsequent write share one transaction. Concurrent tabs cannot
    // both consume the last quota, and replacement is charged only its net size.
    let used = 0;
    const cursor = store.openCursor();
    cursor.onsuccess = () => {
      const current = cursor.result;
      if (current) {
        if (current.key !== key) used += (current.value as StoredAudio).blob.size;
        current.continue();
      } else {
        if (used + blob.size > MAX_TOTAL_AUDIO_BYTES) {
          fail(
            new AudioStorageError(
              '本机录音已达到100MB上限。请到设置删除旧录音，或选择仅保存文字。',
            ),
          );
          return;
        }
        store.put(record);
        result(attachment);
      }
    };
  });
}
export async function getAudio(key: string): Promise<StoredAudio | null> {
  const db = await openDatabase();
  return transaction<StoredAudio | null>(db, 'readonly', (store, result) => {
    const req = store.get(key);
    req.onsuccess = () => result(req.result ?? null);
  });
}
export async function deleteAudio(key: string): Promise<void> {
  const db = await openDatabase();
  return transaction<void>(db, 'readwrite', (store, result) => {
    store.delete(key);
    result(undefined);
  });
}
export async function clearAudio(): Promise<void> {
  const db = await openDatabase();
  return transaction<void>(db, 'readwrite', (store, result) => {
    store.clear();
    result(undefined);
  });
}
export async function getAudioUsage(): Promise<{ bytes: number; count: number }> {
  const db = await openDatabase();
  return transaction(db, 'readonly', (store, result) => {
    let bytes = 0,
      count = 0;
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        bytes += (cursor.value as StoredAudio).blob.size;
        count++;
        cursor.continue();
      } else result({ bytes, count });
    };
  });
}
export async function pruneAudio(retainKeys: string[]): Promise<number> {
  const retained = new Set(retainKeys);
  const db = await openDatabase();
  return transaction(db, 'readwrite', (store, result) => {
    let removed = 0;
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        if (!retained.has(String(cursor.key))) {
          cursor.delete();
          removed++;
        }
        cursor.continue();
      } else result(removed);
    };
  });
}
export async function listAudioMetadata(): Promise<AudioAttachment[]> {
  const db = await openDatabase();
  return transaction(db, 'readonly', (store, result) => {
    const records: AudioAttachment[] = [];
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        const { key, bytes, mimeType, fileName } = cursor.value as StoredAudio;
        records.push({ key, bytes, mimeType, fileName });
        cursor.continue();
      } else result(records);
    };
  });
}
