import { useGetApiTimersActive, type TimeEntry } from "../api/generated";

// GET /timers/active returns 404 when there's no active timer, which axios
// treats as an error — but react-query keeps the *last successful* `data`
// around by default even after a refetch errors. Without filtering on
// isError here, stopping a timer would refetch, get a 404, and the UI would
// keep showing the just-stopped timer as still running because `data`
// never actually clears on its own.
export function useActiveTimer(): TimeEntry | undefined {
  const { data, isError } = useGetApiTimersActive({ query: { refetchInterval: 20000, retry: false } });
  return isError ? undefined : data;
}
