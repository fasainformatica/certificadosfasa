import type { UserRole } from "@/lib/supabase/database.types";

export type ManagedInternalUser = {
  id: string;
  email: string;
  role: UserRole;
  active: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  lastSignInAt: string | null;
  emailConfirmedAt: string | null;
};
