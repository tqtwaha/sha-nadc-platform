'use client';

import { useEffect, useState } from 'react';

// Wall clock ticks every second on the client so the LED panel doesn't
// show a stale server-rendered timestamp between auto-refreshes.

export function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!now) return <span className="font-mono text-3xl text-t1">--:--:--</span>;

  const time = now.toLocaleTimeString('en-KE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Africa/Nairobi',
  });
  const date = now.toLocaleDateString('en-KE', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    timeZone: 'Africa/Nairobi',
  });
  return (
    <div className="text-right leading-none">
      <div className="font-mono text-3xl text-t1 tabular-nums">{time}</div>
      <div className="font-mono text-[10px] text-t3 uppercase tracking-wider mt-1">
        {date} · EAT
      </div>
    </div>
  );
}
