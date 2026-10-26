import type { Metadata } from "next";
import { OrdnetAdminPanel } from "@/components/ordnet-admin-panel";

export const metadata: Metadata = {
  title: "ORD.NET Provider · Sentinel Admin",
  robots: { index: false, follow: false },
};

export default function OrdnetAdminPage() {
  return <OrdnetAdminPanel />;
}
