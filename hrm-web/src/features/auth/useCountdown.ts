'use client';
import { useEffect, useState } from 'react';

/** Seconds left until `start(seconds)` elapses; used for "resend code" timers. */
export const useCountdown = () => {
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until <= now) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [until, now]);
  return {
    secondsLeft: Math.max(0, Math.ceil((until - now) / 1000)),
    start: (seconds: number) => {
      const t = Date.now();
      setNow(t);
      setUntil(t + seconds * 1000);
    },
  };
};
