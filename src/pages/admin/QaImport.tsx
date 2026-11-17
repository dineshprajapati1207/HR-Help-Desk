import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Modal, Button, Select, Badge, Skeleton } from "@/components/ui";
import { run } from "./common";
import { embedFaqsFor } from "./pipeline";

type QaSet = { label: string; items: { s: string | null; q: string; a: string }[] };

const compact = (s: string) => s.toLowerCase().replace(/\bpolicy\b/g, "").replace(/[^a-z0-9]+/g, "");
const words = (s: string) => s.toLowerCase().replace(/\bpolicy\b/g, "").split(/[^a-z0-9]+/).filter((w) => w.length > 1);
function lev(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
function similarity(label: string, name: string) {
  const a = compact(label), b = compact(name);
  if (!a || !b) return 0;
  if (a === b) return 1.2;
  if (a.includes(b) || b.includes(a)) return 1;
  const A = words(label), B = words(name);
  const m = A.filter((x) => B.some((y) => y === x || (x.length >= 5 && y.length >= 5 && lev(x, y) <= 2))).length;
  return A.length ? (m / A.length) * 0.9 : 0;
}

/** Loads the ready-made Q&A sets into the matching policies. Answers are stored exactly as written in the files. */
export function QaImportDialog({ policies, onClose }: { policies: any[]; onClose: () => void }) {
  const usable = policies.filter((p) => p.status !== "archived" && p.current_version_id);
  const [sets, setSets] = useState<QaSet[] | null>(null);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [state, setState] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    import("@/data/qaBundle.json").then((m) => {
      const data = ((m as any).default ?? m) as QaSet[];
      setSets(data);
      const auto: Record<string, string> = {};
      for (const s of data) {
        const best = usable.map((p) => ({ p, sc: similarity(s.label, p.name) })).filter((x) => x.sc >= 0.5).sort((a, b) => b.sc - a.sc || a.p.name.length - b.p.name.length)[0];
        if (best) auto[s.label] = best.p.id;
      }
      setPick(auto);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function importOne(s: QaSet) {
    const pid = pick[s.label];
    if (!pid) return false;
    setState((x) => ({ ...x, [s.label]: "Saving questions..." }));
    const r = await run("import_qa", { policy_id: pid, items: s.items }) as { created: number; version_id: string } | null;
    if (!r) { setState((x) => ({ ...x, [s.label]: "Failed" })); return false; }
    await embedFaqsFor(r.version_id, (p) => setState((x) => ({ ...x, [s.label]: `Preparing search ${Math.round(p)}%` })));
    setState((x) => ({ ...x, [s.label]: `Done: ${r.created} Q&As` }));
    return true;
  }
  async function importAll() {
    setBusy(true);
    let n = 0;
    for (const s of sets ?? []) if (pick[s.label] && !(state[s.label] ?? "").startsWith("Done")) if (await importOne(s)) n++;
    setBusy(false);
    toast.success(`${n} Q&A set(s) imported`);
  }
  const total = (sets ?? []).reduce((a, s) => a + s.items.length, 0);
  const ready = (sets ?? []).filter((s) => pick[s.label]).length;

  return (
    <Modal open onClose={onClose} title="Import Q&A into policies" wide
      footer={<><Button variant="secondary" onClick={onClose}>Close</Button><Button loading={busy} disabled={!ready} onClick={importAll}>Import {ready} selected set{ready === 1 ? "" : "s"}</Button></>}>
      {!sets ? <Skeleton className="h-64" /> : (
        <div className="space-y-3">
          <p className="text-sm text-navy-3">{sets.length} Q&A sets ({total} questions) are ready. Check which policy each set goes to. Answers are saved exactly as written. Importing replaces the automatically generated questions of that policy (questions you typed yourself are kept).</p>
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {sets.map((s) => (
              <div key={s.label} className="flex flex-col sm:flex-row sm:items-center gap-2 p-3">
                <div className="sm:w-1/3"><p className="font-semibold text-sm">{s.label}</p><p className="text-xs text-navy-3">{s.items.length} questions</p></div>
                <Select className="sm:flex-1" value={pick[s.label] ?? ""} onChange={(e) => setPick((x) => ({ ...x, [s.label]: e.target.value }))} disabled={busy}>
                  <option value="">Do not import</option>
                  {usable.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
                <div className="sm:w-40 text-xs">{state[s.label] ? <Badge tone={state[s.label].startsWith("Done") ? "green" : state[s.label] === "Failed" ? "red" : "orange"}>{state[s.label]}</Badge> : !pick[s.label] ? <span className="text-amber-700">Policy not found</span> : null}</div>
              </div>
            ))}
          </div>
          {!usable.length && <p className="text-sm text-red-700">No published policies found. Upload and publish the policies first.</p>}
        </div>
      )}
    </Modal>
  );
}
