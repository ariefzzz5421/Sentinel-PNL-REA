import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Sentinel opening splash - premium and non-blocking", () => {
  it("uses the existing official Sentinel image and mounts as a sibling of the original provider", () => {
    const layout = read("src/app/layout.tsx");
    const splash = read("src/components/sentinel-splash.tsx");
    const svg = read("public/sentinel-logo.svg");
    expect(svg).toContain("Sentinel eye emblem");
    expect(splash).toContain('src="/sentinel-logo.svg"');
    expect(splash).toContain("priority");
    expect(layout).toContain("import { SentinelSplash }");
    expect(layout).toContain("<SentinelSplash/>");
    expect(layout).toContain("<OptionalPrivyProvider appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID}>{children}</OptionalPrivyProvider>");
    expect(layout.indexOf("<SentinelSplash/>")).toBeLessThan(layout.indexOf("<OptionalPrivyProvider"));
  });

  it("only shows the intro once per browser tab and always exits within 1.7s", () => {
    const splash = read("src/components/sentinel-splash.tsx");
    expect(splash).toContain('sentinel-intro-seen-v1');
    expect(splash).toContain("window.sessionStorage.getItem(STORAGE_KEY)");
    expect(splash).toContain('window.sessionStorage.setItem(STORAGE_KEY, "1")');
    expect(splash).toContain("const INTRO_MS = 1260");
    expect(splash).toContain("const OUTRO_MS = 440");
    expect(splash).toContain('setPhase("leave")');
    expect(splash).toContain('setPhase("hidden")');
    expect(splash).toContain("window.clearTimeout(fade)");
    expect(splash).toContain("window.clearTimeout(finish)");
    expect(splash).toContain('if (phase === "hidden") return null');
  });

  it("has accessible skip control and respects reduced motion", () => {
    const splash = read("src/components/sentinel-splash.tsx");
    const css = read("src/app/globals.css");
    expect(splash).toContain('aria-label="Skip Sentinel introduction"');
    expect(splash).toContain("prefers-reduced-motion: reduce");
    expect(splash).toContain("onClick={() => { markIntroSeen(); setPhase(\"hidden\"); }}");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain(".sentinel-splash__skip:focus-visible");
    expect(css).toContain(".sentinel-splash--leave");
    expect(css).toContain("pointer-events: none;");
  });

  it("keeps all motion to CSS transforms, opacity and simple blur, without external video assets", () => {
    const splash = read("src/components/sentinel-splash.tsx");
    const css = read("src/app/globals.css");
    expect(css).toContain("@keyframes sentinel-intro-orbit");
    expect(css).toContain("@keyframes sentinel-intro-emblem");
    expect(css).toContain("@keyframes sentinel-intro-caption");
    expect(css).toContain("@keyframes sentinel-intro-halo");
    expect(splash).not.toContain("<video");
    expect(splash).not.toContain("<audio");
    expect(splash).not.toContain("fetch(");
    expect(splash).not.toContain("localStorage");
  });
});
