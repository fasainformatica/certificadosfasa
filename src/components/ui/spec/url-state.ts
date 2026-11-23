"use client";

import { useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  window.addEventListener("popstate", callback);
  return () => window.removeEventListener("popstate", callback);
}

export function useQueryString() {
  return useSyncExternalStore(subscribe, () => window.location.search, () => "");
}

export function queryHref(query: string, name: string, value: string): string {
  const params = new URLSearchParams(query);
  if (value) params.set(name, value);
  else params.delete(name);
  params.delete("page");
  const result = params.toString();
  return result ? `?${result}` : "?";
}
