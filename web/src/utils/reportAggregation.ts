import { addDays, addMonths, addWeeks, differenceInCalendarDays, format, getISOWeek, startOfMonth, startOfWeek } from "date-fns";
import type { Project, Task, TimeEntry } from "../api/generated";
import { colorForId } from "./projectColor";
import type { DateRange } from "../types";

export type GroupDimension = "project" | "task" | "tag" | "member";

const NEUTRAL_COLOR = "#737373";
const NO_PROJECT: Category = { key: "__no_project__", label: "Without project", color: NEUTRAL_COLOR };
const NO_TAGS: Category = { key: "__no_tags__", label: "No tags", color: NEUTRAL_COLOR };
const OTHER_COLOR = "#525252";

export interface Category {
  key: string;
  label: string;
  color: string;
}

export interface ReportFilters {
  projectId: string | null;
  taskId: string | null;
  tagIds: string[];
}

// Same "duration so far" logic TimeEntriesList uses for the still-running
// entry (duration_seconds is NULL until a timer stops).
export function entryDuration(entry: TimeEntry, activeTimerId: string | undefined, liveElapsed: number): number {
  if (entry.duration_seconds != null) return entry.duration_seconds;
  if (activeTimerId && entry.id === activeTimerId) return liveElapsed;
  return 0;
}

// Every filter dimension applies as an AND — an entry must satisfy all of
// them at once. Within `tagIds` itself matching is OR (an entry's task needs
// just one of the selected tags), matching the existing convention in
// QuickFilterBar/TimeEntriesList.
export function filterEntries(entries: TimeEntry[], tasksById: Map<string, Task>, filters: ReportFilters): TimeEntry[] {
  return entries.filter((e) => {
    if (filters.projectId && e.project_id !== filters.projectId) return false;
    if (filters.taskId && e.task_id !== filters.taskId) return false;
    if (filters.tagIds.length > 0) {
      const tags = tasksById.get(e.task_id)?.tags ?? [];
      if (!filters.tagIds.some((t) => tags.includes(t))) return false;
    }
    return true;
  });
}

// Which categories a single entry contributes its full duration to. Project
// and task are 1:1 (always exactly one category); tag is potentially 1:N — a
// task with two tags credits both tag buckets in full, the same way Toggl's
// own tag reports work, so tag percentages can legitimately sum past 100%.
function categoriesForEntry(
  entry: TimeEntry,
  task: Task | undefined,
  projectsById: Map<string, Project>,
  dimension: GroupDimension,
): Category[] {
  switch (dimension) {
    case "project": {
      if (!entry.project_id) return [NO_PROJECT];
      const project = projectsById.get(entry.project_id);
      return [{ key: entry.project_id, label: project?.name ?? "Unknown project", color: colorForId(entry.project_id) }];
    }
    case "task":
      return [{ key: entry.task_id, label: task?.title ?? entry.task_name, color: colorForId(entry.task_id) }];
    case "tag": {
      const tags = task?.tags ?? [];
      if (tags.length === 0) return [NO_TAGS];
      return tags.map((t) => ({ key: t, label: t, color: colorForId(t) }));
    }
    case "member":
      // No multi-member data model yet — everything belongs to one bucket.
      return [{ key: "me", label: "Me", color: NEUTRAL_COLOR }];
  }
}

export interface BreakdownNode extends Category {
  seconds: number;
  count: number;
  percent: number; // of the grand total across the whole filtered set
  children: BreakdownNode[];
  entry?: TimeEntry; // set only on a true leaf (single time entry) row
}

// Builds the grouped rows for the donut chart and the breakdown table,
// including the drill-down hierarchy: Project -> Task -> individual entries,
// Task -> individual entries, Tag -> individual entries.
export function buildBreakdown(
  entries: TimeEntry[],
  tasksById: Map<string, Task>,
  projectsById: Map<string, Project>,
  dimension: GroupDimension,
  activeTimerId: string | undefined,
  liveElapsed: number,
): BreakdownNode[] {
  const grandTotal = entries.reduce((sum, e) => sum + entryDuration(e, activeTimerId, liveElapsed), 0);

  function leafFor(entry: TimeEntry): BreakdownNode {
    const seconds = entryDuration(entry, activeTimerId, liveElapsed);
    return {
      key: entry.id,
      label: entry.task_name,
      color: NEUTRAL_COLOR,
      seconds,
      count: 1,
      percent: pct(seconds, grandTotal),
      children: [],
      entry,
    };
  }

  function groupEntries(list: TimeEntry[], groupDimension: GroupDimension): BreakdownNode[] {
    const byKey = new Map<string, { category: Category; entries: TimeEntry[] }>();
    for (const entry of list) {
      const task = tasksById.get(entry.task_id);
      for (const category of categoriesForEntry(entry, task, projectsById, groupDimension)) {
        const existing = byKey.get(category.key);
        if (existing) existing.entries.push(entry);
        else byKey.set(category.key, { category, entries: [entry] });
      }
    }

    return Array.from(byKey.values())
      .map(({ category, entries: groupEntriesList }) => {
        const seconds = groupEntriesList.reduce((sum, e) => sum + entryDuration(e, activeTimerId, liveElapsed), 0);
        return {
          ...category,
          seconds,
          count: groupEntriesList.length,
          percent: pct(seconds, grandTotal),
          children: childrenFor(groupEntriesList, groupDimension),
        };
      })
      .sort((a, b) => b.seconds - a.seconds);
  }

  function childrenFor(list: TimeEntry[], groupDimension: GroupDimension): BreakdownNode[] {
    if (groupDimension === "project") return groupEntries(list, "task");
    // Task, tag, and member groups all bottom out directly at individual
    // sessions — no third level.
    return [...list]
      .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
      .map(leafFor);
  }

  return groupEntries(entries, dimension);
}

