function pickMime(kind) {
  if (!window.MediaRecorder) return '';
  const list = kind === 'VIDEO'
    ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
    : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg', 'audio/aac'];
  return list.find((t) => {
    try { return MediaRecorder.isTypeSupported(t); } catch (_) { return false; }
  }) || '';
}

function permissionMessage(kind, err) {
  const name = err && err.name;
  const isVideo = kind === 'VIDEO';
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return 'Браузер не даёт доступ к микрофону и камере. Откройте сайт по адресу localhost или через HTTPS.';
  }
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return isVideo
      ? 'Доступ к камере или микрофону запрещён. Нажмите на значок замка в адресной строке → Камера и Микрофон → Разрешить — и обновите страницу.'
      : 'Доступ к микрофону запрещён. Нажмите на значок замка в адресной строке → Микрофон → Разрешить — и обновите страницу. На телефоне проверьте настройки сайта в браузере.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return isVideo
      ? 'Камера или микрофон не найдены. Подключите устройство и повторите попытку.'
      : 'Микрофон не найден. Подключите микрофон или проверьте настройки телефона.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'Устройство занято другим приложением. Закройте другие вкладки и программы, которые используют камеру или микрофон.';
  }
  if (name === 'SecurityError') {
    return 'Браузер блокирует запись на незащищённом соединении. Используйте localhost или HTTPS.';
  }
  return (err && err.message) || 'Не удалось начать запись. Проверьте разрешения браузера и повторите.';
}

export class RetellRecorder {
  constructor() {
    this.reset();
  }

  reset() {
    this.stopTracks();
    if (this.url) URL.revokeObjectURL(this.url);
    if (this.audioCtx) {
      try { this.audioCtx.close(); } catch (_) { /* ignore */ }
    }
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.stream = null;
    this.mr = null;
    this.chunks = [];
    this.blob = null;
    this.url = null;
    this.mimeType = '';
    this.startedAt = 0;
    this.elapsedMs = 0;
    this.paused = false;
    this.recording = false;
    this.tickTimer = null;
    this.audioCtx = null;
    this.analyser = null;
    this.raf = 0;
    this.onTick = null;
    this.onStop = null;
    this.onWave = null;
    this.maxMs = 0;
    this.kind = 'AUDIO';
    this.previewEl = null;
  }

  stopTracks() {
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  durationSec() {
    let ms = this.elapsedMs;
    if (this.recording && !this.paused && this.startedAt) ms += Date.now() - this.startedAt;
    return Math.max(1, Math.round(ms / 1000));
  }

  async prepare(kind, previewEl) {
    this.kind = kind;
    this.previewEl = previewEl || null;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error(permissionMessage(kind, { name: 'SecurityError' }));
    }
    const portrait = window.matchMedia('(orientation: portrait)').matches || window.innerWidth < 700;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const video = (portrait || coarse)
      ? { facingMode: { ideal: 'user' }, width: { ideal: 720 }, height: { ideal: 1280 } }
      : { facingMode: { ideal: 'user' }, width: { ideal: 1280 }, height: { ideal: 720 } };
    const constraints = kind === 'VIDEO'
      ? {
        audio: { echoCancellation: true, noiseSuppression: true },
        video,
      }
      : { audio: { echoCancellation: true, noiseSuppression: true } };
    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      if (kind === 'VIDEO') {
        try {
          this.stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: { facingMode: 'user' },
          });
        } catch (err2) {
          throw new Error(permissionMessage(kind, err2));
        }
      } else {
        throw new Error(permissionMessage(kind, err));
      }
    }
    if (kind === 'VIDEO' && previewEl) {
      previewEl.srcObject = this.stream;
      previewEl.muted = true;
      previewEl.playsInline = true;
      try { await previewEl.play(); } catch (_) { /* autoplay may wait for gesture */ }
    }
    this._setupAnalyser();
    return { mimeType: pickMime(kind), stream: this.stream };
  }

  _setupAnalyser() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.audioCtx = new Ctx();
      const src = this.audioCtx.createMediaStreamSource(this.stream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 64;
      src.connect(this.analyser);
      const data = new Uint8Array(this.analyser.frequencyBinCount);
      const loop = () => {
        this.raf = requestAnimationFrame(loop);
        if (!this.analyser || this.paused || !this.recording) return;
        this.analyser.getByteFrequencyData(data);
        if (this.onWave) this.onWave(Array.from(data));
      };
      this.raf = requestAnimationFrame(loop);
    } catch (_) { /* analyser is optional */ }
  }

  async start({ maxSeconds, onTick, onStop, onWave }) {
    if (!this.stream) throw new Error('Сначала разрешите доступ к микрофону.');
    if (!window.MediaRecorder) throw new Error('Этот браузер не поддерживает запись. Попробуйте Chrome, Safari или Firefox.');
    this.onTick = onTick;
    this.onStop = onStop;
    this.onWave = onWave;
    this.maxMs = maxSeconds * 1000;
    this.chunks = [];
    this.blob = null;
    if (this.url) { URL.revokeObjectURL(this.url); this.url = null; }
    const mime = pickMime(this.kind);
    this.mimeType = mime;
    this.mr = mime ? new MediaRecorder(this.stream, { mimeType: mime }) : new MediaRecorder(this.stream);
    this.mr.ondataavailable = (e) => {
      if (e.data && e.data.size) this.chunks.push(e.data);
    };
    this.mr.onstop = () => {
      const type = this.mr.mimeType || this.mimeType || (this.kind === 'VIDEO' ? 'video/webm' : 'audio/webm');
      this.blob = new Blob(this.chunks, { type });
      if (this.url) URL.revokeObjectURL(this.url);
      this.url = URL.createObjectURL(this.blob);
      this.recording = false;
      this.paused = false;
      if (this.tickTimer) clearInterval(this.tickTimer);
      if (this.previewEl) {
        this.previewEl.srcObject = null;
      }
      this.stopTracks();
      if (this.onStop) this.onStop({ blob: this.blob, url: this.url, duration: this.durationSec(), mimeType: type });
    };
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      try { await this.audioCtx.resume(); } catch (_) { /* ignore */ }
    }
    this.elapsedMs = 0;
    this.startedAt = Date.now();
    this.paused = false;
    this.recording = true;
    this.mr.start(200);
    this._armTick();
  }

  _armTick() {
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.tickTimer = setInterval(() => {
      if (!this.recording || this.paused) return;
      const ms = this.elapsedMs + (Date.now() - this.startedAt);
      if (this.onTick) this.onTick(Math.floor(ms / 1000), Math.floor(this.maxMs / 1000));
      if (ms >= this.maxMs) this.stop();
    }, 200);
  }

  pause() {
    if (!this.mr || !this.recording || this.paused) return false;
    if (typeof this.mr.pause !== 'function' || this.mr.state !== 'recording') return false;
    this.elapsedMs += Date.now() - this.startedAt;
    this.paused = true;
    this.mr.pause();
    return true;
  }

  resume() {
    if (!this.mr || !this.paused) return false;
    if (typeof this.mr.resume !== 'function') return false;
    this.paused = false;
    this.startedAt = Date.now();
    this.mr.resume();
    this._armTick();
    return true;
  }

  stop() {
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.recording && !this.paused && this.startedAt) {
      this.elapsedMs += Date.now() - this.startedAt;
    }
    this.recording = false;
    this.paused = false;
    if (this.mr && (this.mr.state === 'recording' || this.mr.state === 'paused')) {
      try { this.mr.stop(); } catch (_) { /* ignore */ }
    }
  }

  discard() {
    this.reset();
  }
}

export { pickMime, permissionMessage };
