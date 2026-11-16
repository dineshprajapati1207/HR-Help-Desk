import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export const cn = (...c: ClassValue[]) => twMerge(clsx(c));
export const inr = (n: number | null | undefined, digits = 0) =>
  n == null || Number.isNaN(n) ? "—" : "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: digits, minimumFractionDigits: digits });
export const num = (v: string | number | undefined | null) => { const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/,/g, "")); return Number.isFinite(n) ? n : 0; };
export const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");
export const fmtDateTime = (d?: string | null) => (d ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
export const CATEGORIES = ["Attendance", "Leave", "Payroll", "Employee Benefits", "Recruitment", "Employee Development", "Relocation", "Separation", "POSH", "Loans", "Salary Advance", "Referral", "Other Policies"];
export const CONTACT_CATEGORIES: Record<string, string> = { general_hr: "General HR", payroll: "Payroll", income_tax: "Income Tax", pf: "PF", loans: "Loans", posh: "POSH", other: "Other Queries" };
export function roundBy(n: number, mode: string = "round") { return mode === "ceil" ? Math.ceil(n) : mode === "floor" ? Math.floor(n) : mode === "none" ? n : Math.round(n); }
