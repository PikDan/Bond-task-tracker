import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  usePostApiTasks,
  usePatchApiTimeEntriesId,
  useGetApiProjects,
  getApiTimeEntries,
  deleteApiTasksId,
  getGetApiTasksQueryKey,
  getGetApiTimeEntriesQueryKey,
  getGetApiTimersActiveQueryKey,
  type TimeEntry,
} from "../api/generated";
import { Modal } from "./Modal";
import { ProjectPicker } from "./ProjectPicker";
import { useToast } from "../context/ToastContext";
import { extractErrorMessage } from "../utils/errors";

interface Props {
  entries: TimeEntry[]; // every selected entry, spanning multiple tasks (same day)
  bareTaskIds: string[]; // selected tasks that were never started (no entries to reassign)
  onClose: () => void;
  onSaved: () => void;
}

// Scenario B: the bulk selection spans multiple independent tasks. All
// selected entries get merged onto one brand-new task; any original task
// left with zero entries anywhere (not just in the current view) is deleted
// so it doesn't linger as a ghost "bare task" row. Bare tasks selected
// directly (never had any entries) skip the reassign step and go straight
// into that same cleanup, since they already have zero entries.
export function GroupEditModal({ entries, bareTaskIds, onClose, onSaved }: Props) {
  const queryClient = useQueryClient();
  const { show } = useToast();
  const { data: projects } = useGetApiProjects();

  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const createTask = usePostApiTasks();
  const reassignEntry = usePatchApiTimeEntriesId();

  const taskCount = new Set([...entries.map((e) => e.task_id), ...bareTaskIds]).size;

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: getGetApiTasksQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetApiTimeEntriesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetApiTimersActiveQueryKey() });
  }

  async function handleSave() {
    const trimmed = title.trim();
    if (!trimmed) {
      setSaveError("Task name is required");
      return;
    }
    setSaveError(null);
    setIsSaving(true);
    try {
      const newTask = await createTask.mutateAsync({ data: { title: trimmed, project_id: projectId } });
      await Promise.all(entries.map((e) => reassignEntry.mutateAsync({ id: e.id, data: { task_id: newTask.id } })));

      // Delete any original task that's now fully empty — checked
      // authoritatively against the server (not the locally cached, possibly
      // date-filtered entries list), since this is a destructive step.
      const originalTaskIds = Array.from(new Set([...entries.map((e) => e.task_id), ...bareTaskIds]));
      await Promise.all(
        originalTaskIds.map(async (taskId) => {
          const remaining = await getApiTimeEntries({ task_id: taskId });
          if (remaining.length === 0) await deleteApiTasksId(taskId);
        }),
      );

      invalidateAll();
      show(`Merged ${taskCount} tasks into "${trimmed}"`, "success");
      onSaved();
      onClose();
    } catch (err) {
      setSaveError(extractErrorMessage(err, "Could not save changes"));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal title={`Group and Edit ${taskCount} tasks`} onClose={onClose} size="md">
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs text-neutral-400">Task name</label>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-neutral-400">Project</label>
          <ProjectPicker projects={projects ?? []} selectedId={projectId} onSelect={setProjectId} />
        </div>

        <p className="text-xs text-neutral-500">
          {entries.length} sessions across {taskCount} tasks will be merged into one task. Times stay separate.
        </p>

        {saveError && <p className="text-xs text-red-400">{saveError}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !title.trim()}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm hover:bg-blue-500 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}
