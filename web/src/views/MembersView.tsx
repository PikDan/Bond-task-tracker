import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetApiOrganizationsId,
  useGetApiOrganizationsIdMembers,
  useGetApiWorkspaces,
  usePatchApiWorkspacesId,
  useDeleteApiWorkspacesId,
  useDeleteApiOrganizationsIdMembersUserId,
  getGetApiOrganizationsIdMembersQueryKey,
  getGetApiWorkspacesQueryKey,
  AccessRole,
  OrgRole,
  type OrgMembership,
  type Workspace,
} from "../api/generated";
import { useWorkspace } from "../context/WorkspaceContext";
import { colorForId } from "../utils/projectColor";
import { extractErrorMessage } from "../utils/errors";
import { DeleteConfirmModal } from "../components/DeleteConfirmModal";
import { InviteOrgMemberModal } from "../components/members/InviteOrgMemberModal";
import { TransferOwnershipModal } from "../components/members/TransferOwnershipModal";
import { CreateWorkspaceModal } from "../components/members/CreateWorkspaceModal";
import { WorkspaceMembersModal } from "../components/members/WorkspaceMembersModal";

const ROLE_LABELS: Record<AccessRole, string> = {
  OWNER: "Organization Owner",
  ADMIN: "Organization Admin",
  WORKSPACE_ADMIN: "Workspace Admin",
  MEMBER: "Member",
};

