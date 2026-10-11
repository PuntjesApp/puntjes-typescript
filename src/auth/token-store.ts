/** A bearer token and the moment it stops working, in milliseconds since the epoch. */
export interface AccessToken {
  value: string;
  expiresAt: number;
}

/**
 * Keeps access tokens between calls, for example in Redis shared by several servers. The key names the credentials a
 * token belongs to, so one store can serve the clients of many shops.
 */
export interface TokenStore {
  get(key: string): Promise<AccessToken | null>;
  set(key: string, token: AccessToken): Promise<void>;
  delete(key: string): Promise<void>;
}

/** Keeps tokens in this process. The default. */
export class InMemoryTokenStore implements TokenStore {
  private readonly tokens = new Map<string, AccessToken>();

  async get(key: string): Promise<AccessToken | null> {
    return this.tokens.get(key) ?? null;
  }

  async set(key: string, token: AccessToken): Promise<void> {
    this.tokens.set(key, token);
  }

  async delete(key: string): Promise<void> {
    this.tokens.delete(key);
  }
}
