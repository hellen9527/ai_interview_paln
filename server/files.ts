import mammoth from 'mammoth';
import { createRequire } from 'node:module';
import { ApiError } from './errors.js';

// pdf-parse 1.1.1's package entry executes a debug fixture when loaded by ESM.
// Use its pinned implementation directly, without that unrelated filesystem side effect.
const pdf = createRequire(import.meta.url)('pdf-parse/lib/pdf-parse.js') as (
  buffer: Uint8Array,
  options?: { max?: number },
) => Promise<{ text: string; numpages: number }>;

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_RESUME_CHARS = 50_000;

export function safeFileName(name: string): string {
  return (
    name
      .split(/[\\/]/)
      .at(-1)
      ?.replace(/[\u0000-\u001f\u007f]/g, '')
      .slice(0, 160) || 'upload'
  );
}

/** Bound common DOCX zip-bomb vectors before any decompression. ZIP64 is deliberately unsupported. */
function inspectDocx(buffer: Buffer) {
  let eocd = -1;
  for (let p = buffer.length - 22; p >= Math.max(0, buffer.length - 65_557); p--) {
    if (buffer.readUInt32LE(p) === 0x06054b50) {
      eocd = p;
      break;
    }
  }
  if (eocd < 0) throw new ApiError(422, 'INVALID_DOCX', 'DOCX文件不完整或格式无效。');
  const count = buffer.readUInt16LE(eocd + 10);
  const size = buffer.readUInt32LE(eocd + 12);
  let offset = buffer.readUInt32LE(eocd + 16);
  if (
    !count ||
    count > 1_000 ||
    size === 0xffffffff ||
    offset === 0xffffffff ||
    offset + size > eocd
  ) {
    throw new ApiError(422, 'DOCX_TOO_COMPLEX', 'DOCX文件结构过于复杂，请导出为文本或普通PDF。');
  }
  let expanded = 0;
  let hasDocument = false;
  for (let i = 0; i < count; i++) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new ApiError(422, 'INVALID_DOCX', 'DOCX目录无效，请重新导出文件。');
    }
    const flags = buffer.readUInt16LE(offset + 8);
    const unpacked = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const end = offset + 46 + nameLength + extraLength + commentLength;
    expanded += unpacked;
    if (
      flags & 1 ||
      unpacked === 0xffffffff ||
      expanded > 25 * 1024 * 1024 ||
      end > buffer.length
    ) {
      throw new ApiError(422, 'DOCX_TOO_COMPLEX', 'DOCX展开后过大或已加密，请导出为文本。');
    }
    hasDocument ||=
      buffer.toString('utf8', offset + 46, offset + 46 + nameLength) === 'word/document.xml';
    offset = end;
  }
  if (!hasDocument) throw new ApiError(422, 'INVALID_DOCX', '文件不是有效的Word DOCX文档。');
}

export async function extractResume(
  file: Express.Multer.File,
): Promise<{ text: string; fileName: string }> {
  const fileName = safeFileName(file.originalname);
  const extension = fileName.split('.').at(-1)?.toLowerCase();
  if (!['txt', 'pdf', 'docx'].includes(extension || '')) {
    throw new ApiError(415, 'UNSUPPORTED_FILE_TYPE', '简历仅支持TXT、PDF和DOCX文件，最大10MB。');
  }
  if (!file.size) throw new ApiError(422, 'EMPTY_FILE', '文件为空，请选择有内容的简历。');
  let text: string;
  try {
    if (extension === 'txt') {
      text = new TextDecoder('utf-8', { fatal: true }).decode(file.buffer);
      if (text.includes('\0'))
        throw new ApiError(422, 'INVALID_TEXT', 'TXT文件包含二进制内容，请保存为UTF-8纯文本。');
    } else if (extension === 'pdf') {
      if (!file.buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
        throw new ApiError(422, 'INVALID_PDF', '文件内容与PDF扩展名不符。');
      }
      // Give PDF.js a dedicated typed array; Node's pooled Buffer can expose an unrelated byte offset.
      const result = await pdf(new Uint8Array(file.buffer), { max: 100 });
      if (result.numpages > 100)
        throw new ApiError(422, 'RESUME_TOO_LONG', '简历超过100页，请上传精简版本。');
      text = result.text;
    } else {
      inspectDocx(file.buffer);
      text = (await mammoth.extractRawText({ buffer: file.buffer })).value;
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      422,
      'RESUME_PARSE_FAILED',
      '无法读取文件。请检查文件是否损坏、加密，或改用UTF-8 TXT / DOCX文件。',
    );
  }
  text = text
    .replace(/\r\n/g, '\n')
    .replace(/\u0000/g, '')
    .trim();
  if (!text)
    throw new ApiError(
      422,
      'RESUME_NO_TEXT',
      '未提取到文字。扫描版PDF暂不支持OCR，请粘贴简历文字或上传可复制文字的文件。',
    );
  if (text.length > MAX_RESUME_CHARS)
    throw new ApiError(422, 'RESUME_TOO_LONG', '提取的简历文字超过50,000字符，请精简后上传。');
  return { text, fileName };
}

export function validateAudio(file: Express.Multer.File): { fileName: string; mimeType: string } {
  const b = file.buffer;
  if (!b.length) throw new ApiError(422, 'EMPTY_AUDIO', '录音为空，请重新录制。');
  // Check a container signature, not merely a browser-supplied MIME type or extension.
  if (
    b.length >= 12 &&
    b.toString('ascii', 0, 4) === 'RIFF' &&
    b.toString('ascii', 8, 12) === 'WAVE'
  )
    return { fileName: 'recording.wav', mimeType: 'audio/wav' };
  if (b.length >= 4 && b.readUInt32BE(0) === 0x1a45dfa3)
    return { fileName: 'recording.webm', mimeType: 'audio/webm' };
  if (b.length >= 4 && b.toString('ascii', 0, 4) === 'OggS')
    return { fileName: 'recording.ogg', mimeType: 'audio/ogg' };
  if (b.length >= 4 && b.toString('ascii', 0, 4) === 'fLaC')
    return { fileName: 'recording.flac', mimeType: 'audio/flac' };
  if (b.length >= 12 && b.toString('ascii', 4, 8) === 'ftyp')
    return { fileName: 'recording.m4a', mimeType: 'audio/mp4' };
  if (
    b.length >= 3 &&
    (b.toString('ascii', 0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0))
  )
    return { fileName: 'recording.mp3', mimeType: 'audio/mpeg' };
  throw new ApiError(
    415,
    'UNSUPPORTED_AUDIO_TYPE',
    '请上传有效的WAV、WebM、MP3、M4A、OGG或FLAC录音。',
  );
}
