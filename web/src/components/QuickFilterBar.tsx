import { useMemo, useRef, useState } from "react";
import { ListTodo, Folder, Tags as TagsIcon } from "lucide-react";
import { useGetApiProjects, useGetApiTasks, AccessRole, type Project } from "../api/generated";
import { colorForId } from "../utils/projectColor";
import { useClickOutside } from "../hooks/useClickOutside";
import { useWorkspace } from "../context/WorkspaceContext";
import { ProjectPicker } from "./ProjectPicker";

interface Props {
  taskQuery: string;
  onTaskQueryChange: (q: string) => void;
  projectFilter: string | null;
  onProjectFilterChange: (id: string | null) => void;
  tagFilter: string[];
  onTagFilterChange: (tags: string[]) => void;
}

export function QuickFilterBar({
  taskQuery,
  onTaskQueryChange,
  projectFilter,
  onProjectFilterChange,
  tagFilter,
  onTagFilterChange,
}: Props) {
  const { role } = useWorkspace();
  const canSeeAll = role === AccessRole.OWNER || role === AccessRole.ADMIN || role === AccessRole.WORKSPACE_ADMIN;
  const { data: projects } = useGetApiProjects();
  const { data: tasks } = useGetApiTasks({ all: canSeeAll });

  const selectedProject = projects?.find((p) => p.id === projectFilter);
  const allTags = useMemo(() => Array.from(new Set((tasks ?? []).flatMap((t) => t.tags))).sort(), [tasks]);

  return (
    <div id="quick-filter-bar" className="mb-4 flex items-center gap-2">
      <TaskFilterButton query={taskQuery} onChange={onTaskQueryChange} />
      <ProjectFilterButton projects={projects ?? []} selected={selectedProject} onSelect={onProjectFilterChange} />
      <TagFilterButton allTags={allTags} selected={tagFilter} onChange={onTagFilterChange} />
    </div>
  );
}

function TaskFilterButton({ query, onChange }: { query: string; onChange: (q: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));
  const active = query.trim() !== "";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 rounded border px-2 py-1 text-xs ${
          active ? "border-blue-500 bg-blue-500/10 text-blue-300" : "border-neutral-700 text-neutral-300 hover:bg-neutral-800"
        }`}
      >
        <ListTodo size={14} />
        Task
      </button>
      {open && (
        <div className="absolute left-0 z-20 mt-2 w-56 rounded border border-neutral-700 bg-neutral-900 p-2 shadow-xl">
          <p className="mb-2 text-xs font-semibold text-neutral-300">Search task</p>
          <input
            autoFocus
            value={query}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      )}
    </div>
  );
}

function ProjectFilterButton({
  projects,
  selected,
  onSelect,
}: {
  projects: Project[];
  selected: Project | undefined;
  onSelect: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded border px-2 py-1 text-xs"
        style={
          selected
            ? { borderColor: colorForId(selected.id), color: "#e5e5e5", backgroundColor: `${colorForId(selected.id)}22` }
            : { borderColor: "#404040", color: "#d4d4d4" }
        }
      >
        <Folder size={14} />
        {selected ? selected.name : "Project"}
      </button>
      {open && (
        <div className="absolute left-0 z-20 mt-2 w-56 rounded border border-neutral-700 bg-neutral-900 p-2 shadow-xl">
          <ProjectPicker
            projects={projects}
            selectedId={selected?.id ?? null}
            onSelect={(id) => {
              onSelect(id);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

function TagFilterButton({
  allTags,
  selected,
  onChange,
}: {
  allTags: string[];
  selected: string[];
  onChange: (tags: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));

  const filtered = allTags.filter((t) => t.toLowerCase().includes(query.toLowerCase()));
  const active = selected.length > 0;

  function toggle(tag: string) {
    onChange(selected.includes(tag) ? selected.filter((t) => t !== tag) : [...selected, tag]);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 rounded border px-2 py-1 text-xs ${
          active ? "border-blue-500 bg-blue-500/10 text-blue-300" : "border-neutral-700 text-neutral-300 hover:bg-neutral-800"
        }`}
      >
        <TagsIcon size={14} />
        Tags{active ? ` (${selected.length})` : ""}
      </button>
      {open && (
        <div className="absolute left-0 z-20 mt-2 w-56 rounded border border-neutral-700 bg-neutral-900 p-2 shadow-xl">
          <p className="mb-2 text-xs font-semibold text-neutral-300">Search tag</p>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="mb-2 w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <ul className="max-h-48 space-y-0.5 overflow-y-auto">
            {filtered.length === 0 && <li className="px-2 py-1 text-xs text-neutral-500">No tags</li>}
            {filtered.map((tag) => (
              <li key={tag}>
                <label className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-neutral-800">
                  <input type="checkbox" checked={selected.includes(tag)} onChange={() => toggle(tag)} />
                  {tag}
                </label>
              </li>
            ))}
          </ul>
          {active && (
            <>
              <hr className="my-2 border-neutral-800" />
              <button onClick={() => onChange([])} className="w-full text-left text-xs text-blue-400 hover:underline">
                Clear selected tags
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
