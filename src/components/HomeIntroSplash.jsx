import { useCallback, useEffect, useRef, useState } from 'react';

const SESSION_KEY = 'pic4pick-home-intro-session';

/** object-fit: cover — 将媒体像素坐标映射到视口坐标 */
function coverLayout(containerW, containerH, mediaW, mediaH) {
  if (!mediaW || !mediaH) return { scale: 1, offsetX: 0, offsetY: 0 };
  const scale = Math.max(containerW / mediaW, containerH / mediaH);
  const dispW = mediaW * scale;
  const dispH = mediaH * scale;
  const offsetX = (containerW - dispW) / 2;
  const offsetY = (containerH - dispH) / 2;
  return { scale, offsetX, offsetY, dispW, dispH };
}

function mediaPixelToScreen(px, py, layout) {
  const x = layout.offsetX + px * layout.scale;
  const y = layout.offsetY + py * layout.scale;
  return { x, y };
}

function sampleParticlesFromDrawable(drawable, maxParticles = 2200) {
  const w = drawable.videoWidth || drawable.naturalWidth || drawable.width;
  const h = drawable.videoHeight || drawable.naturalHeight || drawable.height;
  if (!w || !h) return [];

  const cw = window.innerWidth;
  const ch = window.innerHeight;
  const layout = coverLayout(cw, ch, w, h);

  const cols = Math.min(96, Math.max(32, Math.floor(cw / 14)));
  const rows = Math.min(72, Math.max(24, Math.floor(ch / 14)));
  const stepX = w / cols;
  const stepY = h / rows;

  const canvas = document.createElement('canvas');
  const capW = Math.min(w, 960);
  const capH = Math.min(h, 540);
  canvas.width = capW;
  canvas.height = capH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(drawable, 0, 0, capW, capH);

  const sx = capW / w;
  const sy = capH / h;
  const data = ctx.getImageData(0, 0, capW, capH).data;

  const particles = [];
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      if (particles.length >= maxParticles) break;
      const mx = Math.floor((gx + 0.5) * stepX);
      const my = Math.floor((gy + 0.5) * stepY);
      const cx = Math.floor(mx * sx);
      const cy = Math.floor(my * sy);
      const i = (cy * capW + cx) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3] / 255;
      if (a < 0.08) continue;
      const { x, y } = mediaPixelToScreen(mx, my, layout, cw, ch);
      if (x < -40 || y < -40 || x > cw + 40 || y > ch + 40) continue;
      const cxn = cw / 2;
      const cyn = ch / 2;
      const ang = Math.atan2(y - cyn, x - cxn) + (Math.random() - 0.5) * 0.85;
      const spd = 2.2 + Math.random() * 7.5;
      particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd + (Math.random() - 0.5) * 1.2,
        vy: Math.sin(ang) * spd + (Math.random() - 0.5) * 1.2,
        r,
        g,
        b,
        a: a * (0.75 + Math.random() * 0.25),
        size: 1.1 + Math.random() * 2.2,
        drag: 0.988 + Math.random() * 0.008,
      });
    }
    if (particles.length >= maxParticles) break;
  }
  return particles;
}

function themedFallbackParticles(count = 900) {
  const cw = window.innerWidth;
  const ch = window.innerHeight;
  const styles = getComputedStyle(document.documentElement);
  const accent = styles.getPropertyValue('--accent').trim() || '#cfa56a';
  const parse = (hex) => {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!m) return { r: 207, g: 165, b: 106 };
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
  };
  const { r: ar, g: ag, b: ab } = parse(accent);
  const particles = [];
  for (let i = 0; i < count; i++) {
    const x = Math.random() * cw;
    const y = Math.random() * ch;
    const cx = cw / 2;
    const cy = ch / 2;
    const ang = Math.atan2(y - cy, x - cx) + (Math.random() - 0.5) * 1.1;
    const spd = 1.8 + Math.random() * 6;
    const t = Math.random();
    particles.push({
      x,
      y,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      r: Math.round(ar + (245 - ar) * t * 0.35),
      g: Math.round(ag + (245 - ag) * t * 0.35),
      b: Math.round(ab + (250 - ab) * t * 0.35),
      a: 0.35 + Math.random() * 0.55,
      size: 1.2 + Math.random() * 2.4,
      drag: 0.985 + Math.random() * 0.01,
    });
  }
  return particles;
}

