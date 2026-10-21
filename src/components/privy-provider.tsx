"use client";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";

const ActivePrivyProvider = dynamic(() => import("./privy-provider-active"), { ssr: false });
export function OptionalPrivyProvider({ children, appId }: { children: ReactNode; appId?: string }) {
  return appId ? <ActivePrivyProvider appId={appId}>{children}</ActivePrivyProvider> : children;
}
