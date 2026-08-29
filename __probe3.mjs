import { chromium } from 'playwright';
const now = Date.now();
const job = {
  localId: "job-f", requestId: "req-f", modelId: "popcorn-auto", modelLabel: "Popcorn Auto",
  recipe: "teleport", stage: "still",
  input: { modelId: "popcorn-auto", prompt: "tokyo", imageUrls: [], aspectRatio: "9:16", batchSize: 2 },
  inputHash: "1", phase: "failed", images: [], warnings: [],
  error: { kind: "server_error", message: "Higgsfield said no.", correlationId: "abc-123", retryable: false },
  correlationId: "abc-123",
  createdAt: now - 60000, submittedAt: now - 59000, completedAt: now - 30000,
  pollAttempts: 3, nextPollAt: Number.MAX_SAFE_INTEGER, expectedCount: 2, etaSeconds: 10,
};
const payload = JSON.stringify({ order: ["job-f"], jobs: { "job-f": job } });

const run = async (colorScheme) => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ colorScheme });
  const page = await ctx.newPage();
  const msgs = [];
  page.on('console', m => msgs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', e => msgs.push(`[pageerror] ${e.message}`));
  await page.goto('http://localhost:3000/studio', { waitUntil: 'domcontentloaded' });
  await page.evaluate(p => localStorage.setItem('avatar-kit.jobs.v1', p), payload);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  console.log('\n===== scheme=' + colorScheme + ' =====');
  console.log('before retry, card text:', (await page.locator('section:has(h3)').first().innerText()).replace(/\n/g,' | '));
  const retry = page.getByRole('button', { name: 'Retry' }).first();
  await retry.evaluate(el => el.click());
  await page.waitForTimeout(1200);
  const toaster = await page.locator('[data-sonner-toaster]').first();
  console.log('toaster count:', await page.locator('[data-sonner-toaster]').count());
  if (await page.locator('[data-sonner-toaster]').count()) {
    console.log('data-sonner-theme =', await toaster.getAttribute('data-sonner-theme'));
    const t = page.locator('[data-sonner-toast]').first();
    console.log('toast bg =', await t.evaluate(el => getComputedStyle(el).backgroundColor + ' / color ' + getComputedStyle(el).color));
  }
  console.log('after retry, card text:', (await page.locator('section:has(h3)').first().innerText()).replace(/\n/g,' | '));
  await page.waitForTimeout(4000);
  console.log('after 5s, card text:', (await page.locator('section:has(h3)').first().innerText()).replace(/\n/g,' | '));
  console.log('console:', msgs.filter(m=>!m.includes('DevTools')&&!m.includes('HMR')).join(' || '));
  await browser.close();
};
await run('light');
await run('dark');
