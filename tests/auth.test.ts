import { describe, expect, it } from 'vitest';
import { AuthenticationError, InMemoryTokenStore, ServerError, type AccessToken, type TokenStore } from '../src/index.ts';
import { tokenKey } from '../src/auth/token-source.ts';
import { FakeFetch, errorResponse, json } from './support/fake-fetch.ts';

const ok = { data: {} };
const storeKey = () => tokenKey('https://shop.test', 'client-id', 'client-secret');

describe('authentication', () => {
  it('shares one grant between two calls', async () => {
    const fake = new FakeFetch().thenJson(200, ok).thenJson(200, ok);
    const puntjes = fake.client();

    await puntjes.showMe();
    await puntjes.showMe();

    expect(fake.grants).toBe(1);
    expect(fake.requests.map((r) => r.authorization)).toEqual(['Bearer token-1', 'Bearer token-1']);
    expect(fake.grantBodies).toEqual(['grant_type=client_credentials&client_id=client-id&client_secret=client-secret']);
  });

  it('grants again after a rejected token and sends the call once more', async () => {
    const fake = new FakeFetch().thenError(401, 'UNAUTHENTICATED').thenJson(200, ok);

    await fake.client().showMe();

    expect(fake.grants).toBe(2);
    expect(fake.requests.map((r) => r.authorization)).toEqual(['Bearer token-1', 'Bearer token-2']);
  });

  it('hands a second rejection to the caller', async () => {
    const fake = new FakeFetch().thenError(401, 'UNAUTHENTICATED', 2).thenJson(200, ok);

    await expect(fake.client().showMe()).rejects.toBeInstanceOf(AuthenticationError);

    expect(fake.requests).toHaveLength(2);
  });

  it('sends no token on a public operation', async () => {
    const fake = new FakeFetch().thenJson(200, { status: 'ok' });

    await fake.client().checkHealth();

    expect(fake.grants).toBe(0);
    expect(fake.requests.map((r) => r.authorization)).toEqual([null]);
  });

  it('shares one grant between parallel calls on a cold client', async () => {
    const fake = new FakeFetch();
    fake.latency = 20;
    for (let i = 0; i < 20; i++) fake.thenJson(200, ok);
    const puntjes = fake.client();

    await Promise.all(Array.from({ length: 20 }, () => puntjes.showMe()));

    expect(fake.grants).toBe(1);
  });

  it('uses a stored token until shortly before it expires', async () => {
    const tokenStore = new InMemoryTokenStore();
    await tokenStore.set(storeKey(), { value: 'stored', expiresAt: Date.now() + 10 * 60_000 });
    const fake = new FakeFetch().thenJson(200, ok);

    await fake.client({ tokenStore }).showMe();

    expect(fake.grants).toBe(0);
    expect(fake.requests.map((r) => r.authorization)).toEqual(['Bearer stored']);
  });

  it('replaces a token about to expire', async () => {
    const tokenStore = new InMemoryTokenStore();
    await tokenStore.set(storeKey(), { value: 'stale', expiresAt: Date.now() + 10_000 });
    const fake = new FakeFetch().thenJson(200, ok);

    await fake.client({ tokenStore }).showMe();

    expect(fake.grants).toBe(1);
    expect((await tokenStore.get(storeKey()))?.value).toBe('token-1');
  });

  it('throws an AuthenticationError for rejected credentials', async () => {
    const fake = new FakeFetch();
    fake.grantAnswer = () => json(401, { error: 'invalid_client', error_description: 'Client authentication failed' });

    const error = await fake.client().showMe().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AuthenticationError);
    expect((error as AuthenticationError).message).toBe('Client authentication failed');
    expect((error as AuthenticationError).rawCode).toBe('invalid_client');
    expect(fake.requests).toHaveLength(0);
  });

  it('makes a token endpoint outage a ServerError', async () => {
    const fake = new FakeFetch();
    fake.grantAnswer = () => errorResponse(503, 'INTERNAL_ERROR');

    await expect(fake.client().showMe()).rejects.toBeInstanceOf(ServerError);
  });

  it('keeps one token per shop in a shared store', async () => {
    const tokenStore = new InMemoryTokenStore();
    const fake = new FakeFetch().thenJson(200, ok).thenJson(200, ok);

    await fake.client({ tokenStore, clientId: 'shop-a' }).showMe();
    await fake.client({ tokenStore, clientId: 'shop-b' }).showMe();

    expect(fake.grants).toBe(2);
    expect(fake.requests.map((r) => r.authorization)).toEqual(['Bearer token-1', 'Bearer token-2']);
  });

  it('replaces a short-lived token when its own lifetime ends', async () => {
    const fake = new FakeFetch().thenJson(200, ok).thenJson(200, ok);
    fake.grantAnswer = (n) => json(200, { token_type: 'Bearer', expires_in: 10, access_token: `token-${n}` });
    const puntjes = fake.client();

    await puntjes.showMe();
    await puntjes.showMe();

    expect(fake.grants).toBe(2);
  });

  it('retries a token endpoint hiccup', async () => {
    const fake = new FakeFetch().thenJson(200, ok);
    fake.grantAnswer = (n) =>
      n === 1 ? errorResponse(503, 'INTERNAL_ERROR') : json(200, { token_type: 'Bearer', expires_in: 3600, access_token: 'token-ok' });

    await fake.client().showMe();

    expect(fake.grants).toBe(2);
    expect(fake.requests.map((r) => r.authorization)).toEqual(['Bearer token-ok']);
  });

  it('gives up on a token endpoint that stays down after the retries', async () => {
    const fake = new FakeFetch();
    fake.grantAnswer = () => errorResponse(503, 'INTERNAL_ERROR');

    await expect(fake.client().showMe()).rejects.toBeInstanceOf(ServerError);

    expect(fake.grants).toBe(3);
  });

  it('shares one new grant between parallel rejections', async () => {
    const inner = new InMemoryTokenStore();
    await inner.set('any', { value: 'old', expiresAt: Date.now() + 3_600_000 });
    const single: TokenStore = {
      get: () => inner.get('any'),
      set: (_key: string, token: AccessToken) => inner.set('any', token),
      delete: () => inner.delete('any'),
    };
    const fake = new FakeFetch();
    fake.apiLatency = (call) => (call === 1 ? 50 : call === 2 ? 300 : 0);
    fake.respond = (request) =>
      request.headers.get('Authorization') === 'Bearer old' ? errorResponse(401, 'UNAUTHENTICATED') : json(200, ok);
    const puntjes = fake.client({ tokenStore: single });

    await Promise.all([puntjes.showMe(), puntjes.showMe()]);

    expect(fake.grants).toBe(1);
  });

  it('sends the current token on a retried attempt', async () => {
    const fake = new FakeFetch().thenError(503, 'INTERNAL_ERROR').thenJson(200, ok);
    const tokenStore = new InMemoryTokenStore();
    const puntjes = fake.client({
      tokenStore,
      sleep: async () => {
        await tokenStore.set(storeKey(), { value: 'rotated', expiresAt: Date.now() + 3_600_000 });
      },
    });

    await puntjes.showMe();

    expect(fake.requests.map((r) => r.authorization)).toEqual(['Bearer token-1', 'Bearer rotated']);
  });
});
