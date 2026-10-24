import type { Metadata } from "next";
import { Space_Grotesk, IBM_Plex_Mono, Inter, Oswald, Orbitron } from "next/font/google";
import "./globals.css";
import { OptionalPrivyProvider } from "@/components/privy-provider";

const space = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const plex = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-plex", display: "swap" });
const oswald = Oswald({ subsets: ["latin"], variable: "--font-oswald", display: "swap" });
const orbitron = Orbitron({ subsets: ["latin"], variable: "--font-orbitron", display: "swap" });
export const metadata: Metadata = {
  title: "Sentinel PNL — Track Every Move. Know Your Edge.",
  description:
    "Private-first NFT trading PnL workspace with transparent cost basis and optional live data providers.",
  icons: { icon: "/sentinel-logo.svg", apple: "/sentinel-logo.svg" },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <head>
        <link rel="preconnect" href="https://api.fontshare.com"/>
        <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f%5B%5D=satoshi%40400%2C500%2C600%2C700&display=swap"/>
      </head>
      <body className={`${space.variable} ${inter.variable} ${plex.variable} ${oswald.variable} ${orbitron.variable}`}><OptionalPrivyProvider appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID}>{children}</OptionalPrivyProvider></body>
    </html>
  );
}
