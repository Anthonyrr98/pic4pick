import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { useAnimatedPresence } from '../hooks/useAnimatedPresence';
import './UploadProgress.css';

gsap.registerPlugin(useGSAP);

export function UploadProgress({ progress, fileName, isVisible, uploadedBytes, totalBytes, statusLabel, outcome }) {
  const rootRef = useRef(null);
  const fillRef = useRef(null);
  const percentageRef = useRef(null);
  const barRef = useRef(null);
  const updateRef = useRef(null);
  const visible = isVisible && progress !== null;
  const target = Number.isFinite(progress) ? Math.min(100, Math.max(0, progress)) : 0;
  const current = useMemo(() => ({ target, fileName, uploadedBytes, totalBytes, statusLabel, outcome }),
    [target, fileName, uploadedBytes, totalBytes, statusLabel, outcome]);
  const [retained, setRetained] = useState(current);
  useLayoutEffect(() => { if (visible) setRetained(current); }, [visible, current]);
  const displayed = visible ? current : retained;
  const present = useAnimatedPresence(visible, rootRef, { variant: 'notice' });
  const targetRef = useRef(displayed.target);
  useLayoutEffect(() => { targetRef.current = displayed.target; }, [displayed.target]);

  useGSAP(() => {
    if (!present) return;
    const media = gsap.matchMedia();
    media.add({ reduce: '(prefers-reduced-motion: reduce)', animate: '(prefers-reduced-motion: no-preference)' }, context => {
      let lastInteger = -1;
      const writePercentage = () => {
        const integer = Math.round(Number(gsap.getProperty(fillRef.current, 'scaleX')) * 100);
        if (integer === lastInteger) return;
        lastInteger = integer;
        percentageRef.current.textContent = `${integer}%`;
        barRef.current.setAttribute('aria-valuenow', String(integer));
      };
      const to = gsap.quickTo(fillRef.current, 'scaleX', {
        duration: 0.28, ease: 'power2.out', onUpdate: writePercentage,
      });
      updateRef.current = value => {
        if (value === 0 || context.conditions.reduce) {
          to.tween.pause();
          gsap.set(fillRef.current, { scaleX: value / 100 });
          writePercentage();
        }
        else to(value / 100);
      };
      updateRef.current(targetRef.current);
      return () => { updateRef.current = null; };
    }, rootRef);
    return () => media.revert();
  }, { scope: rootRef, dependencies: [present, displayed.fileName], revertOnUpdate: true });

  useGSAP(() => { updateRef.current?.(displayed.target); },
    { dependencies: [displayed.target, present, displayed.fileName] });
  useGSAP(() => {
    if (!present || !visible) return;
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.fromTo(rootRef.current.querySelector('.upload-progress-label'), { opacity: 0.4, y: 3 },
        { opacity: 1, y: 0, duration: 0.18, clearProps: 'opacity,transform' });
    }, rootRef);
    return () => media.revert();
  }, { scope: rootRef, dependencies: [present, visible, displayed.statusLabel, displayed.outcome], revertOnUpdate: true });

  if (!present) {
    return null;
  }

  const formattedBytes = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="upload-progress-anchor" data-state={visible ? 'open' : 'closing'}
      data-outcome={displayed.outcome || 'uploading'}>
    <div className="upload-progress-container" ref={rootRef}>
      <div className="upload-progress-header">
        <span className="upload-progress-label" role="status">
          {displayed.outcome && <span className="upload-progress-result" aria-hidden="true">{displayed.outcome === 'success' ? '✓ ' : '! '}</span>}
          {displayed.statusLabel || '上传中...'}
        </span>
        <span className="upload-progress-percentage" ref={percentageRef}>0%</span>
      </div>
      {displayed.fileName && (
        <div className="upload-progress-filename">{displayed.fileName}</div>
      )}
      {Boolean(displayed.uploadedBytes && displayed.totalBytes) && (
        <div className="upload-progress-bytes">
          {formattedBytes(displayed.uploadedBytes)} / {formattedBytes(displayed.totalBytes)}
        </div>
      )}
      <div className="upload-progress-bar" ref={barRef} role="progressbar" aria-label={displayed.statusLabel || '上传进度'}
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={0}>
        <div 
          className="upload-progress-fill" 
          ref={fillRef}
        />
      </div>
    </div>
    </div>
  );
}

