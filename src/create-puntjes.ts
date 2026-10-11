import { TokenSource, tokenKey } from './auth/token-source.js';
import { InMemoryTokenStore, type TokenStore } from './auth/token-store.js';
import { createClient, createConfig } from './generated/client/index.js';
import { PuntjesApi } from './generated/sdk.gen.js';
import { authFetch } from './http/auth-fetch.js';
import { errorFetch } from './http/error-fetch.js';
import { asGlobalFetch, type Fetch } from './http/fetch.js';
import { retryFetch } from './http/retry-fetch.js';

export const DEFAULT_BASE_URL = 'https://puntjes.app';

const API_PREFIX = '/api/v1';

const TOKEN_PATH = '/oauth/token';

const UNSIGNED_TOKEN = 'pending';

export interface PuntjesOptions {
  clientId: string;
  clientSecret: string;
  /** The Puntjes host, with or without `/api/v1`. Production by default. */
  baseUrl?: string;
  /** A fetch to send every request through, for a proxy or a test; it must honour `init.signal`. The global fetch by default. */
  fetch?: (request: Request, init: { signal?: AbortSignal }) => Promise<Response>;
  /** How many times a failed call that is safe to repeat is sent again. 2 by default. */
  maxRetries?: number;
  /** The first wait before a retry, in milliseconds, doubled for each next one. 500 by default. */
  retryBaseDelay?: number;
  /** How long one attempt may take, in milliseconds. 30000 by default. */
  timeout?: number;
  /** Where tokens are kept between calls. In this process by default. */
  tokenStore?: TokenStore;
  /** How to wait between retries, for a test. */
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

/** Builds the generated `PuntjesApi` with authentication, retries and typed errors. */
export function createPuntjes(options: PuntjesOptions): PuntjesApi {
  if (!options.clientId?.trim() || !options.clientSecret?.trim()) {
    throw new TypeError('createPuntjes needs a clientId and a clientSecret.');
  }

  const host = hostOf(options.baseUrl ?? DEFAULT_BASE_URL);
  const transport: Fetch = (request, init = {}) => (options.fetch ?? globalThis.fetch)(request, init);
  const retry = {
    maxRetries: options.maxRetries ?? 2,
    retryBaseDelay: options.retryBaseDelay ?? 500,
    timeout: options.timeout ?? 30_000,
    sleep: options.sleep ?? sleep,
  };
  const grants = retryFetch(transport, { ...retry, repeatEveryMethod: true });
  const tokens = new TokenSource(
    options.clientId,
    options.clientSecret,
    host + TOKEN_PATH,
    tokenKey(host, options.clientId, options.clientSecret),
    options.tokenStore ?? new InMemoryTokenStore(),
    grants,
  );
  const client = createClient(
    createConfig({
      baseUrl: host + API_PREFIX,
      auth: () => UNSIGNED_TOKEN,
      fetch: asGlobalFetch(errorFetch(retryFetch(authFetch(transport, tokens), retry))),
      throwOnError: true,
    }),
  );

  return new PuntjesApi({ client });
}

function hostOf(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '');

  return trimmed.toLowerCase().endsWith(API_PREFIX) ? trimmed.slice(0, -API_PREFIX.length) : trimmed;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason);
    }, { once: true });
  });
}
