import { useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import type { Project, Task, TimeEntry } from "../../api/generated";
import { colorForId } from "../../utils/projectColor";
import { formatDuration, formatTimeRange } from "../../utils/format";
import { useClickOutside } from "../../hooks/useClickOutside";
import { useUser } from "../../context/UserContext";
import { SelectCheckbox } from "../SelectCheckbox";
import { buildBreakdown, entryDuration, type BreakdownNode, type GroupDimension } from "../../utils/reportAggregation";

type TableGroupBy = "none" | GroupDimension;

const GROUP_LABELS: Record<TableGroupBy, string> = {
  none: "No grouping",
  task: "Task",
  project: "Project",
  tag: "Tag",
  member: "Member",
};

const GROUP_ORDER: TableGroupBy[] = ["none", "task", "project", "member", "tag"];

type SortColumn = "task" | "duration" | "member" | "project" | "tags";
type SortDir = "asc" | "desc";

interface EntryRow {
  entry: TimeEntry;
  taskTitle: string;
  projectName: string;
  projectId: string | null;
  tags: string[];
  seconds: number;
}

const PAGE_SIZE = 25;

interface Props {
  entries: TimeEntry[];
  tasksById: Map<string, Task>;
  projectsById: Map<string, Project>;
  activeTimerId: string | undefined;
  liveElapsed: number;
  selectedIds: Set<string>;
  onToggleIds: (ids: string[]) => void;
  periodLabel: string;
  onAddEntry: () => void;
}

function buildRow(entry: TimeEntry, tasksById: Map<string, Task>, projectsById: Map<string, Project>, activeTimerId: string | undefined, liveElapsed: number): EntryRow {
  const task = tasksById.get(entry.task_id);
  const projectName = entry.project_id ? (projectsById.get(entry.project_id)?.name ?? "Unknown project") : "Without project";
  return {
    entry,
    taskTitle: task?.title || entry.task_name || "",
    projectName,
    projectId: entry.project_id,
    tags: task?.tags ?? [],
    seconds: entryDuration(entry, activeTimerId, liveElapsed),
  };
}

function compareRows(a: EntryRow, b: EntryRow, column: SortColumn): number {
  switch (column) {
    case "task":
      return a.taskTitle.localeCompare(b.taskTitle);
    case "duration":
      return a.seconds - b.seconds;
    case "member":
      return 0; // single-user system for now — nothing to differentiate on
    case "project":
      return a.projectName.localeCompare(b.projectName);
    case "tags":
      return a.tags.join(",").localeCompare(b.tags.join(","));
  }
}

// Reuses Summary's grouping engine (Project -> Task -> entries, etc.) and
// just flattens every leaf entry under each top-level group — Detailed only
// groups one level deep, it doesn't need the nested drill-down Summary uses.
function collectLeafEntries(node: BreakdownNode): TimeEntry[] {
  if (node.entry) return [node.entry];
  return node.children.flatMap(collectLeafEntries);
}

export function TimeEntriesTable({
  entries,
  tasksById,
  projectsById,
  activeTimerId,
  liveElapsed,
  selectedIds,
  onToggleIds,
  periodLabel,
  onAddEntry,
}: Props) {
  const { userId } = useUser();
  const [groupBy, setGroupBy] = useState<TableGroupBy>("none");
  const [sortColumn, setSortColumn] = useState<SortColumn>("duration");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);

  function handleSort(column: SortColumn) {
    if (column === sortColumn) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDir(column === "duration" ? "desc" : "asc");
    }
    setPage(0);
  }

  function toggleGroupCollapsed(key: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const allRows = useMemo(
    () => entries.map((e) => buildRow(e, tasksById, projectsById, activeTimerId, liveElapsed)),
    [entries, tasksById, projectsById, activeTimerId, liveElapsed],
  );

  const sign = sortDir === "asc" ? 1 : -1;
  const sortedRows = useMemo(() => [...allRows].sort((a, b) => sign * compareRows(a, b, sortColumn)), [allRows, sortColumn, sign]);

  const groups = useMemo(() => {
    if (groupBy === "none") return null;
    const tree = buildBreakdown(entries, tasksById, projectsById, groupBy, activeTimerId, liveElapsed);
    return tree.map((node) => ({
      key: node.key,
      label: node.label,
      color: node.color,
      seconds: node.seconds,
      count: node.count,
      rows: [...collectLeafEntries(node).map((e) => buildRow(e, tasksById, projectsById, activeTimerId, liveElapsed))].sort(
        (a, b) => sign * compareRows(a, b, sortColumn),
      ),
    }));
  }, [groupBy, entries, tasksById, projectsById, activeTimerId, liveElapsed, sortColumn, sign]);

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const pagedRows = sortedRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const visibleIds = groups ? groups.flatMap((g) => g.rows.map((r) => r.entry.id)) : pagedRows.map((r) => r.entry.id);
  const selectedVisibleCount = visibleIds.filter((id) => selectedIds.has(id)).length;

  return (
    <div className="rounded border border-neutral-800">
      <div className="flex items-center justify-between border-b border-neutral-800 p-4">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-neutral-200">Time entries from {periodLabel}</h3>
          <GroupBySelect value={groupBy} onChange={(v) => { setGroupBy(v); setPage(0); }} />
        </div>
        <button
          onClick={onAddEntry}
          className="flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-sm hover:bg-blue-500"
        >
          <Plus size={14} />
          Add entry
        </button>
      </div>

      {entries.length === 0 ? (
        <p className="p-8 text-center text-sm text-neutral-500">No time entries found</p>
      ) : (
        <>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-800 text-left text-xs uppercase tracking-wide text-neutral-500">
                <th className="w-10 px-4 py-2">
                  <SelectCheckbox
                    checked={visibleIds.length > 0 && selectedVisibleCount === visibleIds.length}
                    indeterminate={selectedVisibleCount > 0 && selectedVisibleCount < visibleIds.length}
                    onToggle={() => onToggleIds(visibleIds)}
                    label="Select all visible entries"
                  />
                </th>
                <SortHeader label="Task" column="task" active={sortColumn} dir={sortDir} onSort={handleSort} />
                <SortHeader label="Duration" column="duration" active={sortColumn} dir={sortDir} onSort={handleSort} />
                <SortHeader label="Member" column="member" active={sortColumn} dir={sortDir} onSort={handleSort} />
                <SortHeader label="Project" column="project" active={sortColumn} dir={sortDir} onSort={handleSort} />
                <SortHeader label="Tags" column="tags" active={sortColumn} dir={sortDir} onSort={handleSort} />
              </tr>
            </thead>
            <tbody>
              {groups
                ? groups.map((group) => (
                    <GroupBlock
                      key={group.key}
                      group={group}
                      collapsed={collapsedGroups.has(group.key)}
                      onToggle={() => toggleGroupCollapsed(group.key)}
                      selectedIds={selectedIds}
                      onToggleIds={onToggleIds}
                      userId={userId}
                    />
                  ))
                : pagedRows.map((row) => (
                    <EntryTableRow key={row.entry.id} row={row} selected={selectedIds.has(row.entry.id)} onToggle={() => onToggleIds([row.entry.id])} userId={userId} />
                  ))}
            </tbody>
          </table>

          {!groups && pageCount > 1 && (
            <div className="flex items-center justify-between border-t border-neutral-800 p-3 text-xs text-neutral-400">
              <span>
                Page {page + 1} of {pageCount} — {sortedRows.length} entries
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="rounded border border-neutral-700 px-2 py-1 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  disabled={page >= pageCount - 1}
                  className="rounded border border-neutral-700 px-2 py-1 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SortHeader({
  label,
  column,
  active,
  dir,
  onSort,
}: {
  label: string;
  column: SortColumn;
  active: SortColumn;
  dir: SortDir;
  onSort: (column: SortColumn) => void;
}) {
  const isActive = active === column;
  return (
    <th className="px-2 py-2 text-left font-medium">
      <button onClick={() => onSort(column)} className={`inline-flex items-center gap-1 hover:text-neutral-200 ${isActive ? "text-blue-400" : ""}`}>
        {label}
        <span className="text-[10px]">{isActive ? (dir === "asc" ? "▲" : "▼") : ""}</span>
      </button>
    </th>
  );
}

function GroupBySelect({ value, onChange }: { value: TableGroupBy; onChange: (v: TableGroupBy) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-700"
      >
        Group by: <span className="font-semibold text-neutral-100">{GROUP_LABELS[value]}</span>
        <ChevronDown size={12} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 z-20 mt-2 w-40 rounded border border-neutral-700 bg-neutral-900 p-1 shadow-xl">
          {GROUP_ORDER.map((option) => {
            const disabled = option === "member";
            const selected = value === option;
            return (
              <button
                key={option}
                disabled={disabled}
                title={disabled ? "Coming soon" : undefined}
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
                className={`block w-full rounded px-2 py-1 text-left text-sm ${
                  disabled ? "cursor-not-allowed text-neutral-600" : selected ? "bg-blue-600 text-white" : "text-neutral-200 hover:bg-neutral-800"
                }`}
              >
                {GROUP_LABELS[option]}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function GroupBlock({
  group,
  collapsed,
  onToggle,
  selectedIds,
  onToggleIds,
  userId,
}: {
  group: { key: string; label: string; color: string; seconds: number; count: number; rows: EntryRow[] };
  collapsed: boolean;
  onToggle: () => void;
  selectedIds: Set<string>;
  onToggleIds: (ids: string[]) => void;
  userId: string;
}) {
  const groupIds = group.rows.map((r) => r.entry.id);
  const selectedCount = groupIds.filter((id) => selectedIds.has(id)).length;

  return (
    <>
      <tr className="border-b border-neutral-800 bg-neutral-900/60">
        <td className="px-4 py-2">
          <SelectCheckbox
            checked={groupIds.length > 0 && selectedCount === groupIds.length}
            indeterminate={selectedCount > 0 && selectedCount < groupIds.length}
            onToggle={() => onToggleIds(groupIds)}
            label={`Select all entries in ${group.label}`}
          />
        </td>
        <td colSpan={5} className="px-2 py-2">
          <button onClick={onToggle} className="flex items-center gap-1.5 font-medium text-neutral-200 hover:text-neutral-100">
            <ChevronRight size={12} className={`transition-transform ${collapsed ? "" : "rotate-90"}`} />
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: group.color }} />
            {group.label || <span className="italic text-neutral-500">Untitled</span>}
            <span className="text-xs font-normal text-neutral-500">({group.count})</span>
            <span className="ml-2 font-mono text-xs font-normal text-neutral-400">{formatDuration(group.seconds)}</span>
          </button>
        </td>
      </tr>
      {!collapsed &&
        group.rows.map((row) => (
          <EntryTableRow key={row.entry.id} row={row} selected={selectedIds.has(row.entry.id)} onToggle={() => onToggleIds([row.entry.id])} userId={userId} indent />
        ))}
    </>
  );
}

function EntryTableRow({ row, selected, onToggle, userId, indent }: { row: EntryRow; selected: boolean; onToggle: () => void; userId: string; indent?: boolean }) {
  const { entry } = row;
  return (
    <tr className="border-b border-neutral-800/60 hover:bg-neutral-800/30">
      <td className="px-4 py-2">
        <SelectCheckbox checked={selected} onToggle={onToggle} label={`Select entry ${row.taskTitle}`} />
      </td>
      <td className="px-2 py-2" style={indent ? { paddingLeft: 28 } : undefined}>
        <div className="min-w-0">
          <p className="truncate text-neutral-100">
            {row.taskTitle || entry.description || <span className="italic text-neutral-500">Untitled task</span>}
          </p>
          <p className="text-xs text-neutral-500">{formatTimeRange(entry.started_at, entry.ended_at)}</p>
        </div>
      </td>
      <td className="px-2 py-2 font-mono text-neutral-300">{formatDuration(row.seconds)}</td>
      <td className="px-2 py-2 text-neutral-300">
        <span className="flex items-center gap-1.5">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-700 text-[10px] uppercase text-neutral-300">
            {userId.slice(0, 1) || "?"}
          </span>
          <span className="truncate">{userId || "Me"}</span>
        </span>
      </td>
      <td className="px-2 py-2 text-neutral-300">
        {row.projectId ? (
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colorForId(row.projectId) }} />
            <span className="truncate">{row.projectName}</span>
          </span>
        ) : (
          <span className="text-neutral-500">Without project</span>
        )}
      </td>
      <td className="px-2 py-2 text-neutral-400">
        {row.tags.length > 0 ? (
          <span className="flex flex-wrap gap-1">
            {row.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-neutral-700 px-2 py-0.5 text-[11px] text-neutral-200">
                {tag}
              </span>
            ))}
          </span>
        ) : (
          <span className="text-neutral-500">No tags</span>
        )}
      </td>
    </tr>
  );
}
