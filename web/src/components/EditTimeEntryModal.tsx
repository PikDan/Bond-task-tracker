import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  usePatchApiTasksId,
  usePostApiTasks,
  usePatchApiTimeEntriesId,
  useGetApiProjects,
  getGetApiTasksQueryKey,
  getGetApiTimeEntriesQueryKey,
  getGetApiTimersActiveQueryKey,
  type TimeEntry,
} from "../api/generated";
import { Modal } from "./Modal";
import { ProjectPicker } from "./ProjectPicker";
import { SelectCheckbox } from "./SelectCheckbox";
import { TagEditor, type TagEditorHandle } from "./TagEditor";
import { formatTimeRange } from "../utils/format";
import { useToast } from "../context/ToastContext";
import { extractErrorMessage } from "../utils/errors";

interface Props {
  taskId: string;
  currentTitle: string;
  currentProjectId: string | null;
  currentTags: string[];
  entries: TimeEntry[]; // every session of this task on the selected day
  onClose: () => void;
  onSaved: () => void;
}

// Scenario A: the bulk selection resolved to a single task. All of that
// task's sessions on the selected day are listed, checked by default — if
// the user unchecks some before saving, only the checked ones split off
// into a brand-new task with the new name/project; unchecked ones stay on
// the original task, completely untouched.
export function EditTimeEntryModal({
  taskId,
  currentTitle,
  currentProjectId,
  currentTags,
  entries,
  onClose,
  onSaved,
}: Props) {
  const queryClient = useQueryClient();
  const { show } = useToast();
  const { data: projects } = useGetApiProjects();

  const [title, setTitle] = useState(currentTitle);
  const [projectId, setProjectId] = useState<string | null>(currentProjectId);
  const [tags, setTags] = useState<string[]>(currentTags);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set(entries.map((e) => e.id)));
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const tagEditorRef = useRef<TagEditorHandle>(null);

  const updateTask = usePatchApiTasksId();
  const createTask = usePostApiTasks();
  const reassignEntry = usePatchApiTimeEntriesId();

  function toggleEntry(id: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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
    // Only applies when there are sessions to split — a never-started task
    // (entries.length === 0) has nothing to check in the first place, so an
    // empty checkedIds there just means "rename/reassign in place", not "user
    // unchecked everything".
    if (entries.length > 0 && checkedIds.size === 0) {
      setSaveError("At least one session must stay checked");
      return;
    }
    setSaveError(null);
    setIsSaving(true);
    // A tag typed into the "+ tag" field but never confirmed with Enter
    // never made it into `tags` — flush it in now so Save doesn't silently
    // drop it.
    const finalTags = tagEditorRef.current?.flushPendingTag() ?? tags;
    try {
      if (checkedIds.size === entries.length) {
        // No split — rename/reassign the existing task in place.
        await updateTask.mutateAsync({
          id: taskId,
          data: { title: trimmed, project_id: projectId ?? "", tags: finalTags },
        });
        show("Task updated", "success");
      } else {
        // Split — create a new task (creation has no tags field, so tags
        // are applied via a follow-up PATCH), move only the checked
        // sessions to it.
        const newTask = await createTask.mutateAsync({ data: { title: trimmed, project_id: projectId } });
        if (finalTags.length > 0) {
          await updateTask.mutateAsync({ id: newTask.id, data: { tags: finalTags } });
        }
        await Promise.all(
          Array.from(checkedIds).map((id) => reassignEntry.mutateAsync({ id, data: { task_id: newTask.id } })),
        );
        show("Task split", "success");
      }
      invalidateAll();
      onSaved();
      onClose();
    } catch (err) {
      setSaveError(extractErrorMessage(err, "Could not save changes"));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal title="Edit time entry" onClose={onClose} size="md">
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

        <div>
          <label className="mb-1 block text-xs text-neutral-400">Tags</label>
          <TagEditor ref={tagEditorRef} tags={tags} onChange={setTags} />
        </div>

        {entries.length > 1 && (
          <div>
            <label className="mb-1 block text-xs text-neutral-400">Sessions</label>
            <ul className="max-h-40 space-y-1 overflow-y-auto rounded border border-neutral-800 p-2">
              {entries.map((entry) => (
                <li key={entry.id} className="flex items-center gap-2 text-sm">
                  <SelectCheckbox
                    checked={checkedIds.has(entry.id)}
                    onToggle={() => toggleEntry(entry.id)}
                    label={`Include session ${formatTimeRange(entry.started_at, entry.ended_at)}`}
                  />
                  <span className="text-neutral-300">{formatTimeRange(entry.started_at, entry.ended_at)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {saveError && <p className="text-xs text-red-400">{saveError}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm hover:bg-blue-500 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}
