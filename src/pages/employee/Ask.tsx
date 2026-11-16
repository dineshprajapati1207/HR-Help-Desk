import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowUp, Copy, ThumbsUp, ThumbsDown, RefreshCw, Plus, Trash2, FileText, CheckCircle2, AlertCircle, HelpCircle, History, X } from "lucide-react";
import { Button, Card, Badge, Modal } from "@/components/ui";
import { Md, ContactCard } from "@/components/Shared";
import { askAI, employeeApi, view, type ChatReply, type Source, type Contact } from "@/lib/api";
import { fmtDate, cn } from "@/lib/format";

type Msg = { id?: string; role: "user" | "assistant"; content: string; confidence?: "high" | "medium" | "low"; sources?: Source[]; related_questions?: string[]; unanswered_parts?: string | null; contact?: Contact | null; feedback?: boolean; pending?: boolean };

const CONF = {
  high: { label: "Answer found in the official Petpooja policy.", icon: CheckCircle2, cls: "text-emerald-700 bg-emerald-50" },
  medium: { label: "Here is the closest information available in the policy.", icon: HelpCircle, cls: "text-amber-800 bg-amber-50" },
  low: { label: "I couldn't find sufficiently reliable information in the approved knowledge library.", icon: AlertCircle, cls: "text-red-700 bg-red-50" },
};

