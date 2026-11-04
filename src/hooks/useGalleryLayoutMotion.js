import { useLayoutEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { Flip } from 'gsap/Flip';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(Flip, useGSAP);

const inViewport = node => {
  const rect = node.getBoundingClientRect();
  return rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
};

// Capture explicitly before the filter state changes. Refreshes, likes and
// pagination never capture a state, so they cannot replay a layout transition.
export function useGalleryLayoutMotion(rootRef, active, filterKey, prepareRef, filmFrames) {
  const pendingRef = useRef(null);
  const playRef = useRef(null);

  useGSAP((_context, contextSafe) => {
    const root = rootRef.current;
    if (!root) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let animation;
    let targets = [];
    const clear = () => {
      animation?.kill(); animation = null;
      gsap.set(targets, { clearProps: 'transform,transformOrigin,translate,rotate,scale,width,height,position,top,left' });
      targets = [];
      delete root.dataset.layoutMotion;
    };
    const cancel = () => { pendingRef.current = null; clear(); };
    const capture = nextFilter => {
      root.dispatchEvent(new Event('gallerylayoutstart'));
      const cards = [...root.querySelectorAll('.photo-card')];
      // Film changes the whole print geometry and theme. Keep its full-image
      // reveal instead of stretching a cropped card into a film aperture.
      if (!active || preference.matches || document.hidden || (nextFilter === 'film') !== filmFrames) {
        cancel(); return;
      }
      const visible = cards.filter(inViewport);
      const state = Flip.getState(visible, { kill: false });
      clear();
      pendingRef.current = { state, ids: new Set(visible.map(card => card.dataset.photoId)) };
    };
    const play = contextSafe(() => {
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (!pending || preference.matches || document.hidden || !active) { clear(); return; }
      targets = [...root.querySelectorAll('.photo-card')].filter(card => pending.ids.has(card.dataset.photoId));
      if (!targets.length) return;
      root.dataset.layoutMotion = '';
      animation = Flip.from(pending.state, { targets, duration: 0.38, ease: 'power3.out',
        scale: true, prune: true, onComplete: clear });
    });
    if (prepareRef) prepareRef.current = capture;
    playRef.current = play;
    const preferenceChanged = () => { if (preference.matches) cancel(); };
    const visibilityChanged = () => { if (document.hidden) cancel(); };
    root.addEventListener('wheel', cancel, { passive: true });
    window.addEventListener('scroll', cancel, true);
    window.addEventListener('resize', cancel);
    preference.addEventListener('change', preferenceChanged);
    document.addEventListener('visibilitychange', visibilityChanged);
    return () => {
      cancel();
      if (prepareRef?.current === capture) prepareRef.current = null;
      playRef.current = null;
      root.removeEventListener('wheel', cancel);
      window.removeEventListener('scroll', cancel, true);
      window.removeEventListener('resize', cancel);
      preference.removeEventListener('change', preferenceChanged);
      document.removeEventListener('visibilitychange', visibilityChanged);
    };
  }, { scope: rootRef, dependencies: [active, prepareRef, filmFrames], revertOnUpdate: true });

  useLayoutEffect(() => { playRef.current?.(); }, [filterKey]);
}
