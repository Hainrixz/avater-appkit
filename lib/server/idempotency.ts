import type { Job } from "@/lib/shared/types";

/**
 * Idempotencia sintética, construida en NUESTRO proxy.
 *
 * La API no acepta idempotency key en los POST de generación, y su propia
 * documentación advierte de no reintentar un POST ambiguo. Como no se puede arreglar
 * aguas arriba, se arregla en la capa que sí controlamos: dos peticiones con la misma
 * clave mientras la primera está en vuelo comparten la MISMA promesa, así que un
 * doble clic a 30ms produce un solo POST upstream.
 *
 * Un Map en proceso basta de verdad para una app local de un usuario: el proceso del
 * dev server es el 100% de la superficie. Un hot reload lo vacía, lo cual da igual —
 * un clic tampoco sobrevive a un hot reload.
 */
interface Entry {
  promise: Promise<Job>;
  at: number;
}

const TTL_MS = 10 * 60_000;
const inflight = new Map<string, Entry>();

function sweep(now: number): void {
  for (const [k, v] of inflight) {
    if (now - v.at > TTL_MS) inflight.delete(k);
  }
}

export async function once(key: string, fn: () => Promise<Job>): Promise<Job> {
  const now = Date.now();
  sweep(now);

  const existing = inflight.get(key);
  if (existing) return existing.promise;

  const promise = fn();
  inflight.set(key, { promise, at: now });

  try {
    return await promise;
  } catch (e) {
    // Un fallo no se cachea: el usuario tiene derecho a reintentar a mano.
    inflight.delete(key);
    throw e;
  }
}
