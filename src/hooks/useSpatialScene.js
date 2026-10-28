import { useEffect, useRef, useState } from 'react';
import { loadPrecomputedSpatialDepth, loadSpatialImage, prefetchPrecomputedSpatialDepth } from '../utils/spatialDepth';
import { createSpatialRenderer, orientationToSpatialInput } from '../utils/spatialRenderer';
import { createSpatialOrientationFilter } from '../utils/spatialMotion.js';

export function useSpatialScene(photoId, imageRef, mediaRef, canvasRef) {
  const rendererRef = useRef(null);
  const depthTaskRef = useRef(null);
  const [enabledId, setEnabledId] = useState(null);
  const [status, setStatus] = useState({ phase: 'idle', message: '' });
  const [motionAllowed, setMotionAllowed] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [saveData, setSaveData] = useState(() => Boolean(navigator.connection?.saveData));
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
    const connection = navigator.connection;
    const update = () => setSaveData(Boolean(connection?.saveData));
    connection?.addEventListener?.('change', update);
    return () => connection?.removeEventListener?.('change', update);
  }, []);

  // The prepared task belongs only to this open photograph. Keep it alive when
  // the user clicks so the foreground load can reuse an unfinished download.
  useEffect(() => () => {
    depthTaskRef.current?.controller.abort();
    depthTaskRef.current = null;
  }, [photoId, reducedMotion]);

  useEffect(() => {
    if (saveData) {
      const task = depthTaskRef.current;
      if (task && !task.consumed) {
        task.controller.abort();
        depthTaskRef.current = null;
      }
    }
    if (!photoId || active || reducedMotion || saveData) return undefined;
    let timer;
    const schedule = () => {
      clearTimeout(timer);
      if (document.hidden) {
        const task = depthTaskRef.current;
        if (task && !task.consumed) task.controller.abort();
        return;
      }
      timer = setTimeout(() => {
        // One attempt per open photo, including after turning an effect off.
        if (depthTaskRef.current) return;
        const controller = new AbortController();
        const task = { photoId, controller, consumed: false };
        task.promise = prefetchPrecomputedSpatialDepth(photoId, controller.signal);
        depthTaskRef.current = task;
        // Background errors never interrupt viewing the ordinary photograph.
        void task.promise.catch(() => {});
      }, 800);
    };
    schedule();
    document.addEventListener('visibilitychange', schedule);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', schedule);
    };
  }, [photoId, active, reducedMotion, saveData]);

  useEffect(() => {
    setEnabledId(null);
    setStatus({ phase: 'idle', message: '' });
  }, [photoId]);

  useEffect(() => {
    if (!active || reducedMotion) return undefined;
    const controller = new AbortController();
    let prepared;
    const canvas = canvasRef.current;
    const generate = async () => {
      try {
        if (!canvas?.getContext('webgl')) throw new Error('此浏览器暂不支持空间场景，请尝试新版 Safari 或 Chrome。');
        const source = imageRef.current?.currentSrc || imageRef.current?.src;
        if (!source || !imageRef.current?.naturalWidth) throw new Error('照片仍在加载，请稍后开启空间场景。');
        setStatus({ phase: 'loading', message: '正在读取空间照片…' });
        const onProgress = (progress) => {
          if (controller.signal.aborted) return;
          setStatus({
            phase: 'loading',
            message: progress.stage === 'pending' ? '正在等待后台准备空间照片…' : '正在读取空间照片…',
          });
        };
        const readDepth = () => {
          if (controller.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
          return loadPrecomputedSpatialDepth(photoId, onProgress, controller.signal);
        };
        prepared = depthTaskRef.current;
        let depthPromise;
        if (prepared?.photoId === photoId && !prepared.controller.signal.aborted) {
          prepared.consumed = true;
          depthPromise = prepared.promise.then((depth) => {
            if (controller.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
            return depth || readDepth();
          }, readDepth);
        } else {
          depthPromise = readDepth();
          depthTaskRef.current = { photoId, controller, promise: depthPromise, consumed: true };
        }
        const [image, depth] = await Promise.all([
          loadSpatialImage(source, controller.signal), depthPromise,
        ]);
        if (controller.signal.aborted) return;
        rendererRef.current = createSpatialRenderer(canvas, image, depth);
        setStatus({ phase: 'ready', message: '' });
      } catch (error) {
        if (controller.signal.aborted) return;
        controller.abort();
        prepared?.controller.abort();
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
      prepared?.controller.abort();
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
    let touchPointer = null;
    const orientationFilter = createSpatialOrientationFilter();
    const reset = () => rendererRef.current?.setTarget(0, 0, { returning: true });
    const recalibrate = () => { baseline = null; orientationFilter.reset(); reset(); };
    const move = (event) => {
      if (event.pointerType === 'mouse' ? touchPointer !== null : event.pointerId !== touchPointer) return;
      const bounds = canvasRef.current.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      rendererRef.current?.setTarget(
        ((event.clientX - bounds.left) / bounds.width - 0.5) * 2,
        ((event.clientY - bounds.top) / bounds.height - 0.5) * 2,
      );
    };
    const down = (event) => {
      if (event.pointerType !== 'mouse' && event.isPrimary !== false && touchPointer === null) {
        touchPointer = event.pointerId;
        baseline = null;
        orientationFilter.reset();
        media.setPointerCapture(event.pointerId);
      }
    };
    const up = (event) => {
      if (event.pointerId !== touchPointer) return;
      touchPointer = null;
      // The resting phone angle may have changed during a drag.
      recalibrate();
    };
    const leave = () => { if (touchPointer === null) reset(); };
    const orientation = (event) => {
      if (document.hidden || touchPointer !== null || !Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return;
      if (!baseline) { baseline = { beta: event.beta, gamma: event.gamma }; return; }
      const angle = window.screen.orientation?.angle ?? window.orientation ?? 0;
      const { x, y } = orientationToSpatialInput(event.beta, event.gamma, baseline, angle);
      const filtered = orientationFilter.sample(x, y);
      if (filtered) rendererRef.current?.setTarget(filtered.x, filtered.y);
    };
    media.addEventListener('pointermove', move);
    media.addEventListener('pointerdown', down);
    media.addEventListener('pointerup', up);
    media.addEventListener('pointercancel', up);
    media.addEventListener('lostpointercapture', up);
    media.addEventListener('pointerleave', leave);
    if (motionAllowed) window.addEventListener('deviceorientation', orientation);
    window.addEventListener('orientationchange', recalibrate);
    document.addEventListener('visibilitychange', recalibrate);
    return () => {
      media.removeEventListener('pointermove', move);
      media.removeEventListener('pointerdown', down);
      media.removeEventListener('pointerup', up);
      media.removeEventListener('pointercancel', up);
      media.removeEventListener('lostpointercapture', up);
      media.removeEventListener('pointerleave', leave);
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
    // before reading the precomputed result or any other awaited work.
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
