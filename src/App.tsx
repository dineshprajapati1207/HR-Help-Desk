import { Navigate, Route, Routes } from "react-router-dom";
import { LayoutDashboard,
  FileUp, FileText, ListChecks, BrainCircuit, Calculator, BarChart3, Contact2, Megaphone, ScrollText, Settings } from "lucide-react";
import { Shell, type NavItem } from "@/components/layout/Shell";
import { EmployeeShell } from "@/components/layout/EmployeeShell";
import EmpDashboard from "@/pages/employee/Dashboard";
import Ask from "@/pages/employee/Ask";
import PolicyLibrary from "@/pages/employee/PolicyLibrary";
import PLGratuity from "@/pages/employee/PLGratuity";
import IncomeTax from "@/pages/employee/IncomeTax";
import PFCalc from "@/pages/employee/PFCalculator";
import ContactHR from "@/pages/employee/ContactHR";
import PolicyPage from "@/pages/employee/PolicyPage";
import MyHistory from "@/pages/employee/MyHistory";
import Help from "@/pages/employee/Help";
import AdminDashboard from "@/pages/admin/Dashboard";
import Documents from "@/pages/admin/Documents";
import Policies from "@/pages/admin/Policies";
import Faqs from "@/pages/admin/Faqs";
import KnowledgeBase from "@/pages/admin/KnowledgeBase";
import Calculators from "@/pages/admin/Calculators";
import Analytics from "@/pages/admin/Analytics";
import Contacts from "@/pages/admin/Contacts";
import Announcements from "@/pages/admin/Announcements";
import AuditLogs from "@/pages/admin/AuditLogs";
import SettingsPage from "@/pages/admin/Settings";
import { AdminGate } from "@/pages/admin/AdminGate";
import { adminPass } from "@/lib/api";

function AdminTopRight() {
  return (
    <>
      <a href="/" className="text-sm font-semibold text-navy-3 hover:text-navy px-2">Employee portal</a>
      <button onClick={() => { adminPass.clear(); window.location.href = "/"; }} className="text-sm font-semibold text-red-600 hover:underline px-2">Sign out</button>
    </>
  );
}

const adminNav: NavItem[] = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/admin/documents", label: "Document Management", icon: FileUp },
  { to: "/admin/policies", label: "Policy Management", icon: FileText },
  { to: "/admin/faqs", label: "FAQ & Q&A Management", icon: ListChecks },
  { to: "/admin/knowledge", label: "AI Knowledge Base", icon: BrainCircuit },
  { to: "/admin/calculators", label: "Calculator Management", icon: Calculator },
  { to: "/admin/analytics", label: "Query Analytics", icon: BarChart3 },
  { to: "/admin/contacts", label: "Contact Directory", icon: Contact2 },
  { to: "/admin/announcements", label: "Announcements", icon: Megaphone },
  { to: "/admin/audit", label: "Audit Logs", icon: ScrollText },
  { to: "/admin/settings", label: "Settings", icon: Settings },
];

export default function App() {
  return (
    <Routes>
      <Route element={<EmployeeShell />}>
        <Route index element={<EmpDashboard />} />
        <Route path="ask" element={<Ask />} />
        <Route path="ask/:sessionId" element={<Ask />} />
        <Route path="policies" element={<PolicyLibrary />} />
        <Route path="policy/:id" element={<PolicyPage />} />
        <Route path="pl-gratuity" element={<PLGratuity />} />
        <Route path="income-tax" element={<IncomeTax />} />
        <Route path="pf" element={<PFCalc />} />
        <Route path="contact" element={<ContactHR />} />
        <Route path="email" element={<Navigate to="/contact" replace />} />
        <Route path="history" element={<MyHistory />} />
        <Route path="help" element={<Help />} />
      </Route>
      <Route path="admin" element={<AdminGate><Shell nav={adminNav} admin topRight={<AdminTopRight />} /></AdminGate>}>
        <Route index element={<AdminDashboard />} />
        <Route path="documents" element={<Documents />} />
        <Route path="policies" element={<Policies />} />
        <Route path="faqs" element={<Faqs />} />
        <Route path="knowledge" element={<KnowledgeBase />} />
        <Route path="calculators" element={<Calculators />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="contacts" element={<Contacts />} />
        <Route path="announcements" element={<Announcements />} />
        <Route path="audit" element={<AuditLogs />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
