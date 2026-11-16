import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { adminApi } from "@/lib/api";
import { Input, Select } from "@/components/ui";

export function useAdmin<T>(action: string, payload: Record<string, unknown> = {}, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const key = JSON.stringify(payload);
  const reload = useCallback(async () => {
    setLoading(true);
    try { setData(await adminApi<T>(action, JSON.parse(key))); } catch (e) { toast.error((e as Error).message); } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, key, ...deps]);
  useEffect(() => { reload(); }, [reload]);
  return { data, loading, reload, setData };
}

export async function run(action: string, payload: Record<string, unknown>, ok?: string) {
  try { const r = await adminApi(action, payload); if (ok) toast.success(ok); return r; } catch (e) { toast.error((e as Error).message); return null; }
}

export type Range = { preset: string; from?: string; to?: string };
export function rangeToPayload(r: Range) {
  const end = new Date();
  if (r.preset === "today") { const s = new Date(); s.setHours(0, 0, 0, 0); return { from: s.toISOString(), to: end.toISOString() }; }
  if (r.preset === "7") return { from: new Date(Date.now() - 7 * 864e5).toISOString(), to: end.toISOString() };
  if (r.preset === "custom" && r.from && r.to) return { from: new Date(r.from).toISOString(), to: new Date(r.to + "T23:59:59").toISOString() };
  return { from: new Date(Date.now() - 30 * 864e5).toISOString(), to: end.toISOString() };
}
export function DateFilter({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  return (
    <div className="flex flex-wrap gap-2 items-center">
      <Select className="w-40" value={value.preset} onChange={(e) => onChange({ ...value, preset: e.target.value })} aria-label="Date range">
        <option value="today">Today</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="custom">Custom range</option>
      </Select>
      {value.preset === "custom" && <>
        <Input type="date" className="w-40" value={value.from ?? ""} onChange={(e) => onChange({ ...value, from: e.target.value })} aria-label="From" />
        <Input type="date" className="w-40" value={value.to ?? ""} onChange={(e) => onChange({ ...value, to: e.target.value })} aria-label="To" />
      </>}
    </div>
  );
}
export const CHART = { orange: "#EE5A24", navy: "#14213D", grey: "#94A3B8", amber: "#F59E0B", red: "#DC2626", green: "#059669", palette: ["#EE5A24", "#14213D", "#F59E0B", "#5B6684", "#059669", "#FB923C", "#94A3B8", "#0EA5E9"] };
