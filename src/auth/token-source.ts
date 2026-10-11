import { createHash } from 'node:crypto';
import { AuthenticationError, PuntjesError, TransportError } from '../errors.ts';
import { toError } from '../http/error-body.ts';
import type { Fetch } from '../http/fetch.ts';
import type { AccessToken, TokenStore } from './token-store.ts';

const LEEWAY = 30_000;

/** The store key of one shop's token. The same key as the .NET SDK, so a shared store holds one token per shop. */
export function tokenKey(host: string, clientId: string, clientSecret: string): string {
  return 'puntjes:token:' + createHash('sha256').update(`${host}|${clientId}|${clientSecret}`).digest('hex').slice(0, 32);
}

/** Grants client credentials tokens, one grant at a time, and keeps them in the store. */
export class TokenSource {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly tokenUrl: string,
    private readonly key: string,
    private readonly store: TokenStore,
    private readonly grants: Fetch,
  ) {}

  async get(): Promise<string> {
    const stored = usable(await this.store.get(this.key));
    if (stored !== null) {
      return stored;
    }

    return this.exclusive(async () => {
      const granted = usable(await this.store.get(this.key));
      if (granted !== null) {
        return granted;
      }

      const fresh = await this.grant();
      await this.store.set(this.key, fresh);

      return fresh.value;
    });
  }

  /** Clears the stored token, but only while it is still the one the API rejected. */
  forget(rejected: string): Promise<void> {
    return this.exclusive(async () => {
      if ((await this.store.get(this.key))?.value === rejected) {
        await this.store.delete(this.key);
      }
    });
  }

  private exclusive<T>(work: () => Promise<T>): Promise<T> {
    const run = this.queue.then(work, work);
    this.queue = run.catch(() => undefined);

    return run;
  }

  private async grant(): Promise<AccessToken> {
    const issuedAt = Date.now();
    let response: Response;
    try {
      response = await this.grants(
        new Request(this.tokenUrl, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ grant_type: 'client_credentials', client_id: this.clientId, client_secret: this.clientSecret }).toString(),
        }),
      );
    } catch (error) {
      if (error instanceof PuntjesError) {
        throw error;
      }

      throw new TransportError(`The Puntjes token endpoint could not be reached: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }

    if (response.status === 400 || response.status === 401) {
      throw rejected(await response.text(), response.status);
    }

    if (!response.ok) {
      throw await toError(response);
    }

    let root: { access_token?: unknown; expires_in?: unknown };
    try {
      root = JSON.parse(await response.text());
    } catch (error) {
      throw new TransportError('The Puntjes token endpoint returned no usable token.', { cause: error });
    }

    if (typeof root.access_token !== 'string' || root.access_token === '') {
      throw new TransportError('The Puntjes token endpoint returned no access_token.');
    }

    const expiresIn = typeof root.expires_in === 'number' ? root.expires_in : 3600;

    return { value: root.access_token, expiresAt: issuedAt + expiresIn * 1000 };
  }
}

function usable(token: AccessToken | null): string | null {
  return token !== null && token.expiresAt - LEEWAY > Date.now() ? token.value : null;
}

function rejected(text: string, status: number): AuthenticationError {
  let code: string | null = null;
  let description: string | null = null;
  try {
    const root = JSON.parse(text) as { error?: unknown; error_description?: unknown };
    code = typeof root.error === 'string' ? root.error : null;
    description = typeof root.error_description === 'string' ? root.error_description : null;
  } catch {
    code = null;
  }

  return new AuthenticationError(description ?? 'The Puntjes API refused the client credentials.', { status, rawCode: code });
}
