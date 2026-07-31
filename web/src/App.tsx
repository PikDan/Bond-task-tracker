import { useState } from "react";
import { useUser } from "./context/UserContext";
import { UserSwitcher } from "./components/UserSwitcher";
import { NavSidebar } from "./components/NavSidebar";
import { ActiveTimerBar } from "./components/ActiveTimerBar";
import { ToastViewport } from "./components/ToastViewport";
import { TimerView } from "./views/TimerView";
import { ReportsView } from "./views/ReportsView";
import { ProjectsView } from "./views/ProjectsView";
import { MembersView } from "./views/MembersView";
import type { ViewKey } from "./types";

export default function App() {
  const { userId } = useUser();
  const [view, setView] = useState<ViewKey>("timer");

  if (!userId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-900 text-neutral-100">
        <div className="rounded border border-neutral-700 p-6 text-center">
          <p className="mb-4 text-neutral-300">Set a user id to get started</p>
          <UserSwitcher />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-100">
      <ToastViewport />
      <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
        <h1 className="text-lg font-semibold">Time Tracker</h1>
        <UserSwitcher />
      </header>

      <ActiveTimerBar />

      <div className="flex">
        <aside className="w-56 shrink-0 border-r border-neutral-800 p-4">
          <NavSidebar active={view} onSelect={setView} />
        </aside>

        <main className="flex-1 p-4">
          {view === "timer" && <TimerView />}
          {view === "reports" && <ReportsView />}
          {view === "projects" && <ProjectsView />}
          {view === "members" && <MembersView />}
        </main>
      </div>
    </div>
  );
}
