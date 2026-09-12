/**
 * Cloudflare R2 (S3-compatible) media storage.
 * When R2_* env is incomplete, falls back to local disk helpers.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { isProduction } = require('./env');

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
  // Lazy require so local JSON-only boot works without the package until installed
  const { S3Client } = require('@aws-sdk/client-s3');
  const accountId = String(process.env.R2_ACCOUNT_ID).trim();
  s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: String(process.env.R2_ACCESS_KEY_ID).trim(),
      secretAccessKey: String(process.env.R2_SECRET_ACCESS_KEY).trim(),
    },
  });
  return s3;
}

function publicUrlForKey(key) {
  const base = String(process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');
  if (!base) return null;
  return `${base}/${key.replace(/^\//, '')}`;
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
  };
  return map[String(mimeType || '').split(';')[0].trim()] || fallback;
}

function makeObjectKey(type, originalName, mimeType) {
  const t = String(type || 'misc').replace(/[^a-z0-9_-]/gi, '') || 'misc';
  const ext = safeExt(originalName, mimeType);
  return `${t}/${crypto.randomUUID()}${ext}`;
}

async function uploadBuffer({ buffer, contentType, type, originalName }) {
  if (!r2Configured()) {
    const err = new Error('R2 is not configured');
    err.status = 500;
    throw err;
  }
  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  const key = makeObjectKey(type, originalName, contentType);
  const client = getS3();
  await client.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET,
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

async function getObject(key) {
  if (!r2Configured()) return null;
  const { GetObjectCommand } = require('@aws-sdk/client-s3');
  const client = getS3();
  const out = await client.send(new GetObjectCommand({
    Bucket: process.env.R2_BUCKET,
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
  const client = getS3();
  await client.send(new DeleteObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: key,
  }));
}

function assertProductionMediaReady() {
  // R2 preferred; local disk fallback is allowed (see persistUpload)
  return Boolean(r2Configured() || !isProduction());
}

/** Write buffer to local disk (dev fallback) */
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
};
