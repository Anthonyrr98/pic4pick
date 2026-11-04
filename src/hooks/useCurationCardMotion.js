import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { HOVER_MOTION } from '../constants/motionPresets';

gsap.registerPlugin(useGSAP);

// Delegate to the panel and retain just one controller. Bounds are read before
// the card tilts, never from an already transformed card on each pointer event.
export function useCurationCardMotion(rootRef, enabled) {
  useGSAP(() => {
    const root = rootRef.current;
    if (!root || !enabled) return;
    const preference = window.matchMedia('(min-width: 769px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
    const context = gsap.context(() => {}, root);
    let active = null;
    const reset = () => {
      context.revert();
      if (active) delete active.card.dataset.motionHover;
      active = null;
    };
    const move = event => {
      if (event.pointerType !== 'mouse' || !preference.matches) return;
      const card = event.target.closest('.curation-card');
      if (!card || !root.contains(card)) return;
      if (active?.card !== card) {
        reset();
        const rect = card.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        context.add(() => {
          const controller = { card, rect, hovering: true };
          card.dataset.motionHover = '';
          gsap.set(card, { rotationX: 0, rotationY: 0, z: 0, willChange: 'transform',
            '--cursor-x': '50%', '--cursor-y': '50%' });
          const options = { duration: HOVER_MOTION.duration, ease: HOVER_MOTION.ease };
          controller.rx = gsap.quickTo(card, 'rotationX', options);
          controller.ry = gsap.quickTo(card, 'rotationY', options);
          controller.z = gsap.quickTo(card, 'z', { duration: HOVER_MOTION.duration, ease: HOVER_MOTION.ease,
            onComplete: () => { if (active === controller && !controller.hovering) reset(); } });
          controller.lightX = gsap.quickSetter(card, '--cursor-x', '%');
          controller.lightY = gsap.quickSetter(card, '--cursor-y', '%');
          active = controller;
        });
      }
      const x = Math.max(0, Math.min(1, (event.clientX - active.rect.left) / active.rect.width));
      const y = Math.max(0, Math.min(1, (event.clientY - active.rect.top) / active.rect.height));
      active.hovering = true;
      active.rx((0.5 - y) * HOVER_MOTION.cityTilt * 2);
      active.ry((x - 0.5) * HOVER_MOTION.cityTilt * 2);
      active.z(HOVER_MOTION.cityDepth);
      active.lightX(x * 100); active.lightY(y * 100);
    };
    const leave = event => {
      if (!active || event.relatedTarget instanceof Node && active.card.contains(event.relatedTarget)) return;
      active.hovering = false;
      active.rx(0); active.ry(0); active.z(0);
      active.lightX(50); active.lightY(50);
    };
    const mutations = new MutationObserver(() => {
      if (active && !root.contains(active.card)) reset();
    });
    const resize = new ResizeObserver(reset);
    mutations.observe(root, { childList: true, subtree: true });
    resize.observe(root);
    root.addEventListener('pointerover', move);
    root.addEventListener('pointermove', move);
    root.addEventListener('pointerout', leave);
    root.addEventListener('pointercancel', reset);
    window.addEventListener('scroll', reset, true);
    window.addEventListener('resize', reset);
    document.addEventListener('visibilitychange', reset);
    preference.addEventListener('change', reset);
    return () => {
      reset(); mutations.disconnect(); resize.disconnect();
      root.removeEventListener('pointerover', move);
      root.removeEventListener('pointermove', move);
      root.removeEventListener('pointerout', leave);
      root.removeEventListener('pointercancel', reset);
      window.removeEventListener('scroll', reset, true);
      window.removeEventListener('resize', reset);
      document.removeEventListener('visibilitychange', reset);
      preference.removeEventListener('change', reset);
    };
  }, { scope: rootRef, dependencies: [enabled], revertOnUpdate: true });
}
