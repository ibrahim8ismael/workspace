import { useEffect, useRef } from 'react';
import type { SessionDto } from '../../lib/api';
import { effectiveSessionDeadline } from './session-clock';

/** Keep expiry cleanup active independently of the visible screen. */
export function useSessionExpiry(session: SessionDto | null, onExpire: () => void) {
  const deadline = effectiveSessionDeadline(session);
  const expiredDeadline = useRef<number | null>(null);
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);
  useEffect(() => {
    if (deadline === null) {
      expiredDeadline.current = null;
      return;
    }
    const update = () => {
      if (deadline <= Date.now() && expiredDeadline.current !== deadline) {
        expiredDeadline.current = deadline;
        onExpireRef.current();
      }
    };
    update();
    const timer = window.setInterval(update, 1000);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [deadline]);
}
