// Run with a local production server on 127.0.0.1:3002 and playwright-cli run-code --filename.
// eslint-disable-next-line @typescript-eslint/no-unused-expressions
async (page) => {
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("http://127.0.0.1:3002/");
    const metrics = await page.evaluate(() => ({
      viewport: innerWidth,
      document: document.documentElement.scrollWidth,
      scanVisible: !!document.querySelector(".scanner-submit")?.getBoundingClientRect().width,
    }));
    if (metrics.document > metrics.viewport || !metrics.scanVisible) throw new Error(`Layout failed at ${width}px: ${JSON.stringify(metrics)}`);
    await page.screenshot({ path: `docs/screenshots/sentinel-${width}.png` });
    console.log(`Scanner layout passed at ${width}px; document width ${metrics.document}px.`);
  }
}
