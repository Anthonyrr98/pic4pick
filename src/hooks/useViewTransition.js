import { useCallback, useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { VIEW_MOTION } from '../constants/motionPresets';

gsap.registerPlugin(useGSAP);

// Commit the next React view between the two fades. Only the active view owns
// layout, so the map is measured at its real size and never scaled or remounted.
export function useViewTransition(rootRef, view, onChange) {
  const currentRef = useRef(view);
  const requestedRef = useRef(view);
  const changeRef = useRef(onChange);
  const requestRef = useRef(null);
  const arriveRef = useRef(null);

  useGSAP((_context, contextSafe) => {
    const root = rootRef.current;
    if (!root) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const positions = new Map();
    const touched = new Set();
    let animation;
    let first = true;
    const screen = name => [...root.querySelectorAll('[data-view-screen]')]
      .find(node => node.dataset.viewScreen === name);
    const clear = () => {
      animation?.kill(); animation = null;
      for (const node of touched) {
        gsap.set(node, { clearProps: 'opacity' });
        node.inert = node.dataset.viewScreen !== currentRef.current;
      }
      delete root.dataset.viewTransition;
    };
    const commit = () => changeRef.current(requestedRef.current);
    const settle = () => { clear(); commit(); };
    const request = contextSafe(next => {
      if (next === requestedRef.current) return;
      requestedRef.current = next;
      const outgoing = screen(currentRef.current);
      animation?.kill();
      if (next !== currentRef.current) {
        positions.set(currentRef.current, window.scrollY);
        outgoing?.dispatchEvent(new Event('viewleavestart'));
      }
      if (outgoing?.contains(document.activeElement)) {
        [...root.querySelectorAll('[data-view-target]')]
          .find(node => node.dataset.viewTarget === next)?.focus({ preventScroll: true });
      }
      if (!outgoing || preference.matches || document.hidden) { settle(); return; }
      touched.add(outgoing);
      const returning = next === currentRef.current;
      outgoing.inert = !returning;
      root.dataset.viewTransition = returning ? 'in' : 'out';
      animation = gsap.to(outgoing, { opacity: returning ? 1 : 0,
        duration: returning ? VIEW_MOTION.enter : VIEW_MOTION.leave, ease: VIEW_MOTION.ease,
        onComplete: returning ? clear : commit });
    });
    const arrive = contextSafe(next => {
      currentRef.current = next;
      clear();
      if (first) { first = false; requestedRef.current = next; return; }
      // A second tap may have arrived after the leave callback but before the
      // React commit. Resolve that request before painting an obsolete view.
      if (next !== requestedRef.current) { commit(); return; }
      window.scrollTo({ top: positions.get(next) || 0, behavior: 'instant' });
      const incoming = screen(next);
      if (!incoming) return;
      touched.add(incoming); incoming.inert = false;
      if (preference.matches || document.hidden) return;
      root.dataset.viewTransition = 'in';
      animation = gsap.fromTo(incoming, { opacity: 0 }, { opacity: 1,
        duration: VIEW_MOTION.enter, ease: VIEW_MOTION.ease, onComplete: clear });
    });
    requestRef.current = request;
    arriveRef.current = arrive;
    const preferenceChanged = () => { if (preference.matches) settle(); };
    const visibilityChanged = () => { if (document.hidden) settle(); };
    window.addEventListener('resize', settle);
    document.addEventListener('visibilitychange', visibilityChanged);
    preference.addEventListener('change', preferenceChanged);
    return () => {
      clear(); touched.forEach(node => { node.inert = false; });
      window.removeEventListener('resize', settle);
      document.removeEventListener('visibilitychange', visibilityChanged);
      preference.removeEventListener('change', preferenceChanged);
      requestRef.current = null; arriveRef.current = null;
    };
  }, { scope: rootRef });

  useGSAP(() => {
    changeRef.current = onChange;
  }, { dependencies: [onChange] });

  useGSAP(() => {
    arriveRef.current?.(view);
  }, { dependencies: [view] });
  return useCallback(next => requestRef.current?.(next), []);
}