function pct(seconds: number, total: number): number {
  if (total <= 0) return 0;
  return (seconds / total) * 100;
}

type Granularity = "day" | "week" | "month";

export interface SeriesBucket {
  key: string;
  label: string;
  byCategory: Map<string, number>;
}

export interface TimeSeries {
  buckets: SeriesBucket[];
  categories: Category[]; // legend order, largest total first, capped with "Other"
  granularity: Granularity;
}

const MAX_SERIES_CATEGORIES = 6;

function pickGranularity(from: Date, to: Date): Granularity {
  const days = differenceInCalendarDays(to, from);
  if (days <= 14) return "day";
  if (days <= 120) return "week";
  return "month";
}

function bucketKeyAndLabel(date: Date, granularity: Granularity): { key: string; label: string } {
  if (granularity === "day") return { key: format(date, "yyyy-MM-dd"), label: format(date, "d MMM") };
  if (granularity === "week") {
    const weekStart = startOfWeek(date, { weekStartsOn: 1 });
    return { key: format(weekStart, "yyyy-MM-dd"), label: `W${getISOWeek(date)}` };
  }
  return { key: format(startOfMonth(date), "yyyy-MM"), label: format(date, "MMM yyyy") };
}

function enumerateBuckets(from: Date, to: Date, granularity: Granularity): { key: string; label: string }[] {
  const buckets: { key: string; label: string }[] = [];
  let cursor = granularity === "week" ? startOfWeek(from, { weekStartsOn: 1 }) : granularity === "month" ? startOfMonth(from) : from;
  const advance = granularity === "day" ? (d: Date) => addDays(d, 1) : granularity === "week" ? (d: Date) => addWeeks(d, 1) : (d: Date) => addMonths(d, 1);

  // Guard against a pathological huge range producing an unbounded loop.
  let safety = 0;
  while (cursor <= to && safety < 1000) {
    buckets.push(bucketKeyAndLabel(cursor, granularity));
    cursor = advance(cursor);
    safety++;
  }
  return buckets;
}

// Builds the "Duration by week/day/month" stacked bar chart's data: every
// bucket across the effective range (even ones with zero time, so the chart
// reads as a continuous timeline), stacked by whichever dimension the user
// picked. Categories are capped to the largest few, with the remainder
// folded into "Other" — never an unbounded number of stacked hues.
export function buildTimeSeries(
  entries: TimeEntry[],
  tasksById: Map<string, Task>,
  projectsById: Map<string, Project>,
  dimension: GroupDimension,
  dateRange: DateRange | null,
  activeTimerId: string | undefined,
  liveElapsed: number,
): TimeSeries {
  if (entries.length === 0) return { buckets: [], categories: [], granularity: "week" };

  const timestamps = entries.map((e) => new Date(e.started_at).getTime());
  const effectiveFrom = dateRange?.from ?? new Date(Math.min(...timestamps));
  const effectiveTo = dateRange?.to ?? new Date(Math.max(...timestamps));
  const granularity = pickGranularity(effectiveFrom, effectiveTo);

  const totalsByCategory = new Map<string, { category: Category; seconds: number }>();
  const byBucketAndCategory = new Map<string, Map<string, number>>();

  for (const entry of entries) {
    const task = tasksById.get(entry.task_id);
    const { key: bucketKey } = bucketKeyAndLabel(new Date(entry.started_at), granularity);
    const seconds = entryDuration(entry, activeTimerId, liveElapsed);

    for (const category of categoriesForEntry(entry, task, projectsById, dimension)) {
      const totalEntry = totalsByCategory.get(category.key);
      if (totalEntry) totalEntry.seconds += seconds;
      else totalsByCategory.set(category.key, { category, seconds });

      let bucketMap = byBucketAndCategory.get(bucketKey);
      if (!bucketMap) {
        bucketMap = new Map();
        byBucketAndCategory.set(bucketKey, bucketMap);
      }
      bucketMap.set(category.key, (bucketMap.get(category.key) ?? 0) + seconds);
    }
  }

  const rankedCategories = Array.from(totalsByCategory.values()).sort((a, b) => b.seconds - a.seconds);
  const kept = rankedCategories.slice(0, MAX_SERIES_CATEGORIES).map((c) => c.category);
  const overflow = rankedCategories.slice(MAX_SERIES_CATEGORIES);
  const keptKeys = new Set(kept.map((c) => c.key));
  const categories = overflow.length > 0 ? [...kept, { key: "__other__", label: "Other", color: OTHER_COLOR }] : kept;

  const buckets: SeriesBucket[] = enumerateBuckets(effectiveFrom, effectiveTo, granularity).map(({ key, label }) => {
    const source = byBucketAndCategory.get(key);
    const byCategory = new Map<string, number>();
    if (source) {
      for (const [categoryKey, seconds] of source) {
        const targetKey = keptKeys.has(categoryKey) ? categoryKey : "__other__";
        byCategory.set(targetKey, (byCategory.get(targetKey) ?? 0) + seconds);
      }
    }
    return { key, label, byCategory };
  });

  return { buckets, categories, granularity };
}

// Same top-N + "Other" capping as the time series, applied to the donut's
// slices — reuses buildBreakdown's totals rather than recomputing them.
export function capBreakdownForChart(rows: BreakdownNode[], max = 8): { key: string; label: string; color: string; seconds: number }[] {
  if (rows.length <= max) return rows;
  const kept = rows.slice(0, max);
  const overflowSeconds = rows.slice(max).reduce((sum, r) => sum + r.seconds, 0);
  return [...kept, { key: "__other__", label: "Other", color: OTHER_COLOR, seconds: overflowSeconds }];
}