/**
 * 首页全屏开场：先播放你放在 public 下的视频或图片，再以粒子飞散结束。
 *
 * 使用方式：
 * - 将开场动画导出为 WebM/MP4，放到 public/intro-splash.webm（或改 props）
 * - 或使用静态图 public/intro-splash.png，在 imageHoldMs 后自动消散
 *
 * @param {object} props
 * @param {boolean} [props.oncePerSession=true] 同一会话只播放一次
 * @param {string | null} [props.videoSrc='/intro-splash.webm'] 设为 null 可跳过视频
 * @param {string | null} [props.imageSrc='/intro-splash.png'] 视频失败时的备选；仅图时把 videoSrc 设为 null
 * @param {number} [props.imageHoldMs=3200] 仅图片时展示时长（毫秒）
 * @param {number} [props.fallbackHoldMs=2200] 无媒体时的占位时长
 * @param {number} [props.minHoldMs=600] 至少展示多久后才允许进入消散（避免闪一下）
 * @param {import('react').ReactNode} [props.children] 叠在媒体上方（例如标题），粒子仍从媒体采样
 */
export function HomeIntroSplash({
  oncePerSession = true,
  videoSrc = '/intro-splash.webm',
  imageSrc = '/intro-splash.png',
  imageHoldMs = 3200,
  fallbackHoldMs = 2200,
  minHoldMs = 600,
  children = null,
}) {
  const [phase, setPhase] = useState(() => {
    if (!oncePerSession) return 'ready';
    try {
      if (sessionStorage.getItem(SESSION_KEY) === '1') return 'done';
    } catch {
      /* ignore */
    }
    return 'ready';
  });

  const [sourceMode, setSourceMode] = useState(() => {
    if (videoSrc) return 'video';
    if (imageSrc) return 'image';
    return 'fallback';
  });

  const videoRef = useRef(null);
  const imageRef = useRef(null);
  const sourceModeRef = useRef(sourceMode);
  const particlesRef = useRef(null);
  const overlayRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(0);
  const startedAt = useRef(0);
  const finishedRef = useRef(false);
  const dissolveStarted = useRef(false);
  const dissolveScheduledRef = useRef(false);
  /** 为 false 时（图片 / 占位）不再额外等待 minHoldMs，由各自定时器控制总展示时长 */
  const pendingMinHoldRef = useRef(true);
  const timersRef = useRef([]);

  useEffect(() => {
    sourceModeRef.current = sourceMode;
  }, [sourceMode]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const markSessionDone = useCallback(() => {
    finishedRef.current = true;
    try {
      sessionStorage.setItem(SESSION_KEY, '1');
    } catch {
      /* ignore */
    }
  }, []);

  const runDissolve = useCallback(() => {
    if (phase !== 'ready' || dissolveScheduledRef.current) return;
    dissolveScheduledRef.current = true;
    if (!startedAt.current) {
      startedAt.current = performance.now();
    }
    const elapsed = performance.now() - startedAt.current;
    const hold = pendingMinHoldRef.current ? minHoldMs : 0;
    const go = () => {
      if (dissolveStarted.current) return;
      dissolveStarted.current = true;

      const mode = sourceModeRef.current;
      let drawable = null;
      if (mode === 'video' && videoRef.current) drawable = videoRef.current;
      else if (mode === 'image' && imageRef.current) drawable = imageRef.current;

      let particles = drawable ? sampleParticlesFromDrawable(drawable) : [];
      if (particles.length < 80) {
        particles = themedFallbackParticles(1000);
      }
      particlesRef.current = particles;

      const overlay = overlayRef.current;
      if (overlay) overlay.style.opacity = '0';

      setPhase('dissolve');
    };
    if (elapsed >= hold) go();
    else timersRef.current.push(setTimeout(go, hold - elapsed));
  }, [minHoldMs, phase]);

  useEffect(() => {
    startedAt.current = performance.now();
    return () => clearTimers();
  }, [clearTimers]);

  useEffect(() => {
    if (phase !== 'ready') return undefined;
    if (sourceMode === 'fallback') {
      startedAt.current = performance.now();
      pendingMinHoldRef.current = false;
      const t = setTimeout(runDissolve, fallbackHoldMs);
      timersRef.current.push(t);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [phase, sourceMode, fallbackHoldMs, runDissolve]);

  useEffect(() => {
    if (phase !== 'dissolve') return undefined;

    const finishOnNextFrame = () => {
      markSessionDone();
      requestAnimationFrame(() => setPhase('done'));
    };

    const particles = particlesRef.current;
    if (!particles?.length) {
      finishOnNextFrame();
      return undefined;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      finishOnNextFrame();
      return undefined;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      finishOnNextFrame();
      return undefined;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const start = performance.now();
    const duration = 920;

    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      const fade = 1 - t * t;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= p.drag;
        p.vy *= p.drag;
        p.vy += 0.06;
        ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${(p.a * fade).toFixed(3)})`;
        ctx.fillRect(p.x, p.y, p.size, p.size);
      }

      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        markSessionDone();
        setPhase('done');
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [phase, markSessionDone]);

  const onVideoEnded = useCallback(() => {
    runDissolve();
  }, [runDissolve]);

  const onVideoError = useCallback(() => {
    clearTimers();
    dissolveScheduledRef.current = false;
    if (imageSrc) {
      setSourceMode('image');
      dissolveStarted.current = false;
    } else {
      setSourceMode('fallback');
    }
  }, [clearTimers, imageSrc]);

  const onImageError = useCallback(() => {
    dissolveScheduledRef.current = false;
    setSourceMode('fallback');
  }, []);

  const onImageLoad = useCallback(() => {
    clearTimers();
    dissolveScheduledRef.current = false;
    pendingMinHoldRef.current = false;
    startedAt.current = performance.now();
    const t = setTimeout(runDissolve, imageHoldMs);
    timersRef.current.push(t);
  }, [clearTimers, imageHoldMs, runDissolve]);

  const skip = useCallback(() => {
    clearTimers();
    pendingMinHoldRef.current = false;
    dissolveScheduledRef.current = false;
    runDissolve();
  }, [clearTimers, runDissolve]);

  if (phase === 'done') return null;

  return (
    <div
      className={`home-intro-root${phase === 'dissolve' ? ' home-intro-dissolving' : ''}`}
      ref={overlayRef}
      role="presentation"
      aria-hidden={phase === 'dissolve'}
    >
      {phase === 'ready' && (
        <>
          <div className="home-intro-media-layer">
            {sourceMode === 'video' && videoSrc && (
              <video
                ref={videoRef}
                className="home-intro-media"
                src={videoSrc}
                autoPlay
                muted
                playsInline
                preload="auto"
                onEnded={onVideoEnded}
                onError={onVideoError}
              />
            )}
            {sourceMode === 'image' && imageSrc && (
              <img
                ref={imageRef}
                className="home-intro-media"
                src={imageSrc}
                alt=""
                onLoad={onImageLoad}
                onError={onImageError}
              />
            )}
            {sourceMode === 'fallback' && <div className="home-intro-fallback" aria-hidden />}
          </div>
          {children ? <div className="home-intro-children">{children}</div> : null}
          <button type="button" className="home-intro-skip" onClick={skip}>
            跳过
          </button>
        </>
      )}
      <canvas ref={canvasRef} className="home-intro-particle-canvas" aria-hidden />
    </div>
  );
}
