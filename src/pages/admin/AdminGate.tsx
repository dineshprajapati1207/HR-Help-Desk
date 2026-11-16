import { useEffect, useState } from "react";
import { ShieldAlert, Loader2, Lock } from "lucide-react";
import { adminApi, adminPass } from "@/lib/api";
import { configured } from "@/lib/supabase";
import { Button, Input, NotConfigured } from "@/components/ui";

/** Admin access is decided on the server. Employees cannot open it: they need the admin passcode
 *  (and, if configured, a trusted network). Nothing admin-related is shown on the employee side. */
export function AdminGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"checking" | "ok" | "login" | "denied">("checking");
  const [msg, setMsg] = useState("");
  const [pass, setPass] = useState("");
  const [keep, setKeep] = useState(false);
  const [busy, setBusy] = useState(false);

  const check = () =>
    adminApi("ping").then(() => setState("ok")).catch((e) => {
      if (e.code === "ADMIN_PASSCODE_REQUIRED" || e.code === "ADMIN_PASSCODE_INVALID") { adminPass.clear(); setState("login"); if (e.code === "ADMIN_PASSCODE_INVALID") setMsg(e.message); }
      else { setMsg(e.message); setState("denied"); }
    });
  useEffect(() => { if (!configured) { setState("denied"); return; } check(); /* eslint-disable-next-line */ }, []);

  const login = async (e: React.FormEvent) => {
    e.preventDefault(); if (!pass.trim()) return;
    setBusy(true); setMsg(""); adminPass.set(pass.trim(), keep);
    await check(); setBusy(false);
  };

  if (state === "checking") return <div className="h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-brand" /></div>;
  if (state === "login") return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-navy">
      <form onSubmit={login} className="w-full max-w-sm bg-white rounded-2xl p-8">
        <div className="h-12 w-12 rounded-full bg-brand-soft flex items-center justify-center mx-auto"><Lock className="h-6 w-6 text-brand" /></div>
        <h1 className="text-xl font-extrabold mt-3 text-center">HR Admin sign in</h1>
        <p className="text-sm text-navy-3 mt-1 text-center">Only authorised HR administrators can open this area.</p>
        <Input type="password" autoFocus placeholder="Admin passcode" value={pass} onChange={(e) => setPass(e.target.value)} className="mt-5" aria-label="Admin passcode" />
        {msg && <p className="text-sm text-red-600 mt-2">{msg}</p>}
        <label className="flex items-center gap-2 text-sm mt-3"><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} className="accent-brand h-4 w-4" />Keep me signed in on this device</label>
        <Button type="submit" className="w-full mt-4" loading={busy}>Sign in</Button>
        <a href="/" className="block text-center text-sm text-navy-3 mt-4 hover:text-navy">← Back to employee portal</a>
      </form>
    </div>
  );
  if (state === "denied") return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-navy">
      <div className="max-w-md bg-white rounded-2xl p-8 text-center">
        {!configured ? <NotConfigured /> : <>
          <ShieldAlert className="h-10 w-10 text-brand mx-auto" />
          <h1 className="text-xl font-extrabold mt-3">Admin console is restricted</h1>
          <p className="text-sm text-navy-3 mt-2">This area is for authorised HR administrators only.</p>
          {msg && <p className="text-xs text-navy-3 mt-4 bg-paper rounded-lg p-3">{msg}</p>}
          <a href="/" className="inline-block text-sm text-brand-dark font-semibold mt-4">← Back to employee portal</a>
        </>}
      </div>
    </div>
  );
  return <>{children}</>;
}
