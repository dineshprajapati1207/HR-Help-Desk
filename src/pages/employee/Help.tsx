import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, PageHeader, Skeleton } from "@/components/ui";
import { ContactCard } from "@/components/Shared";
import { view, type Contact } from "@/lib/api";
import { CONTACT_CATEGORIES } from "@/lib/format";

export default function Help() {
  const [c, setC] = useState<Contact[] | null>(null);
  useEffect(() => { view<Contact>("public_contacts").then(setC).catch(() => setC([])); }, []);
  return (
    <div>
      <PageHeader title="Help & Support" text="Reach the right person for your query. For PoSH concerns, follow the reporting channel described in the PoSH policy." />
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {c === null ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-44" />)
          : c.length === 0 ? <p className="text-sm text-navy-3">No contacts have been set up yet.</p>
          : c.map((x) => <ContactCard key={x.id} contact={x} topic={CONTACT_CATEGORIES[x.escalation_category]} />)}
      </div>
      <Card className="p-5 mt-6">
        <p className="font-bold">How PeopleHub works</p>
        <ul className="text-sm text-navy-3 mt-2 space-y-1.5 list-disc pl-5">
          <li>PeopleHub AI answers only from policies HR has approved and published, and shows the source for each answer.</li>
          <li>Calculators use rules approved by HR. Results are estimates; your final settlement is confirmed by Payroll.</li>
          <li>Email drafts are never sent for you. Copy them into your mail app.</li>
          <li>Your chat history is stored for this browser only. You can delete it in <Link to="/history" className="text-brand-dark font-semibold">My History</Link>.</li>
        </ul>
      </Card>
    </div>
  );
}
