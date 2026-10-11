import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { IDBObjectStore } from 'fake-indexeddb';
import { beforeEach, test } from 'node:test';
import {
  MAX_AUDIO_BYTES,
  MAX_TOTAL_AUDIO_BYTES,
  clearAudio,
  deleteAudio,
  getAudio,
  getAudioUsage,
  pruneAudio,
  saveAudio,
} from '../src/lib/audioStore';

const MiB = 1024 * 1024;

function sizedAudio(bytes: number, fill = 0): Blob {
  return new Blob([new Uint8Array(bytes).fill(fill)], { type: 'audio/webm' });
}

function wavFixture(): Uint8Array<ArrayBuffer> {
  // A valid four-sample, mono, 16-bit PCM WAV, including signed sample values.
  const bytes = new Uint8Array(52);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) =>
    bytes.set(new TextEncoder().encode(value), offset);
  text(0, 'RIFF');
  view.setUint32(4, 44, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, 8, true);
  [0, 1234, -2345, 32767].forEach((sample, i) => view.setInt16(44 + i * 2, sample, true));
  return bytes;
}

async function fillWithTenMiBRecords(count: number): Promise<void> {
  const blob = sizedAudio(10 * MiB);
  for (let index = 0; index < count; index++) {
    await saveAudio(`existing-${index}`, blob, `existing-${index}.webm`);
  }
}

beforeEach(async () => {
  await clearAudio();
});

test('audio storage preserves actual binary data, MIME type, filename, and metadata', async () => {
  assert.equal(MAX_AUDIO_BYTES, 10 * MiB);
  assert.equal(MAX_TOTAL_AUDIO_BYTES, 100 * MiB);
  assert.equal(await getAudio('not-recorded'), null);
  const original = wavFixture();
  const blob = new Blob([original], { type: 'audio/wav' });
  const saved = await saveAudio('intro-recording', blob, '自我介绍.wav');
  assert.equal(saved.key, 'intro-recording');
  const record = await getAudio('intro-recording');
  assert.ok(record);
  assert.equal(record.key, 'intro-recording');
  assert.equal(record.fileName, '自我介绍.wav');
  assert.equal(record.bytes, original.byteLength);
  assert.equal(record.mimeType, 'audio/wav');
  assert.equal(record.blob.type, 'audio/wav');
  assert.equal(record.blob.size, original.byteLength);
  assert.ok(Number.isFinite(new Date(record.createdAt).getTime()));
  assert.deepEqual(new Uint8Array(await record.blob.arrayBuffer()), original);
  assert.deepEqual(await getAudioUsage(), { bytes: original.byteLength, count: 1 });
});

test('delete, prune, and clear remove only intended recordings and update usage', async () => {
  await saveAudio('first', sizedAudio(3), 'first.webm');
  await saveAudio('second', sizedAudio(7), 'second.webm');
  assert.deepEqual(await getAudioUsage(), { bytes: 10, count: 2 });
  await deleteAudio('first');
  assert.equal(await getAudio('first'), null);
  assert.ok(await getAudio('second'));
  assert.deepEqual(await getAudioUsage(), { bytes: 7, count: 1 });
  await deleteAudio('first');
  assert.deepEqual(await getAudioUsage(), { bytes: 7, count: 1 });
  await saveAudio('orphan', sizedAudio(11), 'orphan.webm');
  assert.equal(await pruneAudio(['second', 'already-deleted']), 1);
  assert.equal(await getAudio('orphan'), null);
  assert.ok(await getAudio('second'), 'pruning must preserve retained audio');
  assert.deepEqual(await getAudioUsage(), { bytes: 7, count: 1 });
  await clearAudio();
  assert.equal(await getAudio('second'), null);
  assert.deepEqual(await getAudioUsage(), { bytes: 0, count: 0 });
});

test('an oversized replacement is rejected without destroying the old recording', async () => {
  const original = wavFixture();
  await saveAudio('replace-me', new Blob([original], { type: 'audio/wav' }), 'old.wav');
  await assert.rejects(saveAudio('replace-me', sizedAudio(MAX_AUDIO_BYTES + 1), 'too-large.webm'));
  const record = await getAudio('replace-me');
  assert.ok(record);
  assert.equal(record.fileName, 'old.wav');
  assert.equal(record.mimeType, 'audio/wav');
  assert.deepEqual(new Uint8Array(await record.blob.arrayBuffer()), original);
  assert.deepEqual(await getAudioUsage(), { bytes: original.byteLength, count: 1 });
});

