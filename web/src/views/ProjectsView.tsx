import { useMemo, useRef, useState, type FormEvent } from "react";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { CaseSensitive, Users } from "lucide-react";
import {
  useGetApiProjects,
  useGetApiTasks,
  useGetApiTimeEntries,
  usePostApiProjects,
  usePatchApiProjectsId,
  useDeleteApiProjectsId,
  getGetApiProjectsQueryKey,
  AccessRole,
  ProjectRole,
  type Project,
} from "../api/generated";
import { colorForId } from "../utils/projectColor";
import { extractErrorMessage } from "../utils/errors";
import { Modal } from "../components/Modal";
import { DeleteConfirmModal } from "../components/DeleteConfirmModal";
import { ProjectMembersModal } from "../components/members/ProjectMembersModal";
import { formatDuration } from "../utils/format";
import { useClickOutside } from "../hooks/useClickOutside";
import { useWorkspace } from "../context/WorkspaceContext";

export function ProjectsView() {
  const queryClient = useQueryClient();
  const { role } = useWorkspace();
  const canManageWorkspace = role === AccessRole.OWNER || role === AccessRole.ADMIN || role === AccessRole.WORKSPACE_ADMIN;
  const { data: projects, isLoading } = useGetApiProjects();
  const { data: tasks } = useGetApiTasks({ all: canManageWorkspace });
  const { data: entries } = useGetApiTimeEntries({ all: canManageWorkspace });
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [nameQuery, setNameQuery] = useState("");
  const [managingProject, setManagingProject] = useState<Project | null>(null);
  const [renamingProject, setRenamingProject] = useState<{ id: string; name: string } | null>(null);
  const [pendingDeleteProject, setPendingDeleteProject] = useState<Project | null>(null);

  const createProject = usePostApiProjects({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetApiProjectsQueryKey() });
        setName("");
        setModalOpen(false);
      },
    },
  });

  const renameProject = usePatchApiProjectsId({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetApiProjectsQueryKey() });
        setRenamingProject(null);
      },
    },
  });

  const deleteProject = useDeleteApiProjectsId({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetApiProjectsQueryKey() });
        setPendingDeleteProject(null);
      },
    },
  });

  const taskCountByProject = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of tasks ?? []) {
      if (!t.project_id) continue;
      map.set(t.project_id, (map.get(t.project_id) ?? 0) + 1);
    }
    return map;
  }, [tasks]);

  const timeSpentByProject = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries ?? []) {
      if (e.duration_seconds != null && e.project_id) {
        map.set(e.project_id, (map.get(e.project_id) ?? 0) + e.duration_seconds);
      }
    }
    return map;
  }, [entries]);

  const filteredProjects = useMemo(() => {
    const q = nameQuery.trim().toLowerCase();
    if (!q) return projects ?? [];
    return (projects ?? []).filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, nameQuery]);

  const isFiltering = nameQuery.trim() !== "";
  const nothingFound = isFiltering && filteredProjects.length === 0;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    createProject.mutate({ data: { name: trimmed } });
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Projects</h1>
        <button
          onClick={() => setModalOpen(true)}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm hover:bg-blue-500"
        >
          Create Project
        </button>
      </div>

      <div className="mb-4 flex items-center gap-2">
        <ProjectNameFilterButton query={nameQuery} onChange={setNameQuery} resultCount={filteredProjects.length} />
        <MemberFilterButton />
      </div>

      {modalOpen && (
        <Modal title="Create new project" onClose={() => setModalOpen(false)}>
          <form onSubmit={handleSubmit}>
            <label className="mb-1 block text-xs text-neutral-400">Project name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {createProject.isError && (
              <p className="mt-2 text-xs text-red-400">
                {extractErrorMessage(createProject.error, "Could not create project")}
              </p>
            )}
            <button
              type="submit"
              disabled={createProject.isPending}
              className="mt-3 w-full rounded bg-blue-600 py-2 text-sm hover:bg-blue-500 disabled:opacity-50"
            >
              Create Project
            </button>
          </form>
        </Modal>
      )}

      {isLoading && <p className="text-sm text-neutral-500">Loading…</p>}

      {!isLoading && !isFiltering && projects?.length === 0 && (
        <p className="text-sm text-neutral-500">No projects yet</p>
      )}

      {nothingFound && (
        <div className="rounded border border-neutral-800 py-8 text-center">
          <p className="mb-3 text-sm text-neutral-500">Nothing found</p>
          <button
            onClick={() => setModalOpen(true)}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm hover:bg-blue-500"
          >
            + New Project
          </button>
        </div>
      )}

      {!nothingFound && !!filteredProjects.length && (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-800 text-left text-xs uppercase tracking-wide text-neutral-500">
              <th className="py-2 font-medium">Project</th>
              <th className="py-2 font-medium">Created</th>
              <th className="py-2 font-medium">Tasks count</th>
              <th className="py-2 font-medium">Time spent</th>
              <th className="py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {filteredProjects.map((project) => {
              const canManageThisProject = canManageWorkspace || project.my_role === ProjectRole.LEAD;
              const isRenaming = renamingProject?.id === project.id;
              return (
                <tr key={project.id} className="border-b border-neutral-800/60">
                  <td className="py-2">
                    {isRenaming ? (
                      <form
                        className="flex items-center gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const trimmed = renamingProject.name.trim();
                          if (!trimmed) return;
                          renameProject.mutate({ id: project.id, data: { name: trimmed } });
                        }}
                      >
                        <input
                          autoFocus
                          value={renamingProject.name}
                          onChange={(e) => setRenamingProject({ id: project.id, name: e.target.value })}
                          className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <button
                          type="submit"
                          disabled={renameProject.isPending}
                          className="rounded bg-blue-600 px-2 py-1 text-xs hover:bg-blue-500 disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setRenamingProject(null)}
                          className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800"
                        >
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colorForId(project.id) }} />
                        {project.name}
                        {project.my_role === ProjectRole.LEAD && (
                          <span className="rounded-full bg-blue-500/10 px-1.5 text-[10px] text-blue-300">Lead</span>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-neutral-400">{format(new Date(project.created_at), "dd MMM yyyy")}</td>
                  <td className="py-2 text-neutral-400">{taskCountByProject.get(project.id) ?? 0}</td>
                  <td className="py-2 font-mono text-neutral-400">
                    {formatDuration(timeSpentByProject.get(project.id) ?? 0)}
                  </td>
                  <td className="py-2 text-right">
                    {!isRenaming && (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setManagingProject(project)}
                          className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800"
                        >
                          Participants
                        </button>
                        {canManageThisProject && (
                          <button
                            onClick={() => setRenamingProject({ id: project.id, name: project.name })}
                            className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800"
                          >
                            Rename
                          </button>
                        )}
                        {canManageWorkspace && (
                          <button
                            onClick={() => setPendingDeleteProject(project)}
                            className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {renameProject.isError && (
        <p className="mt-2 text-xs text-red-400">
          {extractErrorMessage(renameProject.error, "Could not rename project")}
        </p>
      )}

      {managingProject && (
        <ProjectMembersModal
          project={managingProject}
          canManageWorkspace={canManageWorkspace}
          onClose={() => setManagingProject(null)}
        />
      )}
      {pendingDeleteProject && (
        <DeleteConfirmModal
          count={1}
          isPending={deleteProject.isPending}
          onCancel={() => setPendingDeleteProject(null)}
          onConfirm={() => deleteProject.mutate({ id: pendingDeleteProject.id })}
        />
      )}
    </div>
  );
}

function ProjectNameFilterButton({
  query,
  onChange,
  resultCount,
}: {
  query: string;
  onChange: (q: string) => void;
  resultCount: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));
  const active = query.trim() !== "";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 rounded border px-2 py-1 text-xs ${
          active ? "border-blue-500 bg-blue-500/10 text-blue-300" : "border-neutral-700 text-neutral-300 hover:bg-neutral-800"
        }`}
      >
        <CaseSensitive size={14} />
        Project name
        {active && (
          <span className="rounded-full bg-blue-500/20 px-1.5 text-[10px] font-semibold text-blue-300">
            {resultCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute left-0 z-20 mt-2 w-56 rounded border border-neutral-700 bg-neutral-900 p-2 shadow-xl">
          <p className="mb-2 text-xs font-semibold text-neutral-300">Search project</p>
          <input
            aria-label="Search project"
            autoFocus
            value={query}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      )}
    </div>
  );
}

function MemberFilterButton() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 rounded border px-2 py-1 text-xs ${
          open ? "border-blue-500 bg-blue-500/10 text-blue-300" : "border-neutral-700 text-neutral-300 hover:bg-neutral-800"
        }`}
      >
        <Users size={14} />
        Member
      </button>
      {open && (
        <div className="absolute left-0 z-20 mt-2 w-40 rounded border border-neutral-700 bg-neutral-900 p-2 shadow-xl">
          <p className="text-xs text-neutral-400">Coming soon</p>
        </div>
      )}
    </div>
  );
}
