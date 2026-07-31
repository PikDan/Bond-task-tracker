import { useState } from "react";
import type { Project } from "../api/generated";
import { colorForId } from "../utils/projectColor";

interface Props {
  projects: Project[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  noProjectLabel?: string;
}

// Just the search input + scrollable project list — the popover shell
// (trigger button, positioning, click-outside) is owned by each call site,
// since that differs between a filter button, a folder icon, and an
// inline field inside a modal.
export function ProjectPicker({ projects, selectedId, onSelect, noProjectLabel = "No Project" }: Props) {
  const [query, setQuery] = useState("");
  const filtered = projects.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-neutral-300">Search project</p>
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mb-2 w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      <ul className="max-h-48 space-y-0.5 overflow-y-auto">
        <li>
          <button
            onClick={() => onSelect(null)}
            className={`w-full rounded px-2 py-1 text-left text-sm hover:bg-neutral-800 ${
              selectedId === null ? "text-blue-300" : "text-neutral-300"
            }`}
          >
            {noProjectLabel}
          </button>
        </li>
        {filtered.map((p) => (
          <li key={p.id}>
            <button
              onClick={() => onSelect(p.id)}
              className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-neutral-800 ${
                selectedId === p.id ? "text-blue-300" : ""
              }`}
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colorForId(p.id) }} />
              {p.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
