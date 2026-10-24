// Run with a local production server on 127.0.0.1:3002 and playwright-cli run-code --filename.
// eslint-disable-next-line @typescript-eslint/no-unused-expressions
async (page) => {
  for (const width of [1440, 1024, 768, 430, 390, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("http://127.0.0.1:3002/");
    const metrics = await page.evaluate(() => ({
      viewport: innerWidth,
      document: document.documentElement.scrollWidth,
      scanVisible: !!document.querySelector(".scanner-submit")?.getBoundingClientRect().width,
    }));
    if (metrics.document > metrics.viewport || !metrics.scanVisible) throw new Error(`Layout failed at ${width}px: ${JSON.stringify(metrics)}`);
    const tapeLabel = await page.getByText("MARKET", { exact: true }).count();
    if (tapeLabel !== 0) throw new Error("Market tape should not have a leading MARKET label.");
    await page.screenshot({ path: `docs/screenshots/sentinel-${width}.png` });
    console.log(`Scanner layout passed at ${width}px; document width ${metrics.document}px.`);
  }
}
