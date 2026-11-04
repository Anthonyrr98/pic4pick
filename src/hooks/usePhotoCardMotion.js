import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);

// One delegated controller per grid; idle cards never get tweens or layers.
export function usePhotoCardMotion(rootRef, enabled, filmFrames) {
  useGSAP(() => {
    const root = rootRef.current;
    if (!enabled || !root) return;
    const preference = window.matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
    const context = gsap.context(() => {}, root);
    let active = null;
    const reset = () => {
      context.revert();
      if (active) delete active.card.dataset.motionHover;
      active = null;
    };
    const move = event => {
      if (event.pointerType !== 'mouse' || !preference.matches) return;
      const card = event.target.closest('.photo-card');
      if (!card || !root.contains(card)) return;
      const image = filmFrames ? null : card.querySelector('img');
      if (active?.card !== card || active.image !== image) {
        reset();
        // Read before writing transforms; never measure a tilted card per event.
        const rect = card.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        context.add(() => {
          const options = { duration: 0.26, ease: 'power3.out' };
          const controller = { card, image, rect, hovering: true };
          // CSS owns the card transform so GSAP never folds the independent
          // CSS entry-animation translate into a persistent inline transform.
          card.dataset.motionHover = '';
          gsap.set(card, { '--motion-rotate-x': '0deg', '--motion-rotate-y': '0deg',
            '--motion-lift': '0px', willChange: 'transform' });
          controller.rx = gsap.quickTo(card, '--motion-rotate-x', options);
          controller.ry = gsap.quickTo(card, '--motion-rotate-y', options);
          if (image) {
            controller.x = gsap.quickTo(image, 'x', options);
            controller.y = gsap.quickTo(image, 'y', options);
          }
          controller.lift = gsap.quickTo(card, '--motion-lift', { ...options, onComplete: () => {
            if (active === controller && !controller.hovering) reset();
          } });
          active = controller;
        });
      }
      const { rect } = active;
      const x = Math.max(-0.5, Math.min(0.5, (event.clientX - rect.left) / rect.width - 0.5));
      const y = Math.max(-0.5, Math.min(0.5, (event.clientY - rect.top) / rect.height - 0.5));
      active.hovering = true;
      active.rx(filmFrames ? 0 : -y * 6);
      active.ry(filmFrames ? 0 : x * 6);
      active.x?.(-x * 2 * Math.min(5, rect.width * 0.015));
      active.y?.(-y * 2 * Math.min(5, rect.height * 0.015));
      active.lift(filmFrames ? -3 : -6);
    };
    const leave = event => {
      if (!active || active.card.contains(event.relatedTarget)) return;
      active.hovering = false;
      active.rx(0); active.ry(0); active.x?.(0); active.y?.(0); active.lift(0);
    };
    const observer = new MutationObserver(() => {
      if (active && (!root.contains(active.card) || active.image && !active.card.contains(active.image))) reset();
    });
    observer.observe(root, { childList: true, subtree: true });
    root.addEventListener('pointerover', move);
    root.addEventListener('pointermove', move);
    root.addEventListener('pointerout', leave);
    root.addEventListener('pointercancel', reset);
    window.addEventListener('scroll', reset, true);
    window.addEventListener('resize', reset);
    document.addEventListener('visibilitychange', reset);
    preference.addEventListener('change', reset);
    return () => {
      reset(); observer.disconnect();
      root.removeEventListener('pointerover', move);
      root.removeEventListener('pointermove', move);
      root.removeEventListener('pointerout', leave);
      root.removeEventListener('pointercancel', reset);
      window.removeEventListener('scroll', reset, true);
      window.removeEventListener('resize', reset);
      document.removeEventListener('visibilitychange', reset);
      preference.removeEventListener('change', reset);
    };
  }, { scope: rootRef, dependencies: [enabled, filmFrames], revertOnUpdate: true });
}
