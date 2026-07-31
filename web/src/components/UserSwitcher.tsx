import { useState, type FormEvent } from "react";
import { useUser } from "../context/UserContext";

export function UserSwitcher() {
  const { userId, setUserId } = useUser();
  const [draft, setDraft] = useState(userId);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setUserId(draft.trim());
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 text-sm">
      <label htmlFor="user-id" className="text-neutral-400">
        User
      </label>
      <input
        id="user-id"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="user id"
        className="w-32 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-neutral-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      <button type="submit" className="rounded border border-neutral-700 px-2 py-1 hover:bg-neutral-800">
        Set
      </button>
    </form>
  );
}
