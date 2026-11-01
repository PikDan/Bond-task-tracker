import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePostApiOrganizationsIdMembers, getGetApiOrganizationsIdMembersQueryKey } from "../../api/generated";
import { extractErrorMessage } from "../../utils/errors";
import { Modal } from "../Modal";

interface Props {
  orgId: string;
  onClose: () => void;
}

export function InviteOrgMemberModal({ orgId, onClose }: Props) {
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState("");

  const addMember = usePostApiOrganizationsIdMembers({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetApiOrganizationsIdMembersQueryKey(orgId) });
        onClose();
      },
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = userId.trim();
    if (!trimmed) return;
    addMember.mutate({ id: orgId, data: { user_id: trimmed } });
  }

  return (
    <Modal title="Invite member" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <label className="mb-1 block text-xs text-neutral-400">User id</label>
        <input
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          autoFocus
          className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <p className="mt-1 text-xs text-neutral-500">Joins as Organization Admin.</p>
        {addMember.isError && (
          <p className="mt-2 text-xs text-red-400">{extractErrorMessage(addMember.error, "Could not add member")}</p>
        )}
        <button
          type="submit"
          disabled={addMember.isPending}
          className="mt-3 w-full rounded bg-blue-600 py-2 text-sm hover:bg-blue-500 disabled:opacity-50"
        >
          Invite
        </button>
      </form>
    </Modal>
  );
}
