import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  usePatchApiTimeEntriesId,
  getGetApiTimeEntriesQueryKey,
  getGetApiTimersActiveQueryKey,
  type TimeEntry,
} from "../api/generated";
import { extractErrorMessage } from "../utils/errors";
import { toDatetimeLocalValue } from "../utils/format";

interface Props {
  entry: TimeEntry;
  onClose: () => void;
}

export function EditTimeEntryForm({ entry, onClose }: Props) {
  const queryClient = useQueryClient();
  const [startedAt, setStartedAt] = useState(toDatetimeLocalValue(entry.started_at));
  const [endedAt, setEndedAt] = useState(entry.ended_at ? toDatetimeLocalValue(entry.ended_at) : "");

  const update = usePatchApiTimeEntriesId({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetApiTimeEntriesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetApiTimersActiveQueryKey() });
        onClose();
      },
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    // Leaving End blank on a still-active entry just moves Start, keeping it
    // active; filling it in manually closes the entry at that chosen time.
    update.mutate({
      id: entry.id,
      data: {
        started_at: new Date(startedAt).toISOString(),
        ...(endedAt ? { ended_at: new Date(endedAt).toISOString() } : {}),
      },
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-2 flex flex-wrap items-center gap-2 rounded border border-neutral-700 bg-neutral-800/60 p-2 text-xs"
    >
      <label className="flex items-center gap-1">
        Start
        <input
          type="datetime-local"
          value={startedAt}
          onChange={(e) => setStartedAt(e.target.value)}
          className="rounded border border-neutral-700 bg-neutral-900 px-1 py-0.5 text-neutral-100"
        />
      </label>
      <label className="flex items-center gap-1">
        End
        <input
          type="datetime-local"
          value={endedAt}
          onChange={(e) => setEndedAt(e.target.value)}
          className="rounded border border-neutral-700 bg-neutral-900 px-1 py-0.5 text-neutral-100"
        />
      </label>
      <button
        type="submit"
        disabled={update.isPending}
        className="rounded bg-blue-600 px-2 py-1 text-neutral-100 hover:bg-blue-500 disabled:opacity-50"
      >
        Save
      </button>
      <button
        type="button"
        onClick={onClose}
        className="rounded border border-neutral-700 px-2 py-1 hover:bg-neutral-800"
      >
        Cancel
      </button>
      {update.isError && <p className="w-full text-red-400">{extractErrorMessage(update.error, "Could not update")}</p>}
    </form>
  );
}
