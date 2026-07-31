import { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useClickOutside } from "../../hooks/useClickOutside";
import type { GroupDimension } from "../../utils/reportAggregation";

export const DIMENSION_LABELS: Record<GroupDimension, string> = {
  member: "Members",
  project: "Projects",
  task: "Tasks",
  tag: "Tags",
};

const DIMENSION_ORDER: GroupDimension[] = ["member", "project", "task", "tag"];

interface Props {
  label: string; // "Stack by" | "Slice by"
  value: GroupDimension;
  onChange: (dimension: GroupDimension) => void;
}

// Shared "Stack by" / "Slice by" dropdown for the bar chart and donut —
// same four dimensions either way, Members disabled until there's a real
// multi-member data model to group by.
export function GroupByMenu({ label, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-700"
      >
        {label}: <span className="font-semibold">{DIMENSION_LABELS[value]}</span>
        <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-36 rounded border border-neutral-700 bg-neutral-900 p-1 shadow-xl">
          {DIMENSION_ORDER.map((dimension) => {
            const disabled = dimension === "member";
            const selected = value === dimension;
            return (
              <button
                key={dimension}
                disabled={disabled}
                title={disabled ? "Coming soon" : undefined}
                onClick={() => {
                  onChange(dimension);
                  setOpen(false);
                }}
                className={`block w-full rounded px-2 py-1 text-left text-sm ${
                  disabled
                    ? "cursor-not-allowed text-neutral-600"
                    : selected
                      ? "bg-blue-600 text-white"
                      : "text-neutral-200 hover:bg-neutral-800"
                }`}
              >
                {DIMENSION_LABELS[dimension]}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
