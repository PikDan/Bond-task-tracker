import { useMemo, useRef, useState } from "react";
import {
  format,
  isSameDay,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  subDays,
  subWeeks,
} from "date-fns";
import type { DateRange as RdpDateRange } from "react-day-picker";
import { useGetApiTimeEntries, AccessRole, type TimeEntry } from "../api/generated";
import { Calendar } from "./Calendar";
import { formatDuration } from "../utils/format";
import { useLiveElapsedSeconds } from "../hooks/useLiveElapsed";
import { useActiveTimer } from "../hooks/useActiveTimer";
import { useClickOutside } from "../hooks/useClickOutside";
import { useWorkspace } from "../context/WorkspaceContext";
import type { DateRange } from "../types";

type DateMode = "today" | "yesterday" | "week" | "lastWeek" | "last30" | "all";

const DATE_MODE_LABELS: Record<DateMode, string> = {
  today: "Today",
  yesterday: "Yesterday",
  week: "This week",
  lastWeek: "Last week",
  last30: "Last 30 days",
  all: "All dates",
};

// Grouped visually into sections (today-ish / week-ish / everything-else) —
// with only six flat options this reads as "hierarchical" without a real
// multi-level flyout menu.
const DATE_MODE_SECTIONS: DateMode[][] = [["today", "yesterday"], ["week", "lastWeek"], ["last30", "all"]];

function rangeForMode(mode: DateMode): DateRange | null {
  const now = new Date();
  switch (mode) {
    case "all":
      return null;
    case "today":
      return { from: startOfDay(now), to: endOfDay(now) };
    case "yesterday": {
      const yesterday = subDays(now, 1);
      return { from: startOfDay(yesterday), to: endOfDay(yesterday) };
    }
    case "week":
      return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) };
    case "lastWeek": {
      const lastWeek = subWeeks(now, 1);
      return { from: startOfWeek(lastWeek, { weekStartsOn: 1 }), to: endOfWeek(lastWeek, { weekStartsOn: 1 }) };
    }
    case "last30":
      // 30 days inclusive of today (29 days back + today).
      return { from: startOfDay(subDays(now, 29)), to: endOfDay(now) };
  }
}

interface Props {
  dateRange: DateRange | null;
  onChange: (range: DateRange | null) => void;
}

