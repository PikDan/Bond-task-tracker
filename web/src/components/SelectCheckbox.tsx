interface Props {
  checked: boolean;
  indeterminate?: boolean;
  onToggle: () => void;
  label?: string;
}

// A round Toggl-style selection checkbox with three visual states, used at
// all three selection levels: day heading, task-group row, and individual
// expanded session.
export function SelectCheckbox({ checked, indeterminate = false, onToggle, label }: Props) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      aria-label={label ?? "Select"}
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      onKeyDown={(e) => {
        if (e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          onToggle();
        }
      }}
      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
        checked || indeterminate
          ? "border-blue-500 bg-blue-500"
          : "border-neutral-600 bg-transparent hover:border-neutral-400"
      }`}
    >
      {checked && !indeterminate && (
        <svg viewBox="0 0 16 16" className="h-2.5 w-2.5 fill-none stroke-white stroke-[2.5]">
          <path d="M3 8l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {indeterminate && <span className="h-0.5 w-2 rounded-full bg-white" />}
    </button>
  );
}
