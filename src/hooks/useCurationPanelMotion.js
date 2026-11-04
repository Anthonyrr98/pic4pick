import { useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { PANEL_MOTION, FEEDBACK_MOTION } from '../constants/motionPresets';

gsap.registerPlugin(useGSAP);

export function useCurationPanelMotion(panelRef, bodyRef, { active, mobile, collapsed, height, keyboard, viewKey }) {
  const updateRef = useRef(null);
  const activeRef = useRef(active);
  const viewportRef = useRef({ mobile, keyboard });
  useGSAP(() => { activeRef.current = active; }, { dependencies: [active] });

  useGSAP((_context, contextSafe) => {
    const panel = panelRef.current;
    const body = bodyRef.current;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let previous = null;
    let frame = 0;
    let tween;
    const setBodyScale = gsap.quickSetter(body, 'scaleY');
    const setBodyY = gsap.quickSetter(body, 'y', 'px');
    const update = contextSafe((instant = false) => {
      const scale = Number(gsap.getProperty(panel, 'scaleY')) || 1;
      const y = Number(gsap.getProperty(panel, 'y')) || 0;
      const rect = panel.getBoundingClientRect();
      if (!rect.height || !rect.width) {
        tween?.kill(); previous = null;
        gsap.set([panel, body], { clearProps: 'transform,transformOrigin' });
        delete panel.dataset.animating; delete panel.dataset.focusBottom;
        return;
      }
      const next = { height: rect.height / scale, bottom: rect.bottom - y, width: rect.width };
      // The camera uses final geometry, even while the panel is still moving.
      panel.dataset.focusBottom = String(next.bottom);
      if (!instant && previous && Math.abs(previous.height - next.height) < 0.5 &&
        Math.abs(previous.bottom - next.bottom) < 0.5 && Math.abs(previous.width - next.width) < 0.5) return;
      tween?.kill();
      const old = previous;
      previous = next;
      if (!old || instant || preference.matches || !activeRef.current || Math.abs(old.width - next.width) > 1) {
        gsap.set([panel, body], { clearProps: 'transform,transformOrigin' });
        delete panel.dataset.animating;
        return;
      }
      const padding = Number.parseFloat(getComputedStyle(panel).paddingTop) || 0;
      gsap.set(panel, { transformOrigin: '50% 100%', scaleY: old.height * scale / next.height,
        y: old.bottom + y - next.bottom });
      gsap.set(body, { transformOrigin: '50% 0%' });
      const compensate = () => {
        const currentScale = Number(gsap.getProperty(panel, 'scaleY')) || 1;
        setBodyScale(1 / currentScale);
        setBodyY(padding * (1 / currentScale - 1));
      };
      compensate();
      panel.dataset.animating = 'true';
      tween = gsap.to(panel, { scaleY: 1, y: 0, duration: PANEL_MOTION.duration, ease: PANEL_MOTION.ease,
        onUpdate: compensate, onComplete: () => {
          gsap.set([panel, body], { clearProps: 'transform,transformOrigin' });
          delete panel.dataset.animating;
        } });
    });
    updateRef.current = update;
    update(true);
    const resize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => update());
    };
    const preferenceChanged = () => update(true);
    const visibilityChanged = () => { if (document.hidden) update(true); };
    const observer = new ResizeObserver(resize);
    observer.observe(panel);
    preference.addEventListener('change', preferenceChanged);
    document.addEventListener('visibilitychange', visibilityChanged);
    return () => {
      cancelAnimationFrame(frame); observer.disconnect(); tween?.kill();
      preference.removeEventListener('change', preferenceChanged);
      document.removeEventListener('visibilitychange', visibilityChanged);
      delete panel.dataset.animating; delete panel.dataset.focusBottom;
      updateRef.current = null;
    };
  }, { scope: panelRef });

  useGSAP(() => {
    const snap = !active || viewportRef.current.mobile !== mobile || viewportRef.current.keyboard !== keyboard;
    viewportRef.current = { mobile, keyboard };
    updateRef.current?.(snap);
  }, {
    dependencies: [active, mobile, collapsed, height, keyboard, viewKey],
  });

  useGSAP(() => {
    if (!active || collapsed || keyboard || document.hidden) return;
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      const content = panelRef.current.querySelectorAll('.curation-gallery-header, .discover-search, .curation-panel-scroll > :first-child');
      if (content.length) gsap.fromTo(content, { opacity: 0, y: PANEL_MOTION.contentOffset },
        { opacity: 1, y: 0, duration: FEEDBACK_MOTION.duration, ease: FEEDBACK_MOTION.ease,
          stagger: { amount: 0.04 }, clearProps: 'opacity,transform' });
    }, panelRef);
    return () => media.revert();
  }, { scope: panelRef, dependencies: [active, collapsed, viewKey, keyboard], revertOnUpdate: true });
}
