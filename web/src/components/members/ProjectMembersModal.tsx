import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetApiProjectsIdMembers,
  usePostApiProjectsIdMembers,
  usePatchApiProjectsIdMembersUserId,
  useDeleteApiProjectsIdMembersUserId,
  getGetApiProjectsIdMembersQueryKey,
  getGetApiProjectsQueryKey,
  ProjectRole,
  type Project,
  type ProjectMembership,
} from "../../api/generated";
import { extractErrorMessage } from "../../utils/errors";
import { Modal } from "../Modal";
import { DeleteConfirmModal } from "../DeleteConfirmModal";

interface Props {
  project: Project;
  canManageWorkspace: boolean;
  onClose: () => void;
}

export function ProjectMembersModal({ project, canManageWorkspace, onClose }: Props) {
  const queryClient = useQueryClient();
  const isLead = project.my_role === ProjectRole.LEAD;
  const canManageParticipants = canManageWorkspace || isLead;

  const { data: members, isLoading } = useGetApiProjectsIdMembers(project.id);

  const [userId, setUserId] = useState("");
  const [pendingRemove, setPendingRemove] = useState<ProjectMembership | null>(null);

  function invalidateMembers() {
    queryClient.invalidateQueries({ queryKey: getGetApiProjectsIdMembersQueryKey(project.id) });
  }

  const addMember = usePostApiProjectsIdMembers({
    mutation: {
      onSuccess: () => {
        invalidateMembers();
        setUserId("");
      },
    },
  });

  // Promoting to/demoting from Lead — Workspace Admin+ only, "assigns Lead".
  const setRole = usePatchApiProjectsIdMembersUserId({
    mutation: {
      onSuccess: () => {
        invalidateMembers();
        queryClient.invalidateQueries({ queryKey: getGetApiProjectsQueryKey() });
      },
    },
  });

  const removeMember = useDeleteApiProjectsIdMembersUserId({
    mutation: {
      onSuccess: () => {
        invalidateMembers();
        setPendingRemove(null);
      },
    },
  });

  function handleAddSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = userId.trim();
    if (!trimmed) return;
    // Always adds as a plain MEMBER — promoting to Lead is a separate,
    // Workspace-Admin-only action via the row's role select below.
    addMember.mutate({ id: project.id, data: { user_id: trimmed } });
  }

  return (
    <Modal title={`${project.name} — participants`} onClose={onClose} size="md">
      <div className="space-y-3">
        {isLoading && <p className="text-sm text-neutral-500">Loading…</p>}

        {!isLoading && (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-800 text-left text-xs uppercase tracking-wide text-neutral-500">
                <th className="py-1.5 font-medium">User</th>
                <th className="py-1.5 font-medium">Role</th>
                {canManageParticipants && <th className="py-1.5 font-medium" />}
              </tr>
            </thead>
            <tbody>
              {(members ?? []).map((m) => (
                <tr key={m.id} className="border-b border-neutral-800/60">
                  <td className="py-1.5">{m.user_id}</td>
                  <td className="py-1.5">
                    {canManageWorkspace ? (
                      <select
                        value={m.role}
                        disabled={setRole.isPending}
                        onChange={(e) =>
                          setRole.mutate({
                            id: project.id,
                            userId: m.user_id,
                            data: { role: e.target.value as ProjectRole },
                          })
                        }
                        className="rounded border border-neutral-700 bg-neutral-800 px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value={ProjectRole.LEAD}>Lead</option>
                        <option value={ProjectRole.MEMBER}>Member</option>
                      </select>
                    ) : (
                      <span className="text-neutral-400">{m.role === ProjectRole.LEAD ? "Lead" : "Member"}</span>
                    )}
                  </td>
                  {canManageParticipants && (
                    <td className="py-1.5 text-right">
                      <button
                        onClick={() => setPendingRemove(m)}
                        className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800"
                      >
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {canManageParticipants && (
          <form onSubmit={handleAddSubmit} className="flex items-end gap-2 border-t border-neutral-800 pt-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs text-neutral-400">User id</label>
              <input
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
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
        {!canManageWorkspace && isLead && (
          <p className="text-xs text-neutral-500">
            Added participants join as Member — only a Workspace Admin can assign Lead.
          </p>
        )}
        {addMember.isError && (
          <p className="text-xs text-red-400">{extractErrorMessage(addMember.error, "Could not add participant")}</p>
        )}
      </div>

      {pendingRemove && (
        <DeleteConfirmModal
          count={1}
          isPending={removeMember.isPending}
          onCancel={() => setPendingRemove(null)}
          onConfirm={() => removeMember.mutate({ id: project.id, userId: pendingRemove.user_id })}
        />
      )}
    </Modal>
  );
}
