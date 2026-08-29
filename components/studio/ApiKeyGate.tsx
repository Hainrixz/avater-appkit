"use client";

import { useState } from "react";
import { ArrowUpRight, Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppError } from "@/lib/shared/errors";
import { connectKey } from "@/lib/client/api";

interface ApiKeyGateProps {
  onConnected: (info: { keyId: string; secretHint: string }) => void;
}

/**
 * La puerta de entrada.
 *
 * No se dibuja una página vacía detrás: se dibuja el estudio ENTERO, atenuado e
 * `inert`, y esta tarjeta encima. Que el usuario vea exactamente lo que va a
 * desbloquear vale más que cualquier texto de onboarding.
 *
 * La validación es gratis: se apoya en que un request_id inexistente devuelve 404 con
 * llave buena y 401 con llave mala. Ni un crédito para saber si sirve.
 */
export function ApiKeyGate({ onConnected }: ApiKeyGateProps) {
  const [token, setToken] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await connectKey(token.trim());
      onConnected({ keyId: res.keyId, secretHint: res.secretHint });
    } catch (err) {
      setError(
        err instanceof AppError ? err.message : "Couldn't reach the app's own server.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-[440px] rounded-xl border border-hairline bg-panel p-7 shadow-[var(--shadow-lift)]">
      <div className="mb-4 flex size-9 items-center justify-center rounded-lg bg-panel-raised">
        <KeyRound className="size-4 text-ink-muted" />
      </div>

      <h2 className="font-display text-[22px] font-bold tracking-[-0.02em] text-ink">
        Bring your own key.
      </h2>

      <p className="mt-2 text-ui leading-relaxed text-ink-muted">
        This runs on your machine. Your key is kept in an httpOnly cookie for this
        browser, and reaches Higgsfield through your own localhost server — never
        written into the project, never sent anywhere else.
      </p>

      <form onSubmit={submit} className="mt-5 flex flex-col gap-3">
        <div className="relative">
          <input
            type={reveal ? "text" : "password"}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="KEY_ID:KEY_SECRET"
            autoComplete="off"
            spellCheck={false}
            data-1p-ignore
            aria-label="Higgsfield API key"
            aria-invalid={error ? true : undefined}
            className="h-11 w-full rounded-md border border-hairline bg-canvas px-3 pr-10 font-mono text-ui text-ink placeholder:text-ink-faint focus-visible:border-edge"
          />
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            aria-label={reveal ? "Hide key" : "Show key"}
            className="absolute right-1 top-1 grid size-9 place-items-center rounded text-ink-faint hover:text-ink"
          >
            {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>

        {error ? (
          <p role="alert" className="text-meta text-warn">
            {error}
          </p>
        ) : null}

        <Button
          type="submit"
          disabled={busy || token.trim().length < 5}
          className="h-11 bg-rose text-[15px] font-semibold text-white shadow-[var(--shadow-cta)] hover:bg-rose-hover"
        >
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" data-motion="essential" />
              Checking…
            </>
          ) : (
            "Connect"
          )}
        </Button>
      </form>

      <div className="mt-5 flex flex-wrap gap-x-4 gap-y-1 border-t border-hairline pt-4 text-meta">
        <a
          href="https://cloud.higgsfield.ai"
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 text-ink-muted hover:text-ink"
        >
          Get a key at cloud.higgsfield.ai
          <ArrowUpRight className="size-3" />
        </a>
        <span className="text-ink-faint">Checking it costs nothing.</span>
      </div>
    </div>
  );
}
