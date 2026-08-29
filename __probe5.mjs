import { chromium } from 'playwright';
const now = Date.now();
const job = {
  localId: "job-f", requestId: "req-f", modelId: "popcorn-auto", modelLabel: "Popcorn Auto",
  recipe: "teleport", stage: "still",
  input: { modelId: "popcorn-auto", prompt: "tokyo", imageUrls: [], aspectRatio: "9:16", batchSize: 1 },
  inputHash: "1", phase: "failed", images: [], warnings: [],
  error: { kind: "server_error", message: "Higgsfield said no.", correlationId: "abc", retryable: false },
  correlationId: "abc",
  createdAt: now - 60000, submittedAt: now - 59000, completedAt: now - 30000,
  pollAttempts: 3, nextPollAt: Number.MAX_SAFE_INTEGER, expectedCount: 1, etaSeconds: 10,
};
const payload = JSON.stringify({ order: ["job-f"], jobs: { "job-f": job } });
const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.addInitScript(() => {
  window.__t = [];
  const o = window.setTimeout;
  window.setTimeout = function (f, ms, ...r) { window.__t.push(ms); return o.call(window, f, ms, ...r); };
});
await page.goto('http://localhost:3000/studio', { waitUntil: 'domcontentloaded' });
await page.evaluate(p => localStorage.setItem('avatar-kit.jobs.v1', p), payload);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
console.log('header:', await page.getByRole('banner').innerText());
await page.getByRole('button', { name: 'Retry' }).first().evaluate(el => el.click());
await page.waitForTimeout(1500);
console.log('after retry, header:', await page.getByRole('banner').innerText());
console.log('after retry, card:', (await page.locator('section:has(h3)').first().innerText()).replace(/\n/g,' | '));
console.log('persisted phase:', JSON.parse(await page.evaluate(()=>localStorage.getItem('avatar-kit.jobs.v1'))).jobs['job-f'].phase,
            'nextPollAt:', JSON.parse(await page.evaluate(()=>localStorage.getItem('avatar-kit.jobs.v1'))).jobs['job-f'].nextPollAt);
await page.evaluate(()=>{ window.__t.length = 0; });
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
const t = await page.evaluate(()=>window.__t);
console.log('AFTER RELOAD: setTimeout calls in 3s =', t.length, '| overflowing =', t.filter(x=>x>2147483647).length);
console.log('card after reload:', (await page.locator('section:has(h3)').first().innerText()).replace(/\n/g,' | '));
await browser.close();
