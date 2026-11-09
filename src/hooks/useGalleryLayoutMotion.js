import { useLayoutEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { Flip } from 'gsap/Flip';
import { useGSAP } from '@gsap/react';
import { LAYOUT_MOTION } from '../constants/motionPresets';

gsap.registerPlugin(Flip, useGSAP);

const inViewport = node => {
  const rect = node.getBoundingClientRect();
  return rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
};

function visibleCards(root, moving) {
  const cards = root.querySelectorAll(':scope > .photo-card');
  const viewportTop = -root.getBoundingClientRect().top - root.clientTop;
  const viewportBottom = viewportTop + window.innerHeight;
  // The grid flows in DOM order. offsetTop uses each row's layout position,
  // even while an interrupted Flip is rendering a card elsewhere.
  let first = 0;
  let end = cards.length;
  while (first < end) {
    const middle = (first + end) >>> 1;
    if (cards[middle].offsetTop < viewportTop) first = middle + 1;
    else end = middle;
  }
  const previousRow = cards[first - 1]?.offsetTop;
  while (first > 0 && cards[first - 1].offsetTop === previousRow) first--;
  const candidates = new Set(moving);
  // Include the preceding row for a partial intersection and allow one pixel
  // for offsetTop rounding. Rects are read only for these rows and active cards.
  for (let i = first; i < cards.length && cards[i].offsetTop <= viewportBottom + 1; i++) {
    candidates.add(cards[i]);
  }
  return [...candidates].filter(inViewport);
}

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
      // Retargeting captures the currently rendered geometry, then releases
      // the previous Flip without allowing its completion to clear the next.
      animation?.eventCallback('onComplete', null);
      animation?.kill(); animation = null;
      if (targets.length) {
        gsap.set(targets, { clearProps: 'transform,transformOrigin,translate,rotate,scale,width,height,position,top,left' });
      }
      targets = [];
      delete root.dataset.layoutMotion;
    };
    const cancel = () => { pendingRef.current = null; clear(); };
    const capture = nextFilter => {
      root.dispatchEvent(new Event('gallerylayoutstart'));
      // Film changes the whole print geometry and theme. Keep its full-image
      // reveal instead of stretching a cropped card into a film aperture.
      if (!active || preference.matches || document.hidden || (nextFilter === 'film') !== filmFrames) {
        cancel(); return;
      }
      const cards = visibleCards(root, targets);
      const state = cards.length ? Flip.getState(cards, { kill: false }) : null;
      clear();
      pendingRef.current = state ? { state, cards } : null;
    };
    const play = contextSafe(() => {
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (!pending || preference.matches || document.hidden || !active) { clear(); return; }
      targets = pending.cards.filter(card => card.parentElement === root);
      if (!targets.length) return;
      root.dataset.layoutMotion = '';
      animation = Flip.from(pending.state, { targets, ...LAYOUT_MOTION,
        scale: true, prune: true, onComplete: clear });
    });
    if (prepareRef) prepareRef.current = capture;
    playRef.current = play;
    const preferenceChanged = () => { if (preference.matches) cancel(); };
    const visibilityChanged = () => { if (document.hidden) cancel(); };
    root.addEventListener('wheel', cancel, { passive: true });
    root.addEventListener('pointerdown', cancel, { passive: true });
    window.addEventListener('scroll', cancel, true);
    window.addEventListener('resize', cancel);
    preference.addEventListener('change', preferenceChanged);
    document.addEventListener('visibilitychange', visibilityChanged);
    return () => {
      cancel();
      if (prepareRef?.current === capture) prepareRef.current = null;
      playRef.current = null;
      root.removeEventListener('wheel', cancel);
      root.removeEventListener('pointerdown', cancel);
      window.removeEventListener('scroll', cancel, true);
      window.removeEventListener('resize', cancel);
      preference.removeEventListener('change', preferenceChanged);
      document.removeEventListener('visibilitychange', visibilityChanged);
    };
  }, { scope: rootRef, dependencies: [active, prepareRef, filmFrames], revertOnUpdate: true });

  useLayoutEffect(() => { playRef.current?.(); }, [filterKey]);
}
