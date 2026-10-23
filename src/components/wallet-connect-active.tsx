"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { usePrivy, useWallets } from "@privy-io/react-auth";

/** Navigate to the private-to-this-browser PnL dashboard after a NEW wallet login. */
export default function ActiveWalletConnect() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const router = useRouter();
  const pathname = usePathname();
  const previousAuth = useRef<boolean | null>(null);
  const address = wallets.find((wallet) => /^0x[a-f\d]{40}$/i.test(wallet.address))?.address;

  useEffect(() => {
    if (!ready) return;
    if (previousAuth.current === false && authenticated && pathname !== "/profile") {
      router.push("/profile");
    }
    previousAuth.current = authenticated;
  }, [ready, authenticated, pathname, router]);

  if (!ready) return <span className="wallet-setup-note">Wallet loading…</span>;
  if (!authenticated)
    return <button type="button" className="wallet-connect-button" onClick={login}>Connect Wallet</button>;
  return <div className="wallet-account-actions">
    <Link href="/profile" className="wallet-connect-button" title="Open your NFT PnL dashboard">
      {address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "My PnL"}
    </Link>
    <button type="button" className="wallet-signout" onClick={() => void logout()}>Disconnect</button>
  </div>;
}