export function MembersView() {
  const queryClient = useQueryClient();
  const { workspaceId, orgId, role, isLoading: workspaceLoading } = useWorkspace();

  const { data: org } = useGetApiOrganizationsId(orgId);
  const { data: orgMembers } = useGetApiOrganizationsIdMembers(orgId);
  const { data: workspaces } = useGetApiWorkspaces({ org_id: orgId }, { query: { enabled: !!orgId } });

  const [inviteOpen, setInviteOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const [pendingRemoveOrgMember, setPendingRemoveOrgMember] = useState<OrgMembership | null>(null);
  const [pendingDeleteWorkspace, setPendingDeleteWorkspace] = useState<Workspace | null>(null);
  const [renamingWorkspace, setRenamingWorkspace] = useState<{ id: string; name: string } | null>(null);
  const [managingWorkspace, setManagingWorkspace] = useState<Workspace | null>(null);

  const canManageOrg = role === AccessRole.OWNER || role === AccessRole.ADMIN;

  function canManageWorkspaceRow(ws: Workspace) {
    return canManageOrg || (ws.id === workspaceId && role === AccessRole.WORKSPACE_ADMIN);
  }

  const removeOrgMember = useDeleteApiOrganizationsIdMembersUserId({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetApiOrganizationsIdMembersQueryKey(orgId) });
        setPendingRemoveOrgMember(null);
      },
    },
  });

  const renameWorkspace = usePatchApiWorkspacesId({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetApiWorkspacesQueryKey({ org_id: orgId }) });
        setRenamingWorkspace(null);
      },
    },
  });

  const deleteWorkspace = useDeleteApiWorkspacesId({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetApiWorkspacesQueryKey({ org_id: orgId }) });
        setPendingDeleteWorkspace(null);
      },
    },
  });

  if (workspaceLoading || !orgId) {
    return <p className="text-sm text-neutral-500">Loading…</p>;
  }

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-lg font-semibold">{org?.name ?? "Members"}</h1>
        {role && (
          <span className="mt-1 inline-block rounded-full bg-blue-500/10 px-2 py-0.5 text-xs text-blue-300">
            {ROLE_LABELS[role]}
          </span>
        )}
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-300">Organization members</h2>
          {canManageOrg && (
            <button
              onClick={() => setInviteOpen(true)}
              className="rounded bg-blue-600 px-3 py-1.5 text-sm hover:bg-blue-500"
            >
              Invite
            </button>
          )}
        </div>

        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-800 text-left text-xs uppercase tracking-wide text-neutral-500">
              <th className="py-2 font-medium">User</th>
              <th className="py-2 font-medium">Role</th>
              {canManageOrg && <th className="py-2 font-medium" />}
            </tr>
          </thead>
          <tbody>
            {(orgMembers ?? []).map((m) => (
              <tr key={m.id} className="border-b border-neutral-800/60">
                <td className="py-2">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colorForId(m.user_id) }} />
                    {m.user_id}
                  </span>
                </td>
                <td className="py-2 text-neutral-400">
                  {m.role === OrgRole.OWNER ? "Owner" : "Admin"}
                </td>
                {canManageOrg && (
                  <td className="py-2 text-right">
                    {m.role === OrgRole.OWNER ? (
                      <button
                        onClick={() => setTransferOpen(true)}
                        className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800"
                      >
                        Transfer ownership
                      </button>
                    ) : (
                      <button
                        onClick={() => setPendingRemoveOrgMember(m)}
                        className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800"
                      >
                        Remove
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-300">Workspaces</h2>
          {canManageOrg && (
            <button
              onClick={() => setCreateWorkspaceOpen(true)}
              className="rounded bg-blue-600 px-3 py-1.5 text-sm hover:bg-blue-500"
            >
              + Create workspace
            </button>
          )}
        </div>

        <div className="space-y-2">
          {(workspaces ?? []).map((ws) => {
            const canManage = canManageWorkspaceRow(ws);
            const isRenaming = renamingWorkspace?.id === ws.id;
            return (
              <div
                key={ws.id}
                className="flex items-center justify-between rounded border border-neutral-800 px-3 py-2"
              >
                {isRenaming ? (
                  <form
                    className="flex flex-1 items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const trimmed = renamingWorkspace.name.trim();
                      if (!trimmed) return;
                      renameWorkspace.mutate({ id: ws.id, data: { name: trimmed } });
                    }}
                  >
                    <input
                      autoFocus
                      value={renamingWorkspace.name}
                      onChange={(e) => setRenamingWorkspace({ id: ws.id, name: e.target.value })}
                      className="flex-1 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      type="submit"
                      disabled={renameWorkspace.isPending}
                      className="rounded bg-blue-600 px-2 py-1 text-xs hover:bg-blue-500 disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setRenamingWorkspace(null)}
                      className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800"
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <>
                    <span className="flex items-center gap-2 text-sm">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colorForId(ws.id) }} />
                      {ws.name}
                      {ws.id === workspaceId && (
                        <span className="rounded-full bg-neutral-800 px-1.5 text-[10px] text-neutral-400">active</span>
                      )}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setManagingWorkspace(ws)}
                        className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800"
                      >
                        Manage members
                      </button>
                      {canManage && (
                        <>
                          <button
                            onClick={() => setRenamingWorkspace({ id: ws.id, name: ws.name })}
                            className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800"
                          >
                            Rename
                          </button>
                          <button
                            onClick={() => setPendingDeleteWorkspace(ws)}
                            className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
        {renameWorkspace.isError && (
          <p className="mt-2 text-xs text-red-400">
            {extractErrorMessage(renameWorkspace.error, "Could not rename workspace")}
          </p>
        )}
      </section>

      {inviteOpen && <InviteOrgMemberModal orgId={orgId} onClose={() => setInviteOpen(false)} />}
      {transferOpen && <TransferOwnershipModal orgId={orgId} onClose={() => setTransferOpen(false)} />}
      {createWorkspaceOpen && (
        <CreateWorkspaceModal orgId={orgId} onClose={() => setCreateWorkspaceOpen(false)} />
      )}
      {managingWorkspace && (
        <WorkspaceMembersModal
          workspace={managingWorkspace}
          orgId={orgId}
          canManage={canManageWorkspaceRow(managingWorkspace)}
          onClose={() => setManagingWorkspace(null)}
        />
      )}

      {pendingRemoveOrgMember && (
        <DeleteConfirmModal
          count={1}
          isPending={removeOrgMember.isPending}
          onCancel={() => setPendingRemoveOrgMember(null)}
          onConfirm={() => removeOrgMember.mutate({ id: orgId, userId: pendingRemoveOrgMember.user_id })}
        />
      )}
      {pendingDeleteWorkspace && (
        <DeleteConfirmModal
          count={1}
          isPending={deleteWorkspace.isPending}
          onCancel={() => setPendingDeleteWorkspace(null)}
          onConfirm={() => deleteWorkspace.mutate({ id: pendingDeleteWorkspace.id })}
        />
      )}
    </div>
  );
}
