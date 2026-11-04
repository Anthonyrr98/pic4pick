import { useLayoutEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { INTRO_MOTION, ENTRY_MOTION } from '../constants/motionPresets';

gsap.registerPlugin(useGSAP);

export function AppLoading({ intro = false, rootRef, markRef, sheenRef }) {
  return (
    <div ref={rootRef} className={`app-loading-screen${intro ? ' app-intro' : ''}`}
      role="status" aria-live="polite" aria-label="胶片正在装入时光">
      <div ref={markRef} className="app-loading-mark" aria-hidden="true">
        <img src="/loa-loading.webp" width="900" height="313" alt="" fetchPriority="high" decoding="sync" />
        <span ref={sheenRef} className="app-loading-sheen" />
      </div>
      <p>胶片正在装入时光…</p>
    </div>
  );
}

export function AppIntro({ ready, onComplete }) {
  const root = useRef(null);
  const mark = useRef(null);
  const sheen = useRef(null);
  const timelineRef = useRef(null);
  const readyRef = useRef(ready);
  useLayoutEffect(() => { readyRef.current = ready; }, [ready]);

  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add({ reduce: '(prefers-reduced-motion: reduce)', animate: '(prefers-reduced-motion: no-preference)' }, context => {
      if (context.conditions.reduce) { onComplete(); return; }
      const timeline = gsap.timeline({ onComplete });
      timelineRef.current = timeline;
      timeline.fromTo(mark.current, { y: 8, opacity: 0 },
        { y: 0, opacity: 1, duration: INTRO_MOTION.mark, ease: ENTRY_MOTION.ease }, 0);
      timeline.fromTo(sheen.current, { xPercent: 0, opacity: 0 },
        { xPercent: 420, opacity: 0.8, duration: INTRO_MOTION.sheen, ease: 'power2.inOut' }, 0.08);
      timeline.to(sheen.current, { opacity: 0, duration: 0.14 }, 0.44);
      timeline.addLabel('ready', INTRO_MOTION.hold);
      timeline.call(() => { if (!readyRef.current) timeline.pause(); }, [], INTRO_MOTION.hold);
      timeline.to(root.current, { opacity: 0, scale: 1.01, duration: INTRO_MOTION.fade,
        ease: INTRO_MOTION.ease }, INTRO_MOTION.hold);
      const visibilityChanged = () => { if (document.hidden && readyRef.current) timeline.progress(1); };
      document.addEventListener('visibilitychange', visibilityChanged);
      return () => {
        document.removeEventListener('visibilitychange', visibilityChanged);
        timelineRef.current = null;
      };
    }, root);
    return () => media.revert();
  }, { scope: root, dependencies: [onComplete], revertOnUpdate: true });

  useGSAP(() => {
    const timeline = timelineRef.current;
    if (ready && timeline) {
      if (document.hidden) timeline.progress(1);
      else if (timeline.time() >= INTRO_MOTION.hold) timeline.play();
    }
  }, { dependencies: [ready] });

  return <AppLoading intro rootRef={root} markRef={mark} sheenRef={sheen} />;
}
