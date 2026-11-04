import { useRef, useState } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);

// A local interaction token distinguishes an optimistic toggle from restored or
// refreshed data. All three parts share one interruptible timeline per button.
export function useLikeFeedback(buttonRef, liked, count, active, enabled = true) {
  const [request, setRequest] = useState(0);
  const previousRef = useRef({ request, liked, count });
  const playRef = useRef(null);
  const settleRef = useRef(null);

  useGSAP((_context, contextSafe) => {
    const button = buttonRef.current;
    if (!button) return;
    const heart = button.querySelector('.like-badge-heart');
    const number = button.querySelector('.like-badge-count');
    const bursts = button.querySelectorAll('.like-badge-burst');
    const targets = [heart, number, ...bursts];
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let timeline;
    let observer;
    const settle = () => {
      timeline?.kill();
      timeline = null;
      observer?.disconnect();
      observer = null;
      gsap.set(targets, { clearProps: 'transform,opacity,willChange' });
      delete button.dataset.likeAnimating;
    };
    const play = contextSafe(adding => {
      settle();
      if (preference.matches || document.hidden) return;
      const numberOpacity = Number(getComputedStyle(number).opacity);
      button.dataset.likeAnimating = '';
      gsap.set(targets, { willChange: 'transform,opacity' });
      timeline = gsap.timeline({ defaults: { ease: 'power2.out' }, onComplete: settle });
      timeline.fromTo(heart, { scale: adding ? 0.86 : 1.12 },
        { scale: adding ? 1.28 : 0.9, duration: 0.14 }, 0)
        .to(heart, { scale: 1, duration: 0.22 }, 0.14)
        .fromTo(number, { y: adding ? 5 : -5, opacity: 0.35 },
          { y: 0, opacity: numberOpacity, duration: 0.26 }, 0.05);
      if (adding) timeline.fromTo(bursts, { opacity: 0, scale: 0.6 },
        { opacity: 0.85, scale: 1.1, duration: 0.14, stagger: 0.035 }, 0.02)
        .to(bursts, { opacity: 0, scale: 1.5, duration: 0.25, stagger: 0.035 }, 0.195);
      observer = new IntersectionObserver(entries => {
        if (entries.some(entry => !entry.isIntersecting)) settle();
      });
      observer.observe(button);
    });
    const visibilityChanged = () => { if (document.hidden) settle(); };
    playRef.current = play;
    settleRef.current = settle;
    preference.addEventListener('change', settle);
    document.addEventListener('visibilitychange', visibilityChanged);
    return () => {
      settle();
      playRef.current = null;
      settleRef.current = null;
      preference.removeEventListener('change', settle);
      document.removeEventListener('visibilitychange', visibilityChanged);
    };
  }, { scope: buttonRef, dependencies: [enabled], revertOnUpdate: true });

  useGSAP(() => {
    const previous = previousRef.current;
    previousRef.current = { request, liked, count };
    if (active && enabled && request !== previous.request && liked !== previous.liked) playRef.current?.(liked);
    else if (!active || liked !== previous.liked || count !== previous.count) settleRef.current?.();
  }, { dependencies: [request, liked, count, active, enabled] });

  return () => setRequest(value => value + 1);
}
