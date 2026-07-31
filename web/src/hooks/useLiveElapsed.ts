import { useEffect, useState } from "react";

// Purely client-side tick: computes elapsed time from a fixed started_at
// timestamp via setInterval, instead of polling the server every second.
export function useLiveElapsedSeconds(startedAt: string | null | undefined): number {
  const [elapsed, setElapsed] = useState(() => computeElapsed(startedAt));

  useEffect(() => {
    setElapsed(computeElapsed(startedAt));
    if (!startedAt) return;

    const id = setInterval(() => setElapsed(computeElapsed(startedAt)), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  return elapsed;
}

function computeElapsed(startedAt: string | null | undefined): number {
  if (!startedAt) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
}
