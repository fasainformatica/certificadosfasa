import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { requireInternalUser } from "@/lib/auth/rbac";

export default async function InternalLayout({ children }: { children: ReactNode }) {
  const user = await requireInternalUser();

  return <AppShell user={user}>{children}</AppShell>;
}
