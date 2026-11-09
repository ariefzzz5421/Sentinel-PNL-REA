"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

/** Session scoped: don't interrupt navigation or repeated NFT scans with an intro. */
const STORAGE_KEY = "sentinel-intro-seen-v2";
const INTRO_MS = 1430;
const OUTRO_MS = 520;

type SplashPhase = "enter" | "leave" | "hidden";

function markIntroSeen() {
  try { window.sessionStorage.setItem(STORAGE_KEY, "1"); }
  catch { /* Restricted storage must never block access to the website. */ }
}

export function SentinelSplash() {
  // Render intro in the initial HTML to avoid flashing the app before hydration.
  // Automatically exits after ~2 seconds; it has no manual Skip button.
  const [phase, setPhase] = useState<SplashPhase>("enter");

  useEffect(() => {
    let alreadySeen = false;
    try { alreadySeen = window.sessionStorage.getItem(STORAGE_KEY) === "1"; }
    catch { /* Private browsing may disable storage. */ }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (alreadySeen || reduceMotion) {
      // Schedule rather than synchronously setting React state in an effect.
      const immediate = window.setTimeout(() => setPhase("hidden"), 0);
      return () => window.clearTimeout(immediate);
    }

    const fade = window.setTimeout(() => setPhase("leave"), INTRO_MS);
    const finish = window.setTimeout(() => setPhase("hidden"), INTRO_MS + OUTRO_MS);
    return () => { window.clearTimeout(fade); window.clearTimeout(finish); };
  }, []);

  useEffect(() => {
    if (phase === "hidden") markIntroSeen();
  }, [phase]);

  if (phase === "hidden") return null;

  return (
    <div
      className={"sentinel-splash sentinel-splash--" + phase}
      aria-label="Sentinel opening animation"
      data-testid="sentinel-intro"
    >
      <div className="sentinel-splash__halo" aria-hidden="true" />
      <div className="sentinel-splash__grain" aria-hidden="true" />
      <div className="sentinel-splash__stage">
        <div className="sentinel-splash__orbit" aria-hidden="true">
          <span className="sentinel-splash__orbit-dot" />
        </div>
        <div className="sentinel-splash__emblem">
          <Image
            src="/sentinel-logo.svg"
            alt="Sentinel eye logo"
            width={174}
            height={174}
            priority
            unoptimized
          />
        </div>
        <span className="sentinel-splash__brand">SENTINEL</span>
        <span className="sentinel-splash__tagline">NFT INTELLIGENCE</span>
        <span className="sentinel-splash__scanline" aria-hidden="true" />
      </div>
    </div>
  );
}
