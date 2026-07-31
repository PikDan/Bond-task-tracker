import { useState } from "react";
import { formatDuration } from "../../utils/format";
import { capBreakdownForChart, type BreakdownNode, type GroupDimension } from "../../utils/reportAggregation";
import { DIMENSION_LABELS, GroupByMenu } from "./GroupByMenu";

interface Props {
  rows: BreakdownNode[];
  totalSeconds: number;
  sliceBy: GroupDimension;
  onSliceByChange: (dimension: GroupDimension) => void;
}

const SIZE = 200;
const CENTER = SIZE / 2;
const RADIUS = 70;
const STROKE_WIDTH = 30;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const GAP = 3; // px of visual gap between adjacent slices

const DISTRIBUTION_TITLE: Record<GroupDimension, string> = {
  project: "Project distribution",
  task: "Task distribution",
  tag: "Tag distribution",
  member: "Member distribution",
};

export function DistributionDonut({ rows, totalSeconds, sliceBy, onSliceByChange }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);
  const slices = capBreakdownForChart(rows);

  let cumulative = 0;
  const arcs = slices.map((slice) => {
    const fraction = totalSeconds > 0 ? slice.seconds / totalSeconds : 0;
    const length = Math.max(0, fraction * CIRCUMFERENCE - GAP);
    const offset = -cumulative * CIRCUMFERENCE;
    cumulative += fraction;
    return { slice, length, offset, fraction };
  });

  return (
    <div className="rounded border border-neutral-800 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-200">{DISTRIBUTION_TITLE[sliceBy]}</h3>
        <GroupByMenu label="Slice by" value={sliceBy} onChange={onSliceByChange} />
      </div>

      {slices.length === 0 ? (
        <p className="flex h-48 items-center justify-center text-sm text-neutral-500">No data available</p>
      ) : (
        <div className="flex flex-wrap items-center gap-6">
          <div className="relative shrink-0">
            <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-48 w-48 -rotate-90">
              <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="none" stroke="#262626" strokeWidth={STROKE_WIDTH} />
              {arcs.map(({ slice, length, offset }) => (
                <circle
                  key={slice.key}
                  cx={CENTER}
                  cy={CENTER}
                  r={RADIUS}
                  fill="none"
                  stroke={slice.color}
                  strokeWidth={STROKE_WIDTH}
                  strokeDasharray={`${length} ${CIRCUMFERENCE - length}`}
                  strokeDashoffset={offset}
                  strokeLinecap="round"
                  opacity={hovered === null || hovered === slice.key ? 1 : 0.35}
                  onMouseEnter={() => setHovered(slice.key)}
                  onMouseLeave={() => setHovered(null)}
                  style={{ cursor: "pointer", transition: "opacity 100ms" }}
                />
              ))}
            </svg>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg font-semibold text-neutral-100">{formatDuration(totalSeconds)}</span>
              <span className="text-[10px] uppercase tracking-wide text-neutral-500">{DIMENSION_LABELS[sliceBy]}</span>
            </div>
          </div>

          <ul className="min-w-[10rem] flex-1 space-y-1.5">
            {arcs.map(({ slice, fraction }) => (
              <li
                key={slice.key}
                onMouseEnter={() => setHovered(slice.key)}
                onMouseLeave={() => setHovered(null)}
                className={`flex items-center gap-2 rounded px-1 py-0.5 text-xs ${hovered === slice.key ? "bg-neutral-800" : ""}`}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: slice.color }} />
                <span className="min-w-0 flex-1 truncate text-neutral-200">{slice.label}</span>
                <span className="font-mono text-neutral-400">{formatDuration(slice.seconds)}</span>
                <span className="w-12 text-right text-neutral-400">{(fraction * 100).toFixed(1)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
