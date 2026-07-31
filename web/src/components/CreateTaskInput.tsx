import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Folder } from "lucide-react";
import { useGetApiProjects, usePostApiTasks, getGetApiTasksQueryKey } from "../api/generated";
import { extractErrorMessage } from "../utils/errors";
import { useClickOutside } from "../hooks/useClickOutside";
import { useToast } from "../context/ToastContext";
import { ProjectPicker } from "./ProjectPicker";
import { colorForId } from "../utils/projectColor";

interface Props {
  // Active Project quick-filter, if any — used as the default project for a
  // newly created task (project creation itself now lives in Manage → Projects).
  projectFilter: string | null;
}

export function CreateTaskInput({ projectFilter }: Props) {
  const queryClient = useQueryClient();
  const { data: projects } = useGetApiProjects();
  const { show } = useToast();
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState(projectFilter ?? "");
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  useClickOutside(pickerRef, () => setPickerOpen(false));

  useEffect(() => {
    if (projectFilter) setProjectId(projectFilter);
  }, [projectFilter]);

  const selectedProject = projects?.find((p) => p.id === projectId);

  const createTask = usePostApiTasks({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetApiTasksQueryKey() });
        setTitle("");
      },
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    // Both title and project are optional — Toggl-style "start typing, name
    // and organize it later." Pressing Add with everything blank still
    // creates a task; the list renders an "Add task name" placeholder for it.
    createTask.mutate({ data: { project_id: projectId || null, title: title.trim() } });
  }

  function handleFolderClick() {
    if (title.trim() === "") {
      show("Please enter a task name first", "info");
      return;
    }
    setPickerOpen((v) => !v);
  }

  return (
    <div className="mb-4">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative shrink-0" ref={pickerRef}>
          <button
            type="button"
            onClick={handleFolderClick}
            className="flex h-full items-center gap-1.5 rounded border px-2 py-2 text-sm"
            style={
              selectedProject
                ? {
                    borderColor: colorForId(selectedProject.id),
                    color: "#e5e5e5",
                    backgroundColor: `${colorForId(selectedProject.id)}22`,
                  }
                : { borderColor: "#404040", color: "#a3a3a3" }
            }
          >
            <Folder size={16} />
            {selectedProject && <span className="max-w-[8rem] truncate">{selectedProject.name}</span>}
          </button>
          {pickerOpen && (
            <div className="absolute left-0 z-20 mt-2 w-56 rounded border border-neutral-700 bg-neutral-900 p-2 shadow-xl">
              <ProjectPicker
                projects={projects ?? []}
                selectedId={projectId || null}
                onSelect={(id) => {
                  setProjectId(id ?? "");
                  setPickerOpen(false);
                }}
              />
            </div>
          )}
        </div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add task name"
          className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={createTask.isPending}
          className="rounded bg-blue-600 px-4 py-2 text-sm hover:bg-blue-500 disabled:opacity-50"
        >
          Add
        </button>
      </form>
      {createTask.isError && (
        <p className="mt-1 text-xs text-red-400">{extractErrorMessage(createTask.error, "Could not create task")}</p>
      )}
    </div>
  );
}
