import { chromium } from 'playwright';

const now = Date.now();
const job = {
  localId: "job-1",
  requestId: "req-1",
  modelId: "soul",
  modelLabel: "Soul Reference",
  recipe: "teleport",
  stage: "still",
  input: { modelId: "soul", prompt: "tokyo at night", imageUrls: [], aspectRatio: "9:16", batchSize: 2 },
  inputHash: "1",
  phase: "completed",
  images: ["https://placehold.co/540x960/png", "https://placehold.co/540x960/png"],
  warnings: [],
  createdAt: now - 60000,
  submittedAt: now - 59000,
  completedAt: now - 30000,
  expiresAt: now + 7*24*3600*1000,
  pollAttempts: 3,
  nextPollAt: Number.MAX_SAFE_INTEGER,
  expectedCount: 2,
  etaSeconds: 10,
  estimate: { credits: 1.5, usd: 0.094, raw: { credits: "", usd: "" } },
};
const payload = JSON.stringify({ order: ["job-1"], jobs: { "job-1": job } });

const run = async (colorScheme, locale, tz) => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ colorScheme, locale, timezoneId: tz });
  const page = await ctx.newPage();
  const msgs = [];
  page.on('console', m => msgs.push(`[console.${m.type()}] ${m.text()}`));
  page.on('pageerror', e => msgs.push(`[pageerror] ${e.message}\n${e.stack||''}`));
  await page.goto('http://localhost:3000/studio', { waitUntil: 'domcontentloaded' });
  await page.evaluate(p => localStorage.setItem('avatar-kit.jobs.v1', p), payload);
  msgs.length = 0;
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  console.log('\n===== seeded /studio scheme=' + colorScheme + ' locale=' + locale + ' tz=' + tz + ' =====');
  for (const m of msgs) console.log(m.slice(0, 4000));
  const expiry = await page.locator('figcaption').allTextContents();
  console.log('expiry badges:', JSON.stringify(expiry));
  const stored = await page.evaluate(() => localStorage.getItem('avatar-kit.jobs.v1'));
  console.log('stored after load, order:', JSON.parse(stored||'{}').order);
  await browser.close();
};

await run('light', 'de-DE', 'Europe/Berlin');
await run('dark', 'en-US', 'America/New_York');
