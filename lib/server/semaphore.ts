/**
 * Semáforo compartido por sondeos Y generaciones.
 *
 * La API documenta un tope de peticiones concurrentes (el mensaje de error muestra 4)
 * y avisa de que quedarse sin cupo llega como 400, no como 429, y sin Retry-After.
 * El tope está sobre generación; los /estimate PROBABLEMENTE no cuenten, pero
 * "probablemente" no es un plan: si el usuario le da a Generar mientras corre el
 * sondeo, un único semáforo garantiza que nunca haya más de N en vuelo, cuente lo
 * que cuente. Además evita mandarle a Cloudflare una ráfaga de 48 peticiones.
 */
export class Semaphore {
  private active = 0;
  private queue: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  get inFlight(): number {
    return this.active;
  }

  private acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.active += 1;
        resolve();
      });
    });
  }

  private release(): void {
    this.active -= 1;
    const next = this.queue.shift();
    if (next) next();
  }
}

export const CONCURRENCY_LIMIT = 4;

/** Singleton de módulo: uno por proceso del servidor de Next. */
export const providerSemaphore = new Semaphore(CONCURRENCY_LIMIT);
