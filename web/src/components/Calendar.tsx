import { DayPicker, type DateRange } from "react-day-picker";
import "react-day-picker/style.css";

interface Props {
  selected?: DateRange;
  onSelect: (range: DateRange | undefined) => void;
}

export function Calendar({ selected, onSelect }: Props) {
  return (
    <div className="rdp-dark w-[21rem] rounded border border-neutral-700 bg-neutral-900 p-2 shadow-xl">
      {/* min={1} forces the first click to only set `from` (to stays
          undefined) instead of react-day-picker's default of immediately
          committing a same-day range on a single click. */}
      <DayPicker mode="range" min={1} showOutsideDays selected={selected} onSelect={onSelect} />
    </div>
  );
}
