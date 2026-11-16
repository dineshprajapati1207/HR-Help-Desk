// Every policy gets its own colour. The colour comes from the policy name, so it stays the same everywhere
// (home tiles, policy page, menu) and a newly uploaded policy automatically gets one.
export type PolicyColor = { main: string; soft: string; dark: string };
const PALETTE: PolicyColor[] = [
  { main: "#EA580C", soft: "#FFF1E8", dark: "#9A3412" }, // orange
  { main: "#2563EB", soft: "#EAF1FF", dark: "#1E40AF" }, // blue
  { main: "#16A34A", soft: "#E8F8EE", dark: "#166534" }, // green
  { main: "#7C3AED", soft: "#F1EBFF", dark: "#5B21B6" }, // purple
  { main: "#DB2777", soft: "#FDEAF3", dark: "#9D174D" }, // pink
  { main: "#0D9488", soft: "#E3F6F4", dark: "#115E59" }, // teal
  { main: "#DC2626", soft: "#FDECEC", dark: "#991B1B" }, // red
  { main: "#CA8A04", soft: "#FEF6DC", dark: "#854D0E" }, // gold
  { main: "#4F46E5", soft: "#ECEBFE", dark: "#3730A3" }, // indigo
  { main: "#0891B2", soft: "#E1F5FA", dark: "#155E75" }, // cyan
  { main: "#65A30D", soft: "#EEF8DD", dark: "#3F6212" }, // lime
  { main: "#C026D3", soft: "#FAE8FD", dark: "#86198F" }, // fuchsia
  { main: "#B45309", soft: "#FCEFDD", dark: "#78350F" }, // brown
  { main: "#0F766E", soft: "#DFF3F0", dark: "#134E4A" }, // deep teal
];
export function policyColor(key: string | null | undefined): PolicyColor {
  let h = 0;
  for (const ch of (key ?? "").toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
export const versionOf = (p: { version_label?: string | null; version_number?: number | null }) => p.version_label ?? `v${p.version_number ?? 1}`;
