import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
export const configured = Boolean(url && anon);
// Anon key only: base tables are locked by RLS; the browser can read published views and call Edge Functions.
export const supabase = createClient(url || "http://localhost", anon || "missing", { auth: { persistSession: false } });
