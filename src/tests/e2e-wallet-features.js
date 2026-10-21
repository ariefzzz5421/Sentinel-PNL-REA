// Run against a local production server on 127.0.0.1:3002 with playwright-cli run-code --filename.
// eslint-disable-next-line @typescript-eslint/no-unused-expressions
async (page) => {
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("http://127.0.0.1:3002/");
    const robinhood = page.getByRole("button", { name: /Robinhood Chain/ });
    const arc = page.getByRole("button", { name: /Arc soon/ });
    if (!(await robinhood.count()) || !(await arc.count())) throw new Error("New chain choices missing.");
    await robinhood.click();
    await page.getByRole("textbox", { name: "Wallet addresses or ENS names" }).fill("0x000000000000000000000000000000000000dEaD");
    await page.getByRole("button", { name: "Scan", exact: true }).click();
    if (!(await page.locator(".scanner-message").innerText()).includes("not connected yet")) throw new Error("Unavailable chain was not disclosed.");
    await arc.click();
    await page.getByRole("button", { name: "Scan", exact: true }).click();
    if (!(await page.locator(".scanner-message").innerText()).includes("Arc network is configured")) throw new Error("Arc status missing.");
    await page.goto("http://127.0.0.1:3002/profile");
    if (!(await page.locator("body").innerText()).includes("NEXT_PUBLIC_PRIVY_APP_ID")) throw new Error("Missing Privy setup state.");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    if (overflow) throw new Error(`Profile overflows at ${width}px.`);
    console.log(`Chain and profile states passed at ${width}px.`);
  }
}
