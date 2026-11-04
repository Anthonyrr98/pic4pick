import { useCallback, useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);

export function useLightboxImageMotion(photoId, source, failed, imageRef, mediaRef) {
  const outgoingRef = useRef(null);
  const directionRef = useRef(0);

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
    if (!photoId || failed || !image) { removeOutgoing(); return; }
    const media = gsap.matchMedia();
    media.add({ reduce: '(prefers-reduced-motion: reduce)', animate: '(prefers-reduced-motion: no-preference)' }, (context, contextSafe) => {
      const direction = directionRef.current;
      gsap.set(image, { opacity: 0, x: context.conditions.reduce ? 0 : direction * 18 });
      let revealed = false;
      const reveal = contextSafe(() => {
        if (revealed || !image.naturalWidth) return;
        revealed = true;
        if (context.conditions.reduce) {
          gsap.set(image, { opacity: 1, x: 0, clearProps: 'opacity,transform' });
          removeOutgoing();
          return;
        }
        const outgoing = outgoingRef.current;
        const timeline = gsap.timeline({ onComplete: () => {
          if (outgoingRef.current === outgoing) removeOutgoing();
        } });
        timeline.to(image, { opacity: 1, x: 0, duration: 0.24, ease: 'power2.out', clearProps: 'opacity,transform' });
        if (outgoing) timeline.to(outgoing, { opacity: 0, x: -direction * 12, duration: 0.2, ease: 'power2.out' }, 0);
      });
      image.addEventListener('load', reveal);
      if (image.complete && image.naturalWidth) reveal();
      return () => image.removeEventListener('load', reveal);
    }, mediaRef);
    return () => media.revert();
  }, { scope: mediaRef, dependencies: [photoId, source, failed], revertOnUpdate: true });

  useGSAP(() => () => removeOutgoing(), { scope: mediaRef });
  return prepareSwitch;
}
