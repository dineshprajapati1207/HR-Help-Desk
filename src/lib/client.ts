// Anonymous per-browser id so employees see their own chat history without logging in.
export function clientId(): string {
  try {
    let id = localStorage.getItem("ph_client_id");
    if (!id) { id = crypto.randomUUID(); localStorage.setItem("ph_client_id", id); }
    return id;
  } catch { return "anonymous"; }
}
export const getDepartment = () => { try { return localStorage.getItem("ph_department") || null; } catch { return null; } };
export const setDepartment = (d: string) => { try { localStorage.setItem("ph_department", d); } catch { /* ignore */ } };
