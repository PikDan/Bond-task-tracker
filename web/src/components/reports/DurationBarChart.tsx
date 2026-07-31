import { useState } from "react";
import { formatDuration } from "../../utils/format";
import type { GroupDimension, TimeSeries } from "../../utils/reportAggregation";
import { GroupByMenu } from "./GroupByMenu";

interface Props {
  series: TimeSeries;
  stackBy: GroupDimension;
  onStackByChange: (dimension: GroupDimension) => void;
}

const GRANULARITY_TITLE: Record<TimeSeries["granularity"], string> = {
  day: "Duration by day",
  week: "Duration by week",
  month: "Duration by month",
};

// Candidate gridline steps (in seconds) — the smallest one whose ×4 covers
// the tallest bar wins, so the axis reads in sensible round units (15m, 1h,
// 1d, ...) instead of an arbitrary fraction of the raw max.
const STEP_CANDIDATES = [900, 1800, 3600, 2 * 3600, 3 * 3600, 4 * 3600, 6 * 3600, 8 * 3600, 12 * 3600, 24 * 3600, 2 * 24 * 3600, 7 * 24 * 3600];

function pickStep(maxValue: number): number {
  for (const step of STEP_CANDIDATES) {
    if (step * 4 >= maxValue) return step;
  }
  return STEP_CANDIDATES[STEP_CANDIDATES.length - 1];
}

function formatAxisLabel(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}`;
}

const CHART_WIDTH = 800;
const CHART_HEIGHT = 220;
const PAD_LEFT = 44;
const PAD_RIGHT = 8;
const PAD_TOP = 12;
const PAD_BOTTOM = 24;
const SEGMENT_GAP = 2;

export function DurationBarChart({ series, stackBy, onStackByChange }: Props) {
  const [hovered, setHovered] = useState<number | null>(null);

  const title = GRANULARITY_TITLE[series.granularity];
  const hasData = series.buckets.some((b) => b.byCategory.size > 0);

  const plotWidth = CHART_WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotHeight = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;

  const bucketTotals = series.buckets.map((b) => Array.from(b.byCategory.values()).reduce((s, v) => s + v, 0));
  const maxValue = Math.max(1, ...bucketTotals);
  const step = pickStep(maxValue);
  const niceMax = step * 4;
  const gridLines = [0, 1, 2, 3, 4].map((i) => (i * step));

  const bucketCount = series.buckets.length;
  const bandWidth = bucketCount > 0 ? plotWidth / bucketCount : 0;
  const barWidth = Math.max(4, bandWidth * 0.5);

  const hoveredBucket = hovered !== null ? series.buckets[hovered] : null;
  const hoveredTotal = hovered !== null ? bucketTotals[hovered] : 0;

  function yFor(seconds: number): number {
    return PAD_TOP + plotHeight * (1 - seconds / niceMax);
  }

  return (
    <div className="rounded border border-neutral-800 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-200">{title}</h3>
        <GroupByMenu label="Stack by" value={stackBy} onChange={onStackByChange} />
      </div>

      {!hasData ? (
        <p className="flex h-56 items-center justify-center text-sm text-neutral-500">No data available</p>
      ) : (
        <>
          <div className="relative">
            <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="h-56 w-full" preserveAspectRatio="none">
              {gridLines.map((value) => (
                <g key={value}>
                  <line
                    x1={PAD_LEFT}
                    x2={CHART_WIDTH - PAD_RIGHT}
                    y1={yFor(value)}
                    y2={yFor(value)}
                    stroke="#404040"
                    strokeWidth={1}
                    strokeDasharray="2,3"
                  />
                  <text x={PAD_LEFT - 6} y={yFor(value)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="#a3a3a3">
                    {formatAxisLabel(value)}
                  </text>
                </g>
              ))}

              {series.buckets.map((bucket, i) => {
                const x = PAD_LEFT + i * bandWidth + (bandWidth - barWidth) / 2;
                let cumulative = 0;
                const total = bucketTotals[i];
                const isHovered = hovered === i;
                return (
                  <g
                    key={bucket.key}
                    onMouseEnter={() => setHovered(i)}
                    onMouseLeave={() => setHovered(null)}
                    style={{ cursor: total > 0 ? "pointer" : "default" }}
                  >
                    {/* Wide invisible hit target so hovering works even on tiny/zero bars. */}
                    <rect x={x - (bandWidth - barWidth) / 2} y={PAD_TOP} width={bandWidth} height={plotHeight} fill="transparent" />
                    {series.categories.map((category) => {
                      const value = bucket.byCategory.get(category.key) ?? 0;
                      if (value <= 0) return null;
                      const segHeight = Math.max(0, (value / niceMax) * plotHeight - SEGMENT_GAP);
                      const yTop = yFor(cumulative + value);
                      const isTopSegment = cumulative + value === total;
                      cumulative += value;
                      return (
                        <rect
                          key={category.key}
                          x={x}
                          y={yTop}
                          width={barWidth}
                          height={segHeight}
                          fill={category.color}
                          opacity={isHovered || hovered === null ? 1 : 0.4}
                          rx={isTopSegment ? 4 : 0}
                        />
                      );
                    })}
                    <text x={x + barWidth / 2} y={CHART_HEIGHT - PAD_BOTTOM + 14} textAnchor="middle" fontSize={10} fill="#a3a3a3">
                      {bucket.label}
                    </text>
                    {total > 0 && (
                      <text
                        x={x + barWidth / 2}
                        y={yFor(total) - 6}
                        textAnchor="middle"
                        fontSize={10}
                        fill="#e5e5e5"
                        opacity={isHovered ? 1 : 0.85}
                      >
                        {formatAxisLabel(total)}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>

            {hoveredBucket && hoveredTotal > 0 && (
              <div
                className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded border border-neutral-700 bg-neutral-900 p-2 text-xs shadow-xl"
                style={{
                  left: `${((hovered! + 0.5) / bucketCount) * 100}%`,
                  top: `${(yFor(hoveredTotal) / CHART_HEIGHT) * 100 - 2}%`,
                }}
              >
                <p className="mb-1 font-semibold text-neutral-100">{hoveredBucket.label}</p>
                {series.categories
                  .map((category) => ({ category, value: hoveredBucket.byCategory.get(category.key) ?? 0 }))
                  .filter((row) => row.value > 0)
                  .map(({ category, value }) => (
                    <p key={category.key} className="flex items-center gap-1.5 text-neutral-300">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: category.color }} />
                      {category.label}
                      <span className="ml-auto font-mono">{formatDuration(value)}</span>
                    </p>
                  ))}
              </div>
            )}
          </div>

          {series.categories.length > 1 && (
            <div className="mt-2 flex flex-wrap gap-3">
              {series.categories.map((category) => (
                <span key={category.key} className="flex items-center gap-1.5 text-xs text-neutral-400">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: category.color }} />
                  {category.label}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
