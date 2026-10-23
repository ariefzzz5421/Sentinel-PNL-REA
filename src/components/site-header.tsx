import Link from "next/link";
import Image from "next/image";
import { WalletConnectControl } from "@/components/wallet-connect-control";

export function SiteHeader({ active = "" }: { active?: string }) {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link href="/" className="brand" aria-label="Sentinel PNL home">
          <Image src="/sentinel-logo.svg" className="brand-logo" width={36} height={38} alt="Sentinel logo"/>
          <span>
            SENTINEL<span className="brand-light">PNL</span>
          </span>
        </Link>
        <nav className="top-nav" aria-label="Main navigation">
          <Link
            className={active === "dashboard" ? "active" : ""}
            href="/profile"
          >
            My PnL
          </Link>
          <Link
            className={active === "method" ? "active" : ""}
            href="/methodology"
          >
            Methodology
          </Link>
        </nav>
        <div className="header-actions"><WalletConnectControl/></div>
      </div>
    </header>
  );
}
