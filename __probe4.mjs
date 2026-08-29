import { chromium } from 'playwright';
const now = Date.now();
const mk = (phase) => ({
  localId: "job-q", requestId: "req-q", modelId: "popcorn-auto", modelLabel: "Popcorn Auto",
  recipe: "teleport", stage: "still",
  input: { modelId: "popcorn-auto", prompt: "tokyo", imageUrls: [], aspectRatio: "9:16", batchSize: 1 },
  inputHash: "1", phase, images: [], warnings: [],
  createdAt: now - 5000, submittedAt: now - 4000,
  pollAttempts: 1, nextPollAt: Number.MAX_SAFE_INTEGER, expectedCount: 1, etaSeconds: 10,
});
const payload = JSON.stringify({ order: ["job-q"], jobs: { "job-q": mk("draft") } });

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.addInitScript(() => {
  window.__timeouts = [];
  const orig = window.setTimeout;
  window.setTimeout = function (fn, ms, ...rest) {
    window.__timeouts.push(ms);
    return orig.call(window, fn, ms, ...rest);
  };
});
await page.route('**/api/status/**', r => r.fulfill({ status: 200, contentType: 'application/json',
  body: JSON.stringify({ id: 'req-q', status: 'queued' }) }));
await page.goto('http://localhost:3000/studio', { waitUntil: 'domcontentloaded' });
await page.evaluate(p => localStorage.setItem('avatar-kit.jobs.v1', p), payload);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
const t = await page.evaluate(() => window.__timeouts);
const huge = t.filter(x => typeof x === 'number' && x > 2147483647);
console.log('total setTimeout calls in ~3s:', t.length);
console.log('calls with delay > 2^31-1:', huge.length, 'sample:', huge.slice(0,3));
console.log('distribution of last 20:', t.slice(-20));
await browser.close();
