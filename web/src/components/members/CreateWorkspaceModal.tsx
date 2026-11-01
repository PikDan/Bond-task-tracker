import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePostApiWorkspaces, getGetApiWorkspacesQueryKey } from "../../api/generated";
import { extractErrorMessage } from "../../utils/errors";
import { Modal } from "../Modal";

interface Props {
  orgId: string;
  onClose: () => void;
}

export function CreateWorkspaceModal({ orgId, onClose }: Props) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");

  const createWorkspace = usePostApiWorkspaces({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetApiWorkspacesQueryKey({ org_id: orgId }) });
        onClose();
      },
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    createWorkspace.mutate({ data: { org_id: orgId, name: trimmed } });
  }

  return (
    <Modal title="Create workspace" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <label className="mb-1 block text-xs text-neutral-400">Workspace name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        {createWorkspace.isError && (
          <p className="mt-2 text-xs text-red-400">
            {extractErrorMessage(createWorkspace.error, "Could not create workspace")}
          </p>
        )}
        <button
          type="submit"
          disabled={createWorkspace.isPending}
          className="mt-3 w-full rounded bg-blue-600 py-2 text-sm hover:bg-blue-500 disabled:opacity-50"
        >
          Create workspace
        </button>
      </form>
    </Modal>
  );
}
