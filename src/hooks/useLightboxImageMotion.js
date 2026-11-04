import { useCallback, useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { LIGHTBOX_MOTION } from '../constants/motionPresets';

gsap.registerPlugin(useGSAP);

export function useLightboxImageMotion(photoId, source, failed, imageRef, mediaRef, active = true) {
  const outgoingRef = useRef(null);
  const directionRef = useRef(0);
  const revealedImageRef = useRef(null);

  const removeOutgoing = useCallback(() => {
    const outgoing = outgoingRef.current;
    if (!outgoing) return;
    gsap.killTweensOf(outgoing);
    outgoing.remove();
    outgoingRef.current = null;
  }, []);

  const prepareSwitch = useCallback(direction => {
    directionRef.current = direction;
    const image = imageRef.current;
    // Keep the last visible image through multiple requests while images load.
    if (!image?.complete || !image.naturalWidth || Number(gsap.getProperty(image, 'opacity')) < 0.5) return;
    const outgoing = image.cloneNode(false);
    outgoing.removeAttribute('srcset');
    outgoing.removeAttribute('sizes');
    outgoing.src = image.currentSrc || image.src;
    outgoing.alt = '';
    outgoing.className = 'lightbox-outgoing-image';
    outgoing.setAttribute('aria-hidden', 'true');
    outgoing.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;opacity:1;transform:none;transition:none;animation:none;pointer-events:none;z-index:1';
    removeOutgoing();
    mediaRef.current?.appendChild(outgoing);
    outgoingRef.current = outgoing;
  }, [imageRef, mediaRef, removeOutgoing]);

  useGSAP(() => {
    const image = imageRef.current;
    if (!photoId) directionRef.current = 0;
    if (!photoId || failed || !image || !active) {
      removeOutgoing();
      if (image) gsap.set(image, { clearProps: 'opacity,transform' });
      return;
    }
    const media = gsap.matchMedia();
    media.add({ reduce: '(prefers-reduced-motion: reduce)', animate: '(prefers-reduced-motion: no-preference)' }, (context, contextSafe) => {
      if (revealedImageRef.current === image) {
        gsap.set(image, { clearProps: 'opacity,transform' });
        removeOutgoing();
        return;
      }
      const direction = directionRef.current;
      gsap.set(image, { opacity: 0, x: context.conditions.reduce ? 0 : direction * LIGHTBOX_MOTION.offset });
      let revealed = false;
      let alive = true;
      let decoding = 0;
      const reveal = contextSafe(() => {
        if (!alive || revealed || !image.isConnected || !image.complete || !image.naturalWidth) return;
        revealed = true;
        revealedImageRef.current = image;
        if (context.conditions.reduce || document.hidden) {
          gsap.set(image, { opacity: 1, x: 0, clearProps: 'opacity,transform' });
          removeOutgoing();
          return;
        }
        const outgoing = outgoingRef.current;
        const timeline = gsap.timeline({ onComplete: () => {
          if (outgoingRef.current === outgoing) removeOutgoing();
        } });
        timeline.to(image, { opacity: 1, x: 0, duration: LIGHTBOX_MOTION.duration, ease: LIGHTBOX_MOTION.ease,
          clearProps: 'opacity,transform' });
        if (outgoing) timeline.to(outgoing, { opacity: 0, x: -direction * LIGHTBOX_MOTION.exitOffset,
          duration: LIGHTBOX_MOTION.exitDuration, ease: LIGHTBOX_MOTION.ease }, 0);
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
  }, { scope: mediaRef, dependencies: [photoId, source, failed, active], revertOnUpdate: true });

  useGSAP(() => () => removeOutgoing(), { scope: mediaRef });
  return prepareSwitch;
}
