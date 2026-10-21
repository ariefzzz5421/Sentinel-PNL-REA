import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { WalletConnectControl } from "@/components/wallet-connect-control";

export function SiteHeader({ active = "" }: { active?: string }) {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link href="/" className="brand" aria-label="Sentinel PNL home">
          <Image src="/icon.svg" className="brand-logo" width={29} height={29} alt=""/>
          <span>
            SENTINEL<span className="brand-light">PNL</span>
          </span>
        </Link>
        <nav className="top-nav" aria-label="Main navigation">
          <Link
            className={active === "dashboard" ? "active" : ""}
            href="/dashboard"
          >
            Workspace
          </Link>
          <Link
            className={active === "method" ? "active" : ""}
            href="/methodology"
          >
            Methodology
          </Link>
        </nav>
        <div className="header-actions"><WalletConnectControl/><Link href="/dashboard" className="header-cta">Open workspace <ArrowUpRight size={16} /></Link></div>
      </div>
    </header>
  );
}
