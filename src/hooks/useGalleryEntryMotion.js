import { useLayoutEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { useEntryMotionReady } from '../contexts/EntryMotionContext';
import { ENTRY_MOTION } from '../constants/motionPresets';

gsap.registerPlugin(useGSAP);

function useEntryMotion(rootRef, active, revision, kind) {
  const ready = useEntryMotionReady();
  const stateRef = useRef({ active, ready });
  const updateRef = useRef(null);
  useLayoutEffect(() => { stateRef.current = { active, ready }; }, [active, ready]);

  useGSAP((_context, contextSafe) => {
    const root = rootRef.current;
    if (!root) return;
    // Local to this mount lifecycle, including React StrictMode's setup replay.
    const seen = new Set();
    const running = new Set();
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finish = () => { [...running].forEach(tween => tween.progress(1)); };
    const update = contextSafe(() => {
      if (!stateRef.current.active || !stateRef.current.ready) { finish(); return; }
      const selector = kind === 'grid' ? '.photo-card' : '.app-header, #gallery-view .tab-strip';
      const fresh = [...root.querySelectorAll(selector)].filter(node => {
        const key = kind === 'grid' ? node.dataset.photoId : node;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (preference.matches || document.hidden || !fresh.length) return;
      // Off-screen additions appear normally; scrolling must not wait for entry.
      const visible = kind === 'grid' ? fresh.filter(node => {
        const rect = node.getBoundingClientRect();
        return rect.bottom > 0 && rect.top < window.innerHeight + 32;
      }) : fresh;
      if (!visible.length) return;
      let tween;
      tween = gsap.fromTo(visible, { opacity: 0, ...(kind === 'grid' ? { '--entry-y': '6px' } : { y: 8 }) }, {
        opacity: 1, ...(kind === 'grid' ? { '--entry-y': '0px' } : { y: 0 }),
        duration: ENTRY_MOTION.duration, ease: ENTRY_MOTION.ease,
        stagger: kind === 'grid' ? { amount: Math.min(ENTRY_MOTION.maxCardDelay,
          (visible.length - 1) * ENTRY_MOTION.cardGap) } : ENTRY_MOTION.headerGap,
        clearProps: kind === 'grid' ? 'opacity,--entry-y' : 'opacity,transform',
        onComplete: () => running.delete(tween),
      });
      running.add(tween);
    });
    updateRef.current = update;
    update();
    const preferenceChanged = () => { if (preference.matches) finish(); };
    const visibilityChanged = () => { if (document.hidden) finish(); };
    preference.addEventListener('change', preferenceChanged);
    document.addEventListener('visibilitychange', visibilityChanged);
    return () => {
      running.forEach(tween => tween.kill()); running.clear(); seen.clear();
      preference.removeEventListener('change', preferenceChanged);
      document.removeEventListener('visibilitychange', visibilityChanged);
      updateRef.current = null;
    };
  }, { scope: rootRef });

  useGSAP(() => { updateRef.current?.(); }, { dependencies: [active, ready, revision] });
}

export function usePhotoGridEntry(rootRef, active, photos) {
  useEntryMotion(rootRef, active, photos, 'grid');
}

export function useGalleryHeaderEntry(rootRef, active) {
  useEntryMotion(rootRef, active, null, 'header');
}
