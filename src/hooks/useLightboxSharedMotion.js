import { useCallback, useRef } from 'react';
import { gsap } from 'gsap';
import { Flip } from 'gsap/Flip';
import { useGSAP } from '@gsap/react';
import { SHARED_PHOTO_MOTION } from '../constants/motionPresets';

gsap.registerPlugin(Flip, useGSAP);

function readCard(card) {
  if (!card?.isConnected) return null;
  const rect = card.getBoundingClientRect();
  if (!rect.width || !rect.height || rect.bottom <= 0 || rect.top >= window.innerHeight
    || rect.right <= 0 || rect.left >= window.innerWidth) return null;
  const style = getComputedStyle(card);
  if (style.visibility !== 'visible') return null;
  return { rect, radius: parseFloat(style.borderTopLeftRadius) || 0 };
}

export function captureLightboxSource(card, photoId) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.hidden) return null;
  const origin = readCard(card);
  const image = card?.querySelector('img.loaded');
  if (!origin || !image?.complete || !image.naturalWidth || !image.currentSrc) return null;
  return { card, photoId, origin, src: image.currentSrc,
    aspect: image.naturalWidth / image.naturalHeight };
}

function coverPose({ rect, radius }, width, height) {
  const scale = Math.max(rect.width / width, rect.height / height);
  const insetX = (width - rect.width / scale) / 2;
  const insetY = (height - rect.height / scale) / 2;
  return {
    x: rect.left - insetX * scale,
    y: rect.top - insetY * scale,
    scale,
    clipPath: `inset(${insetY}px ${insetX}px round ${radius / scale}px)`,
  };
}

export function useLightboxSharedMotion({ rootRef, mediaRef, imageRef, sourceRef, photoId, present, failed }) {
  const closeRef = useRef(null);

  useGSAP((_context, contextSafe) => {
    const source = sourceRef.current;
    if (!present || failed || !source || source.photoId !== photoId) return;
    const root = rootRef.current;
    const media = mediaRef.current;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!root || !media || preference.matches || document.hidden) return;
    const { width, height } = media.getBoundingClientRect();
    if (!width || !height) return;
    const radius = parseFloat(getComputedStyle(media).borderTopLeftRadius) || 0;
    let layer;
    let timeline;

    const clear = () => {
      timeline?.kill();
      timeline = null;
      layer?.remove();
      layer = null;
      delete root.dataset.sharedPhotoMotion;
      source.card.removeAttribute('data-shared-photo-source');
    };
    const makeLayer = (src, bounds) => {
      const image = document.createElement('img');
      image.className = 'lightbox-shared-photo';
      image.alt = '';
      image.setAttribute('aria-hidden', 'true');
      image.referrerPolicy = 'no-referrer';
      image.src = src;
      image.style.width = `${bounds.width}px`;
      image.style.height = `${bounds.height}px`;
      document.body.appendChild(image);
      layer = image;
      source.card.setAttribute('data-shared-photo-source', '');
    };
    const play = (phase, pose, duration) => {
      root.dataset.sharedPhotoMotion = phase;
      timeline?.kill();
      timeline = gsap.timeline({ onComplete: phase === 'enter' ? clear : undefined });
      timeline.to(layer, { ...pose, duration, ease: SHARED_PHOTO_MOTION.ease });
    };
    makeLayer(source.src, { width, height });
    // The live aperture defines the full-image endpoint. The thumbnail crop
    // animates separately so changing aspect ratios never stretches the photo.
    const { x, y } = Flip.fit(layer, media, { scale: true, getVars: true });
    const expanded = { x, y, scale: 1, clipPath: `inset(0px 0px round ${radius}px)` };
    gsap.set(layer, coverPose(source.origin, width, height));
    play('enter', expanded, SHARED_PHOTO_MOTION.enter);

    closeRef.current = contextSafe(() => {
      if (root.dataset.state !== 'open' || root.dataset.sharedPhotoMotion === 'exit') return;
      if (parseFloat(media.style.getPropertyValue('--lightbox-swipe-x'))) return;
      const destination = readCard(source.card);
      if (preference.matches || document.hidden || !destination
        || source.card.dataset.photoId !== String(photoId)) {
        clear();
        return;
      }
      let bounds = { width, height };
      if (!layer) {
        const image = imageRef.current;
        const hasPreview = image?.complete && image.naturalWidth && Number(gsap.getProperty(image, 'opacity')) === 1;
        const rect = media.getBoundingClientRect();
        if (!rect.width || !rect.height || media.classList.contains('spatial-scene-active')) return;
        bounds = rect;
        makeLayer(hasPreview ? image.currentSrc : source.src, bounds);
        const radius = parseFloat(getComputedStyle(media).borderTopLeftRadius) || 0;
        gsap.set(layer, { x: rect.left, y: rect.top, scale: 1, clipPath: `inset(0px 0px round ${radius}px)` });
      }
      // Presence reverses from its current playhead. A close during entry
      // therefore has only the elapsed entry time to get back to the card.
      const duration = Math.min(timeline?.time() ?? SHARED_PHOTO_MOTION.exit, SHARED_PHOTO_MOTION.exit);
      play('exit', coverPose(destination, bounds.width, bounds.height), duration);
    });
    const onVisibilityChange = () => { if (document.hidden) clear(); };
    const onPreferenceChange = () => { if (preference.matches) clear(); };
    document.addEventListener('visibilitychange', onVisibilityChange);
    preference.addEventListener('change', onPreferenceChange);
    window.addEventListener('resize', clear);
    return () => {
      clear();
      closeRef.current = null;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      preference.removeEventListener('change', onPreferenceChange);
      window.removeEventListener('resize', clear);
    };
  }, { scope: rootRef, dependencies: [present, failed, sourceRef, photoId], revertOnUpdate: true });

  return useCallback(() => closeRef.current?.(), []);
}
