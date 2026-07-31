import { useState } from "react";
import { Download } from "lucide-react";
import { useToast } from "../context/ToastContext";
import { ReportsSummaryTab } from "./ReportsSummaryTab";
import { ReportsDetailedTab } from "./ReportsDetailedTab";

type ReportsTab = "summary" | "detailed";

const TABS: { key: ReportsTab; label: string }[] = [
  { key: "summary", label: "Summary" },
  { key: "detailed", label: "Detailed" },
];

export function ReportsView() {
  const [tab, setTab] = useState<ReportsTab>("summary");
  const { show } = useToast();

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-baseline gap-5">
          <h1 className="text-lg font-semibold">Reports</h1>
          <nav className="flex gap-4">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`pb-1 text-sm ${
                  tab === t.key
                    ? "border-b-2 border-blue-500 font-semibold text-blue-400"
                    : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
        <button
          onClick={() => show("Export is coming soon", "info")}
          className="flex items-center gap-1.5 rounded border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800"
        >
          <Download size={14} />
          Export
        </button>
      </div>

      {tab === "summary" ? <ReportsSummaryTab /> : <ReportsDetailedTab />}
    </div>
  );
}
