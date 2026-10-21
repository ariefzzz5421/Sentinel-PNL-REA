import Link from "next/link";
import { Activity, ArrowUpRight } from "lucide-react";

export function SiteHeader({ active = "" }: { active?: string }) {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link href="/" className="brand" aria-label="Sentinel PNL home">
          <span className="brand-mark">
            <Activity size={19} strokeWidth={2.8} />
          </span>
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
        <Link href="/dashboard" className="header-cta">
          Open workspace <ArrowUpRight size={16} />
        </Link>
      </div>
    </header>
  );
}
