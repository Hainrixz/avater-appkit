# Avatar App Kit

![Avatar App Kit](.github/banner.jpg)

**Put yourself anywhere.** A local, open-source studio for the [Higgsfield API](https://docs.higgsfield.ai/docs) — drop a photo, get yourself in another city, in a jacket you don't own, or standing next to someone three time zones away.

You bring your own API key. Nothing is hardcoded, nothing is stored, and it runs on your machine.

```bash
git clone https://github.com/Hainrixz/avater-appkit
cd avater-appkit
npm install
npm run dev
```

Open <http://localhost:3000>, paste your key from [cloud.higgsfield.ai](https://cloud.higgsfield.ai), and go. Checking the key costs nothing.

---

## What it does

| Recipe | You give it | You get |
|---|---|---|
| **Teleport** | one photo + a place ("Tokyo at night") | 1 or 4 vertical stills of you there |
| **Try-on** | your photo + a garment photo | you wearing it — still first, video after |
| **Duo** | your photo + someone else's | the two of you in one frame |

Everything is a two-stage pipeline: **make a still, approve it, then optionally spend on the video.** That ordering is deliberate — a still costs about $0.09 and a video about $0.35, so you find out whether the idea works at a quarter of the price.

## Why bring your own key

No key ships in this repo. When you paste yours it goes into an httpOnly cookie for your browser and travels only to your own `localhost` server, which forwards it to Higgsfield. It is never in the client bundle, never in a commit, and never sent anywhere else. (Higgsfield's own docs forbid calling their API straight from browser code, which is why the proxy exists.)

That also means you can hand this repo to anyone. They bring their own key and spend their own credits.

## The parts worth stealing

This is a starter kit, so the interesting bits are the ones that took measurement rather than typing:

- **Teleport uses `popcorn/auto`, not `soul/reference`.** This one cost real money to learn. `soul/reference` reproduces the *reference photo's whole composition* — background included — while transferring identity, so a studio portrait plus "Tokyo at night" returns a studio portrait. It is not a prompt problem: two rewrites, with and without `enhance_prompt`, failed identically. `popcorn/auto` composes the subject into a genuinely new scene, and it's what the demo images in `public/demo/` were made with. `soul/reference` stays in the model switcher labelled *(restyle)*, which is what it's actually good at.
- **It probes what your key can actually run.** Model access is per-account: on the key this was built against, 11 of 15 catalogued models worked and the rest returned `model_not_found`, `model_blocked` or `model_disabled`. So the app asks `/estimate` for each model at startup — that endpoint is free — and shows real prices next to real availability. Models you can't run stay visible, greyed out, with the reason.
- **The model switcher genuinely switches.** The API's request bodies are not uniform: `duration` is an integer `5|10` on Kling, `6|10` on Hailuo, and a *string* `"4"|"6"|"8"` on Veo; some models take `aspect_ratio` and `resolution`, others have no such field. Each catalogue entry owns a `buildBody()` that snaps unsupported values to the nearest legal one and drops fields the model doesn't have — and the UI tells you what it changed ("Hailuo doesn't do 5s clips — using 6s") instead of coercing silently. `npm run check:models` is the contract test for that.
- **Every generation shows its price first.** There is no balance endpoint, so an out-of-credits error is only discoverable at submit time. The free `/estimate` call is the only thing standing between you and a surprise.
- **Failures are honest.** `nsfw` is a distinct terminal state that Higgsfield refunds automatically, so it renders in neutral grey and leads with "you weren't charged" — not a red error. Running out of concurrent slots arrives as a `400` (there is no `429` in this API), so it's detected by message and shown as "queued", not "invalid request".
- **Results expire in about 7 days.** Every result carries an expiry badge and a download button that routes through `/api/download` — a cross-origin `<a download>` is ignored by every browser and would just open a tab.

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind v4 · shadcn/ui · zero API SDKs (a ~150-line typed `fetch` client instead).

```
app/api/*        route handlers — the key never leaves the server
lib/provider/    the swappable seam: swap Higgsfield for another API here
lib/client/      ~150-line store + a single-timer poller
components/      hero, studio, upload, results
tests/models.ts  the buildBody contract test
```

### Swapping the API

`lib/provider/provider.ts` defines a small `Provider` interface — upload, estimate, submit, poll, cancel, probe. `lib/provider/higgsfield/` implements it. To point this at a different generation API, write one more implementation and register it in `lib/provider/index.ts`. Everything above that seam — recipes, UI, polling, pricing display — is provider-agnostic.

## Three things that will bite you

All three cost real time or real money, so they're written down:

1. **A model that lists an image input does not necessarily relocate the subject.** See the Teleport note above — check what a model actually does before wiring a feature to it, because the endpoint name won't tell you.
2. **Cloudflare blocks requests without a browser-like `User-Agent`.** Not documented anywhere. Every endpoint returns `403 error code: 1010` from a plain HTTP client, and the identical request with a UA header returns `200`. It looks exactly like a credentials problem and isn't. The header is set in one place, `lib/provider/higgsfield/client.ts`.
3. **The published OpenAPI is not always right.** It declares `soul/standard` resolutions as `["2K","4K"]`; the live API rejects that and demands `['720p','1080p']`. Verify against the API, not the spec. This is also why the model catalogue is hand-written rather than generated.

## Scripts

```bash
npm run dev           # localhost:3000
npm run build         # production build
npm run typecheck     # tsc --noEmit
npm run lint          # eslint
npm run check:models  # the buildBody contract test — no network, no credits
npm run banner        # re-shoot .github/banner.jpg from the running app
```

## Making it yours

- **Colours and type** live in the `@theme` block at the top of `app/globals.css`. Everything reads from there; no component hardcodes a hex.
- **Recipes** are data. `lib/recipes.ts` declares the slots, prompts and models — add a third photo slot and the dropzone follows without a component change.
- **Demo images** in `public/demo/` are real output from this app, not mockups. Swap them for your own and the hero and comparison slider update.
- **More components**: this uses [21st.dev](https://21st.dev). With your own key in `.env.local`, `npx shadcn@latest add "https://21st.dev/r/<author>/<slug>?api_key=$API_KEY_21ST"`.

## Licence

MIT — see [LICENSE](./LICENSE). The Satoshi and General Sans fonts in `app/fonts/` are under the ITF Free Font License; if you ship this commercially you inherit that, so keep [app/fonts/LICENSE.md](./app/fonts/LICENSE.md).

Not affiliated with Higgsfield. Built with [Claude Code](https://claude.com/claude-code).
