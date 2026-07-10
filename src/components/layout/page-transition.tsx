import type { ReactNode } from "react";

export function PageTransition({ children }: { children: ReactNode }) {
  return <div className="fasa-page-enter motion-reduce:animate-none">{children}</div>;
}
