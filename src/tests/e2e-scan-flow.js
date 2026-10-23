// Run locally with a production server at 127.0.0.1:3002 and Playwright CLI.
// Synthetic data verifies the interaction, NOT real OpenSea price accuracy.
// eslint-disable-next-line @typescript-eslint/no-unused-expressions
async (page) => {
  const wallet = "0x000000000000000000000000000000000000dead";
  const common = { chain: "ethereum", wallet, collection: "Orbit", contract: "0x0000000000000000000000000000000000000001", tokenId: "7", feeEth: "0", feeKnown: false };
  const events = [
    { ...common, id: "opensea:buy-1", date: "2026-01-01T00:00:00.000Z", type: "buy", amountEth: "1" },
    { ...common, id: "opensea:sell-1", date: "2026-03-01T00:00:00.000Z", type: "sell", amountEth: "1.5" },
  ];
  await page.context().route("**/api/scan", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ events, partial: true, warning: "Historical fees unavailable." }),
  }));
  await page.context().route("**/api/opensea/holdings?**", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ holdings: [], partial: false }),
  }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://127.0.0.1:3002/");
  await page.getByRole("textbox", { name: "Wallet addresses or ENS names" }).fill(wallet);
  await page.getByRole("button", { name: "Scan", exact: true }).click();
  await page.getByRole("button", { name: "Open Orbit PnL details and sharing" }).waitFor();
  const body = await page.locator("body").innerText();
  if (!body.includes("0.5000") || !body.includes("HOLD") || !body.includes("Recent")) {
    throw new Error("Inline result card missing correct synthetic matched sale.");
  }
  if (await page.locator(".scan-results-warning").count()) throw new Error("Large red alert should be removed.");
  await page.getByRole("button", { name: "Open Orbit PnL details and sharing" }).click();
  await page.getByRole("dialog", { name: "Orbit NFT PnL" }).waitFor();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Simple", exact: true }).click();
  await page.getByRole("button", { name: "Complete", exact: true }).click();
  await page.getByPlaceholder("@alias").fill("myNFT");
  await page.getByRole("button", { name: "Download PNG" }).click();
  const file = await download;
  if (!file.suggestedFilename().endsWith(".png")) throw new Error("Share card did not export PNG.");
  await page.getByRole("button", { name: "Close details" }).click();
  const sizes = await page.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth }));
  if (sizes.document > sizes.width) throw new Error("Horizontal overflow on narrow mobile.");
  console.log("Synthetic mobile scan → collection card → detail modal → PNG export passed.");
}
