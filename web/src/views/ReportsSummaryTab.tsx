import { useMemo, useState } from "react";
import { differenceInCalendarDays } from "date-fns";
import { useGetApiTimeEntries, useGetApiTasks, useGetApiProjects } from "../api/generated";
import { useActiveTimer } from "../hooks/useActiveTimer";
import { useLiveElapsedSeconds } from "../hooks/useLiveElapsed";
import { DateRangeBar } from "../components/DateRangeBar";
import { ReportsFilterBar } from "../components/reports/ReportsFilterBar";
import { StatCards } from "../components/reports/StatCards";
import { DurationBarChart } from "../components/reports/DurationBarChart";
import { DistributionDonut } from "../components/reports/DistributionDonut";
import { BreakdownTable } from "../components/reports/BreakdownTable";
import { buildBreakdown, buildTimeSeries, entryDuration, filterEntries, type GroupDimension } from "../utils/reportAggregation";
import { dayKey } from "../utils/format";
import type { DateRange } from "../types";

export function ReportsSummaryTab() {
  const [dateRange, setDateRange] = useState<DateRange | null>(null);
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const [taskFilter, setTaskFilter] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [stackBy, setStackBy] = useState<GroupDimension>("task");
  const [sliceBy, setSliceBy] = useState<GroupDimension>("project");

  const range = dateRange ? { from: dateRange.from.toISOString(), to: dateRange.to.toISOString() } : {};
  const { data: entries, isLoading: entriesLoading } = useGetApiTimeEntries(range);
  const { data: tasks, isLoading: tasksLoading } = useGetApiTasks({});
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

  // A bounded period divides by its calendar length; "All dates" has no
  // fixed length, so it falls back to the number of distinct days that
  // actually have an entry.
  const daysInPeriod = useMemo(() => {
    if (dateRange) return differenceInCalendarDays(dateRange.to, dateRange.from) + 1;
    return new Set(filteredEntries.map((e) => dayKey(e.started_at))).size;
  }, [dateRange, filteredEntries]);

  const averageDailySeconds = daysInPeriod > 0 ? totalSeconds / daysInPeriod : 0;

  const series = useMemo(
    () => buildTimeSeries(filteredEntries, tasksById, projectsById, stackBy, dateRange, activeTimer?.id, liveElapsed),
    [filteredEntries, tasksById, projectsById, stackBy, dateRange, activeTimer?.id, liveElapsed],
  );

  // Shared by both the donut and the table below it — "slice by" is the one
  // dimension selector that drives the whole breakdown, so they always show
  // the same grouping.
  const breakdown = useMemo(
    () => buildBreakdown(filteredEntries, tasksById, projectsById, sliceBy, activeTimer?.id, liveElapsed),
    [filteredEntries, tasksById, projectsById, sliceBy, activeTimer?.id, liveElapsed],
  );

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

          <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
            <DurationBarChart series={series} stackBy={stackBy} onStackByChange={setStackBy} />
            <DistributionDonut rows={breakdown} totalSeconds={totalSeconds} sliceBy={sliceBy} onSliceByChange={setSliceBy} />
          </div>

          <BreakdownTable rows={breakdown} dimension={sliceBy} />
        </>
      )}
    </div>
  );
}
