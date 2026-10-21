import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { OptionalPrivyProvider } from "@/components/privy-provider";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });
export const metadata: Metadata = {
  title: "Sentinel PNL — Track Every Move. Know Your Edge.",
  description:
    "Private-first NFT trading PnL workspace with transparent cost basis and optional live data providers.",
  icons: { icon: "/icon.svg" },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body className={`${geist.variable} ${mono.variable}`}><OptionalPrivyProvider appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID}>{children}</OptionalPrivyProvider></body>
    </html>
  );
}
