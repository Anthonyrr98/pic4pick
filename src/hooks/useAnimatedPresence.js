import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { MENU_MOTION } from '../constants/motionPresets';

gsap.registerPlugin(useGSAP);

// Retain the dialog until its reverse animation finishes. Opening again
// plays the same timeline forward from its current position.
export function useAnimatedPresence(open, rootRef, { panelSelector, onExited, variant = 'dialog' } = {}) {
  const [present, setPresent] = useState(open);
  const openRef = useRef(open);
  const exitedRef = useRef(onExited);
  const syncRef = useRef(null);
  const enteredRef = useRef(false);

  useLayoutEffect(() => {
    openRef.current = open;
    exitedRef.current = onExited;
    if (open) setPresent(true);
  }, [open, onExited]);

  const finishExit = useCallback(() => {
    if (openRef.current) return;
    enteredRef.current = false;
    setPresent(false);
    exitedRef.current?.();
  }, []);

  useGSAP(() => {
    if (!present || !rootRef.current) return;
    const media = gsap.matchMedia();
    media.add({ reduce: '(prefers-reduced-motion: reduce)', mobile: '(max-width: 600px)',
      animate: '(prefers-reduced-motion: no-preference)' }, context => {
      const root = rootRef.current;
      const panel = panelSelector ? root.querySelector(panelSelector) : null;
      const reduced = context.conditions.reduce;
      const timeline = gsap.timeline({ paused: true, onReverseComplete: finishExit,
        onComplete: () => { enteredRef.current = true; } });
      const menu = variant === 'menu';
      timeline.fromTo(root, { opacity: 0, ...(menu ? { y: MENU_MOTION.offset } : {}) },
        { opacity: 1, ...(menu ? { y: 0 } : {}), duration: menu ? MENU_MOTION.duration : 0.18, ease: 'power2.out' });
      if (menu) timeline.fromTo(root.querySelectorAll('.theme-option'), { opacity: 0, y: 4 },
        { opacity: 1, y: 0, duration: MENU_MOTION.itemDuration, stagger: MENU_MOTION.itemGap,
          ease: MENU_MOTION.ease }, 0.03);
      if (panel) timeline.fromTo(panel, { y: context.conditions.mobile ? 32 : 16 },
        { y: 0, duration: 0.26, ease: 'power3.out' }, 0);
      // A breakpoint/preference change should not replay an already open dialog.
      if (enteredRef.current && openRef.current) timeline.progress(1);
      const sync = () => {
        if (reduced) {
          timeline.progress(1).pause();
          if (!openRef.current) finishExit();
        } else if (openRef.current) timeline.play();
        else if (timeline.progress() === 0) finishExit();
        else timeline.reverse();
      };
      syncRef.current = sync;
      sync();
      return () => { if (syncRef.current === sync) syncRef.current = null; };
    }, rootRef);
    return () => media.revert();
  }, { scope: rootRef, dependencies: [present, panelSelector, variant], revertOnUpdate: true });

  useGSAP(() => { syncRef.current?.(); }, { dependencies: [open, present] });
  return present;
}
