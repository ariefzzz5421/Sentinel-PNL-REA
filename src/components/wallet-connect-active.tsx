"use client";
import Link from "next/link";
import { usePrivy, useWallets } from "@privy-io/react-auth";

export default function ActiveWalletConnect() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const address = wallets.find((wallet) => /^0x[a-f\d]{40}$/i.test(wallet.address))?.address;
  if (!ready) return <span className="wallet-setup-note">Wallet loading…</span>;
  if (!authenticated) return <button type="button" className="wallet-connect-button" onClick={login}>Connect wallet</button>;
  return <div className="wallet-account-actions">
    <Link href="/profile" className="wallet-connect-button">{address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "My profile"}</Link>
    <button type="button" className="wallet-signout" onClick={() => void logout()}>Disconnect</button>
  </div>;
}
