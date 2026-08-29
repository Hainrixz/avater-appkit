import { AppError } from "@/lib/shared/errors";
import { createHiggsfieldProvider } from "./higgsfield/provider";
import type { Provider, ProviderCredentials, ProviderFactory } from "./provider";

export type { Provider, ProviderCredentials } from "./provider";

const FACTORIES: Record<string, ProviderFactory> = {
  higgsfield: createHiggsfieldProvider,
};

export const DEFAULT_PROVIDER_ID = "higgsfield";

/**
 * Los proveedores se construyen POR PETICIÓN, no como singleton, porque la
 * credencial es por usuario. El objeto es un closure sobre `creds`, así que la
 * asignación no cuesta nada. El estado mutable compartido (semáforo, cachés) vive
 * en lib/server/* y se indexa por huella de la credencial, nunca lo guarda el proveedor.
 */
export function getProvider(
  id: string = DEFAULT_PROVIDER_ID,
  creds: ProviderCredentials,
): Provider {
  const factory = FACTORIES[id];
  if (!factory) {
    throw new AppError("invalid_params", `Unknown provider: ${id}`);
  }
  return factory(creds);
}

export function listProviderIds(): string[] {
  return Object.keys(FACTORIES);
}
