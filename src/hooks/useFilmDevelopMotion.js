import { useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { useEntryMotionReady } from '../contexts/EntryMotionContext';

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
    const clear = (image, negative, frame = image.closest('.film-negative')) => {
      negative?.remove();
      frame?.removeAttribute('data-film-developing');
      frame?.style.removeProperty('--film-emulsion-opacity');
      frame?.style.removeProperty('--film-grain-opacity');
      gsap.set(image, { clearProps: 'opacity,willChange' });
    };
    const finish = image => {
      const motion = running.get(image);
      running.delete(image);
      motion?.timeline.kill();
      clear(image, motion?.negative, motion?.frame);
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
        gsap.set(frame, { '--film-emulsion-opacity': 0.9, '--film-grain-opacity': 0.2 });
        // Crossfade a static negative over the untouched original. Removing a
        // filter mid-timeline caused a visible colour jump; interpolating the
        // filter on every frame would also repaint every visible photograph.
        const negative = document.createElement('span');
        negative.className = 'film-develop-negative';
        negative.setAttribute('aria-hidden', 'true');
        negative.style.backgroundImage = `url(${JSON.stringify(image.currentSrc || image.src)})`;
        frame.appendChild(negative);
        gsap.set(image, { opacity: 0.65, willChange: 'opacity' });
        const timeline = gsap.timeline({ defaults: { ease: 'power2.out' }, onComplete: () => {
          running.delete(image);
          clear(image, negative, frame);
        } });
        running.set(image, { timeline, negative, frame });
        timeline.to(negative, { opacity: 0, duration: 2.75, ease: 'sine.inOut' }, 0.15)
          .to(image, { opacity: 1, duration: 2.8, ease: 'sine.inOut' }, 0.1)
          .to(frame, { '--film-emulsion-opacity': 0, duration: 3.2, ease: 'sine.inOut' }, 0)
          .to(frame, { '--film-grain-opacity': 0, duration: 2.8, ease: 'sine.inOut' }, 0.4);
      }
    });
    const observer = new IntersectionObserver(entries => {
      for (const { target: image, isIntersecting } of entries) {
        if (isIntersecting) visible.add(image);
        else { visible.delete(image); if (running.has(image)) finish(image); }
      }
      revealVisible();
    });
    const scan = () => {
      for (const image of observed) {
        if (!root.contains(image)) {
          observer.unobserve(image); observed.delete(image); visible.delete(image);
          if (running.has(image)) finish(image);
        }
      }
      for (const image of root.querySelectorAll('.film-negative > img')) {
        if (!observed.has(image)) { observed.add(image); observer.observe(image); }
        if (preference.matches) {
          const key = keyOf(image); if (key) seenRef.current.add(key);
        }
      }
      revealVisible();
    };
    const mutations = new MutationObserver(scan);
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
    scan();
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
