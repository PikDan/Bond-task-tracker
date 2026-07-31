// Backend doesn't store a project color, so we derive a stable one client-side
// from the project id — same project always gets the same dot color.
const PALETTE = [
  "#4f9dde",
  "#e07a5f",
  "#81b29a",
  "#f2cc8f",
  "#9c89b8",
  "#f4a261",
  "#2a9d8f",
  "#e76f51",
  "#a8dadc",
  "#c9ada7",
];

export function colorForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}