export function DateRangeBar({ dateRange, onChange }: Props) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [pendingRange, setPendingRange] = useState<RdpDateRange | undefined>(dateRange ?? undefined);
  const calendarWrapperRef = useRef<HTMLDivElement>(null);
  useClickOutside(calendarWrapperRef, () => setCalendarOpen(false));

  const [dateMode, setDateMode] = useState<DateMode>("all");
  const [presetOpen, setPresetOpen] = useState(false);
  const presetWrapperRef = useRef<HTMLDivElement>(null);
  useClickOutside(presetWrapperRef, () => setPresetOpen(false));

  function handleDateModeChange(mode: DateMode) {
    setDateMode(mode);
    onChange(rangeForMode(mode));
    setPresetOpen(false);
  }

  // Toggling (not just opening) means the "Calendar" button and the date
  // label both act as an on/off switch — clicking either one again while the
  // popover is already open is one of the two ways to close it (the other
  // being a click outside, via useClickOutside above). Picking a date is
  // deliberately NOT one of them, so a range can be adjusted (from, then to,
  // then tweaking either end again) without the popover closing mid-pick.
  function toggleCalendar() {
    if (calendarOpen) {
      setCalendarOpen(false);
      return;
    }
    setPendingRange(dateRange ?? undefined);
    setCalendarOpen(true);
  }

  function handleCalendarSelect(range: RdpDateRange | undefined) {
    setPendingRange(range);
    if (range?.from && range?.to) {
      setDateMode("all"); // custom range no longer matches a preset
      // react-day-picker gives midnight-anchored dates — widen to whole
      // days so the picked end day is fully included, not cut off at 00:00.
      onChange({ from: startOfDay(range.from), to: endOfDay(range.to) });
    }
  }

  const todayRange = useMemo(() => rangeForMode("today")!, []);
  const weekRange = useMemo(() => rangeForMode("week")!, []);

  const { role } = useWorkspace();
  const canSeeAll = role === AccessRole.OWNER || role === AccessRole.ADMIN || role === AccessRole.WORKSPACE_ADMIN;

  // Today/Week totals are fetched independently of the currently selected
  // date filter, so they stay accurate no matter what the list below shows.
  // Must agree with the main list's own all= choice, or the totals and the
  // visible rows would silently disagree for a privileged role.
  const { data: todayEntries } = useGetApiTimeEntries({
    from: todayRange.from.toISOString(),
    to: todayRange.to.toISOString(),
    all: canSeeAll,
  });
  const { data: weekEntries } = useGetApiTimeEntries({
    from: weekRange.from.toISOString(),
    to: weekRange.to.toISOString(),
    all: canSeeAll,
  });
  const activeTimer = useActiveTimer();
  const liveElapsed = useLiveElapsedSeconds(activeTimer?.started_at);

  const todayTotal = useMemo(
    () => sumDurations(todayEntries, activeTimer?.id, liveElapsed),
    [todayEntries, activeTimer?.id, liveElapsed],
  );
  const weekTotal = useMemo(
    () => sumDurations(weekEntries, activeTimer?.id, liveElapsed),
    [weekEntries, activeTimer?.id, liveElapsed],
  );

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded border border-neutral-800 px-4 py-2">
      {dateRange ? (
        <div className="flex items-center gap-2">
          <button onClick={toggleCalendar} className="text-sm font-medium hover:underline">
            {isSameDay(dateRange.from, dateRange.to)
              ? format(dateRange.from, "EEE, d MMM")
              : `${format(dateRange.from, "dd MMM")} → ${format(dateRange.to, "dd MMM")}`}
          </button>
          <button
            onClick={() => {
              setDateMode("all");
              onChange(null);
            }}
            className="text-xs text-blue-400 hover:underline"
          >
            Clear
          </button>
        </div>
      ) : (
        <div className="relative" ref={presetWrapperRef}>
          <button
            onClick={() => setPresetOpen((v) => !v)}
            className="min-w-32 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-left text-sm font-medium text-neutral-100 hover:bg-neutral-700"
          >
            {DATE_MODE_LABELS[dateMode]}
          </button>
          {presetOpen && (
            <div className="absolute left-0 z-20 mt-2 w-40 rounded border border-neutral-700 bg-neutral-900 p-1 shadow-xl">
              {DATE_MODE_SECTIONS.map((section, i) => (
                <div key={i}>
                  {i > 0 && <hr className="my-1 border-neutral-800" />}
                  {section.map((mode) => (
                    <button
                      key={mode}
                      onClick={() => handleDateModeChange(mode)}
                      className={`block w-full rounded px-2 py-1 text-left text-sm hover:bg-neutral-800 ${
                        dateMode === mode ? "text-blue-300" : "text-neutral-200"
                      }`}
                    >
                      {DATE_MODE_LABELS[mode]}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-6 text-sm">
        <div>
          <span className="text-neutral-400">Today total </span>
          <span className="font-mono">{formatDuration(todayTotal)}</span>
        </div>
        <div>
          <span className="text-neutral-400">Week total </span>
          <span className="font-mono">{formatDuration(weekTotal)}</span>
        </div>
      </div>

      <div className="relative" ref={calendarWrapperRef}>
        <button
          onClick={toggleCalendar}
          className="rounded border border-neutral-700 px-3 py-1 text-sm hover:bg-neutral-800"
        >
          Calendar
        </button>
        {calendarOpen && (
          <div className="absolute right-0 z-10 mt-2">
            <Calendar selected={pendingRange} onSelect={handleCalendarSelect} />
          </div>
        )}
      </div>
    </div>
  );
}

function sumDurations(entries: TimeEntry[] | undefined, activeTimerId: string | undefined, liveElapsed: number): number {
  if (!entries) return 0;
  let total = 0;
  for (const e of entries) {
    if (e.duration_seconds != null) {
      total += e.duration_seconds;
    } else if (activeTimerId && e.id === activeTimerId) {
      total += liveElapsed;
    }
  }
  return total;
}
