import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetApiWorkspacesIdMembers,
  useGetApiWorkspaces,
  usePostApiWorkspacesIdMembers,
  usePatchApiWorkspacesIdMembersUserId,
  useDeleteApiWorkspacesIdMembersUserId,
  getGetApiWorkspacesIdMembersQueryKey,
  WorkspaceRole,
  type Workspace,
  type WorkspaceMembership,
} from "../../api/generated";
import { extractErrorMessage } from "../../utils/errors";
import { useToast } from "../../context/ToastContext";
import { Modal } from "../Modal";
import { DeleteConfirmModal } from "../DeleteConfirmModal";

interface Props {
  workspace: Workspace;
  orgId: string;
  canManage: boolean;
  onClose: () => void;
}

export function WorkspaceMembersModal({ workspace, orgId, canManage, onClose }: Props) {
  const queryClient = useQueryClient();
  const { show } = useToast();
  const { data: members, isLoading } = useGetApiWorkspacesIdMembers(workspace.id);
  const { data: otherWorkspaces } = useGetApiWorkspaces({ org_id: orgId });

  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<WorkspaceRole>(WorkspaceRole.MEMBER);
  const [pendingRemove, setPendingRemove] = useState<WorkspaceMembership | null>(null);
  const [movingUserId, setMovingUserId] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);

  function invalidateMembers() {
    queryClient.invalidateQueries({ queryKey: getGetApiWorkspacesIdMembersQueryKey(workspace.id) });
  }

  const addMember = usePostApiWorkspacesIdMembers({
    mutation: {
      onSuccess: () => {
        invalidateMembers();
        setUserId("");
        setRole(WorkspaceRole.MEMBER);
      },
    },
  });

  const changeRole = usePatchApiWorkspacesIdMembersUserId({
    mutation: { onSuccess: invalidateMembers },
  });

  const removeMember = useDeleteApiWorkspacesIdMembersUserId({
    mutation: {
      onSuccess: () => {
        invalidateMembers();
        setPendingRemove(null);
      },
    },
  });

  const moveAdd = usePostApiWorkspacesIdMembers();
  const moveRemove = useDeleteApiWorkspacesIdMembersUserId();

  function handleAddSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = userId.trim();
    if (!trimmed) return;
    addMember.mutate({ id: workspace.id, data: { user_id: trimmed, role } });
  }

  // Add-to-target happens before remove-from-source: AddWorkspaceMember's
  // insert now fails cleanly (ErrAlreadyMember) if the target already has
  // this user, so a failure here aborts with the member still fully in
  // their original workspace, instead of risking them stranded with zero
  // workspace access if the delete-then-add order were used and the second
  // step failed.
  async function handleMove(targetUserId: string, targetWorkspaceId: string) {
    setMovingUserId(targetUserId);
    setMoveError(null);
    try {
      await moveAdd.mutateAsync({ id: targetWorkspaceId, data: { user_id: targetUserId } });
      await moveRemove.mutateAsync({ id: workspace.id, userId: targetUserId });
      invalidateMembers();
      queryClient.invalidateQueries({ queryKey: getGetApiWorkspacesIdMembersQueryKey(targetWorkspaceId) });
      show("Member moved", "success");
    } catch (err) {
      setMoveError(extractErrorMessage(err, "Could not move member"));
    } finally {
      setMovingUserId(null);
    }
  }

  const moveTargets = (otherWorkspaces ?? []).filter((ws) => ws.id !== workspace.id);

  return (
    <Modal title={`${workspace.name} — members`} onClose={onClose} size="md">
      <div className="space-y-3">
        {isLoading && <p className="text-sm text-neutral-500">Loading…</p>}

        {!isLoading && (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-800 text-left text-xs uppercase tracking-wide text-neutral-500">
                <th className="py-1.5 font-medium">User</th>
                <th className="py-1.5 font-medium">Role</th>
                {canManage && <th className="py-1.5 font-medium" />}
              </tr>
            </thead>
            <tbody>
              {(members ?? []).map((m) => (
                <tr key={m.id} className="border-b border-neutral-800/60">
                  <td className="py-1.5">{m.user_id}</td>
                  <td className="py-1.5">
                    {canManage ? (
                      <select
                        value={m.role}
                        disabled={changeRole.isPending}
                        onChange={(e) =>
                          changeRole.mutate({
                            id: workspace.id,
                            userId: m.user_id,
                            data: { role: e.target.value as WorkspaceRole },
                          })
                        }
                        className="rounded border border-neutral-700 bg-neutral-800 px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value={WorkspaceRole.ADMIN}>Workspace Admin</option>
                        <option value={WorkspaceRole.MEMBER}>Member</option>
                      </select>
                    ) : (
                      <span className="text-neutral-400">
                        {m.role === WorkspaceRole.ADMIN ? "Workspace Admin" : "Member"}
                      </span>
                    )}
                  </td>
                  {canManage && (
                    <td className="py-1.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {moveTargets.length > 0 && (
                          <select
                            defaultValue=""
                            disabled={movingUserId === m.user_id}
                            onChange={(e) => {
                              const target = e.target.value;
                              e.target.value = "";
                              if (target) handleMove(m.user_id, target);
                            }}
                            className="rounded border border-neutral-700 bg-neutral-800 px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            <option value="" disabled>
                              Move to…
                            </option>
                            {moveTargets.map((ws) => (
                              <option key={ws.id} value={ws.id}>
                                {ws.name}
                              </option>
                            ))}
                          </select>
                        )}
                        <button
                          onClick={() => setPendingRemove(m)}
                          className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800"
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {moveError && <p className="text-xs text-red-400">{moveError}</p>}

        <p className="text-xs text-neutral-500">
          Org owners/admins with access here only through their organization role (no direct workspace membership)
          won't appear in this list and can't be moved this way.
        </p>

        {canManage && (
          <form onSubmit={handleAddSubmit} className="flex items-end gap-2 border-t border-neutral-800 pt-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs text-neutral-400">User id</label>
              <input
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-neutral-400">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as WorkspaceRole)}
                className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value={WorkspaceRole.MEMBER}>Member</option>
                <option value={WorkspaceRole.ADMIN}>Workspace Admin</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={addMember.isPending}
              className="rounded bg-blue-600 px-3 py-1.5 text-sm hover:bg-blue-500 disabled:opacity-50"
            >
              Add
            </button>
          </form>
        )}
        {addMember.isError && (
          <p className="text-xs text-red-400">{extractErrorMessage(addMember.error, "Could not add member")}</p>
        )}
      </div>

      {pendingRemove && (
        <DeleteConfirmModal
          count={1}
          isPending={removeMember.isPending}
          onCancel={() => setPendingRemove(null)}
          onConfirm={() => removeMember.mutate({ id: workspace.id, userId: pendingRemove.user_id })}
        />
      )}
    </Modal>
  );
}
