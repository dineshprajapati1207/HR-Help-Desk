import { useEffect, useState } from "react";
import { adminApi, adminPass } from "./api";
import { configured } from "./supabase";

/** True only for an administrator who has signed in with the admin passcode on this device.
 *  Employees never have the passcode, so they never see any Admin button or tile. */
export function useAdminAccess() {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    if (!configured || !adminPass.get()) { setOk(false); return; }
    let live = true;
    adminApi("ping").then(() => live && setOk(true)).catch(() => live && setOk(false));
    return () => { live = false; };
  }, []);
  return ok;
}
