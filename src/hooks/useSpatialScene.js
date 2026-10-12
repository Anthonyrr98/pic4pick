import { useEffect, useRef, useState } from 'react';
import { estimateSpatialDepth, loadSpatialImage } from '../utils/spatialDepth';
import { createSpatialRenderer, orientationToSpatialInput } from '../utils/spatialRenderer';

export function useSpatialScene(photoId, imageRef, mediaRef, canvasRef) {
  const rendererRef = useRef(null);
  const [enabledId, setEnabledId] = useState(null);
  const [status, setStatus] = useState({ phase: 'idle', message: '' });
  const [motionAllowed, setMotionAllowed] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const active = Boolean(photoId && enabledId === photoId);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      setReducedMotion(preference.matches);
      if (preference.matches) {
        setEnabledId(null);
        setStatus({ phase: 'idle', message: '' });
      }
    };
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    setEnabledId(null);
    setStatus({ phase: 'idle', message: '' });
  }, [photoId]);

  useEffect(() => {
    if (!active || reducedMotion) return undefined;
    const controller = new AbortController();
    const canvas = canvasRef.current;
    const generate = async () => {
      try {
        if (!canvas?.getContext('webgl')) throw new Error('此浏览器暂不支持空间场景，请尝试新版 Safari 或 Chrome。');
        const source = imageRef.current?.currentSrc || imageRef.current?.src;
        if (!source || !imageRef.current?.naturalWidth) throw new Error('照片仍在加载，请稍后开启空间场景。');
        setStatus({ phase: 'loading', message: '正在读取照片…' });
        const image = await loadSpatialImage(source, controller.signal);
        if (controller.signal.aborted) return;
        const depth = await estimateSpatialDepth(image, source, (progress) => {
          if (controller.signal.aborted) return;
          setStatus({
            phase: 'loading',
            message: progress.stage === 'estimating' ? '正在生成景深…'
              : Number.isFinite(progress.progress) ? `首次下载空间模型 ${progress.progress}%`
                : '正在加载空间模型，首次使用需下载约 27 MB…',
          });
        }, controller.signal);
        if (controller.signal.aborted) return;
        rendererRef.current = createSpatialRenderer(canvas, image, depth);
        setStatus({ phase: 'ready', message: '' });
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error.name === 'AbortError') {
          setStatus({ phase: 'idle', message: '' });
          setEnabledId(null);
          return;
        }
        setStatus({ phase: 'error', message: error.message || '空间场景暂不可用，请重试。' });
        setEnabledId(null);
      }
    };
    const contextLost = (event) => {
      event.preventDefault();
      setStatus({ phase: 'error', message: '空间场景已暂停，请重新开启。' });
      setEnabledId(null);
    };
    canvas?.addEventListener('webglcontextlost', contextLost);
    void generate();
    return () => {
      controller.abort();
      canvas?.removeEventListener('webglcontextlost', contextLost);
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, [active, photoId, reducedMotion, imageRef, canvasRef]);

  const ready = active && status.phase === 'ready';
  useEffect(() => {
    if (!ready) return undefined;
    const media = mediaRef.current;
    let baseline = null;
    let touching = false;
    const reset = () => rendererRef.current?.setTarget(0, 0);
    const move = (event) => {
      if (event.pointerType !== 'mouse' && !touching) return;
      const bounds = canvasRef.current.getBoundingClientRect();
      rendererRef.current?.setTarget(
        ((event.clientX - bounds.left) / bounds.width - 0.5) * 2,
        ((event.clientY - bounds.top) / bounds.height - 0.5) * 2,
      );
    };
    const down = (event) => {
      if (event.pointerType !== 'mouse') {
        touching = true;
        media.setPointerCapture(event.pointerId);
      }
    };
    const up = () => { touching = false; reset(); };
    const orientation = (event) => {
      if (document.hidden || touching || !Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return;
      if (!baseline) { baseline = { beta: event.beta, gamma: event.gamma }; return; }
      const angle = window.screen.orientation?.angle ?? window.orientation ?? 0;
      const { x, y } = orientationToSpatialInput(event.beta, event.gamma, baseline, angle);
      rendererRef.current?.setTarget(x, y);
    };
    const recalibrate = () => { baseline = null; reset(); };
    media.addEventListener('pointermove', move);
    media.addEventListener('pointerdown', down);
    media.addEventListener('pointerup', up);
    media.addEventListener('pointercancel', up);
    media.addEventListener('pointerleave', reset);
    if (motionAllowed) window.addEventListener('deviceorientation', orientation);
    window.addEventListener('orientationchange', recalibrate);
    document.addEventListener('visibilitychange', recalibrate);
    return () => {
      media.removeEventListener('pointermove', move);
      media.removeEventListener('pointerdown', down);
      media.removeEventListener('pointerup', up);
      media.removeEventListener('pointercancel', up);
      media.removeEventListener('pointerleave', reset);
      window.removeEventListener('deviceorientation', orientation);
      window.removeEventListener('orientationchange', recalibrate);
      document.removeEventListener('visibilitychange', recalibrate);
    };
  }, [ready, motionAllowed, photoId, mediaRef, canvasRef]);

  const toggle = () => {
    setStatus({ phase: 'idle', message: '' });
    if (active) { setEnabledId(null); return; }
    if (reducedMotion || !photoId) return;
    // iOS requires the request to run directly inside the button's user gesture,
    // before model downloads or any other awaited work.
    if (window.matchMedia('(pointer: coarse)').matches && window.isSecureContext && window.DeviceOrientationEvent) {
      try {
        const permission = window.DeviceOrientationEvent.requestPermission;
        if (typeof permission === 'function') {
          void permission.call(window.DeviceOrientationEvent).then((result) => setMotionAllowed(result === 'granted')).catch(() => setMotionAllowed(false));
        } else setMotionAllowed(true);
      } catch { setMotionAllowed(false); }
    }
    setEnabledId(photoId);
  };

  return { active, ready, status, toggle, motionAllowed, reducedMotion };
}
