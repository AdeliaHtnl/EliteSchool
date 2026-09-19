/**
 * Multipart video upload via API → R2 (avoids browser CORS on the bucket).
 */
import { api } from './api.js';
import { apiUrl } from './config.js';

export function formatBytes(n) {
  const v = Number(n) || 0;
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
  if (v < 1024 * 1024 * 1024) return `${(v / (1024 * 1024)).toFixed(2)} MB`;
  return `${(v / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatEta(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

export function renderUploadCard(opts = {}) {
  const maxLabel = opts.maxLabel || '5 GB';
  const accept = opts.accept || 'video/mp4,video/webm,video/quicktime,video/x-matroska,video/avi,.mp4,.mov,.webm,.mkv,.avi';
  return `
    <div class="upload-card" data-upload-card>
      <input type="file" name="${opts.name || 'file'}" accept="${accept}" data-upload-input hidden>
      <div class="upload-drop" data-upload-drop>
        <div class="upload-icon" aria-hidden="true">↑</div>
        <p class="upload-title">Перетащите видео сюда</p>
        <p class="upload-or">или</p>
        <button type="button" class="btn btn-primary btn-sm" data-upload-pick>Выбрать файл</button>
        <p class="upload-meta">MP4 · MOV · WEBM · MKV · AVI<br>Максимум: ${maxLabel}</p>
      </div>
      <div class="upload-progress" data-upload-progress hidden>
        <p class="upload-file" data-upload-name>—</p>
        <p class="upload-size"><span data-upload-done>0</span> / <span data-upload-total>0</span></p>
        <div class="upload-bar"><i data-upload-bar style="width:0%"></i></div>
        <p class="upload-stats">
          <span data-upload-pct>0%</span>
          · <span data-upload-speed>—</span>
          · осталось <span data-upload-eta>—</span>
        </p>
        <p class="upload-status" data-upload-status></p>
        <button type="button" class="btn btn-ghost btn-sm" data-upload-retry hidden>Повторить</button>
        <video class="upload-preview" data-upload-preview controls playsinline preload="metadata" hidden></video>
      </div>
    </div>
  `;
}

export async function uploadFileToR2(file, {
  onProgress,
  signal,
} = {}) {
  const init = await api('/api/lessons/upload/init', {
    method: 'POST',
    body: {
      filename: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
    },
  });

  const partSize = init.partSize || 16 * 1024 * 1024;
  const partCount = init.partCount || Math.ceil(file.size / partSize);
  const parts = [];
  let uploaded = 0;
  const started = Date.now();

  try {
    for (let partNumber = 1; partNumber <= partCount; partNumber += 1) {
      if (signal?.aborted) throw new Error('Загрузка отменена.');
      const start = (partNumber - 1) * partSize;
      const end = Math.min(start + partSize, file.size);
      const blob = file.slice(start, end);

      const qs = new URLSearchParams({
        uploadId: init.uploadId,
        key: init.key,
        partNumber: String(partNumber),
      });
      let putRes;
      try {
        putRes = await fetch(`${apiUrl('/api/lessons/upload/part')}?${qs}`, {
          method: 'PUT',
          body: blob,
          credentials: 'include',
          headers: { 'Content-Type': 'application/octet-stream' },
          signal,
        });
      } catch (_) {
        throw new Error('Нет соединения с сервером при загрузке части.');
      }
      let data = {};
      try { data = await putRes.json(); } catch (_) { data = {}; }
      if (!putRes.ok) {
        throw new Error(data.error || `Ошибка загрузки части ${partNumber} (${putRes.status}).`);
      }
      const etag = String(data.etag || '').replace(/^"|"$/g, '');
      if (!etag) throw new Error('Сервер не вернул ETag части.');
      parts.push({ ETag: etag, PartNumber: partNumber });

      uploaded = end;
      const elapsed = (Date.now() - started) / 1000;
      const speed = uploaded / Math.max(elapsed, 0.001);
      const left = (file.size - uploaded) / Math.max(speed, 1);
      onProgress?.({
        uploaded,
        total: file.size,
        percent: Math.round((uploaded / file.size) * 100),
        speed,
        eta: left,
      });
    }

    const done = await api('/api/lessons/upload/complete', {
      method: 'POST',
      body: { uploadId: init.uploadId, key: init.key, parts },
    });
    return done;
  } catch (err) {
    try {
      await api('/api/lessons/upload/abort', {
        method: 'POST',
        body: { uploadId: init.uploadId, key: init.key },
      });
    } catch (_) { /* ignore */ }
    throw err;
  }
}

export function wireUploadCard(root, {
  maxBytes = 5 * 1024 * 1024 * 1024,
  onReady,
} = {}) {
  const card = root.querySelector('[data-upload-card]');
  if (!card || card.dataset.wired === '1') return null;
  card.dataset.wired = '1';

  const input = card.querySelector('[data-upload-input]');
  const drop = card.querySelector('[data-upload-drop]');
  const progress = card.querySelector('[data-upload-progress]');
  const pickBtn = card.querySelector('[data-upload-pick]');
  const retryBtn = card.querySelector('[data-upload-retry]');
  const preview = card.querySelector('[data-upload-preview]');
  let lastFile = null;
  let result = null;
  let objectUrl = null;

  const setStatus = (text, ok) => {
    const el = card.querySelector('[data-upload-status]');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('ok', ok === true);
    el.classList.toggle('err', ok === false);
  };

  const showProgress = (file) => {
    drop.hidden = true;
    progress.hidden = false;
    card.querySelector('[data-upload-name]').textContent = file.name;
    card.querySelector('[data-upload-total]').textContent = formatBytes(file.size);
    card.querySelector('[data-upload-done]').textContent = '0';
    card.querySelector('[data-upload-bar]').style.width = '0%';
    card.querySelector('[data-upload-pct]').textContent = '0%';
    retryBtn.hidden = true;
    setStatus('Загрузка…');
  };

  const updateProgress = (p) => {
    card.querySelector('[data-upload-done]').textContent = formatBytes(p.uploaded);
    card.querySelector('[data-upload-bar]').style.width = `${p.percent}%`;
    card.querySelector('[data-upload-pct]').textContent = `${p.percent}%`;
    card.querySelector('[data-upload-speed]').textContent = `${formatBytes(p.speed)}/s`;
    card.querySelector('[data-upload-eta]').textContent = formatEta(p.eta);
  };

  const startUpload = async (file) => {
    lastFile = file;
    result = null;
    if (file.size > maxBytes) {
      showProgress(file);
      setStatus(`Файл больше лимита (${formatBytes(maxBytes)}).`, false);
      retryBtn.hidden = false;
      return;
    }
    showProgress(file);
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(file);
    if (preview && file.type.startsWith('video/')) {
      preview.src = objectUrl;
      preview.hidden = false;
    }
    try {
      result = await uploadFileToR2(file, { onProgress: updateProgress });
      setStatus('✓ Видео загружено', true);
      onReady?.(result);
    } catch (err) {
      result = null;
      setStatus(`✕ ${err.message || 'Ошибка загрузки'}`, false);
      retryBtn.hidden = false;
      onReady?.(null);
    }
  };

  pickBtn?.addEventListener('click', () => input?.click());
  input?.addEventListener('change', () => {
    const f = input.files?.[0];
    if (f) startUpload(f);
  });
  retryBtn?.addEventListener('click', () => {
    if (lastFile) startUpload(lastFile);
  });

  ['dragenter', 'dragover'].forEach((ev) => {
    drop?.addEventListener(ev, (e) => {
      e.preventDefault();
      drop.classList.add('drag');
    });
  });
  ['dragleave', 'drop'].forEach((ev) => {
    drop?.addEventListener(ev, (e) => {
      e.preventDefault();
      drop.classList.remove('drag');
    });
  });
  drop?.addEventListener('drop', (e) => {
    const f = e.dataTransfer?.files?.[0];
    if (f) startUpload(f);
  });

  return {
    getResult: () => result,
    getFile: () => lastFile,
    reset: () => {
      result = null;
      input.value = '';
      drop.hidden = false;
      progress.hidden = true;
      if (preview) {
        preview.hidden = true;
        preview.removeAttribute('src');
      }
    },
  };
}
