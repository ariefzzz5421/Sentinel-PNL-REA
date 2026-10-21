"use client";
import dynamic from "next/dynamic";

const ActiveProfile = dynamic(() => import("./profile-active"), { ssr: false });
export function ProfileEntry() {
  return process.env.NEXT_PUBLIC_PRIVY_APP_ID
    ? <ActiveProfile/>
    : <main className="profile-page"><div className="profile-hero"><p className="profile-eyebrow">OPTIONAL WALLET PROFILE</p><h1>Connect your wallet profile</h1><p>Set NEXT_PUBLIC_PRIVY_APP_ID in your environment to enable Privy wallet connection. The scanner and local ledger work without it.</p></div></main>;
}
