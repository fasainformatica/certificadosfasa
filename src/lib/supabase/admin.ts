import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";
import { getSupabasePublicEnv, getSupabaseServiceRoleKey } from "./env";

export function createSupabaseAdminClient() {
  const { url } = getSupabasePublicEnv();

  return createClient<Database>(url, getSupabaseServiceRoleKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
