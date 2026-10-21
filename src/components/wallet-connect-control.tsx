"use client";
import dynamic from "next/dynamic";

const ActiveWalletConnect = dynamic(() => import("./wallet-connect-active"), { ssr: false });
export function WalletConnectControl() {
  return process.env.NEXT_PUBLIC_PRIVY_APP_ID
    ? <ActiveWalletConnect/>
    : <span className="wallet-setup-note" title="Set NEXT_PUBLIC_PRIVY_APP_ID to enable optional wallet connection">Wallet connect setup pending</span>;
}
