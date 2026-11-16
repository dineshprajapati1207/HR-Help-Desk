import React, { useEffect } from "react";
import { X, Loader2, Inbox } from "lucide-react";
import { cn } from "@/lib/format";

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" | "navy"; size?: "sm" | "md" | "lg"; loading?: boolean };
export function Button({ variant = "primary", size = "md", loading, className, children, disabled, ...rest }: BtnProps) {
  const v = {
    primary: "bg-brand text-white hover:bg-brand-dark",
    navy: "bg-navy text-white hover:bg-navy-2",
    secondary: "bg-white text-navy border border-slate-200 hover:border-slate-300 hover:bg-slate-50",
    ghost: "text-navy-3 hover:text-navy hover:bg-slate-100",
    danger: "bg-white text-red-600 border border-red-200 hover:bg-red-50",
  }[variant];
  const s = { sm: "h-8 px-3 text-xs", md: "h-10 px-4 text-sm", lg: "h-12 px-5 text-[15px]" }[size];
  return (
    <button {...rest} disabled={disabled || loading}
      className={cn("inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap", v, s, className)}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}{children}
    </button>
  );
}

export const Card = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div {...p} className={cn("bg-white rounded-2xl border border-slate-200/80", className)} />;

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="block text-[13px] font-semibold text-navy mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-xs text-navy-3 mt-1">{hint}</span>}
    </label>
  );
}
const inputCls = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-navy placeholder:text-slate-400 focus:border-brand focus:ring-2 focus:ring-brand/15 outline-none";
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => <input ref={ref} {...p} className={cn(inputCls, "h-10", className)} />);
export const Textarea = ({ className, ...p }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={cn(inputCls, "min-h-[90px]", className)} />;
export const Select = ({ className, children, ...p }: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cn(inputCls, "h-10", className)}>{children}</select>;

export function Badge({ tone = "slate", children, className }: { tone?: "slate" | "green" | "amber" | "red" | "orange" | "navy" | "blue"; children: React.ReactNode; className?: string }) {
  const t = { slate: "bg-slate-100 text-slate-700", green: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-800", red: "bg-red-50 text-red-700", orange: "bg-brand-soft text-brand-dark", navy: "bg-navy text-white", blue: "bg-sky-50 text-sky-700" }[tone];
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", t, className)}>{children}</span>;
}

export const statusTone = (s?: string | null) =>
  ({ active: "green", approved: "green", published: "green", answered: "green", high: "green", inactive: "slate", draft: "slate", superseded: "slate", archived: "slate", pending: "amber", review: "amber", needs_review: "amber", medium: "amber", embedding: "blue", extracting: "blue", generating_faqs: "blue", uploaded: "blue", rejected: "red", error: "red", low: "red", unsupported: "red", linked: "blue" } as Record<string, any>)[s ?? ""] ?? "slate";

export function Tabs({ tabs, value, onChange }: { tabs: { id: string; label: string; count?: number }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-slate-200 mb-5" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={cn("px-3.5 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px", value === t.id ? "border-brand text-navy" : "border-transparent text-navy-3 hover:text-navy")}>
          {t.label}{t.count != null && <span className="ml-1.5 text-xs text-navy-3">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide, footer }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean; footer?: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-navy/40 p-3 overflow-y-auto" onMouseDown={onClose}>
      <div role="dialog" aria-modal className={cn("bg-white rounded-2xl w-full shadow-2xl my-6 flex flex-col max-h-[92vh]", wide ? "max-w-5xl" : "max-w-lg")} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold">{title}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export function Confirm({ open, title, message, confirmLabel, danger, onConfirm, onClose, loading }: { open: boolean; title: string; message: string; confirmLabel: string; danger?: boolean; onConfirm: () => void; onClose: () => void; loading?: boolean }) {
  return (
    <Modal open={open} onClose={onClose} title={title}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant={danger ? "danger" : "primary"} loading={loading} onClick={onConfirm}>{confirmLabel}</Button></>}>
      <p className="text-sm text-navy-3 leading-relaxed">{message}</p>
    </Modal>
  );
}

export const Skeleton = ({ className }: { className?: string }) => <div className={cn("animate-pulse rounded-lg bg-slate-200/70", className)} />;

export function Empty({ title, text, action, icon: Icon = Inbox }: { title: string; text?: string; action?: React.ReactNode; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex flex-col items-center text-center py-12 px-6">
      <div className="h-12 w-12 rounded-full bg-brand-soft flex items-center justify-center mb-3"><Icon className="h-6 w-6 text-brand" /></div>
      <p className="font-bold">{title}</p>
      {text && <p className="text-sm text-navy-3 mt-1 max-w-sm">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, text, actions }: { title: string; text?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
      <div><h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>{text && <p className="text-sm text-navy-3 mt-1 max-w-2xl">{text}</p>}</div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: string; tone?: "orange" | "red" }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-semibold text-navy-3">{label}</p>
      <p className={cn("text-2xl font-extrabold mt-1", tone === "orange" && "text-brand", tone === "red" && "text-red-600")}>{value}</p>
      {sub && <p className="text-xs text-navy-3 mt-0.5">{sub}</p>}
    </Card>
  );
}

export function Notice({ tone = "amber", children }: { tone?: "amber" | "red" | "blue" | "orange"; children: React.ReactNode }) {
  const t = { amber: "bg-amber-50 border-amber-200 text-amber-900", red: "bg-red-50 border-red-200 text-red-800", blue: "bg-sky-50 border-sky-200 text-sky-900", orange: "bg-brand-soft border-brand-line text-navy" }[tone];
  return <div className={cn("rounded-xl border px-4 py-3 text-sm leading-relaxed", t)}>{children}</div>;
}

export function NotConfigured() {
  return <Notice tone="red">Supabase is not configured. Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to <code>.env</code> and restart.</Notice>;
}