test('an aborted write transaction rejects and preserves the prior committed recording', async (t) => {
  const original = wavFixture();
  await saveAudio(
    'transaction-failure',
    new Blob([original], { type: 'audio/wav' }),
    'committed.wav',
  );
  const put = IDBObjectStore.prototype.put;
  const injectedFailure = t.mock.method(
    IDBObjectStore.prototype,
    'put',
    function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      const request = key === undefined ? put.call(this, value) : put.call(this, value, key);
      // Abort after enqueueing the write: the application must await transaction commit.
      this.transaction.abort();
      return request;
    },
  );
  try {
    await assert.rejects(saveAudio('transaction-failure', sizedAudio(100, 17), 'uncommitted.webm'));
    assert.ok(injectedFailure.mock.callCount() > 0, 'the write failure must actually be injected');
  } finally {
    injectedFailure.mock.restore();
  }
  const record = await getAudio('transaction-failure');
  assert.ok(record);
  assert.equal(record.fileName, 'committed.wav');
  assert.deepEqual(new Uint8Array(await record.blob.arrayBuffer()), original);
  assert.deepEqual(await getAudioUsage(), { bytes: original.byteLength, count: 1 });
});

test('quota checks charge only the net change when replacing the same key', async () => {
  await fillWithTenMiBRecords(9);
  await saveAudio('replace-at-capacity', sizedAudio(MAX_AUDIO_BYTES), 'original.webm');
  assert.deepEqual(await getAudioUsage(), { bytes: MAX_TOTAL_AUDIO_BYTES, count: 10 });
  await saveAudio('replace-at-capacity', sizedAudio(MAX_AUDIO_BYTES, 1), 'same-size.webm');
  assert.equal((await getAudio('replace-at-capacity'))?.fileName, 'same-size.webm');
  assert.deepEqual(await getAudioUsage(), { bytes: MAX_TOTAL_AUDIO_BYTES, count: 10 });
  await saveAudio('replace-at-capacity', sizedAudio(MiB), 'smaller.webm');
  assert.deepEqual(await getAudioUsage(), { bytes: 91 * MiB, count: 10 });
  await saveAudio('replace-at-capacity', sizedAudio(MAX_AUDIO_BYTES), 'larger-again.webm');
  await assert.rejects(saveAudio('one-byte-over', sizedAudio(1), 'overflow.webm'));
  assert.equal(await getAudio('one-byte-over'), null);
  assert.equal((await getAudio('replace-at-capacity'))?.fileName, 'larger-again.webm');
  assert.deepEqual(await getAudioUsage(), { bytes: MAX_TOTAL_AUDIO_BYTES, count: 10 });
});

test('concurrent saves cannot both consume the same remaining quota', async () => {
  await fillWithTenMiBRecords(9);
  await saveAudio('five-megabytes', sizedAudio(5 * MiB), 'five.webm');
  const results = await Promise.allSettled([
    saveAudio('concurrent-a', sizedAudio(4 * MiB), 'a.webm'),
    saveAudio('concurrent-b', sizedAudio(4 * MiB), 'b.webm'),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  const records = await Promise.all([getAudio('concurrent-a'), getAudio('concurrent-b')]);
  assert.equal(records.filter(Boolean).length, 1, 'rejected writes must not leave an extra record');
  assert.deepEqual(await getAudioUsage(), { bytes: 99 * MiB, count: 11 });
});

test('missing IndexedDB raises a clear error instead of pretending to save audio', async () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  assert.ok(originalDescriptor);
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    writable: true,
    value: undefined,
  });
  try {
    await assert.rejects(saveAudio('unsupported', sizedAudio(3), 'unsupported.webm'), (error) => {
      assert.ok(error instanceof Error);
      assert.ok(error.message.trim().length > 0, 'report the storage failure to the caller');
      return true;
    });
  } finally {
    Object.defineProperty(globalThis, 'indexedDB', originalDescriptor);
  }
  assert.equal(await getAudio('unsupported'), null);
  assert.deepEqual(await getAudioUsage(), { bytes: 0, count: 0 });
});
