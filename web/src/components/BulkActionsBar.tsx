import { useEffect, useState } from "react";

interface Props {
  count: number;
  crossDay: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onClear: () => void;
}

export function BulkActionsBar({ count, crossDay, onEdit, onDelete, onClear }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      className={`fixed bottom-6 left-1/2 z-40 flex items-center gap-3 rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 shadow-2xl transition-all duration-150 ${
        mounted ? "opacity-100" : "opacity-0"
      }`}
      style={{ transform: mounted ? "translate(-50%, 0)" : "translate(-50%, 0.5rem)" }}
    >
      <span className="text-sm font-medium text-neutral-100">{count} item{count === 1 ? "" : "s"} selected</span>

      <div className="flex items-center gap-2">
        <button
          onClick={onEdit}
          disabled={crossDay}
          title={crossDay ? "Bulk edit only works within a single day" : undefined}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-500"
        >
          Edit
        </button>
        <button
          onClick={onDelete}
          className="rounded bg-red-600 px-3 py-1.5 text-sm hover:bg-red-500"
        >
          Delete
        </button>
        <button onClick={onClear} className="px-2 py-1.5 text-lg leading-none text-neutral-400 hover:text-neutral-200">
          ×
        </button>
      </div>

      {crossDay && <span className="text-xs text-neutral-500">Edit only works within a single day</span>}
    </div>
  );
}
