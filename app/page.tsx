import Link from "next/link";
import { ArrowRight, KeyRound, Shield, Sparkles, Wand2 } from "lucide-react";
import { BeforeAfterSlider } from "@/components/hero/BeforeAfterSlider";

/** lucide-react v1 ya no trae marcas de terceros, así que el octocat va inline. */
function GithubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={className} fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

/**
 * EL HERO — "el relevo".
 *
 * No es un vídeo a sangre de fondo: eso es el patrón genérico y además desperdicia la
 * proporción que el propio producto genera. El marco es 9:16, exactamente la forma que
 * sale de la app, colocado a la derecha. La columna izquierda es editorial.
 *
 * Las tres identidades —Higgsfield, Claude y el kit— viven en una sola tira de una
 * línea abajo del todo. Justamente por eso se lee caro: las marcas seguras ponen la
 * atribución en una nota al pie, no en el titular.
 *
 * La entrada es CSS puro con animation-delay escalonado, no JS: esto corre durante la
 * carga inicial, que es cuando el hilo principal está más ocupado.
 */

const STEPS = [
  { n: "01", t: "Paste your key", d: "From cloud.higgsfield.ai. Checking it is free." },
  { n: "02", t: "Drop a photo", d: "Yours, an outfit, or you and someone else." },
  { n: "03", t: "Generate", d: "See the exact price before you spend a credit." },
];

const RECIPES = [
  {
    icon: Sparkles,
    title: "Teleport",
    body: "One photo of you plus a place. Tokyo at night, a Lisbon staircase, a snowfield. Four takes at a time, vertical.",
  },
  {
    icon: Wand2,
    title: "Try-on",
    body: "Your photo plus a garment. Get the still first, approve it, and only then spend on the video.",
  },
  {
    icon: KeyRound,
    title: "Duo",
    body: "You and your partner, in one frame, in one place. Two photos in, one result out.",
  },
];

