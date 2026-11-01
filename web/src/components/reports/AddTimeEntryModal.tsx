import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  usePostApiTasks,
  usePatchApiTasksId,
  usePostApiTimersStart,
  usePatchApiTimeEntriesId,
  useGetApiTasks,
  useGetApiProjects,
  getGetApiTasksQueryKey,
  getGetApiTimeEntriesQueryKey,
  getGetApiTimersActiveQueryKey,
  AccessRole,
  type Task,
} from "../../api/generated";
import { Modal } from "../Modal";
import { ProjectPicker } from "../ProjectPicker";
import { TagEditor, type TagEditorHandle } from "../TagEditor";
import { useClickOutside } from "../../hooks/useClickOutside";
import { useToast } from "../../context/ToastContext";
import { useWorkspace } from "../../context/WorkspaceContext";
import { extractErrorMessage } from "../../utils/errors";
import { formatDuration } from "../../utils/format";

interface Props {
  defaultProjectId?: string | null;
  onClose: () => void;
  onSaved: () => void;
}

function combine(date: string, time: string): Date {
  return new Date(`${date}T${time}:00`);
}

// There's no direct "create a historical time entry" endpoint on the
// backend — only Start (always begins *now*) and Patch (corrects an
// existing entry's times). So a backfilled entry is created the same way
// EditTimeEntryForm already corrects one: start it, then immediately patch
// started_at/ended_at to the times the user actually picked. If the user
// already has some other timer running, Start 409s — surfaced as-is via
// extractErrorMessage, since the fix (stop your other timer) is the user's
// to make, not something to paper over here.
export function AddTimeEntryModal({ defaultProjectId = null, onClose, onSaved }: Props) {
  const queryClient = useQueryClient();
  const { show } = useToast();
  const { role } = useWorkspace();
  const canSeeAll = role === AccessRole.OWNER || role === AccessRole.ADMIN || role === AccessRole.WORKSPACE_ADMIN;
  const { data: tasks } = useGetApiTasks({ all: canSeeAll });
  const { data: projects } = useGetApiProjects();

  const [title, setTitle] = useState("");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  useClickOutside(suggestionsRef, () => setSuggestionsOpen(false));

  const [projectId, setProjectId] = useState<string | null>(defaultProjectId);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const projectPickerRef = useRef<HTMLDivElement>(null);
  useClickOutside(projectPickerRef, () => setProjectPickerOpen(false));

  const [tags, setTags] = useState<string[]>([]);
  const tagEditorRef = useRef<TagEditorHandle>(null);

  const [date, setDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [startTime, setStartTime] = useState(() => format(new Date(), "HH:mm"));
  // Duration (hours/minutes) is the value actually submitted; startTime and
  // endTime are both editable too, but every change funnels through one of
  // the three handlers below so the other two stay in lockstep — editing
  // start or duration keeps the other end fixed and recomputes end time;
  // editing end time recomputes duration instead of touching start.
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(15);
  const [endTime, setEndTime] = useState(() => format(new Date(Date.now() + 15 * 60000), "HH:mm"));

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const createTask = usePostApiTasks();
  const updateTask = usePatchApiTasksId();
  const startTimer = usePostApiTimersStart();
  const correctEntry = usePatchApiTimeEntriesId();

  const suggestions = useMemo(() => {
    const q = title.trim().toLowerCase();
    if (!q || selectedTask) return [];
    return (tasks ?? []).filter((t) => t.title.toLowerCase().includes(q)).slice(0, 6);
  }, [tasks, title, selectedTask]);

  const selectedProject = projects?.find((p) => p.id === projectId);
  const durationSeconds = Math.max(0, hours) * 3600 + Math.max(0, minutes) * 60;
  const crossesMidnight = useMemo(() => {
    const start = combine(date, startTime);
    const end = new Date(start.getTime() + durationSeconds * 1000);
    return end.toDateString() !== start.toDateString();
  }, [date, startTime, durationSeconds]);

  function handleTitleChange(value: string) {
    setTitle(value);
    setSuggestionsOpen(true);
    if (selectedTask && value !== selectedTask.title) setSelectedTask(null);
  }

  function pickSuggestion(task: Task) {
    setSelectedTask(task);
    setTitle(task.title);
    setProjectId(task.project_id);
    setTags(task.tags);
    setSuggestionsOpen(false);
  }

  // Start time (or the date) changed: keep duration fixed, shift end time.
  function handleStartTimeChange(nextDate: string, nextStartTime: string) {
    setDate(nextDate);
    setStartTime(nextStartTime);
    const start = combine(nextDate, nextStartTime);
    const end = new Date(start.getTime() + durationSeconds * 1000);
    setEndTime(format(end, "HH:mm"));
  }

  // Duration changed directly: keep start time fixed, shift end time.
  function handleDurationChange(nextHours: number, nextMinutes: number) {
    setHours(nextHours);
    setMinutes(nextMinutes);
    const start = combine(date, startTime);
    const end = new Date(start.getTime() + (nextHours * 3600 + nextMinutes * 60) * 1000);
    setEndTime(format(end, "HH:mm"));
  }

  // End time changed directly: keep start time fixed, recompute duration.
  // A pick earlier than start is assumed to roll over into the next day
  // (there's no separate "end date" field), matching how the +1d hint below
  // already communicates an overnight span.
  function handleEndTimeChange(nextEndTime: string) {
    setEndTime(nextEndTime);
    const start = combine(date, startTime);
    let end = combine(date, nextEndTime);
    if (end <= start) end = new Date(end.getTime() + 24 * 3600 * 1000);
    const diffSeconds = Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
    setHours(Math.floor(diffSeconds / 3600));
    setMinutes(Math.floor((diffSeconds % 3600) / 60));
  }

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: getGetApiTasksQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetApiTimeEntriesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetApiTimersActiveQueryKey() });
  }

  async function handleSave() {
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Task name is required");
      return;
    }
    if (durationSeconds <= 0) {
      setError("Duration must be greater than zero");
      return;
    }
    setError(null);
    setSaving(true);
    // Flush any tag still typed into the "+ tag" field but never confirmed
    // with Enter — otherwise it's silently dropped, same issue fixed in
    // EditTimeEntryModal.
    const finalTags = tagEditorRef.current?.flushPendingTag() ?? tags;
    try {
      let taskId: string;
      if (selectedTask && selectedTask.title === trimmed) {
        taskId = selectedTask.id;
        await updateTask.mutateAsync({ id: taskId, data: { title: trimmed, project_id: projectId ?? "", tags: finalTags } });
      } else {
        const newTask = await createTask.mutateAsync({ data: { title: trimmed, project_id: projectId } });
        taskId = newTask.id;
        if (finalTags.length > 0) await updateTask.mutateAsync({ id: taskId, data: { tags: finalTags } });
      }

      const startedAt = combine(date, startTime);
      const endedAt = new Date(startedAt.getTime() + durationSeconds * 1000);

      const started = await startTimer.mutateAsync({ data: { task_id: taskId } });
      await correctEntry.mutateAsync({
        id: started.id,
        data: { started_at: startedAt.toISOString(), ended_at: endedAt.toISOString() },
      });

      invalidateAll();
      show("Entry added", "success");
      onSaved();
      onClose();
    } catch (err) {
      setError(extractErrorMessage(err, "Could not add entry"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Add time entry" onClose={onClose} size="md">
      <div className="space-y-3">
        <div className="relative" ref={suggestionsRef}>
          <label className="mb-1 block text-xs text-neutral-400">Task</label>
          <input
            autoFocus
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            onFocus={() => setSuggestionsOpen(true)}
            placeholder="What are you working on?"
            className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {suggestionsOpen && suggestions.length > 0 && (
            <ul className="absolute left-0 right-0 z-20 mt-1 max-h-40 overflow-y-auto rounded border border-neutral-700 bg-neutral-900 p-1 shadow-xl">
              {suggestions.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => pickSuggestion(t)}
                    className="block w-full truncate rounded px-2 py-1 text-left text-sm text-neutral-200 hover:bg-neutral-800"
                  >
                    {t.title || <span className="italic text-neutral-500">Untitled task</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="relative" ref={projectPickerRef}>
          <label className="mb-1 block text-xs text-neutral-400">Project</label>
          <button
            type="button"
            onClick={() => setProjectPickerOpen((v) => !v)}
            className="w-full truncate rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-left text-sm hover:bg-neutral-700"
          >
            {selectedProject ? selectedProject.name : <span className="text-neutral-500">No project</span>}
          </button>
          {projectPickerOpen && (
            <div className="absolute left-0 z-20 mt-1 w-56 rounded border border-neutral-700 bg-neutral-900 p-2 shadow-xl">
              <ProjectPicker
                projects={projects ?? []}
                selectedId={projectId}
                onSelect={(id) => {
                  setProjectId(id);
                  setProjectPickerOpen(false);
                }}
              />
            </div>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs text-neutral-400">Tags</label>
          <TagEditor ref={tagEditorRef} tags={tags} onChange={setTags} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-neutral-400">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => handleStartTimeChange(e.target.value, startTime)}
              className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-400">Start time</label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => handleStartTimeChange(date, e.target.value)}
              className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-neutral-400">Duration</label>
            <div className="flex items-center gap-1.5">
              <NumberStepper value={hours} min={0} suffix="h" onChange={(v) => handleDurationChange(v, minutes)} />
              <NumberStepper value={minutes} min={0} max={59} suffix="m" onChange={(v) => handleDurationChange(hours, v)} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-400">End time</label>
            <div className="flex items-center gap-1.5">
              <input
                type="time"
                value={endTime}
                onChange={(e) => handleEndTimeChange(e.target.value)}
                className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {crossesMidnight && <span className="shrink-0 text-xs text-neutral-500">+1d</span>}
            </div>
          </div>
        </div>

        <p className="text-xs text-neutral-500">Total duration: {formatDuration(durationSeconds)}</p>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm hover:bg-blue-500 disabled:opacity-50"
          >
            Add entry
          </button>
        </div>
      </div>
    </Modal>
  );
}

// A number input with the browser's default (mismatched, off-theme) spinner
// arrows hidden, replaced with a small stacked up/down control drawn in the
// app's own style.
function NumberStepper({
  value,
  onChange,
  min,
  max,
  suffix,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  suffix: string;
}) {
  function clamp(v: number): number {
    let result = v;
    if (min != null) result = Math.max(min, result);
    if (max != null) result = Math.min(max, result);
    return result;
  }

  return (
    <div className="flex items-center rounded border border-neutral-700 bg-neutral-800 focus-within:ring-1 focus-within:ring-blue-500">
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(clamp(Number(e.target.value) || 0))}
        className="w-12 min-w-0 [appearance:textfield] bg-transparent px-2 py-1.5 text-sm focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <span className="pr-1 text-xs text-neutral-500">{suffix}</span>
      <div className="flex flex-col border-l border-neutral-700">
        <button
          type="button"
          tabIndex={-1}
          onClick={() => onChange(clamp(value + 1))}
          className="flex h-3.5 w-5 items-center justify-center text-neutral-400 hover:bg-neutral-700 hover:text-neutral-100"
        >
          <ChevronUp size={10} />
        </button>
        <button
          type="button"
          tabIndex={-1}
          onClick={() => onChange(clamp(value - 1))}
          className="flex h-3.5 w-5 items-center justify-center border-t border-neutral-700 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-100"
        >
          <ChevronDown size={10} />
        </button>
      </div>
    </div>
  );
}
