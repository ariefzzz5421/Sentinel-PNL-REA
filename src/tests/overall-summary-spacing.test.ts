import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Overall PnL summary mobile spacing and clean audit panel", () => {
  it("keeps the share action with balanced icons and a comfortable tap target", () => {
    const view = read("src/components/wallet-overall-card.tsx");
    const css = read("src/app/globals.css");
    expect(view).toContain('className="wallet-overall-action-label"');
    expect(view).toContain("<span>Overall PnL Card</span>");
    expect(view).toContain("<ExternalLink size={17}");
    expect(css).toContain(".wallet-overall-action-label {");
    expect(css).toContain("min-height: 58px;");
    expect(css).toContain("min-height: 56px;");
    expect(css).toContain("padding: 13px 17px;");
  });

  it("removes only the visible explanatory audit paragraph, keeping verified figures and diagnostics", () => {
    const view = read("src/components/wallet-overall-card.tsx");
    const audit = view.slice(
      view.indexOf('<details className="wallet-overall-audit"'),
      view.indexOf("</details>") + "</details>".length,
    );
    expect(audit).toContain("<summary>Verify PnL calculation</summary>");
    expect(audit).toContain("summary.grossProfitsEth");
    expect(audit).toContain("summary.grossLossesEth");
    expect(audit).toContain("summary.realizedEth");
    expect(audit).toContain("summary.matchedSales");
    expect(audit).toContain("summary.unknownBasisSales");
    expect(audit).toContain("summary.netReconciled");
    expect(audit).not.toContain("<small>");
    expect(audit).not.toContain("USD conversions use current spot, not historical FX.</small>");
  });
});
