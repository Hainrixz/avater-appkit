import { chromium } from 'playwright';

const run = async (url, colorScheme, locale, tz) => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ colorScheme, locale, timezoneId: tz });
  const page = await ctx.newPage();
  const msgs = [];
  page.on('console', m => msgs.push(`[console.${m.type()}] ${m.text()}`));
  page.on('pageerror', e => msgs.push(`[pageerror] ${e.message}`));
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  } catch (e) { msgs.push('[goto] ' + e.message); }
  await page.waitForTimeout(2500);
  console.log('\n===== ' + url + ' scheme=' + colorScheme + ' locale=' + locale + ' tz=' + tz + ' =====');
  for (const m of msgs) console.log(m.slice(0, 3000));
  await browser.close();
};

const base = process.argv[2] || 'http://localhost:3000';
await run(base + '/', 'light', 'de-DE', 'Europe/Berlin');
await run(base + '/studio', 'light', 'de-DE', 'Europe/Berlin');
await run(base + '/studio', 'dark', 'en-US', 'America/New_York');
