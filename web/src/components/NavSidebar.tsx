import type { ViewKey } from "../types";

interface NavItem {
  key: ViewKey;
  label: string;
}

interface NavSection {
  heading: string;
  items: NavItem[];
}

const SECTIONS: NavSection[] = [
  { heading: "Track", items: [{ key: "timer", label: "Timer" }] },
  { heading: "Analyze", items: [{ key: "reports", label: "Reports" }] },
  {
    heading: "Manage",
    items: [
      { key: "projects", label: "Projects" },
      { key: "members", label: "Members" },
    ],
  },
];

interface Props {
  active: ViewKey;
  onSelect: (view: ViewKey) => void;
}

export function NavSidebar({ active, onSelect }: Props) {
  return (
    <nav className="space-y-5">
      {SECTIONS.map((section) => (
        <div key={section.heading}>
          <h2 className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            {section.heading}
          </h2>
          <ul className="space-y-0.5">
            {section.items.map((item) => (
              <li key={item.key}>
                <button
                  onClick={() => onSelect(item.key)}
                  className={`w-full rounded px-2 py-1.5 text-left text-sm hover:bg-neutral-800 ${
                    active === item.key ? "bg-neutral-800 text-neutral-100" : "text-neutral-300"
                  }`}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
