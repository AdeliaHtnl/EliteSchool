/**
 * Single source of truth for upload limits and allowed video types.
 */
const MAX_VIDEO_SIZE_MB = Math.max(1, Number(process.env.MAX_VIDEO_SIZE_MB || 5120) || 5120);
const MAX_VIDEO_SIZE_BYTES = MAX_VIDEO_SIZE_MB * 1024 * 1024;
/** Multipart chunk size (R2/S3 min 5 MiB except last part) */
const MULTIPART_PART_SIZE = 16 * 1024 * 1024;
/** Retellings / small media via Express (not 5GB through API body) */
const MAX_RETELL_UPLOAD_BYTES = Math.min(
  MAX_VIDEO_SIZE_BYTES,
  Number(process.env.MAX_RETELL_UPLOAD_MB || 400) * 1024 * 1024 || 400 * 1024 * 1024
);
/** Neon base64 fallback only for small files when R2 missing (dev) */
const MAX_INLINE_FALLBACK_BYTES = Math.min(
  40 * 1024 * 1024,
  MAX_RETELL_UPLOAD_BYTES
);

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.webm', '.mkv', '.avi']);
const VIDEO_MIME = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-matroska',
  'video/avi',
  'video/x-msvideo',
  'video/ogg',
]);
const PDF_EXTENSIONS = new Set(['.pdf']);
const PDF_MIME = new Set(['application/pdf']);
const DANGEROUS_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.sh', '.php', '.js', '.mjs', '.cjs', '.html', '.htm',
  '.svg', '.xml', '.jar', '.msi', '.ps1', '.vbs', '.scr', '.com', '.dll',
]);

function extOf(name) {
  const m = String(name || '').toLowerCase().match(/(\.[a-z0-9]{1,8})$/);
  return m ? m[1] : '';
}

function mimeBase(m) {
  return String(m || '').split(';')[0].trim().toLowerCase();
}

function assertSafeFilename(originalName) {
  const ext = extOf(originalName);
  if (DANGEROUS_EXTENSIONS.has(ext)) {
    const err = new Error('Этот тип файла запрещён.');
    err.status = 400;
    throw err;
  }
}

function isAllowedVideo(originalName, mimeType) {
  assertSafeFilename(originalName);
  const ext = extOf(originalName);
  const mime = mimeBase(mimeType);
  if (VIDEO_EXTENSIONS.has(ext)) return true;
  if (VIDEO_MIME.has(mime)) return true;
  return false;
}

function isAllowedLessonFile(originalName, mimeType) {
  assertSafeFilename(originalName);
  const ext = extOf(originalName);
  const mime = mimeBase(mimeType);
  if (PDF_EXTENSIONS.has(ext) || PDF_MIME.has(mime)) return true;
  return isAllowedVideo(originalName, mimeType);
}

function formatSizeMb(bytes) {
  return Math.round((Number(bytes) || 0) / (1024 * 1024));
}

module.exports = {
  MAX_VIDEO_SIZE_MB,
  MAX_VIDEO_SIZE_BYTES,
  MULTIPART_PART_SIZE,
  MAX_RETELL_UPLOAD_BYTES,
  MAX_INLINE_FALLBACK_BYTES,
  VIDEO_EXTENSIONS,
  VIDEO_MIME,
  PDF_EXTENSIONS,
  PDF_MIME,
  isAllowedVideo,
  isAllowedLessonFile,
  assertSafeFilename,
  extOf,
  mimeBase,
  formatSizeMb,
};
