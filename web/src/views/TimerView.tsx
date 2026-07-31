import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CreateTaskInput } from "../components/CreateTaskInput";
import { QuickFilterBar } from "../components/QuickFilterBar";
import { DateRangeBar } from "../components/DateRangeBar";
import { TimeEntriesList } from "../components/TimeEntriesList";
import { BulkActionsBar } from "../components/BulkActionsBar";
import { DeleteConfirmModal } from "../components/DeleteConfirmModal";
import { EditTimeEntryModal } from "../components/EditTimeEntryModal";
import { GroupEditModal } from "../components/GroupEditModal";
import {
  useGetApiTimeEntries,
  useGetApiTasks,
  useDeleteApiTimeEntriesId,
  useDeleteApiTasksId,
  getGetApiTimeEntriesQueryKey,
  getGetApiTimersActiveQueryKey,
  getGetApiTasksQueryKey,
} from "../api/generated";
import { dayKey } from "../utils/format";
import { useToast } from "../context/ToastContext";
import type { DateRange } from "../types";

export function TimerView() {
  const [dateRange, setDateRange] = useState<DateRange | null>(null);
  const [taskQuery, setTaskQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(new Set());
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const queryClient = useQueryClient();
  const { show } = useToast();

  // Same range shape TimeEntriesList requests — React Query dedupes this
  // against that component's own fetch, so this doesn't cause an extra
  // network round trip. Used to look up any selected entry's day (for the
  // cross-day bulk-edit guard), to bulk-delete by id, and to build the
  // bulk-edit modals' data.
  const range = dateRange ? { from: dateRange.from.toISOString(), to: dateRange.to.toISOString() } : {};
  const { data: entries } = useGetApiTimeEntries(range);
  const { data: tasks } = useGetApiTasks({});
  const entriesById = useMemo(() => new Map((entries ?? []).map((e) => [e.id, e])), [entries]);
  const tasksById = useMemo(() => new Map((tasks ?? []).map((t) => [t.id, t])), [tasks]);

  const selectedEntries = useMemo(
    () => Array.from(selectedEntryIds, (id) => entriesById.get(id)).filter((e): e is NonNullable<typeof e> => !!e),
    [selectedEntryIds, entriesById],
  );

  // A never-started task has no entry to select, so its checkbox puts the
  // task's own id into selectedEntryIds instead (see TimeEntriesList) — any
  // selected id that isn't a known entry must be one of those bare tasks.
  const selectedBareTaskIds = useMemo(
    () => Array.from(selectedEntryIds).filter((id) => !entriesById.has(id) && tasksById.has(id)),
    [selectedEntryIds, entriesById, tasksById],
  );

  const crossDay = useMemo(() => {
    const days = new Set([
      ...selectedEntries.map((e) => dayKey(e.started_at)),
      ...selectedBareTaskIds.map((id) => dayKey(tasksById.get(id)!.created_at)),
    ]);
    return days.size > 1;
  }, [selectedEntries, selectedBareTaskIds, tasksById]);

  function toggleIds(ids: string[]) {
    setSelectedEntryIds((prev) => {
      const next = new Set(prev);
      const allSelected = ids.every((id) => next.has(id));
      for (const id of ids) {
        if (allSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  function clearSelection() {
    setSelectedEntryIds(new Set());
  }

  const deleteEntry = useDeleteApiTimeEntriesId();
  const deleteTask = useDeleteApiTasksId();

  async function handleConfirmDelete() {
    const entryIds = selectedEntries.map((e) => e.id);
    const results = await Promise.allSettled([
      ...entryIds.map((id) => deleteEntry.mutateAsync({ id })),
      ...selectedBareTaskIds.map((id) => deleteTask.mutateAsync({ id })),
    ]);
    const total = entryIds.length + selectedBareTaskIds.length;
    const failed = results.filter((r) => r.status === "rejected").length;
    const succeeded = total - failed;

    queryClient.invalidateQueries({ queryKey: getGetApiTimeEntriesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetApiTimersActiveQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetApiTasksQueryKey() });

    if (failed === 0) {
      show(`Deleted ${succeeded} item${succeeded === 1 ? "" : "s"}`, "success");
    } else {
      show(`Deleted ${succeeded} of ${total} — ${failed} failed`, "error");
    }

    setDeleteConfirmOpen(false);
    clearSelection();
  }

  // Scenario A (single task) vs Scenario B (multiple independent tasks), per
  // the distinct task_id count across both real selected entries and bare
  // (never-started) selected tasks. Scenario A's modal shows *every* session
  // of that task on the selected day (not just the ones the user happened to
  // check in the outer list) — bulk-selecting any subset is just how the user
  // says "I want to edit this task."
  const distinctTaskIds = useMemo(
    () => new Set([...selectedEntries.map((e) => e.task_id), ...selectedBareTaskIds]),
    [selectedEntries, selectedBareTaskIds],
  );
  const scenario: "A" | "B" | null =
    selectedEntryIds.size === 0 ? null : distinctTaskIds.size === 1 ? "A" : "B";

  const scenarioATaskEntries = useMemo(() => {
    if (scenario !== "A" || selectedEntries.length === 0) return [];
    const taskId = selectedEntries[0].task_id;
    const day = dayKey(selectedEntries[0].started_at);
    return (entries ?? []).filter((e) => e.task_id === taskId && dayKey(e.started_at) === day);
  }, [scenario, selectedEntries, entries]);

  // The one task involved in scenario A — either the shared task_id of every
  // selected entry, or (when nothing was ever started) the single selected
  // bare task's own id.
  const singleTaskId = scenario === "A" ? Array.from(distinctTaskIds)[0] : null;

  function handleEdit() {
    setEditOpen(true);
  }

  function handleEditSaved() {
    clearSelection();
  }

  return (
    <div>
      <CreateTaskInput projectFilter={projectFilter} />

      <QuickFilterBar
        taskQuery={taskQuery}
        onTaskQueryChange={setTaskQuery}
        projectFilter={projectFilter}
        onProjectFilterChange={setProjectFilter}
        tagFilter={tagFilter}
        onTagFilterChange={setTagFilter}
      />

      <DateRangeBar dateRange={dateRange} onChange={setDateRange} />
      <TimeEntriesList
        dateRange={dateRange}
        taskQuery={taskQuery}
        projectFilter={projectFilter}
        tagFilter={tagFilter}
        selectedEntryIds={selectedEntryIds}
        onToggleIds={toggleIds}
      />

      {selectedEntryIds.size > 0 && (
        <BulkActionsBar
          count={selectedEntryIds.size}
          crossDay={crossDay}
          onEdit={handleEdit}
          onDelete={() => setDeleteConfirmOpen(true)}
          onClear={clearSelection}
        />
      )}

      {deleteConfirmOpen && (
        <DeleteConfirmModal
          count={selectedEntryIds.size}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteConfirmOpen(false)}
          isPending={deleteEntry.isPending || deleteTask.isPending}
        />
      )}

      {editOpen && scenario === "A" && singleTaskId && (() => {
        // task's own project_id may legitimately be null ("no project") —
        // `??` would wrongly paper over that with the entry's stale
        // snapshot, so only fall back to the entry when the task itself
        // couldn't be found (e.g. deleted).
        const task = tasksById.get(singleTaskId);
        return (
          <EditTimeEntryModal
            taskId={singleTaskId}
            currentTitle={task?.title ?? selectedEntries[0]?.task_name ?? ""}
            currentProjectId={task ? task.project_id : (selectedEntries[0]?.project_id ?? null)}
            currentTags={task?.tags ?? []}
            entries={scenarioATaskEntries}
            onClose={() => setEditOpen(false)}
            onSaved={handleEditSaved}
          />
        );
      })()}

      {editOpen && scenario === "B" && (
        <GroupEditModal
          entries={selectedEntries}
          bareTaskIds={selectedBareTaskIds}
          onClose={() => setEditOpen(false)}
          onSaved={handleEditSaved}
        />
      )}
    </div>
  );
}
