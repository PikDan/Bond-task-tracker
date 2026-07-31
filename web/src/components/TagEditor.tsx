import { forwardRef, useImperativeHandle, useState, type FormEvent } from "react";

interface Props {
  tags: string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
}

// Lets a caller pull in whatever's still typed in the "+ tag" input but not
// yet committed (no Enter pressed) — otherwise clicking a Save button
// elsewhere silently drops it, since it never made it into `tags`.
export interface TagEditorHandle {
  flushPendingTag(): string[];
}

export const TagEditor = forwardRef<TagEditorHandle, Props>(function TagEditor({ tags, onChange, disabled }, ref) {
  const [draft, setDraft] = useState("");

  useImperativeHandle(ref, () => ({
    flushPendingTag() {
      const trimmed = draft.trim();
      if (!trimmed || tags.includes(trimmed)) return tags;
      const next = [...tags, trimmed];
      onChange(next);
      setDraft("");
      return next;
    },
  }));

  function addTag(e: FormEvent) {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || tags.includes(trimmed)) {
      setDraft("");
      return;
    }
    onChange([...tags, trimmed]);
    setDraft("");
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {tags.map((tag) => (
        <span
          key={tag}
          className="flex items-center gap-1 rounded-full bg-neutral-700 px-2 py-0.5 text-[11px] text-neutral-200"
        >
          {tag}
          <button
            type="button"
            onClick={() => removeTag(tag)}
            disabled={disabled}
            className="text-neutral-400 hover:text-red-400 disabled:opacity-50"
            aria-label={`Remove tag ${tag}`}
          >
            ×
          </button>
        </span>
      ))}
      <form onSubmit={addTag} className="inline-flex">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="+ tag"
          disabled={disabled}
          className="w-16 rounded border border-neutral-700 bg-neutral-800 px-1.5 py-0.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </form>
    </div>
  );
});
