import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { differenceInCalendarDays, format, isSameDay } from "date-fns";
import {
  useGetApiTimeEntries,
  useGetApiTasks,
  useGetApiProjects,
  useDeleteApiTimeEntriesId,
  getGetApiTimeEntriesQueryKey,
  getGetApiTimersActiveQueryKey,
  getGetApiTasksQueryKey,
  AccessRole,
  type TimeEntry,
} from "../api/generated";
import { useActiveTimer } from "../hooks/useActiveTimer";
import { useLiveElapsedSeconds } from "../hooks/useLiveElapsed";
import { useToast } from "../context/ToastContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { DateRangeBar } from "../components/DateRangeBar";
import { BulkActionsBar } from "../components/BulkActionsBar";
import { DeleteConfirmModal } from "../components/DeleteConfirmModal";
import { EditTimeEntryModal } from "../components/EditTimeEntryModal";
import { GroupEditModal } from "../components/GroupEditModal";
import { ReportsFilterBar } from "../components/reports/ReportsFilterBar";
import { StatCards } from "../components/reports/StatCards";
import { TimeEntriesTable } from "../components/reports/TimeEntriesTable";
import { AddTimeEntryModal } from "../components/reports/AddTimeEntryModal";
import { dayKey } from "../utils/format";
import { entryDuration, filterEntries } from "../utils/reportAggregation";
import type { DateRange } from "../types";

function periodLabelFor(dateRange: DateRange | null): string {
  if (!dateRange) return "all time";
  if (isSameDay(dateRange.from, dateRange.to)) return format(dateRange.from, "d MMM yyyy");
  return `${format(dateRange.from, "d MMM")} – ${format(dateRange.to, "d MMM yyyy")}`;
}

