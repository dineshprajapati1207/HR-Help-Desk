import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/format";

export type NavItem = { to: string; label: string; icon: React.ComponentType<{ className?: string }>; end?: boolean };

export function Logo({ admin }: { admin?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="h-9 w-9 rounded-xl bg-brand flex items-center justify-center text-white font-extrabold text-lg leading-none">p</div>
      <div className="leading-tight">
        <p className={cn("font-extrabold text-[15px]", admin ? "text-white" : "text-navy")}>PeopleHub</p>
        <p className={cn("text-[11px] font-semibold", admin ? "text-white/60" : "text-navy-3")}>{admin ? "Admin console" : "by Petpooja"}</p>
      </div>
    </div>
  );
}

export function Shell({ nav, admin, topRight }: { nav: NavItem[]; admin?: boolean; topRight?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const current = nav.find((n) => (n.end ? loc.pathname === n.to : loc.pathname.startsWith(n.to)));
  const sidebar = (
    <nav className="flex flex-col gap-0.5 p-3" aria-label="Main">
      {nav.map((n) => (
        <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setOpen(false)}
          className={({ isActive }) => cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold",
            admin ? (isActive ? "bg-white/10 text-white" : "text-white/65 hover:text-white hover:bg-white/5")
                  : (isActive ? "bg-brand-soft text-brand-dark" : "text-navy-3 hover:text-navy hover:bg-slate-100"))}>
          <n.icon className="h-[18px] w-[18px] shrink-0" />{n.label}
        </NavLink>
      ))}
    </nav>
  );
  return (
    <div className="min-h-full flex">
      <aside className={cn("hidden lg:flex w-64 shrink-0 flex-col border-r sticky top-0 h-screen", admin ? "bg-navy border-navy" : "bg-white border-slate-200")}>
        <div className="px-5 py-5"><Logo admin={admin} /></div>
        <div className="flex-1 overflow-y-auto">{sidebar}</div>
      </aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-navy/40" />
          <aside className={cn("absolute left-0 top-0 h-full w-72 overflow-y-auto", admin ? "bg-navy" : "bg-white")} onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-5 flex justify-between items-center"><Logo admin={admin} /><button onClick={() => setOpen(false)} aria-label="Close menu"><X className={cn("h-5 w-5", admin && "text-white")} /></button></div>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-slate-200 h-14 flex items-center px-4 lg:px-8 gap-3">
          <button className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
          <p className="font-bold text-sm truncate">{current?.label ?? ""}</p>
          <div className="ml-auto flex items-center gap-2">{topRight}</div>
        </header>
        <main className="flex-1 p-4 lg:p-8 max-w-[1400px] w-full mx-auto"><Outlet /></main>
      </div>
    </div>
  );
}
