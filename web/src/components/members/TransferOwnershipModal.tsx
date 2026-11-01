import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  usePostApiOrganizationsIdTransferOwner,
  getGetApiOrganizationsIdMembersQueryKey,
  getGetApiOrganizationsIdQueryKey,
} from "../../api/generated";
import { extractErrorMessage } from "../../utils/errors";
import { useToast } from "../../context/ToastContext";
import { Modal } from "../Modal";

interface Props {
  orgId: string;
  onClose: () => void;
}

export function TransferOwnershipModal({ orgId, onClose }: Props) {
  const queryClient = useQueryClient();
  const { show } = useToast();
  const [toUserId, setToUserId] = useState("");

  const transfer = usePostApiOrganizationsIdTransferOwner({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetApiOrganizationsIdMembersQueryKey(orgId) });
        queryClient.invalidateQueries({ queryKey: getGetApiOrganizationsIdQueryKey(orgId) });
        show("Ownership transferred", "success");
        onClose();
      },
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = toUserId.trim();
    if (!trimmed) return;
    transfer.mutate({ id: orgId, data: { to_user_id: trimmed } });
  }

  return (
    <Modal title="Transfer ownership" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <p className="mb-2 text-xs text-neutral-400">
          Transfers this organization to another member and demotes you to Admin.
        </p>
        <label className="mb-1 block text-xs text-neutral-400">New owner's user id</label>
        <input
          value={toUserId}
          onChange={(e) => setToUserId(e.target.value)}
          autoFocus
          className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        {transfer.isError && (
          <p className="mt-2 text-xs text-red-400">
            {extractErrorMessage(transfer.error, "Could not transfer ownership")}
          </p>
        )}
        <button
          type="submit"
          disabled={transfer.isPending}
          className="mt-3 w-full rounded bg-red-600 py-2 text-sm hover:bg-red-500 disabled:opacity-50"
        >
          Transfer ownership
        </button>
      </form>
    </Modal>
  );
}
