import { gsap } from 'gsap';

// Animate only the inner dots: the SDK owns all positioning on their parents.
export function createMarkerReveal(dots, scope, canAnimate) {
  const media = gsap.matchMedia();
  let tween;
  const finish = () => { tween?.progress(1).pause(); };
  if (dots.length) media.add({ reduce: '(prefers-reduced-motion: reduce)',
    animate: '(prefers-reduced-motion: no-preference)' }, context => {
    if (context.conditions.reduce || !canAnimate()) {
      gsap.set(dots, { opacity: 1, scale: 1, clearProps: 'opacity,transform' });
      return;
    }
    tween = gsap.fromTo(dots, { opacity: 0, scale: 0.45 }, {
      opacity: 1, scale: 1, duration: 0.22, ease: 'power2.out',
      stagger: { amount: Math.min(0.28, (dots.length - 1) * 0.012) },
      clearProps: 'opacity,transform',
    });
    return () => { tween = null; };
  }, scope);
  const visibility = () => { if (document.hidden) finish(); };
  document.addEventListener('visibilitychange', visibility);
  return { finish, dispose() {
    document.removeEventListener('visibilitychange', visibility);
    media.revert();
  } };
}
