import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Menu as MenuIcon, ArrowLeft, Home, ShieldCheck, X, MessageSquareText, CalendarClock, Receipt, PiggyBank, Phone, History, LifeBuoy, Library } from "lucide-react";
import { EmployeeTopBar } from "@/components/GlobalSearch";
import { view } from "@/lib/api";
import { configured } from "@/lib/supabase";
import { policyColor } from "@/lib/policyColors";
import { useAdminAccess } from "@/lib/useAdminAccess";
import { cn } from "@/lib/format";

const tools = [
  { to: "/ask", label: "Ask HR Assistant", icon: MessageSquareText },
  { to: "/policies", label: "All policies", icon: Library },
  { to: "/pl-gratuity", label: "PL & Gratuity Calculation", icon: CalendarClock },
  { to: "/income-tax", label: "Income Tax Calculator", icon: Receipt },
  { to: "/pf", label: "PF Calculator", icon: PiggyBank },
  { to: "/contact", label: "Contact HR", icon: Phone },
  { to: "/history", label: "My History", icon: History },
  { to: "/help", label: "Help & Support", icon: LifeBuoy },
];

const btn = "h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm font-semibold inline-flex items-center gap-1.5 hover:border-slate-300 hover:bg-slate-50 whitespace-nowrap";

export function EmployeeShell() {
  const nav = useNavigate();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const [policies, setPolicies] = useState<any[]>([]);
  const isAdmin = useAdminAccess();
  const atHome = loc.pathname === "/";
  useEffect(() => { if (configured) view("public_policies", (q) => q.order("name")).then(setPolicies).catch(() => {}); }, []);
  useEffect(() => { setOpen(false); window.scrollTo(0, 0); }, [loc.pathname]);

  return (
    <div className="min-h-full flex flex-col">
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 no-print">
        <div className="max-w-[1180px] mx-auto px-3 sm:px-5 py-2.5 flex flex-wrap items-center gap-2">
          <Link to="/" className="flex items-baseline gap-1.5 mr-1 shrink-0">
            <span className="font-extrabold text-brand text-lg leading-none">Petpooja</span>
            <span className="text-[11px] font-semibold text-navy-3 hidden sm:inline">HR Self-Service</span>
          </Link>
          <button className={btn} onClick={() => setOpen(true)} aria-label="Open main menu"><MenuIcon className="h-4 w-4" />Menu</button>
          <button className={cn(btn, atHome && "opacity-40 pointer-events-none")} onClick={() => nav(-1)} aria-label="Go back"><ArrowLeft className="h-4 w-4" />Back</button>
          <Link to="/" className={btn}><Home className="h-4 w-4" />Home</Link>
          {isAdmin && <Link to="/admin" className={btn}><ShieldCheck className="h-4 w-4" />Admin</Link>}
          <div className="flex-1 min-w-[200px] flex items-center gap-2 order-last sm:order-none basis-full sm:basis-auto"><EmployeeTopBar /></div>
        </div>
      </header>

      {open && (
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-navy/40" />
          <aside className="absolute left-0 top-0 h-full w-80 max-w-[88vw] bg-white overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <p className="font-extrabold text-lg"><span className="text-brand">Petpooja</span> Menu</p>
              <button onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button>
            </div>
            <nav className="p-3" aria-label="Main menu">
              <NavLink to="/" end className={({ isActive }) => cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold", isActive ? "bg-brand-soft text-brand-dark" : "hover:bg-slate-100")}><Home className="h-[18px] w-[18px]" />Home</NavLink>
              {tools.map((t) => (
                <NavLink key={t.to} to={t.to} className={({ isActive }) => cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold", isActive ? "bg-brand-soft text-brand-dark" : "hover:bg-slate-100")}><t.icon className="h-[18px] w-[18px]" />{t.label}</NavLink>
              ))}
              <p className="px-3 pt-5 pb-2 text-xs font-bold uppercase tracking-wide text-navy-3">Policies</p>
              {policies.length === 0 && <p className="px-3 text-sm text-navy-3">Policies appear here once HR publishes them.</p>}
              {policies.map((p) => (
                <NavLink key={p.id} to={`/policy/${p.id}`} className={({ isActive }) => cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold", isActive ? "bg-slate-100" : "hover:bg-slate-50")}>
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: policyColor(p.name).main }} />{p.name}
                </NavLink>
              ))}
              {isAdmin && <Link to="/admin" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold hover:bg-slate-100 mt-4 border-t border-slate-100"><ShieldCheck className="h-[18px] w-[18px]" />Admin Dashboard</Link>}
            </nav>
          </aside>
        </div>
      )}
      <main className="flex-1 w-full max-w-[1180px] mx-auto px-3 sm:px-5 py-5 sm:py-7"><Outlet /></main>
    </div>
  );
}
