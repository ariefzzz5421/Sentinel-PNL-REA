// Run against a local production server on 127.0.0.1:3002 with playwright-cli run-code --filename.
// ENS response is mocked here; the live server resolver is tested separately.
// eslint-disable-next-line @typescript-eslint/no-unused-expressions
async (page) => {
  await page.context().unroute("**/api/scan");
  await page.context().route("**/api/resolve-ens", (route) => {
    const request = route.request().postDataJSON();
    if (request.names[0] !== "alice.eth") throw new Error("ENS input not sent to resolver.");
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ resolved: [{ name: "alice.eth", address: "0x000000000000000000000000000000000000dEaD", record: "ethereum" }] }) });
  });
  await page.goto("http://127.0.0.1:3002/");
  await page.getByRole("textbox", { name: "Wallet addresses or ENS names" }).fill("alice.eth");
  await page.getByRole("button", { name: "Scan", exact: true }).click();
  await page.locator(".scanner-message.error").waitFor();
  const message = await page.locator(".scanner-message").innerText();
  if (!message.includes("Live scanning is not configured")) throw new Error(`Unexpected scan outcome: ${message}`);
  console.log("ENS name -> address -> scan route -> honest unconfigured error passed.");
}
