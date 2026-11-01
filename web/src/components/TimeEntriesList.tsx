import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Folder } from "lucide-react";
import {
  useGetApiTimeEntries,
  useGetApiTasks,
  useGetApiProjects,
  usePatchApiTasksId,
  usePostApiTimersStart,
  getGetApiTasksQueryKey,
  getGetApiTimersActiveQueryKey,
  getGetApiTimeEntriesQueryKey,
  TaskStatus,
  AccessRole,
  type TimeEntry,
  type Task,
} from "../api/generated";
import { dayKey, formatDayHeading, formatDuration, formatTimeRange } from "../utils/format";
import { colorForId } from "../utils/projectColor";
import { findOverlapGroups, type OverlapInfo } from "../utils/overlap";
import { useLiveElapsedSeconds } from "../hooks/useLiveElapsed";
import { useActiveTimer } from "../hooks/useActiveTimer";
import { useClickOutside } from "../hooks/useClickOutside";
import { useToast } from "../context/ToastContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { extractErrorMessage } from "../utils/errors";
import { EditTimeEntryForm } from "./EditTimeEntryForm";
import { TagEditor } from "./TagEditor";
import { SelectCheckbox } from "./SelectCheckbox";
import { ProjectPicker } from "./ProjectPicker";
import type { DateRange } from "../types";

interface Props {
  dateRange: DateRange | null; // null = all dates
  taskQuery: string;
  projectFilter: string | null;
  tagFilter: string[];
  selectedEntryIds: Set<string>;
  onToggleIds: (ids: string[]) => void;
}

type TaskStatusValue = (typeof TaskStatus)[keyof typeof TaskStatus];

interface TaskGroup {
  taskId: string;
  taskName: string;
  projectId: string | null;
  status: TaskStatusValue;
  tags: string[];
  createdAt: string;
  entries: TimeEntry[]; // empty = task exists but has never been started
}

const STATUS_LABELS: Record<string, string> = {
  HOLD: "Hold",
  IN_PROGRESS: "In Progress",
  DONE: "Done",
};

export function TimeEntriesList({
  dateRange,
  taskQuery,
  projectFilter,
  tagFilter,
  selectedEntryIds,
  onToggleIds,
}: Props) {
  const { role } = useWorkspace();
  const canSeeAll = role === AccessRole.OWNER || role === AccessRole.ADMIN || role === AccessRole.WORKSPACE_ADMIN;

  const range = dateRange ? { from: dateRange.from.toISOString(), to: dateRange.to.toISOString() } : {};
  const { data: entries, isLoading: entriesLoading } = useGetApiTimeEntries({ ...range, all: canSeeAll });
  const { data: tasks, isLoading: tasksLoading } = useGetApiTasks({ all: canSeeAll });
  const { data: projects } = useGetApiProjects();
  const activeTimer = useActiveTimer();
  const liveElapsed = useLiveElapsedSeconds(activeTimer?.started_at);

  const projectNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of projects ?? []) m.set(p.id, p.name);
    return m;
  }, [projects]);

  const hasAnyData = (tasks?.length ?? 0) > 0;

  const { filteredTasks, filteredEntries } = useMemo(() => {
    if (!tasks || !entries) return { filteredTasks: [] as Task[], filteredEntries: [] as TimeEntry[] };
    const query = taskQuery.trim().toLowerCase();
    const fTasks = tasks.filter((t) => {
      if (projectFilter && t.project_id !== projectFilter) return false;
      if (tagFilter.length > 0 && !tagFilter.some((tag) => t.tags.includes(tag))) return false;
      if (query && !t.title.toLowerCase().includes(query)) return false;
      return true;
    });
    const taskIds = new Set(fTasks.map((t) => t.id));
    const fEntries = entries.filter((e) => taskIds.has(e.task_id));
    return { filteredTasks: fTasks, filteredEntries: fEntries };
  }, [tasks, entries, taskQuery, projectFilter, tagFilter]);

  const days = useMemo(() => {
    if (!entries || !tasks) return [];
    return buildDayGroups(filteredEntries, filteredTasks, dateRange);
  }, [filteredEntries, filteredTasks, entries, tasks, dateRange]);

  if (entriesLoading || tasksLoading) return <p className="text-sm text-neutral-500">Loading…</p>;
  if (days.length === 0) {
    const filtersActive = taskQuery.trim() !== "" || projectFilter !== null || tagFilter.length > 0;
    return <p className="text-sm text-neutral-500">{hasAnyData && filtersActive ? "No tasks found" : "No tasks yet"}</p>;
  }

  return (
    <div className="space-y-6">
      {days.map((day) => (
        <DayGroup
          key={day.key}
          dayKeyValue={day.key}
          groups={day.groups}
          activeTimer={activeTimer}
          liveElapsed={liveElapsed}
          projectNameById={projectNameById}
          selectedEntryIds={selectedEntryIds}
          onToggleIds={onToggleIds}
        />
      ))}
    </div>
  );
}

