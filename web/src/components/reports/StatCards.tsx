import { formatDecimalHours, formatDuration } from "../../utils/format";

interface Props {
  totalSeconds: number;
  averageDailySeconds: number;
}

// Minimal set required now (Total Hours, Average Daily Hours) — laid out so
// more cards (Active Projects, Active Tasks, Total Sessions) can slot in
// later without restructuring, same divider-between-cells pattern used
// elsewhere for grouped stats.
export function StatCards({ totalSeconds, averageDailySeconds }: Props) {
  return (
    <div className="mb-4 flex flex-wrap items-stretch divide-x divide-neutral-800 rounded border border-neutral-800">
      <StatCard label="Total Hours" value={formatDuration(totalSeconds)} />
      <StatCard label="Average Daily Hours" value={`${formatDecimalHours(averageDailySeconds)} Hours`} />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[10rem] flex-1 px-4 py-3">
      <p className="text-xs text-neutral-400">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}
