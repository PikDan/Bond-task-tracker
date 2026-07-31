import type { TimeEntry } from "../api/generated";

export interface OverlapInfo {
  conflictId: number;
  color: string;
  others: TimeEntry[];
}

// Distinct from project colors (colorForId) so conflict highlighting never
// visually collides with a project's own dot/pill color.
const CONFLICT_COLORS = ["#a168a4", "#e07a5f", "#4a9d8f", "#c9a227", "#5b8dd6", "#d6708f"];

// Groups entries whose time ranges overlap (directly or transitively — if A
// overlaps B and B overlaps C, all three are one conflict) via union-find,
// then assigns each group of size >= 2 a stable sequential id and color.
// Purely a client-side visual hint — the backend doesn't prevent overlaps.
export function findOverlapGroups(entries: TimeEntry[]): Map<string, OverlapInfo> {
  const closed = entries.filter((e) => e.ended_at != null);

  const parent = new Map<string, string>();
  for (const e of closed) parent.set(e.id, e.id);

  function find(id: string): string {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(id, root);
    return root;
  }
  function union(a: string, b: string) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }

  const sorted = [...closed].sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    const aEnd = new Date(a.ended_at as string).getTime();
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j];
      const bStart = new Date(b.started_at).getTime();
      if (bStart >= aEnd) break; // sorted by start, no further overlap possible
      union(a.id, b.id);
    }
  }

  const groupsByRoot = new Map<string, TimeEntry[]>();
  for (const e of closed) {
    const root = find(e.id);
    const list = groupsByRoot.get(root) ?? [];
    list.push(e);
    groupsByRoot.set(root, list);
  }

  const conflictGroups = Array.from(groupsByRoot.values())
    .filter((g) => g.length >= 2)
    .sort((a, b) => earliestStart(a) - earliestStart(b));

  const result = new Map<string, OverlapInfo>();
  conflictGroups.forEach((group, index) => {
    const conflictId = index + 1;
    const color = CONFLICT_COLORS[index % CONFLICT_COLORS.length];
    for (const entry of group) {
      result.set(entry.id, { conflictId, color, others: group.filter((e) => e.id !== entry.id) });
    }
  });

  return result;
}

function earliestStart(group: TimeEntry[]): number {
  return Math.min(...group.map((e) => new Date(e.started_at).getTime()));
}