function DayGroup({
  dayKeyValue,
  groups,
  activeTimer,
  liveElapsed,
  projectNameById,
  selectedEntryIds,
  onToggleIds,
}: {
  dayKeyValue: string;
  groups: TaskGroup[];
  activeTimer: TimeEntry | undefined;
  liveElapsed: number;
  projectNameById: Map<string, string>;
  selectedEntryIds: Set<string>;
  onToggleIds: (ids: string[]) => void;
}) {
  const [hoveredConflictId, setHoveredConflictId] = useState<number | null>(null);
  const allEntries = useMemo(() => groups.flatMap((g) => g.entries), [groups]);
  const dayTotal = allEntries.reduce((sum, e) => sum + durationOf(e, activeTimer?.id, liveElapsed), 0);
  const overlaps = useMemo(() => findOverlapGroups(allEntries), [allEntries]);

  // A task with zero sessions (never started) has no entry id to select, so
  // its bare "row" is selected by its task id instead — see the matching
  // fallback in TaskGroupRow's own checkbox.
  const allIds = useMemo(
    () => groups.flatMap((g) => (g.entries.length > 0 ? g.entries.map((e) => e.id) : [g.taskId])),
    [groups],
  );
  const selectedCount = allIds.filter((id) => selectedEntryIds.has(id)).length;

  return (
    <div>
      <div className="mb-1 flex items-center gap-2 border-b border-neutral-800 pb-1">
        {allIds.length > 0 && (
          <SelectCheckbox
            checked={selectedCount === allIds.length}
            indeterminate={selectedCount > 0 && selectedCount < allIds.length}
            onToggle={() => onToggleIds(allIds)}
            label={`Select all entries for ${formatDayHeading(dayKeyValue)}`}
          />
        )}
        <span className="flex-1 font-semibold">{formatDayHeading(dayKeyValue)}</span>
        <span className="font-mono text-sm text-neutral-300">{formatDuration(dayTotal)}</span>
      </div>

      <ul className="divide-y divide-neutral-800/60">
        {groups.map((group) => (
          <TaskGroupRow
            key={group.taskId}
            group={group}
            activeTimer={activeTimer}
            liveElapsed={liveElapsed}
            overlaps={overlaps}
            hoveredConflictId={hoveredConflictId}
            onHoverConflict={setHoveredConflictId}
            projectName={group.projectId ? (projectNameById.get(group.projectId) ?? "Unknown project") : null}
            selectedEntryIds={selectedEntryIds}
            onToggleIds={onToggleIds}
          />
        ))}
      </ul>
    </div>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className={`h-3 w-3 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
    >
      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function OverlapBadge({
  info,
  projectNameById,
  isHighlighted,
  onHover,
}: {
  info: OverlapInfo;
  projectNameById: Map<string, string>;
  isHighlighted: boolean;
  onHover: (id: number | null) => void;
}) {
  return (
    <span
      className="group relative shrink-0 cursor-default rounded border px-1.5 py-0.5 text-[10px] uppercase"
      style={{
        borderColor: info.color,
        color: info.color,
        backgroundColor: isHighlighted ? `${info.color}33` : undefined,
      }}
      onMouseEnter={() => onHover(info.conflictId)}
      onMouseLeave={() => onHover(null)}
    >
      Overlap #{info.conflictId}
      <div className="pointer-events-none absolute left-0 top-full z-20 mt-1 hidden w-56 rounded border border-neutral-700 bg-neutral-900 p-2 text-[11px] normal-case text-neutral-300 shadow-xl group-hover:block">
        <p className="mb-1 font-semibold text-neutral-100">Overlaps with:</p>
        {info.others.map((e) => (
          <p key={e.id}>
            {e.project_id ? (projectNameById.get(e.project_id) ?? "Unknown project") : "No project"} —{" "}
            {formatTimeRange(e.started_at, e.ended_at)}
          </p>
        ))}
      </div>
    </span>
  );
}

function TaskGroupRow({
  group,
  activeTimer,
  liveElapsed,
  overlaps,
  hoveredConflictId,
  onHoverConflict,
  projectName,
  selectedEntryIds,
  onToggleIds,
}: {
  group: TaskGroup;
  activeTimer: TimeEntry | undefined;
  liveElapsed: number;
  overlaps: Map<string, OverlapInfo>;
  hoveredConflictId: number | null;
  onHoverConflict: (id: number | null) => void;
  projectName: string | null;
  selectedEntryIds: Set<string>;
  onToggleIds: (ids: string[]) => void;
}) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState(group.taskName);

  const total = group.entries.reduce((sum, e) => sum + durationOf(e, activeTimer?.id, liveElapsed), 0);
  const isGrouped = group.entries.length > 1;
  const single = group.entries.length === 1 ? group.entries[0] : undefined;
  const conflictedCount = group.entries.filter((e) => overlaps.has(e.id)).length;
  const isRunning = activeTimer?.task_id === group.taskId;

  const updateTask = usePatchApiTasksId({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetApiTasksQueryKey() });
      },
    },
  });

  const startTimer = usePostApiTimersStart({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetApiTimersActiveQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetApiTimeEntriesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetApiTasksQueryKey() });
      },
    },
  });

  function saveTitle() {
    const trimmed = titleDraft.trim();
    setRenaming(false);
    if (trimmed === "" || trimmed === group.taskName) {
      setTitleDraft(group.taskName);
      return;
    }
    updateTask.mutate({ id: group.taskId, data: { title: trimmed } });
  }

  const nameElement = renaming ? (
    <input
      autoFocus
      value={titleDraft}
      onChange={(e) => setTitleDraft(e.target.value)}
      onBlur={saveTitle}
      onKeyDown={(e) => {
        if (e.key === "Enter") saveTitle();
        if (e.key === "Escape") {
          setTitleDraft(group.taskName);
          setRenaming(false);
        }
      }}
      className="min-w-0 rounded border border-neutral-700 bg-neutral-800 px-1 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
    />
  ) : (
    <button
      onClick={() => {
        setTitleDraft(group.taskName);
        setRenaming(true);
      }}
      className="truncate text-left hover:underline"
    >
      {group.taskName || <span className="italic text-neutral-500">Add task name</span>}
    </button>
  );

  const dot = group.projectId ? (
    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: colorForId(group.projectId) }} />
  ) : null;

  // A never-started task has no entries to select by id, so its checkbox
  // selects the task id itself instead — bulk actions treat that id as "this
  // whole task" rather than a set of sessions (see TimerView).
  const groupEntryIds = useMemo(
    () => (group.entries.length > 0 ? group.entries.map((e) => e.id) : [group.taskId]),
    [group.entries, group.taskId],
  );
  const groupSelectedCount = groupEntryIds.filter((id) => selectedEntryIds.has(id)).length;

  const singleOverlap = single ? overlaps.get(single.id) : undefined;
  // Placeholder map for the ProjectName lookup used inside OverlapBadge's
  // tooltip — reconstructed from the color palette used elsewhere isn't
  // available here directly, so the tooltip resolves names via the map
  // passed down from DayGroup.
  const projectNameById = useProjectNameMap();

  return (
    <li className="py-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <SelectCheckbox
            checked={groupSelectedCount === groupEntryIds.length}
            indeterminate={groupSelectedCount > 0 && groupSelectedCount < groupEntryIds.length}
            onToggle={() => onToggleIds(groupEntryIds)}
            label={
              group.entries.length > 0
                ? `Select all sessions of ${group.taskName || "this task"}`
                : `Select ${group.taskName || "this task"}`
            }
          />
          {isGrouped && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="flex h-6 items-center gap-1 rounded border border-neutral-600 px-1.5 text-xs text-neutral-300 hover:bg-neutral-800"
            >
              <ChevronIcon expanded={expanded} />
              <span>{group.entries.length}</span>
            </button>
          )}
          {isGrouped && conflictedCount > 0 && (
            <span className="shrink-0 text-[10px] uppercase text-[rgb(161,104,164)]">Overlap({conflictedCount})</span>
          )}
          <div className="min-w-0 shrink truncate">{nameElement}</div>
          {dot}
          <ProjectPill
            projectId={group.projectId}
            projectName={projectName}
            taskNameEmpty={group.taskName.trim() === ""}
            onSelect={(id) => updateTask.mutate({ id: group.taskId, data: { project_id: id ?? "" } })}
          />
          {single && singleOverlap && (
            <OverlapBadge
              info={singleOverlap}
              projectNameById={projectNameById}
              isHighlighted={hoveredConflictId === singleOverlap.conflictId}
              onHover={onHoverConflict}
            />
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <select
            aria-label="Task status"
            value={group.status}
            onChange={(e) =>
              updateTask.mutate({ id: group.taskId, data: { status: e.target.value as TaskStatusValue } })
            }
            className="rounded border border-neutral-700 bg-neutral-800 px-1 py-0.5 text-xs text-neutral-300"
          >
            <option value={TaskStatus.HOLD}>{STATUS_LABELS.HOLD}</option>
            <option value={TaskStatus.IN_PROGRESS}>{STATUS_LABELS.IN_PROGRESS}</option>
            <option value={TaskStatus.DONE}>{STATUS_LABELS.DONE}</option>
          </select>

          {single && (
            <>
              <span className="text-neutral-400">{formatTimeRange(single.started_at, single.ended_at)}</span>
              <button
                onClick={() => setEditingId((id) => (id === single.id ? null : single.id))}
                className="text-xs text-neutral-500 hover:text-blue-400"
              >
                Edit
              </button>
            </>
          )}

          <span className="w-16 text-right font-mono">{formatDuration(total)}</span>

          <button
            onClick={() => startTimer.mutate({ data: { task_id: group.taskId } })}
            disabled={isRunning || startTimer.isPending}
            className={`shrink-0 rounded px-3 py-1 text-xs ${
              isRunning ? "bg-green-700/50 text-green-300" : "bg-neutral-700 hover:bg-neutral-600"
            }`}
          >
            {isRunning ? "● Running" : "Start"}
          </button>
        </div>
      </div>

      <TagEditor
        tags={group.tags}
        disabled={updateTask.isPending}
        onChange={(tags) => updateTask.mutate({ id: group.taskId, data: { tags } })}
      />

      {startTimer.isError && (
        <p className="mt-1 text-xs text-red-400">{extractErrorMessage(startTimer.error, "Could not start timer")}</p>
      )}

      {single && editingId === single.id && <EditTimeEntryForm entry={single} onClose={() => setEditingId(null)} />}

      {isGrouped && expanded && (
        <ul className="mt-2 space-y-1 border-l border-neutral-800 pl-3">
          {[...group.entries]
            .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
            .map((entry, index) => {
              const info = overlaps.get(entry.id);
              return (
                <li key={entry.id} className="text-xs text-neutral-400">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2">
                      <SelectCheckbox
                        checked={selectedEntryIds.has(entry.id)}
                        onToggle={() => onToggleIds([entry.id])}
                        label={`Select session ${index + 1}`}
                      />
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-neutral-600 text-[10px] text-neutral-300">
                        {index + 1}
                      </span>
                      <span className="truncate">
                        {group.taskName || <span className="italic">Add task name</span>}
                      </span>
                      {dot}
                      <ProjectPill
                        projectId={group.projectId}
                        projectName={projectName}
                        taskNameEmpty={group.taskName.trim() === ""}
                        onSelect={(id) => updateTask.mutate({ id: group.taskId, data: { project_id: id ?? "" } })}
                      />
                      {info && (
                        <OverlapBadge
                          info={info}
                          projectNameById={projectNameById}
                          isHighlighted={hoveredConflictId === info.conflictId}
                          onHover={onHoverConflict}
                        />
                      )}
                    </span>
                    <span className="flex items-center gap-3">
                      <span>{formatTimeRange(entry.started_at, entry.ended_at)}</span>
                      <button onClick={() => setEditingId((id) => (id === entry.id ? null : entry.id))} className="hover:text-blue-400">
                        Edit
                      </button>
                      <span className="w-16 text-right font-mono">
                        {formatDuration(durationOf(entry, activeTimer?.id, liveElapsed))}
                      </span>
                    </span>
                  </div>
                  {editingId === entry.id && <EditTimeEntryForm entry={entry} onClose={() => setEditingId(null)} />}
                </li>
              );
            })}
        </ul>
      )}
    </li>
  );
}

// The tooltip inside OverlapBadge needs project names for entries that may
// belong to a *different* task/project than the row it's rendered in — reuse
// the same projects fetch (React Query dedupes this against the parent's).
function useProjectNameMap(): Map<string, string> {
  const { data: projects } = useGetApiProjects();
  return useMemo(() => {
    const m = new Map<string, string>();
    for (const p of projects ?? []) m.set(p.id, p.name);
    return m;
  }, [projects]);
}

// Owns its own popover open-state and outside-click ref so multiple pills for
// the same task (the collapsed row header and each expanded session line)
// don't fight over a single shared ref/state and pop open in sync.
function ProjectPill({
  projectId,
  projectName,
  taskNameEmpty,
  onSelect,
}: {
  projectId: string | null;
  projectName: string | null;
  taskNameEmpty: boolean;
  onSelect: (id: string | null) => void;
}) {
  const { show } = useToast();
  const { data: allProjects } = useGetApiProjects();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));

  function handleClick() {
    if (taskNameEmpty) {
      show("Please enter a task name first", "info");
      return;
    }
    setOpen((v) => !v);
  }

  return (
    <div className="relative" ref={ref}>
      {projectId ? (
        <button
          onClick={handleClick}
          className="rounded-full border px-2 py-0.5 text-xs text-neutral-200 hover:bg-neutral-800"
          style={{ borderColor: colorForId(projectId) }}
        >
          {projectName}
        </button>
      ) : (
        <button
          onClick={handleClick}
          className="flex items-center gap-1 rounded-full border border-dashed border-neutral-600 px-2 py-0.5 text-xs text-neutral-500 hover:border-neutral-400 hover:text-neutral-300"
        >
          <Folder size={12} />
          No project
        </button>
      )}
      {open && (
        <div className="absolute left-0 z-20 mt-2 w-56 rounded border border-neutral-700 bg-neutral-900 p-2 shadow-xl">
          <ProjectPicker
            projects={allProjects ?? []}
            selectedId={projectId}
            onSelect={(id) => {
              onSelect(id);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

function buildDayGroups(entries: TimeEntry[], tasks: Task[], dateRange: DateRange | null): { key: string; groups: TaskGroup[] }[] {
  const tasksById = new Map(tasks.map((t) => [t.id, t]));
  const byDay = new Map<string, Map<string, TaskGroup>>();

  function dayMap(key: string): Map<string, TaskGroup> {
    let m = byDay.get(key);
    if (!m) {
      m = new Map();
      byDay.set(key, m);
    }
    return m;
  }

  for (const entry of entries) {
    const key = dayKey(entry.started_at);
    const m = dayMap(key);
    const existing = m.get(entry.task_id);
    if (existing) {
      existing.entries.push(entry);
    } else {
      // Prefer the live Task record for name/project — entry.task_name and
      // entry.project_id are a denormalized snapshot taken when the entry
      // was created and never get refreshed when the task is later renamed
      // or reassigned, so displaying them here would show stale data.
      const task = tasksById.get(entry.task_id);
      m.set(entry.task_id, {
        taskId: entry.task_id,
        taskName: task?.title ?? entry.task_name,
        projectId: task ? task.project_id : entry.project_id,
        status: task?.status ?? TaskStatus.HOLD,
        tags: task?.tags ?? [],
        createdAt: task?.created_at ?? entry.started_at,
        entries: [entry],
      });
    }
  }

  // Tasks with zero sessions ever (in the currently fetched range) still get
  // a bare row, so a brand-new task shows up immediately under Today.
  const taskIdsWithEntries = new Set(entries.map((e) => e.task_id));
  for (const task of tasks) {
    if (taskIdsWithEntries.has(task.id)) continue;
    const createdAt = new Date(task.created_at);
    if (dateRange && (createdAt < dateRange.from || createdAt > dateRange.to)) continue;
    const key = dayKey(task.created_at);
    dayMap(key).set(task.id, {
      taskId: task.id,
      taskName: task.title,
      projectId: task.project_id,
      status: task.status,
      tags: task.tags,
      createdAt: task.created_at,
      entries: [],
    });
  }

  return Array.from(byDay.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([key, groupMap]) => ({
      key,
      groups: Array.from(groupMap.values()).sort((a, b) => sortKey(b) - sortKey(a)),
    }));
}

function sortKey(group: TaskGroup): number {
  if (group.entries.length === 0) return new Date(group.createdAt).getTime();
  return Math.max(...group.entries.map((e) => new Date(e.started_at).getTime()));
}

function durationOf(entry: TimeEntry, activeTimerId: string | undefined, liveElapsed: number): number {
  if (entry.duration_seconds != null) return entry.duration_seconds;
  if (activeTimerId && entry.id === activeTimerId) return liveElapsed;
  return 0;
}
