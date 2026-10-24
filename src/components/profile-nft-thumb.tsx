"use client";
import { useState } from "react";
import Image from "next/image";
import { Images } from "lucide-react";

/** Display only real provider-supplied public artwork, never a fabricated collection image. */
export function ProfileNftThumb({ src, name }: { src: string | null | undefined; name: string }) {
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  let valid: string | null = null;
  if (src && src.length < 1800) {
    try { const url = new URL(src); if (url.protocol === "https:") valid = url.toString(); }
    catch { /* Malformed provider image: show honest fallback. */ }
  }
  return <span className="personal-nft-thumb" aria-label={valid && brokenSrc !== valid ? name + " NFT artwork" : name + " artwork unavailable"}>
    {valid && brokenSrc !== valid
      ? <Image src={valid} width={52} height={52} alt={name + " NFT"} loading="lazy" unoptimized onError={() => setBrokenSrc(valid)} />
      : <Images size={22} aria-hidden="true"/>}
  </span>;
}