export default function Ask() {
  const { sessionId } = useParams();
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const [sid, setSid] = useState<string | null>(sessionId ?? null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessions, setSessions] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const policyFilter = params.get("policy");
  const policyName = params.get("policyName");
  const end = useRef<HTMLDivElement>(null);
  const firstQ = useRef(false);

  const [fallbackMsg, setFallbackMsg] = useState("For further assistance, please contact:");
  useEffect(() => { view<any>("public_settings", (q) => q.eq("key", "app")).then((r) => r[0]?.value?.fallback_message && setFallbackMsg(r[0].value.fallback_message)).catch(() => {}); }, []);
  const loadSessions = () => employeeApi<{ sessions: any[] }>("list_sessions").then((r) => setSessions(r.sessions)).catch(() => {});
  useEffect(() => { loadSessions(); }, []);
  useEffect(() => {
    if (sessionId) {
      setSid(sessionId);
      employeeApi<{ messages: Msg[] }>("get_session", { session_id: sessionId }).then((r) => setMsgs(r.messages)).catch((e) => toast.error(e.message));
    }
  }, [sessionId]);
  useEffect(() => {
    const q = params.get("q");
    if (q && !firstQ.current) { firstQ.current = true; params.delete("q"); setParams(params, { replace: true }); send(q); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs]);

  async function send(text: string, regenerate = false) {
    const t = text.trim(); if (!t || busy) return;
    setBusy(true); setInput("");
    setMsgs((m) => [...(regenerate ? m.slice(0, -1) : [...m, { role: "user" as const, content: t }]), { role: "assistant", content: "", pending: true }]);
    try {
      const r: ChatReply = await askAI(t, sid, { policy_id: policyFilter, regenerate });
      if (!sid) { setSid(r.session_id); window.history.replaceState(null, "", `/ask/${r.session_id}${window.location.search}`); }
      setMsgs((m) => [...m.slice(0, -1), { id: r.message_id, role: "assistant", content: r.answer || "I couldn't find this information in the current Petpooja knowledge library.", confidence: r.confidence, sources: r.sources, related_questions: r.related_questions, unanswered_parts: r.unanswered_parts, contact: r.contact }]);
      loadSessions();
    } catch (e) {
      setMsgs((m) => m.slice(0, -1));
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  }

  const lastUser = [...msgs].reverse().find((m) => m.role === "user")?.content;
  const newChat = () => { setSid(null); setMsgs([]); nav("/ask"); };
  const clearChat = async () => { if (sid) await employeeApi("delete_session", { session_id: sid }).catch(() => {}); newChat(); loadSessions(); toast.success("Chat cleared"); };
  const feedback = async (i: number, helpful: boolean) => {
    const m = msgs[i]; if (!m.id) return;
    await employeeApi("feedback", { message_id: m.id, helpful }).then(() => { setMsgs((x) => x.map((y, k) => (k === i ? { ...y, feedback: helpful } : y))); toast.success("Thanks for the feedback"); }).catch((e) => toast.error(e.message));
  };

  return (
    <div className="flex gap-6 h-[calc(100vh-7.5rem)] lg:h-[calc(100vh-8.5rem)]">
      <aside className={cn("w-64 shrink-0 flex-col", showHistory ? "fixed inset-0 z-40 bg-white p-4 flex lg:static lg:p-0 lg:bg-transparent" : "hidden lg:flex")}>
        <div className="flex gap-2 mb-3"><Button className="flex-1" onClick={newChat}><Plus className="h-4 w-4" />New chat</Button>{showHistory && <Button variant="ghost" onClick={() => setShowHistory(false)} aria-label="Close"><X className="h-4 w-4" /></Button>}</div>
        <p className="text-xs font-semibold text-navy-3 px-1 mb-1">Chat history</p>
        <div className="flex-1 overflow-y-auto space-y-0.5">
          {sessions.length === 0 && <p className="text-sm text-navy-3 px-1">Your conversations will be listed here.</p>}
          {sessions.map((s) => (
            <button key={s.id} onClick={() => { setShowHistory(false); nav(`/ask/${s.id}`); }} className={cn("w-full text-left rounded-lg px-3 py-2 text-sm truncate", s.id === sid ? "bg-white border border-slate-200 font-semibold" : "hover:bg-white")}>{s.title}</button>
          ))}
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center gap-2 mb-3">
          <Button size="sm" variant="secondary" className="lg:hidden" onClick={() => setShowHistory(true)}><History className="h-4 w-4" />History</Button>
          {policyFilter && <Badge tone="orange">Asking about: {policyName ?? "selected policy"} <button onClick={() => { params.delete("policy"); params.delete("policyName"); setParams(params); }} aria-label="Remove filter"><X className="h-3 w-3" /></button></Badge>}
          <div className="ml-auto flex gap-2">{msgs.length > 0 && <Button size="sm" variant="ghost" onClick={clearChat}><Trash2 className="h-4 w-4" />Clear chat</Button>}</div>
        </div>

        <div className="flex-1 overflow-y-auto pr-1 space-y-5">
          {msgs.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center px-4">
              <h1 className="text-2xl font-extrabold">Ask about any Petpooja policy</h1>
              <p className="text-navy-3 mt-2 max-w-md text-sm">Answers come from approved policy documents, with the source and section shown for every answer.</p>
              <div className="flex flex-wrap gap-2 justify-center mt-5 max-w-xl">
                {["What is the attendance policy?", "How is gratuity calculated?", "What happens if I leave without serving notice?", "What is the salary advance process?"].map((s) =>
                  <button key={s} onClick={() => send(s)} className="text-sm rounded-full border border-slate-200 bg-white px-3.5 py-1.5 hover:border-brand">{s}</button>)}
              </div>
            </div>
          )}
          {msgs.map((m, i) => m.role === "user" ? (
            <div key={i} className="flex justify-end"><div className="bg-navy text-white rounded-2xl rounded-br-md px-4 py-2.5 max-w-[85%] text-[15px] whitespace-pre-wrap">{m.content}</div></div>
          ) : (
            <div key={i} className="max-w-[92%]">
              {m.pending ? <Card className="p-4 text-sm text-navy-3 flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-brand animate-pulse" />Searching the policy library…</Card> : (
                <Card className="p-5">
                  {m.confidence && (() => { const c = CONF[m.confidence]; return <p className={cn("inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-2.5 py-1 mb-3", c.cls)}><c.icon className="h-3.5 w-3.5" />{c.label}</p>; })()}
                  {m.confidence !== "low" ? <Md>{m.content}</Md> : <p className="text-[15px]">I couldn't find this information in the current Petpooja knowledge library.</p>}
                  {m.unanswered_parts && m.confidence !== "low" && <div className="mt-3 text-sm rounded-lg bg-amber-50 px-3 py-2"><span className="font-semibold">Not covered by the policy: </span>{m.unanswered_parts}</div>}
                  {!!m.sources?.length && (
                    <div className="mt-4 space-y-2">
                      <p className="text-xs font-semibold text-navy-3">Sources</p>
                      {m.sources.map((s, k) => (
                        <div key={k} className="rounded-lg border border-brand-line bg-white px-3 py-2.5">
                          <div className="flex gap-3">
                            <FileText className="h-4 w-4 text-brand mt-0.5 shrink-0" />
                            <span className="text-sm"><span className="font-semibold">{s.policy_name}</span>{s.section ? <span className="text-navy-3">, {s.section}</span> : null}
                              <span className="block text-xs text-navy-3">{s.version}{s.last_updated ? `, last updated ${fmtDate(s.last_updated)}` : ""}{s.effective_date ? `, effective ${fmtDate(s.effective_date)}` : ""}</span></span>
                          </div>
                          <p className="text-[11px] font-semibold text-navy-3 mt-2 ml-7">Exact text from the policy</p>
                          <div className="mt-1 ml-7 border-l-4 border-brand-line pl-3 text-sm whitespace-pre-wrap leading-relaxed">{s.excerpt}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {m.contact && m.confidence !== "high" && <div className="mt-4"><p className="text-sm text-navy-3 mb-2">{fallbackMsg}</p><ContactCard compact contact={m.contact} topic={lastUser} /></div>}
                  {!!m.related_questions?.length && (
                    <div className="mt-4"><p className="text-xs font-semibold text-navy-3 mb-1.5">Related questions</p>
                      <div className="flex flex-wrap gap-2">{m.related_questions.map((q) => <button key={q} onClick={() => send(q)} className="text-sm rounded-full bg-slate-100 px-3 py-1 hover:bg-brand-soft">{q}</button>)}</div></div>
                  )}
                  <div className="flex gap-1 mt-4 -ml-2 no-print">
                    <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(m.content); toast.success("Answer copied"); }}><Copy className="h-4 w-4" />Copy</Button>
                    <Button size="sm" variant="ghost" aria-label="Helpful" className={cn(m.feedback === true && "text-emerald-600")} onClick={() => feedback(i, true)}><ThumbsUp className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" aria-label="Not helpful" className={cn(m.feedback === false && "text-red-600")} onClick={() => feedback(i, false)}><ThumbsDown className="h-4 w-4" /></Button>
                    {i === msgs.length - 1 && lastUser && <Button size="sm" variant="ghost" disabled={busy} onClick={() => send(lastUser, true)}><RefreshCw className="h-4 w-4" />Regenerate</Button>}
                  </div>
                </Card>
              )}
            </div>
          ))}
          <div ref={end} />
        </div>

        <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="relative mt-3">
          <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={1} disabled={busy}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
            placeholder={msgs.length ? "Ask a follow-up question" : "Ask anything about Petpooja policies, PL, gratuity, income tax, PF..."} aria-label="Your question"
            className="w-full resize-none rounded-2xl bg-white border border-slate-200 px-4 py-3.5 pr-14 outline-none focus:border-brand focus:ring-2 focus:ring-brand/15" />
          <button type="submit" disabled={busy || !input.trim()} aria-label="Send" className="absolute right-2.5 bottom-3 h-9 w-9 rounded-xl bg-brand text-white flex items-center justify-center disabled:opacity-40"><ArrowUp className="h-5 w-5" /></button>
        </form>
        <p className="text-[11px] text-navy-3 mt-1.5 text-center">PeopleHub AI answers only from approved Petpooja documents. Check important decisions with HR.</p>
      </div>

    </div>
  );
}
