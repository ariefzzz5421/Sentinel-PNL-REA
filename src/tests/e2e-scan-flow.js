// Run locally with: npx -y --package=@playwright/cli playwright-cli -s=sentinel-local run-code --filename src/tests/e2e-scan-flow.js
// Uses a synthetic browser route response. Route -> provider mapping is tested separately in Vitest.
// eslint-disable-next-line @typescript-eslint/no-unused-expressions
async (page) => {
  const wallet = "0x000000000000000000000000000000000000dead";
  const common = { chain: "ethereum", wallet, collection: "Orbit", contract: "0x0000000000000000000000000000000000000001", tokenId: "7", feeEth: "0", feeKnown: false };
  const fixture = { events: [
    { ...common, id: "reservoir:ethereum:buy-1", date: "2026-01-01T00:00:00.000Z", type: "buy", amountEth: "1" },
    { ...common, id: "reservoir:ethereum:sale-1", date: "2026-03-01T00:00:00.000Z", type: "sell", amountEth: "1.5" },
  ], partial: false, warning: "Gas and other transaction fees are unavailable; PnL is an estimate." };
  await page.context().unroute("**/api/scan");
  await page.context().route("**/api/scan", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixture) }));
  await page.goto("http://127.0.0.1:3002/");
  await page.getByRole("textbox", { name: "Wallet addresses" }).fill("0x000000000000000000000000000000000000dEaD");
  await page.getByRole("button", { name: "Scan", exact: true }).click();
  await page.waitForURL("**/dashboard");
  await page.getByText("REALIZED PNL ESTIMATE").first().waitFor({ state: "visible" });
  const body = await page.locator("body").innerText();
  if (!body.includes("REALIZED PNL ESTIMATE") || !body.includes("0.5000 ETH") || !body.includes("Provider transaction fees are unavailable")) {
    throw new Error("Dashboard did not show the expected estimated PnL and fee warning.");
  }
  console.log("Synthetic browser Scan -> API response -> local ledger -> PnL dashboard passed.");
}
