/**
 * Cloudflare R2 (S3-compatible) media storage.
 * Large videos use multipart + presigned URLs (browser → R2 direct).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { isProduction } = require('./env');
const { MULTIPART_PART_SIZE, mimeBase } = require('./limits');

let s3 = null;

function r2Configured() {
  return Boolean(
    process.env.R2_ACCOUNT_ID
    && process.env.R2_ACCESS_KEY_ID
    && process.env.R2_SECRET_ACCESS_KEY
    && process.env.R2_BUCKET
  );
}

function getS3() {
  if (!r2Configured()) return null;
  if (s3) return s3;
  const { S3Client } = require('@aws-sdk/client-s3');
  const accountId = String(process.env.R2_ACCOUNT_ID).trim();
  s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: String(process.env.R2_ACCESS_KEY_ID).trim(),
      secretAccessKey: String(process.env.R2_SECRET_ACCESS_KEY).trim(),
    },
    // Avoid x-amz-checksum-mode on signed GETs — breaks <video src> in browsers
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  return s3;
}

function bucket() {
  return String(process.env.R2_BUCKET || '').trim();
}

function publicUrlForKey(key) {
  const base = String(process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');
  if (!base || !key) return null;
  return `${base}/${String(key).replace(/^\//, '')}`;
}

function safeExt(originalName, mimeType, fallback = '.bin') {
  const fromName = path.extname(String(originalName || '')).toLowerCase();
  if (fromName && /^\.[a-z0-9]{1,8}$/i.test(fromName) && !fromName.includes('..')) return fromName;
  const map = {
    'application/pdf': '.pdf',
    'audio/webm': '.webm',
    'video/webm': '.webm',
    'video/mp4': '.mp4',
    'audio/mp4': '.m4a',
    'audio/mpeg': '.mp3',
    'video/quicktime': '.mov',
    'video/x-matroska': '.mkv',
    'video/avi': '.avi',
    'video/x-msvideo': '.avi',
  };
  return map[mimeBase(mimeType)] || fallback;
}

function makeObjectKey(type, originalName, mimeType) {
  const t = String(type || 'misc').replace(/[^a-z0-9_-]/gi, '') || 'misc';
  const ext = safeExt(originalName, mimeType);
  return `${t}/${crypto.randomUUID()}${ext}`;
}

async function uploadBuffer({ buffer, contentType, type, originalName }) {
  if (!r2Configured()) {
    const err = new Error('R2 is not configured');
    err.status = 503;
    throw err;
  }
  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  const key = makeObjectKey(type, originalName, contentType);
  const client = getS3();
  await client.send(new PutObjectCommand({
    Bucket: bucket(),
    Key: key,
    Body: buffer,
    ContentType: contentType || 'application/octet-stream',
  }));
  return {
    key,
    url: publicUrlForKey(key),
    mimeType: contentType || 'application/octet-stream',
    size: buffer.length,
  };
}

async function createMultipartUpload({ type, originalName, contentType }) {
  if (!r2Configured()) {
    const err = new Error('Cloudflare R2 не настроен. Добавьте R2_* в переменные окружения Render.');
    err.status = 503;
    throw err;
  }
  const { CreateMultipartUploadCommand } = require('@aws-sdk/client-s3');
  const key = makeObjectKey(type || 'lessons', originalName, contentType);
  const out = await getS3().send(new CreateMultipartUploadCommand({
    Bucket: bucket(),
    Key: key,
    ContentType: contentType || 'application/octet-stream',
  }));
  return {
    key,
    uploadId: out.UploadId,
    partSize: MULTIPART_PART_SIZE,
  };
}

async function signUploadPart({ key, uploadId, partNumber, expiresIn = 3600 }) {
  if (!r2Configured()) {
    const err = new Error('R2 is not configured');
    err.status = 503;
    throw err;
  }
  const { UploadPartCommand } = require('@aws-sdk/client-s3');
  const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
  const cmd = new UploadPartCommand({
    Bucket: bucket(),
    Key: key,
    UploadId: uploadId,
    PartNumber: partNumber,
  });
  const url = await getSignedUrl(getS3(), cmd, { expiresIn });
  return { url, partNumber };
}

/** Server-side UploadPart (avoids browser→R2 CORS when bucket CORS is unset). */
async function uploadPartBuffer({ key, uploadId, partNumber, body }) {
  if (!r2Configured()) {
    const err = new Error('R2 is not configured');
    err.status = 503;
    throw err;
  }
  const { UploadPartCommand } = require('@aws-sdk/client-s3');
  const out = await getS3().send(new UploadPartCommand({
    Bucket: bucket(),
    Key: key,
    UploadId: uploadId,
    PartNumber: partNumber,
    Body: body,
  }));
  const etag = String(out.ETag || '').replace(/^"|"$/g, '');
  if (!etag) {
    const err = new Error('R2 не вернул ETag для части файла.');
    err.status = 502;
    throw err;
  }
  return { etag, partNumber };
}