export default function HomePage() {
  return (
    <div data-surface="atmos" className="min-h-dvh">
      {/* ---------------- hero ---------------- */}
      <section className="mx-auto grid max-w-[1200px] items-center gap-12 px-6 pb-20 pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:pt-24">
        <div className="flex flex-col items-start">
          <p
            className="text-micro font-medium uppercase text-ink-muted"
            data-motion="travel"
            style={{ animation: "rise var(--dur-hero) var(--ease-out) 0ms both" }}
          >
            Higgsfield API · Built with Claude
          </p>

          <h1 className="mt-4 font-display text-hero text-ink">
            <span
              className="block"
              data-motion="travel"
              style={{ animation: "rise var(--dur-hero) var(--ease-out) 60ms both" }}
            >
              Put yourself
            </span>
            <span
              className="block"
              data-motion="travel"
              style={{ animation: "rise var(--dur-hero) var(--ease-out) 120ms both" }}
            >
              anywhere.
            </span>
            <span
              className="mt-2 block font-display text-[clamp(1.25rem,2.4vw,2rem)] font-medium leading-tight tracking-[-0.02em] text-ink-muted"
              data-motion="travel"
              style={{ animation: "rise var(--dur-hero) var(--ease-out) 180ms both" }}
            >
              Your face. Their models. Your key.
            </span>
          </h1>

          <p
            className="mt-6 max-w-[46ch] text-[17px] leading-relaxed text-ink-muted"
            data-motion="travel"
            style={{ animation: "rise var(--dur-hero) var(--ease-out) 240ms both" }}
          >
            An open-source studio for Higgsfield&apos;s image and video models. Paste your
            own key, drop a photo, and get yourself in another city, in a jacket you
            don&apos;t own, or standing next to someone three time zones away. It runs on
            your machine and stores nothing.
          </p>

          <div
            className="mt-8 flex flex-wrap items-center gap-3"
            data-motion="travel"
            style={{ animation: "rise var(--dur-hero) var(--ease-out) 300ms both" }}
          >
            <Link
              href="/studio"
              className="inline-flex h-12 items-center gap-2 rounded-md bg-rose px-6 text-[15px] font-semibold text-white shadow-[var(--shadow-cta)] transition-colors hover:bg-rose-hover"
            >
              Open the studio
              <ArrowRight className="size-4" />
            </Link>
            <a
              href="https://github.com/Hainrixz/avater-appkit"
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex h-12 items-center gap-2 rounded-md border border-hairline px-5 text-[15px] text-ink transition-colors hover:border-edge"
            >
              <GithubMark className="size-4" />
              Clone it
            </a>
          </div>

          {/* Las tres identidades, juntas, en una tira discreta. */}
          <div
            className="mt-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-hairline pt-5 text-meta text-ink-muted"
            data-motion="travel"
            style={{ animation: "rise var(--dur-hero) var(--ease-out) 360ms both" }}
          >
            <span className="inline-flex items-center gap-2">
              <span className="size-2 rounded-full bg-rose" aria-hidden />
              Higgsfield API
            </span>
            <span className="h-3 w-px bg-hairline" aria-hidden />
            <span className="inline-flex items-center gap-2">
              <span className="size-2 rounded-full bg-edge" aria-hidden />
              Built with Claude
            </span>
            <span className="h-3 w-px bg-hairline" aria-hidden />
            <span className="text-ink-faint">Avatar App Kit v0.1</span>
          </div>
        </div>

        {/* El marco 9:16 — la forma exacta que produce el producto. */}
        <div
          className="relative mx-auto w-full max-w-[420px]"
          style={{ animation: "settle 900ms var(--ease-out) 120ms both" }}
        >
          <div className="relative aspect-9/16 overflow-hidden rounded-2xl border border-hairline bg-panel shadow-[var(--shadow-lift)]">
            <img
              src="/demo/after.jpg"
              alt="The same person, generated onto a Tokyo street at night"
              className="absolute inset-0 size-full object-cover"
            />
            <div
              aria-hidden
              className="absolute inset-0"
              style={{ background: "var(--scrim-hero)" }}
            />
            <div className="absolute inset-x-0 bottom-0 p-5">
              <p className="font-display text-ui font-semibold text-ink">Tokyo at night</p>
              <p className="mt-0.5 text-meta text-ink-muted tnum">
                Soul Reference · 9:16 · 1.5 cr · $0.094
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- recetas ---------------- */}
      <section className="mx-auto max-w-[1200px] px-6 py-16">
        <h2 className="font-display text-h1 text-ink">Three things it does.</h2>
        <p className="mt-2 max-w-[52ch] text-ui text-ink-muted">
          Each one is a preset over the same two-stage pipeline: make a still, approve
          it, then optionally spend on the video.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {RECIPES.map(({ icon: Icon, title, body }, i) => (
            <article
              key={title}
              data-hover-lift
              className="rounded-xl border border-hairline bg-panel p-5 transition-[transform,border-color] duration-200 ease-out hover:border-edge/50"
            >
              <Icon className="size-5 text-ink-muted" aria-hidden />
              <h3 className="mt-3 font-display text-h3 text-ink">{title}</h3>
              <p className="mt-2 text-meta leading-relaxed text-ink-muted">{body}</p>
              {i === 1 ? (
                <div className="mt-4">
                  <BeforeAfterSlider
                    beforeSrc="/demo/before.jpg"
                    afterSrc="/demo/after.jpg"
                  />
                  <p className="mt-2 text-micro tracking-normal text-ink-faint">
                    Drag to compare — both frames are real output from this app. Swap
                    the two files in /public/demo with your own.
                  </p>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      {/* ---------------- por qué ---------------- */}
      <section className="mx-auto max-w-[1200px] px-6 py-16">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <h2 className="font-display text-h1 text-ink">
              You bring the key.
              <br />
              We bring nothing.
            </h2>
            <p className="mt-4 max-w-[46ch] text-ui leading-relaxed text-ink-muted">
              No key ships with this repo. You paste your own, it lives in an httpOnly
              cookie in your browser, and it only ever travels to your own localhost
              server. Clone it, re-skin it, sell it — every person who runs it pays with
              their own account.
            </p>

            <ul className="mt-6 flex flex-col gap-3 text-meta text-ink-muted">
              <li className="flex items-start gap-2">
                <Shield className="mt-0.5 size-4 shrink-0 text-ink-faint" aria-hidden />
                The app shows the exact cost before every generation, and failed or
                filtered results are refunded automatically.
              </li>
              <li className="flex items-start gap-2">
                <Shield className="mt-0.5 size-4 shrink-0 text-ink-faint" aria-hidden />
                It checks which models your key can actually run, and greys out the rest
                with the reason.
              </li>
              <li className="flex items-start gap-2">
                <Shield className="mt-0.5 size-4 shrink-0 text-ink-faint" aria-hidden />
                Results are deleted upstream after about 7 days, so every result has a
                download button and an expiry badge.
              </li>
            </ul>
          </div>

          <div className="flex flex-col gap-3">
            {STEPS.map(({ n, t, d }) => (
              <div
                key={n}
                className="flex items-start gap-4 rounded-lg border border-hairline bg-panel p-4"
              >
                <span className="font-mono text-meta text-ink-faint tnum">{n}</span>
                <div>
                  <p className="font-display text-ui font-semibold text-ink">{t}</p>
                  <p className="mt-0.5 text-meta text-ink-muted">{d}</p>
                </div>
              </div>
            ))}

            <pre className="mt-2 overflow-x-auto rounded-lg border border-hairline bg-canvas p-4 font-mono text-meta text-ink-muted">
              <code>{`git clone https://github.com/Hainrixz/avater-appkit
cd avater-appkit
npm install
npm run dev`}</code>
            </pre>
          </div>
        </div>
      </section>

      {/* ---------------- cierre ---------------- */}
      <section className="mx-auto max-w-[1200px] px-6 pb-24 pt-8">
        <div className="flex flex-col items-start gap-5 rounded-2xl border border-hairline bg-panel p-8 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-display text-h2 text-ink">Put yourself somewhere else.</h2>
            <p className="mt-1 text-ui text-ink-muted">
              It takes one photo and about ten seconds.
            </p>
          </div>
          <Link
            href="/studio"
            className="inline-flex h-12 shrink-0 items-center gap-2 rounded-md bg-rose px-6 text-[15px] font-semibold text-white shadow-[var(--shadow-cta)] transition-colors hover:bg-rose-hover"
          >
            Open the studio
            <ArrowRight className="size-4" />
          </Link>
        </div>

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-6 text-meta text-ink-faint">
          <span>Avatar App Kit — MIT. Not affiliated with Higgsfield.</span>
          <span>Fonts: Satoshi &amp; General Sans by Indian Type Foundry.</span>
        </footer>
      </section>
    </div>
  );
}
