import { useRef, useState } from "react";
import { ListTodo, Folder, Tags as TagsIcon, Users } from "lucide-react";
import { useGetApiProjects, useGetApiTasks, type Project, type Task } from "../../api/generated";
import { colorForId } from "../../utils/projectColor";
import { useClickOutside } from "../../hooks/useClickOutside";
import { ProjectPicker } from "../ProjectPicker";

interface Props {
  projectFilter: string | null;
  onProjectFilterChange: (id: string | null) => void;
  taskFilter: string | null;
  onTaskFilterChange: (id: string | null) => void;
  tagFilter: string[];
  onTagFilterChange: (tags: string[]) => void;
}

// Mirrors TimerView's QuickFilterBar visually (same button/popover shell),
// but Task is a single-pick discrete filter here ("Task = API") rather than
// a free-text search — Reports intersects filters, so it needs one exact
// task, not a fuzzy name match. Member is a placeholder: there's no
// multi-member data model yet, so it stays disabled like elsewhere in the app
// (see ProjectsView's MemberFilterButton).
export function ReportsFilterBar({
  projectFilter,
  onProjectFilterChange,
  taskFilter,
  onTaskFilterChange,
  tagFilter,
  onTagFilterChange,
}: Props) {
  const { data: projects } = useGetApiProjects();
  const { data: tasks } = useGetApiTasks({});

  const selectedProject = projects?.find((p) => p.id === projectFilter);
  const selectedTask = tasks?.find((t) => t.id === taskFilter);
  const allTags = Array.from(new Set((tasks ?? []).flatMap((t) => t.tags))).sort();

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <MemberFilterButton />
      <ProjectFilterButton projects={projects ?? []} selected={selectedProject} onSelect={onProjectFilterChange} />
      <TaskFilterButton tasks={tasks ?? []} selected={selectedTask} onSelect={onTaskFilterChange} />
      <TagFilterButton allTags={allTags} selected={tagFilter} onChange={onTagFilterChange} />
    </div>
  );
}

function MemberFilterButton() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
      >
        <Users size={14} />
        Member
      </button>
      {open && (
        <div className="absolute left-0 z-20 mt-2 w-44 rounded border border-neutral-700 bg-neutral-900 p-2 shadow-xl">
          <p className="text-xs text-neutral-500">Coming soon — single-user accounts only for now.</p>
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

function TaskFilterButton({
  tasks,
  selected,
  onSelect,
}: {
  tasks: Task[];
  selected: Task | undefined;
  onSelect: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));

  const filtered = tasks.filter((t) => t.title.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 rounded border px-2 py-1 text-xs ${
          selected ? "border-blue-500 bg-blue-500/10 text-blue-300" : "border-neutral-700 text-neutral-300 hover:bg-neutral-800"
        }`}
      >
        <ListTodo size={14} />
        {selected ? selected.title || "Untitled task" : "Task"}
      </button>
      {open && (
        <div className="absolute left-0 z-20 mt-2 w-56 rounded border border-neutral-700 bg-neutral-900 p-2 shadow-xl">
          <p className="mb-2 text-xs font-semibold text-neutral-300">Search task</p>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="mb-2 w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <ul className="max-h-48 space-y-0.5 overflow-y-auto">
            <li>
              <button
                onClick={() => {
                  onSelect(null);
                  setOpen(false);
                }}
                className={`w-full rounded px-2 py-1 text-left text-sm hover:bg-neutral-800 ${
                  !selected ? "text-blue-300" : "text-neutral-300"
                }`}
              >
                All tasks
              </button>
            </li>
            {filtered.length === 0 && <li className="px-2 py-1 text-xs text-neutral-500">No tasks found</li>}
            {filtered.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => {
                    onSelect(t.id);
                    setOpen(false);
                  }}
                  className={`w-full truncate rounded px-2 py-1 text-left text-sm hover:bg-neutral-800 ${
                    selected?.id === t.id ? "text-blue-300" : ""
                  }`}
                >
                  {t.title || <span className="italic text-neutral-500">Add task name</span>}
                </button>
              </li>
            ))}
          </ul>
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
        Tag{active ? ` (${selected.length})` : ""}
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
