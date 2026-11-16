import ReactMarkdown from "react-markdown";
import { Phone, Mail, PenLine } from "lucide-react";
import { Link } from "react-router-dom";
import { Button, Card } from "@/components/ui";
import type { Contact } from "@/lib/api";
import { CONTACT_CATEGORIES } from "@/lib/format";

export const Md = ({ children }: { children: string }) => <div className="prose-hr text-[15px] text-navy"><ReactMarkdown>{children}</ReactMarkdown></div>;

export function ContactCard({ contact, topic, compact }: { contact: Contact | null; topic?: string; compact?: boolean }) {
  if (!contact) return <p className="text-sm text-navy-3">No contact has been set up yet. Please reach out to your HR team directly.</p>;
  return (
    <Card className={compact ? "p-4 bg-brand-soft/50 border-brand-line" : "p-5"}>
      <p className="text-xs font-semibold text-navy-3">{CONTACT_CATEGORIES[contact.escalation_category] ?? "HR"} contact</p>
      <p className="font-bold text-lg mt-0.5">{contact.name}</p>
      <p className="text-sm text-navy-3">{[contact.department, contact.availability].filter(Boolean).join(", ")}</p>
      <p className="text-sm mt-1">{contact.phone ? `Phone: ${contact.phone}` : "Phone number not yet added by HR"}{contact.email ? ` · ${contact.email}` : ""}</p>
      <div className="flex flex-wrap gap-2 mt-3">
        {contact.phone ? <a href={`tel:${contact.phone.replace(/\s/g, "")}`}><Button size="sm"><Phone className="h-4 w-4" />Call now</Button></a> : <Button size="sm" disabled><Phone className="h-4 w-4" />Call now</Button>}
        {contact.email && <a href={`mailto:${contact.email}`}><Button size="sm" variant="secondary"><Mail className="h-4 w-4" />Email</Button></a>}
        <Link to={`/contact?topic=${encodeURIComponent(topic ?? "")}`}><Button size="sm" variant="secondary"><PenLine className="h-4 w-4" />Generate email draft</Button></Link>
      </div>
    </Card>
  );
}

export function Disclaimer({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  return <div className="text-xs text-navy-3 leading-relaxed border-t border-slate-200 pt-4 mt-6 whitespace-pre-wrap">{text}</div>;
}
