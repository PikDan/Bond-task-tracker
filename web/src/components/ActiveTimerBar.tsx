import { useQueryClient } from "@tanstack/react-query";
import {
  usePostApiTimersStop,
  getGetApiTimersActiveQueryKey,
  getGetApiTimeEntriesQueryKey,
  getGetApiTasksQueryKey,
} from "../api/generated";
import { useActiveTimer } from "../hooks/useActiveTimer";
import { useLiveElapsedSeconds } from "../hooks/useLiveElapsed";
import { formatDuration } from "../utils/format";
import { extractErrorMessage } from "../utils/errors";

export function ActiveTimerBar() {
  const queryClient = useQueryClient();
  const active = useActiveTimer();

  const elapsed = useLiveElapsedSeconds(active?.started_at);

  const stop = usePostApiTimersStop({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetApiTimersActiveQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetApiTimeEntriesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetApiTasksQueryKey() });
      },
    },
  });

  if (!active) {
    return (
      <div className="border-b border-neutral-800 px-4 py-2 text-sm text-neutral-500">No active timer</div>
    );
  }

  return (
    <div className="flex items-center justify-between border-b border-neutral-800 bg-neutral-800/40 px-4 py-2">
      <div className="min-w-0 text-sm">
        <span className="font-medium">{active.task_name}</span>
        {active.description && <span className="ml-2 text-neutral-400">{active.description}</span>}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="font-mono text-lg tabular-nums">{formatDuration(elapsed)}</span>
        <button
          onClick={() => stop.mutate({ data: { task_id: active.task_id } })}
          disabled={stop.isPending}
          className="rounded bg-red-600 px-3 py-1 text-sm hover:bg-red-500 disabled:opacity-50"
        >
          Stop
        </button>
      </div>
      {stop.isError && (
        <p className="ml-3 text-xs text-red-400">{extractErrorMessage(stop.error, "Could not stop timer")}</p>
      )}
    </div>
  );
}
