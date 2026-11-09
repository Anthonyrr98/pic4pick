import { useCallback, useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { LIGHTBOX_MOTION, LIGHTBOX_SWIPE_MOTION } from '../constants/motionPresets';

gsap.registerPlugin(useGSAP);

export function useLightboxImageMotion(photoId, source, failed, imageRef, mediaRef, active = true, sourceCardRef = null) {
  const outgoingRef = useRef(null);
  const switchRef = useRef({ direction: 0, dragX: 0, outgoingX: 0 });
  const revealedImageRef = useRef(null);

  const removeOutgoing = useCallback(() => {
    const outgoing = outgoingRef.current;
    if (!outgoing) return;
    gsap.killTweensOf(outgoing);
    outgoing.remove();
    outgoingRef.current = null;
  }, []);

  const showOutgoing = useCallback(src => {
    const media = mediaRef.current;
    if (!media || !src) return;
    const outgoing = document.createElement('img');
    outgoing.referrerPolicy = 'no-referrer';
    outgoing.src = src;
    outgoing.alt = '';
    outgoing.className = 'lightbox-outgoing-image';
    outgoing.setAttribute('aria-hidden', 'true');
    outgoing.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;opacity:1;transform:none;transition:none;animation:none;pointer-events:none;z-index:1';
    removeOutgoing();
    media.appendChild(outgoing);
    outgoingRef.current = outgoing;
  }, [mediaRef, removeOutgoing]);

  const prepareSwitch = useCallback((direction, dragX = 0) => {
    const image = imageRef.current;
    // Keep the last visible image through multiple requests while images load.
    const imageIsVisible = image?.complete && image.naturalWidth && Number(gsap.getProperty(image, 'opacity')) >= 0.5;
    const visible = imageIsVisible ? image : outgoingRef.current;
    const outgoingX = dragX && visible ? dragX + Number(gsap.getProperty(visible, 'x')) : 0;
    switchRef.current = { direction, dragX, outgoingX };
    if (imageIsVisible) showOutgoing(image.currentSrc || image.src);
  }, [imageRef, showOutgoing]);

  useGSAP(() => {
    const image = imageRef.current;
    if (!photoId) switchRef.current = { direction: 0, dragX: 0, outgoingX: 0 };
    if (!photoId || failed || !image || !active) {
      removeOutgoing();
      if (image) gsap.set(image, { clearProps: 'opacity,transform' });
      return;
    }
    // The loaded grid thumbnail fills the aperture until the preview decodes.
    const thumbnail = sourceCardRef?.current;
    if (thumbnail?.photoId === photoId && !outgoingRef.current && revealedImageRef.current !== image) {
      showOutgoing(thumbnail.src);
    }
    const media = gsap.matchMedia();
    media.add({ reduce: '(prefers-reduced-motion: reduce)', animate: '(prefers-reduced-motion: no-preference)' }, (context, contextSafe) => {
      if (revealedImageRef.current === image) {
        gsap.set(image, { clearProps: 'opacity,transform' });
        removeOutgoing();
        return;
      }
      const { direction, dragX, outgoingX } = switchRef.current;
      const outgoing = outgoingRef.current;
      const reduce = context.conditions.reduce;
      const enterOffset = dragX ? Math.max(LIGHTBOX_MOTION.offset, Math.min(Math.abs(dragX), 48)) : LIGHTBOX_MOTION.offset;
      gsap.set(image, { opacity: 0, x: reduce ? 0 : direction * enterOffset });
      let settle;
      if (outgoing && outgoingX && !reduce) {
        // Transfer the drag into the snapshot's own transform. If the next
        // photo takes time to decode, bring the snapshot back to center.
        gsap.set(outgoing, { x: outgoingX });
        settle = gsap.to(outgoing, { x: 0, delay: LIGHTBOX_SWIPE_MOTION.decodeGrace,
          duration: LIGHTBOX_SWIPE_MOTION.settle, ease: LIGHTBOX_SWIPE_MOTION.ease });
      }
      let revealed = false;
      let alive = true;
      let decoding = 0;
      const reveal = contextSafe(() => {
        if (!alive || revealed || !image.isConnected || !image.complete || !image.naturalWidth) return;
        revealed = true;
        revealedImageRef.current = image;
        settle?.kill();
        if (reduce || document.hidden) {
          gsap.set(image, { opacity: 1, x: 0, clearProps: 'opacity,transform' });
          removeOutgoing();
          return;
        }
        const timeline = gsap.timeline({ onComplete: () => {
          if (outgoingRef.current === outgoing) removeOutgoing();
        } });
        timeline.to(image, { opacity: 1, x: 0, duration: LIGHTBOX_MOTION.duration, ease: LIGHTBOX_MOTION.ease,
          clearProps: 'opacity,transform' });
        if (outgoing) {
          const exitOffset = LIGHTBOX_MOTION.exitOffset
            + (dragX ? Math.max(0, -direction * Number(gsap.getProperty(outgoing, 'x'))) : 0);
          timeline.to(outgoing, { opacity: 0, x: -direction * exitOffset,
            duration: LIGHTBOX_MOTION.exitDuration, ease: LIGHTBOX_MOTION.ease }, 0);
        }
      });
      const decode = () => {
        if (!alive || revealed || !image.complete || !image.naturalWidth) return;
        const request = ++decoding;
        const decodedSource = image.currentSrc || image.src;
        // load can precede decoding a large photograph. A late decode from an
        // abandoned photo/srcset must never start a new animation after cleanup.
        Promise.resolve().then(() => image.decode?.()).catch(() => {}).then(() => {
          if (!alive || request !== decoding) return;
          if ((image.currentSrc || image.src) !== decodedSource) { decode(); return; }
          reveal();
        });
      };
      const visibilityChanged = () => {
        if (!document.hidden || !alive) return;
        gsap.killTweensOf(image);
        settle?.progress(1);
        if (image.complete && image.naturalWidth) {
          revealed = true;
          revealedImageRef.current = image;
          gsap.set(image, { clearProps: 'opacity,transform' });
          removeOutgoing();
        }
      };
      image.addEventListener('load', decode);
      document.addEventListener('visibilitychange', visibilityChanged);
      decode();
      return () => {
        alive = false; decoding++;
        image.removeEventListener('load', decode);
        document.removeEventListener('visibilitychange', visibilityChanged);
      };
    }, mediaRef);
    return () => media.revert();
  }, { scope: mediaRef, dependencies: [photoId, source, failed, active, sourceCardRef], revertOnUpdate: true });

  useGSAP(() => () => removeOutgoing(), { scope: mediaRef });
  return prepareSwitch;
}
