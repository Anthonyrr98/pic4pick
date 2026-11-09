import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { LIGHTBOX_SWIPE_MOTION } from '../constants/motionPresets';

gsap.registerPlugin(useGSAP);

const swipeX = '--lightbox-swipe-x';

export function useLightboxSwipe(mediaRef, enabled, photoId, onSwitch) {
  useGSAP((_context, contextSafe) => {
    const media = mediaRef.current;
    if (!enabled || !media) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const setX = gsap.quickSetter(media, swipeX, 'px');
    let gesture;
    let rebound;
    let x = 0;
    const clearOffset = () => {
      rebound?.kill();
      rebound = null;
      x = 0;
      media.style.removeProperty(swipeX);
    };
    const reset = () => {
      gesture = null;
      clearOffset();
    };
    const returnToCenter = contextSafe(() => {
      if (!x || preference.matches || document.hidden) {
        clearOffset();
        return;
      }
      rebound?.kill();
      rebound = gsap.to(media, { [swipeX]: '0px', duration: LIGHTBOX_SWIPE_MOTION.settle,
        ease: LIGHTBOX_SWIPE_MOTION.ease, onComplete: clearOffset });
    });
    const down = event => {
      if (gesture || event.pointerType === 'mouse' || !event.isPrimary
        || media.closest('[data-shared-photo-motion]')) return;
      const width = media.clientWidth;
      gesture = { id: event.pointerId, x: event.clientX, y: event.clientY,
        limit: Math.min(LIGHTBOX_SWIPE_MOTION.maxDrag, width * 0.35),
        threshold: Math.min(LIGHTBOX_SWIPE_MOTION.threshold, width * 0.2),
        axis: null, base: 0 };
    };
    const horizontalDelta = event => {
      const dx = event.clientX - gesture.x;
      const dy = event.clientY - gesture.y;
      if (!gesture.axis && Math.max(Math.abs(dx), Math.abs(dy)) >= LIGHTBOX_SWIPE_MOTION.slop) {
        if (Math.abs(dx) > Math.abs(dy) * 1.2) {
          gesture.axis = 'x';
          x = parseFloat(media.style.getPropertyValue(swipeX)) || 0;
          gesture.base = x;
          rebound?.kill();
          rebound = null;
        } else if (Math.abs(dy) >= Math.abs(dx)) {
          gesture.axis = 'y';
        }
      }
      return gesture.axis === 'x' ? dx : 0;
    };
    const move = event => {
      if (gesture?.id !== event.pointerId) return;
      const dx = horizontalDelta(event);
      if (gesture.axis !== 'x' || preference.matches) return;
      x = gsap.utils.clamp(-gesture.limit, gesture.limit, dx + gesture.base);
      setX(x);
    };
    const up = event => {
      if (gesture?.id !== event.pointerId) return;
      const dx = horizontalDelta(event);
      const commit = Math.abs(dx) >= gesture.threshold && gesture.axis === 'x';
      gesture = null;
      if (commit) {
        // Keep the drag pose until the photo commit hands it to the outgoing image.
        onSwitch(dx < 0 ? 1 : -1, x);
      } else if (x) {
        returnToCenter();
      }
    };
    const cancel = event => {
      if (gesture?.id !== event.pointerId) return;
      gesture = null;
      returnToCenter();
    };
    const visibilityChanged = () => { if (document.hidden) reset(); };

    media.addEventListener('pointerdown', down);
    media.addEventListener('pointermove', move);
    media.addEventListener('pointerup', up);
    media.addEventListener('pointercancel', cancel);
    media.addEventListener('lostpointercapture', cancel);
    window.addEventListener('resize', reset);
    preference.addEventListener('change', reset);
    document.addEventListener('visibilitychange', visibilityChanged);
    return () => {
      media.removeEventListener('pointerdown', down);
      media.removeEventListener('pointermove', move);
      media.removeEventListener('pointerup', up);
      media.removeEventListener('pointercancel', cancel);
      media.removeEventListener('lostpointercapture', cancel);
      window.removeEventListener('resize', reset);
      preference.removeEventListener('change', reset);
      document.removeEventListener('visibilitychange', visibilityChanged);
      reset();
    };
  }, { scope: mediaRef, dependencies: [enabled, photoId, onSwitch], revertOnUpdate: true });
}
