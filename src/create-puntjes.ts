import { createClient, createConfig } from './generated/client/index.ts';
import { PuntjesApi } from './generated/sdk.gen.ts';
import { errorFetch } from './http/error-fetch.ts';
import type { Fetch } from './http/fetch.ts';

export const DEFAULT_BASE_URL = 'https://puntjes.app';

const API_PREFIX = '/api/v1';

export interface PuntjesOptions {
  clientId: string;
  clientSecret: string;
  /** The Puntjes host, with or without `/api/v1`. Production by default. */
  baseUrl?: string;
  /** A fetch to send every request through, for a proxy or a test. The global fetch by default. */
  fetch?: (request: Request) => Promise<Response>;
  /** How long to wait between retries, for a test. */
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

/** Builds the generated `PuntjesApi` with authentication, retries and typed errors. */
export function createPuntjes(options: PuntjesOptions): PuntjesApi {
  if (!options.clientId?.trim() || !options.clientSecret?.trim()) {
    throw new TypeError('createPuntjes needs a clientId and a clientSecret.');
  }

  const host = hostOf(options.baseUrl ?? DEFAULT_BASE_URL);
  const transport: Fetch = options.fetch ?? ((request) => globalThis.fetch(request));
  const client = createClient(
    createConfig({
      baseUrl: host + API_PREFIX,
      fetch: errorFetch(transport),
      throwOnError: true,
    }),
  );

  return new PuntjesApi({ client });
}

function hostOf(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '');

  return trimmed.toLowerCase().endsWith(API_PREFIX) ? trimmed.slice(0, -API_PREFIX.length) : trimmed;
}
