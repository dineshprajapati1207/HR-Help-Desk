// No external AI service and no API key.
// Embeddings use Supabase's built-in gte-small model (384 dimensions), which runs inside the Edge Function runtime.
declare const Supabase: { ai: { Session: new (model: string) => { run: (input: string, opts: Record<string, unknown>) => Promise<ArrayLike<number>> } } };

export const EMB_MODEL = "gte-small";
let session: InstanceType<typeof Supabase.ai.Session> | null = null;

export async function embed(texts: string[]): Promise<number[][]> {
  session ??= new Supabase.ai.Session(EMB_MODEL);
  const out: number[][] = [];
  for (const t of texts) {
    const v = await session.run(t.replace(/\s+/g, " ").slice(0, 1500), { mean_pool: true, normalize: true });
    out.push(Array.from(v));
  }
  return out;
}

export const toVector = (v: number[]) => `[${v.join(",")}]`;