async function completeMultipartUpload({ key, uploadId, parts }) {
  if (!r2Configured()) {
    const err = new Error('R2 is not configured');
    err.status = 503;
    throw err;
  }
  const { CompleteMultipartUploadCommand } = require('@aws-sdk/client-s3');
  const sorted = [...(parts || [])]
    .map((p) => ({
      ETag: String(p.ETag || p.etag || '').replace(/^"|"$/g, ''),
      PartNumber: Number(p.PartNumber || p.partNumber),
    }))
    .filter((p) => p.ETag && Number.isFinite(p.PartNumber) && p.PartNumber > 0)
    .sort((a, b) => a.PartNumber - b.PartNumber)
    .map((p) => ({ ETag: `"${p.ETag.replace(/"/g, '')}"`, PartNumber: p.PartNumber }));

  if (!sorted.length) {
    const err = new Error('Нет загруженных частей файла.');
    err.status = 400;
    throw err;
  }

  await getS3().send(new CompleteMultipartUploadCommand({
    Bucket: bucket(),
    Key: key,
    UploadId: uploadId,
    MultipartUpload: { Parts: sorted },
  }));

  return {
    key,
    url: publicUrlForKey(key),
  };
}

async function abortMultipartUpload({ key, uploadId }) {
  if (!r2Configured() || !key || !uploadId) return;
  try {
    const { AbortMultipartUploadCommand } = require('@aws-sdk/client-s3');
    await getS3().send(new AbortMultipartUploadCommand({
      Bucket: bucket(),
      Key: key,
      UploadId: uploadId,
    }));
  } catch (_) { /* ignore */ }
}

/** Short-lived signed GET for private buckets. Prefer signing so browser <video> can play without R2 CORS. */
async function signedGetUrl(key, expiresIn = 3600, { preferPublic = false } = {}) {
  if (!r2Configured() || !key) return null;
  if (preferPublic) {
    const pub = publicUrlForKey(key);
    if (pub) return pub;
  }
  const { GetObjectCommand } = require('@aws-sdk/client-s3');
  const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
  return getSignedUrl(getS3(), new GetObjectCommand({
    Bucket: bucket(),
    Key: key,
  }), { expiresIn });
}

/** Stream object body to an Express response (no full buffer). */
async function streamObject(key, res, { contentType, contentDisposition } = {}) {
  if (!r2Configured() || !key) return false;
  const { GetObjectCommand } = require('@aws-sdk/client-s3');
  const out = await getS3().send(new GetObjectCommand({
    Bucket: bucket(),
    Key: key,
  }));
  if (contentType || out.ContentType) {
    res.setHeader('Content-Type', contentType || out.ContentType || 'application/octet-stream');
  }
  if (contentDisposition) res.setHeader('Content-Disposition', contentDisposition);
  if (out.ContentLength != null) res.setHeader('Content-Length', String(out.ContentLength));
  res.setHeader('Cache-Control', 'private, max-age=60');
  if (out.Body && typeof out.Body.pipe === 'function') {
    out.Body.pipe(res);
    return true;
  }
  const chunks = [];
  for await (const chunk of out.Body) chunks.push(chunk);
  res.send(Buffer.concat(chunks));
  return true;
}

async function getObject(key) {
  if (!r2Configured()) return null;
  const { GetObjectCommand } = require('@aws-sdk/client-s3');
  const client = getS3();
  const out = await client.send(new GetObjectCommand({
    Bucket: bucket(),
    Key: key,
  }));
  const chunks = [];
  for await (const chunk of out.Body) chunks.push(chunk);
  return {
    buffer: Buffer.concat(chunks),
    mimeType: out.ContentType || 'application/octet-stream',
    contentLength: out.ContentLength,
  };
}

async function deleteObject(key) {
  if (!r2Configured() || !key) return;
  const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
  await getS3().send(new DeleteObjectCommand({
    Bucket: bucket(),
    Key: key,
  }));
}

function assertProductionMediaReady() {
  return Boolean(r2Configured() || !isProduction());
}

function writeLocal(dir, originalName, mimeType, buffer) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filename = `${crypto.randomUUID()}${safeExt(originalName, mimeType)}`;
  const full = path.join(dir, filename);
  fs.writeFileSync(full, buffer);
  return { filename, full };
}

module.exports = {
  r2Configured,
  uploadBuffer,
  getObject,
  deleteObject,
  publicUrlForKey,
  makeObjectKey,
  safeExt,
  assertProductionMediaReady,
  writeLocal,
  createMultipartUpload,
  signUploadPart,
  uploadPartBuffer,
  completeMultipartUpload,
  abortMultipartUpload,
  signedGetUrl,
  streamObject,
  MULTIPART_PART_SIZE,
};
