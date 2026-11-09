import { useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { useEntryMotionReady } from '../contexts/EntryMotionContext';
import { FILM_MOTION } from '../constants/motionPresets';

gsap.registerPlugin(useGSAP);

// Loaded prints develop together as they enter the viewport. Seen IDs survive
// view changes, but not the grid's lifetime.
export function useFilmDevelopMotion(rootRef, active, filmFrames) {
  const seenRef = useRef(new Set());
  const ready = useEntryMotionReady();

  useGSAP((_context, contextSafe) => {
    const root = rootRef.current;
    if (!root || !active || !filmFrames || !ready) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const observed = new Set();
    const visible = new Set();
    const running = new Map();
    let stopped = false;
    const keyOf = image => image.closest('[data-photo-id]')?.dataset.photoId;
    const clear = (image, { layers, frame }) => {
      layers.forEach(layer => layer.remove());
      frame.removeAttribute('data-film-developing');
      gsap.set(image, { clearProps: 'opacity,willChange' });
    };
    const finish = image => {
      const motion = running.get(image);
      running.delete(image);
      motion.timeline.kill();
      clear(image, motion);
    };
    const revealVisible = contextSafe(() => {
      if (stopped || preference.matches || document.hidden) return;
      // Every visible, loaded print starts immediately; there is no queue.
      for (const image of visible) {
        const key = keyOf(image);
        if (!key || seenRef.current.has(key) || !image.isConnected
          || !image.classList.contains('loaded') || !image.complete || !image.naturalWidth) continue;
        seenRef.current.add(key);
        const frame = image.closest('.film-negative');
        if (!frame) continue;
        frame.dataset.filmDeveloping = '';
        // Crossfade a static negative over the untouched original. Removing a
        // filter mid-timeline caused a visible colour jump; interpolating the
        // filter on every frame would also repaint every visible photograph.
        // Tween the overlays directly so their opacity can update without
        // invalidating inherited custom properties on the entire print.
        const layers = ['negative', 'emulsion', 'grain'].map(kind => {
          const layer = document.createElement('span');
          layer.className = `film-develop-layer film-develop-${kind}`;
          layer.setAttribute('aria-hidden', 'true');
          return layer;
        });
        const [negative, emulsion, grain] = layers;
        negative.style.backgroundImage = `url(${JSON.stringify(image.currentSrc || image.src)})`;
        frame.append(...layers);
        gsap.set(image, { opacity: 0.65, willChange: 'opacity' });
        const timeline = gsap.timeline({ defaults: { ease: 'power2.out' }, onComplete: () => {
          running.delete(image);
          clear(image, { layers, frame });
        } });
        running.set(image, { timeline, layers, frame });
        timeline.to(negative, { opacity: 0, duration: FILM_MOTION.negativeDuration, ease: FILM_MOTION.ease }, 0.15)
          .to(image, { opacity: 1, duration: FILM_MOTION.imageDuration, ease: FILM_MOTION.ease }, 0.1)
          .to(emulsion, { opacity: 0, duration: FILM_MOTION.duration, ease: FILM_MOTION.ease }, 0)
          .to(grain, { opacity: 0, duration: FILM_MOTION.grainDuration, ease: FILM_MOTION.ease }, 0.4);
      }
    });
    const observer = new IntersectionObserver(entries => {
      for (const { target: image, isIntersecting } of entries) {
        if (isIntersecting) visible.add(image);
        else { visible.delete(image); if (running.has(image)) finish(image); }
      }
      revealVisible();
    });
    const register = image => {
      if (observed.has(image)) return;
      observed.add(image); observer.observe(image);
      if (preference.matches) {
        const key = keyOf(image); if (key) seenRef.current.add(key);
      }
    };
    const unregister = image => {
      if (!observed.has(image) || root.contains(image)) return;
      observer.unobserve(image); observed.delete(image); visible.delete(image);
      if (running.has(image)) finish(image);
    };
    // Observe just added/removed image subtrees. A like, hover, skeleton update
    // or temporary development layer must never rescan the entire grid.
    const visit = (node, callback, removing = false) => {
      if (!(node instanceof Element)) return;
      if (removing ? observed.has(node) : node.matches('.film-negative > img')) callback(node);
      if (node.childElementCount) {
        for (const image of node.querySelectorAll(removing ? 'img' : '.film-negative > img')) callback(image);
      }
    };
    const mutations = new MutationObserver(records => {
      let reveal = false;
      for (const record of records) {
        if (record.type === 'attributes') {
          if (observed.has(record.target) && record.target.classList.contains('loaded')) reveal = true;
          continue;
        }
        for (const node of record.removedNodes) visit(node, unregister, true);
        for (const node of record.addedNodes) visit(node, register);
      }
      if (reveal) revealVisible();
    });
    mutations.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    const settle = () => {
      if (!preference.matches && !document.hidden) { revealVisible(); return; }
      for (const image of running.keys()) finish(image);
      // Reduced motion must not replay skipped prints when switched back.
      if (preference.matches) for (const image of observed) {
        const key = keyOf(image); if (key) seenRef.current.add(key);
      }
    };
    root.addEventListener('load', revealVisible, true);
    preference.addEventListener('change', settle);
    document.addEventListener('visibilitychange', settle);
    root.querySelectorAll('.film-negative > img').forEach(register);
    settle();
    return () => {
      stopped = true;
      observer.disconnect(); mutations.disconnect();
      root.removeEventListener('load', revealVisible, true);
      preference.removeEventListener('change', settle);
      document.removeEventListener('visibilitychange', settle);
      for (const image of running.keys()) finish(image);
    };
  }, { scope: rootRef, dependencies: [active, filmFrames, ready], revertOnUpdate: true });
}