export function ReportsDetailedTab() {
  const [dateRange, setDateRange] = useState<DateRange | null>(null);
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const [taskFilter, setTaskFilter] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [addModalOpen, setAddModalOpen] = useState(false);

  const { show } = useToast();
  const { role } = useWorkspace();
  const canSeeAll = role === AccessRole.OWNER || role === AccessRole.ADMIN || role === AccessRole.WORKSPACE_ADMIN;

  const range = dateRange ? { from: dateRange.from.toISOString(), to: dateRange.to.toISOString() } : {};
  const { data: entries, isLoading: entriesLoading } = useGetApiTimeEntries({ ...range, all: canSeeAll });
  const { data: tasks, isLoading: tasksLoading } = useGetApiTasks({ all: canSeeAll });
  const { data: projects } = useGetApiProjects();
  const activeTimer = useActiveTimer();
  const liveElapsed = useLiveElapsedSeconds(activeTimer?.started_at);

  const tasksById = useMemo(() => new Map((tasks ?? []).map((t) => [t.id, t])), [tasks]);
  const projectsById = useMemo(() => new Map((projects ?? []).map((p) => [p.id, p])), [projects]);

  const filteredEntries = useMemo(
    () => filterEntries(entries ?? [], tasksById, { projectId: projectFilter, taskId: taskFilter, tagIds: tagFilter }),
    [entries, tasksById, projectFilter, taskFilter, tagFilter],
  );

  const totalSeconds = useMemo(
    () => filteredEntries.reduce((sum, e) => sum + entryDuration(e, activeTimer?.id, liveElapsed), 0),
    [filteredEntries, activeTimer?.id, liveElapsed],
  );

  const daysInPeriod = useMemo(() => {
    if (dateRange) return differenceInCalendarDays(dateRange.to, dateRange.from) + 1;
    return new Set(filteredEntries.map((e) => dayKey(e.started_at))).size;
  }, [dateRange, filteredEntries]);

  const averageDailySeconds = daysInPeriod > 0 ? totalSeconds / daysInPeriod : 0;

  function toggleIds(ids: string[]) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = ids.every((id) => next.has(id));
      for (const id of ids) {
        if (allSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  // Same bulk edit/delete flow already used in Timer — Detailed just has no
  // day-grouping concept, so scenario A's "sessions" list is every entry of
  // that task in the current filtered view, not just one day's worth.
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const deleteEntry = useDeleteApiTimeEntriesId();

  const entriesById = useMemo(() => new Map(filteredEntries.map((e) => [e.id, e])), [filteredEntries]);
  const selectedEntries = useMemo(
    () => Array.from(selectedIds, (id) => entriesById.get(id)).filter((e): e is TimeEntry => !!e),
    [selectedIds, entriesById],
  );
  const distinctTaskIds = useMemo(() => new Set(selectedEntries.map((e) => e.task_id)), [selectedEntries]);
  const scenario: "A" | "B" | null = selectedIds.size === 0 ? null : distinctTaskIds.size === 1 ? "A" : "B";
  const singleTaskId = scenario === "A" ? Array.from(distinctTaskIds)[0] : null;
  const scenarioATaskEntries = useMemo(() => {
    if (scenario !== "A" || !singleTaskId) return [];
    return filteredEntries.filter((e) => e.task_id === singleTaskId);
  }, [scenario, singleTaskId, filteredEntries]);

  function handleEditSaved() {
    setSelectedIds(new Set());
  }

  async function handleConfirmDelete() {
    const ids = Array.from(selectedIds);
    const results = await Promise.allSettled(ids.map((id) => deleteEntry.mutateAsync({ id })));
    const failed = results.filter((r) => r.status === "rejected").length;
    const succeeded = ids.length - failed;

    queryClient.invalidateQueries({ queryKey: getGetApiTimeEntriesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetApiTimersActiveQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetApiTasksQueryKey() });

    if (failed === 0) {
      show(`Deleted ${succeeded} item${succeeded === 1 ? "" : "s"}`, "success");
    } else {
      show(`Deleted ${succeeded} of ${ids.length} — ${failed} failed`, "error");
    }

    setDeleteConfirmOpen(false);
    setSelectedIds(new Set());
  }

  const isLoading = entriesLoading || tasksLoading;

  return (
    <div>
      <ReportsFilterBar
        projectFilter={projectFilter}
        onProjectFilterChange={setProjectFilter}
        taskFilter={taskFilter}
        onTaskFilterChange={setTaskFilter}
        tagFilter={tagFilter}
        onTagFilterChange={setTagFilter}
      />

      <DateRangeBar dateRange={dateRange} onChange={setDateRange} />

      {isLoading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : (
        <>
          <StatCards totalSeconds={totalSeconds} averageDailySeconds={averageDailySeconds} />

          <TimeEntriesTable
            entries={filteredEntries}
            tasksById={tasksById}
            projectsById={projectsById}
            activeTimerId={activeTimer?.id}
            liveElapsed={liveElapsed}
            selectedIds={selectedIds}
            onToggleIds={toggleIds}
            periodLabel={periodLabelFor(dateRange)}
            onAddEntry={() => setAddModalOpen(true)}
          />
        </>
      )}

      {selectedIds.size > 0 && (
        <BulkActionsBar
          count={selectedIds.size}
          crossDay={false}
          onEdit={() => setEditOpen(true)}
          onDelete={() => setDeleteConfirmOpen(true)}
          onClear={() => setSelectedIds(new Set())}
        />
      )}

      {deleteConfirmOpen && (
        <DeleteConfirmModal
          count={selectedIds.size}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteConfirmOpen(false)}
          isPending={deleteEntry.isPending}
        />
      )}

      {editOpen && scenario === "A" && singleTaskId && (() => {
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
          bareTaskIds={[]}
          onClose={() => setEditOpen(false)}
          onSaved={handleEditSaved}
        />
      )}

      {addModalOpen && (
        <AddTimeEntryModal
          defaultProjectId={projectFilter}
          onClose={() => setAddModalOpen(false)}
          onSaved={() => setSelectedIds(new Set())}
        />
      )}
    </div>
  );
}
