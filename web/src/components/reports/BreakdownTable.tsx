import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { formatDuration, formatTimeRange } from "../../utils/format";
import type { BreakdownNode, GroupDimension } from "../../utils/reportAggregation";

interface Props {
  rows: BreakdownNode[];
  dimension: GroupDimension;
}

type SortColumn = "label" | "seconds" | "percent" | "count";
type SortDir = "asc" | "desc";

const GROUP_COLUMN_LABEL: Record<GroupDimension, string> = {
  project: "Project",
  task: "Task",
  tag: "Tag",
  member: "Member",
};

function sortRows(rows: BreakdownNode[], column: SortColumn, dir: SortDir): BreakdownNode[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (column === "label") return sign * a.label.localeCompare(b.label);
    return sign * (a[column] - b[column]);
  });
}

export function BreakdownTable({ rows, dimension }: Props) {
  const [sortColumn, setSortColumn] = useState<SortColumn>("seconds");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleExpanded(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function handleSort(column: SortColumn) {
    if (column === sortColumn) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDir(column === "label" ? "asc" : "desc");
    }
  }

  const sortedTopLevel = sortRows(rows, sortColumn, sortDir);

  return (
    <div className="rounded border border-neutral-800">
      <div className="flex items-center justify-between border-b border-neutral-800 p-4">
        <h3 className="text-sm font-semibold text-neutral-200">Breakdown</h3>
      </div>

      {rows.length === 0 ? (
        <p className="p-8 text-center text-sm text-neutral-500">Nothing found</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-800 text-left text-xs uppercase tracking-wide text-neutral-500">
              <SortableHeader label={GROUP_COLUMN_LABEL[dimension]} column="label" active={sortColumn} dir={sortDir} onSort={handleSort} />
              <SortableHeader label="Duration" column="seconds" active={sortColumn} dir={sortDir} onSort={handleSort} align="right" />
              <SortableHeader label="Duration %" column="percent" active={sortColumn} dir={sortDir} onSort={handleSort} align="right" />
              <SortableHeader label="Entries" column="count" active={sortColumn} dir={sortDir} onSort={handleSort} align="right" />
            </tr>
          </thead>
          <tbody>
            {sortedTopLevel.map((row) => (
              <Row key={row.key} node={row} depth={0} path={row.key} expanded={expanded} onToggle={toggleExpanded} />
            ))}
            <tr className="text-neutral-300">
              <td className="px-4 py-2 font-semibold uppercase text-xs tracking-wide text-neutral-500">Total</td>
              <td className="px-4 py-2 text-right font-mono">{formatDuration(rows.reduce((s, r) => s + r.seconds, 0))}</td>
              <td className="px-4 py-2 text-right">100%</td>
              <td className="px-4 py-2 text-right">{rows.reduce((s, r) => s + r.count, 0)}</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

function SortableHeader({
  label,
  column,
  active,
  dir,
  onSort,
  align = "left",
}: {
  label: string;
  column: SortColumn;
  active: SortColumn;
  dir: SortDir;
  onSort: (column: SortColumn) => void;
  align?: "left" | "right";
}) {
  const isActive = active === column;
  return (
    <th className={`px-4 py-2 font-medium ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        onClick={() => onSort(column)}
        className={`inline-flex items-center gap-1 hover:text-neutral-200 ${isActive ? "text-blue-400" : ""} ${align === "right" ? "flex-row-reverse" : ""}`}
      >
        {label}
        <span className="text-[10px]">{isActive ? (dir === "asc" ? "▲" : "▼") : ""}</span>
      </button>
    </th>
  );
}

function Row({
  node,
  depth,
  path,
  expanded,
  onToggle,
}: {
  node: BreakdownNode;
  depth: number;
  path: string;
  expanded: Set<string>;
  onToggle: (path: string) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isOpen = expanded.has(path);
  const isLeafEntry = !!node.entry;

  return (
    <>
      <tr className="border-b border-neutral-800/60 hover:bg-neutral-800/30">
        <td className="px-4 py-2">
          <div className="flex items-center gap-1.5" style={{ paddingLeft: depth * 20 }}>
            {hasChildren ? (
              <button onClick={() => onToggle(path)} className="flex h-4 w-4 shrink-0 items-center justify-center text-neutral-400 hover:text-neutral-200">
                <ChevronRight size={12} className={`transition-transform ${isOpen ? "rotate-90" : ""}`} />
              </button>
            ) : (
              <span className="w-4 shrink-0" />
            )}
            {!isLeafEntry && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: node.color }} />}
            <span className="min-w-0 truncate">
              {node.label || <span className="italic text-neutral-500">Untitled</span>}
              {isLeafEntry && node.entry && (
                <span className="ml-2 text-xs text-neutral-500">{formatTimeRange(node.entry.started_at, node.entry.ended_at)}</span>
              )}
            </span>
          </div>
        </td>
        <td className="px-4 py-2 text-right font-mono text-neutral-300">{formatDuration(node.seconds)}</td>
        <td className="px-4 py-2 text-right text-neutral-400">{node.percent.toFixed(2)}%</td>
        <td className="px-4 py-2 text-right text-neutral-400">{isLeafEntry ? "-" : node.count}</td>
      </tr>
      {isOpen &&
        node.children.map((child) => (
          <Row key={child.key} node={child} depth={depth + 1} path={`${path}>${child.key}`} expanded={expanded} onToggle={onToggle} />
        ))}
    </>
  );
}
