import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { useAnimatedPresence } from '../hooks/useAnimatedPresence';
import { FEEDBACK_MOTION } from '../constants/motionPresets';

gsap.registerPlugin(useGSAP);

export function AnimatedMessage({ message, visible = true, feedbackRef }) {
  const ownRef = useRef(null);
  const rootRef = feedbackRef || ownRef;
  const shown = visible && Boolean(message?.text);
  const [retained, setRetained] = useState(message);
  useLayoutEffect(() => { if (shown) setRetained(message); }, [shown, message]);
  const present = useAnimatedPresence(shown, rootRef, { variant: 'notice' });
  const content = shown ? message : retained;
  useGSAP(() => {
    if (!present || !shown) return;
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.fromTo(rootRef.current.querySelector('.admin-message-copy'), { opacity: 0, y: FEEDBACK_MOTION.offset },
        { opacity: 1, y: 0, duration: FEEDBACK_MOTION.duration, ease: FEEDBACK_MOTION.ease, clearProps: 'opacity,transform' });
    }, rootRef);
    return () => media.revert();
  }, { scope: rootRef, dependencies: [present, shown, message?.text, message?.type], revertOnUpdate: true });
  useEffect(() => {
    if (present && shown && feedbackRef && message.type === 'error') {
      rootRef.current?.focus({ preventScroll: true });
      rootRef.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [present, shown, feedbackRef, rootRef, message]);
  if (!present || !content?.text) return null;
  return (
    <div ref={rootRef} className={`admin-message ${content.type}`} data-motion="message"
      data-state={shown ? 'open' : 'closing'} aria-hidden={!shown}
      role={shown ? content.type === 'error' ? 'alert' : 'status' : undefined} tabIndex={-1}>
      <span className="admin-message-copy">{content.text}</span>
    </div>
  );
}
