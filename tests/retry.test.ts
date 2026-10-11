import { describe, expect, it } from 'vitest';
import { PlanLimitExceededError, NotFoundError, RateLimitError, ServerError, TransportError, type CreateTransactionData } from '../src/index.ts';
import type { PuntjesOptions } from '../src/index.ts';
import { FakeFetch, errorResponse, json } from './support/fake-fetch.ts';

const ok = { data: {} };

function setup(options: Partial<PuntjesOptions> = {}) {
  const fake = new FakeFetch();
  const waits: number[] = [];
  const client = () => fake.client({ sleep: async (ms) => void waits.push(ms), ...options });
  return { fake, waits, client };
}

const record = (puntjes: ReturnType<FakeFetch['client']>, idempotencyKey: string | null) =>
  puntjes.submitTransaction({
    body: (idempotencyKey === null
      ? { identifier: 'c1', total_amount: 100 }
      : { identifier: 'c1', total_amount: 100, idempotency_key: idempotencyKey }) as CreateTransactionData,
  });

describe('retry', () => {
  it('retries a GET after a server error, after the first wait', async () => {
    const { fake, waits, client } = setup();
    fake.answerError(503, 'INTERNAL_ERROR').answerJson(200, ok);

    await client().showMe();

    expect(fake.requests).toHaveLength(2);
    expect(waits).toEqual([500]);
  });

  it('doubles the wait and holds the limit', async () => {
    const { fake, waits, client } = setup();
    fake.answerError(500, 'INTERNAL_ERROR', 3);

    await expect(client().showMe()).rejects.toBeInstanceOf(ServerError);

    expect(fake.requests).toHaveLength(3);
    expect(waits).toEqual([500, 1000]);
  });

  it('retries a POST that carries an idempotency key, with the same body', async () => {
    const { fake, client } = setup();
    fake.answerError(503, 'INTERNAL_ERROR').answerJson(201, ok);

    await record(client(), 'key-1');

    expect(fake.requests).toHaveLength(2);
    expect(fake.requests[1]?.body).toBe(fake.requests[0]?.body);
    expect(fake.requests[1]?.body).toContain('"idempotency_key":"key-1"');
  });

  it('sends a POST without an idempotency key once', async () => {
    const { fake, client } = setup();
    fake.answerError(503, 'INTERNAL_ERROR').answerJson(201, ok);

    await expect(record(client(), null)).rejects.toBeInstanceOf(ServerError);

    expect(fake.requests).toHaveLength(1);
  });

  it('sends a POST without an idempotency key once on a network failure', async () => {
    const { fake, client } = setup();
    fake.answerThrow(new TypeError('fetch failed')).answerJson(201, ok);

    await expect(record(client(), null)).rejects.toBeInstanceOf(TransportError);

    expect(fake.requests).toHaveLength(1);
  });

  it('sends a POST with an empty idempotency key once', async () => {
    const { fake, client } = setup();
    fake.answerError(503, 'INTERNAL_ERROR').answerJson(201, ok);

    await expect(record(client(), '')).rejects.toBeInstanceOf(ServerError);

    expect(fake.requests).toHaveLength(1);
  });

  it('retries a GET after a network failure', async () => {
    const { fake, client } = setup();
    fake.answerThrow(new TypeError('fetch failed')).answerJson(200, ok);

    await client().showMe();

    expect(fake.requests).toHaveLength(2);
  });

  it('waits what Retry-After says on a rate limit', async () => {
    const { fake, waits, client } = setup();
    fake.answer(() => errorResponse(429, 'RATE_LIMITED', 'req-1', { 'Retry-After': '3' })).answerJson(200, ok);

    await client().showMe();

    expect(waits).toEqual([3000]);
  });

  it('waits nothing for a Retry-After date in the past', async () => {
    const { fake, waits, client } = setup();
    const past = new Date(Date.now() - 5 * 60_000).toUTCString();
    fake.answer(() => errorResponse(429, 'RATE_LIMITED', 'req-1', { 'Retry-After': past })).answerJson(200, ok);

    await client().showMe();

    expect(waits).toEqual([0]);
  });

  it('waits until a Retry-After date in the future', async () => {
    const { fake, waits, client } = setup();
    const future = new Date(Date.now() + 60_000).toUTCString();
    fake.answer(() => errorResponse(429, 'RATE_LIMITED', 'req-1', { 'Retry-After': future })).answerJson(200, ok);

    await client().showMe();

    expect(waits[0]).toBeGreaterThan(55_000);
    expect(waits[0]).toBeLessThanOrEqual(60_000);
  });

  it('never retries a plan limit', async () => {
    const { fake, client } = setup();
    fake.answerError(429, 'PLAN_LIMIT_EXCEEDED').answerJson(200, ok);

    await expect(client().showMe()).rejects.toBeInstanceOf(PlanLimitExceededError);

    expect(fake.requests).toHaveLength(1);
  });

  it('never retries a client error', async () => {
    const { fake, client } = setup();
    fake.answerError(404, 'CUSTOMER_NOT_FOUND').answerJson(200, ok);

    await expect(client().showMe()).rejects.toBeInstanceOf(NotFoundError);

    expect(fake.requests).toHaveLength(1);
  });

  it('sends once with zero retries', async () => {
    const { fake, client } = setup({ maxRetries: 0 });
    fake.answerError(503, 'INTERNAL_ERROR').answerJson(200, ok);

    await expect(client().showMe()).rejects.toBeInstanceOf(ServerError);

    expect(fake.requests).toHaveLength(1);
  });

  it('retries PUT, PATCH and DELETE', async () => {
    const { fake, client } = setup();
    fake
      .answerError(503, 'INTERNAL_ERROR').answerJson(200, ok)
      .answerError(503, 'INTERNAL_ERROR').answerJson(200, ok)
      .answerError(503, 'INTERNAL_ERROR').answer(() => new Response(null, { status: 204 }));
    const puntjes = client();

    await puntjes.upsertProduct({ path: { externalId: 'p1' }, body: { name: 'Bread' } as never });
    await puntjes.updateProduct({ path: { externalId: 'p1' }, body: { name: 'Rye' } as never });
    await puntjes.deleteProduct({ path: { externalId: 'p1' } });

    expect(fake.requests.map((r) => r.method)).toEqual(['PUT', 'PUT', 'PATCH', 'PATCH', 'DELETE', 'DELETE']);
  });

  it('keeps the Content-Type of a retried POST', async () => {
    const { fake, client } = setup();
    fake.answerError(503, 'INTERNAL_ERROR').answerJson(201, ok);

    await record(client(), 'key-1');

    expect(fake.requests.map((r) => r.contentType)).toEqual(['application/json', 'application/json']);
  });

  it('says how long a rate limit asks to wait when it gives up', async () => {
    const { fake, client } = setup({ maxRetries: 0 });
    fake.answer(() => errorResponse(429, 'RATE_LIMITED', 'req-1', { 'Retry-After': '7' }));

    const error = await client().showMe().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RateLimitError);
    expect((error as RateLimitError).retryAfter).toBe(7000);
  });

  it('times out a GET that hangs and retries it', async () => {
    const { fake, client } = setup({ timeout: 50 });
    fake.answerHang().answerJson(200, ok);
    const started = performance.now();

    await client().showMe();

    expect(performance.now() - started).toBeGreaterThanOrEqual(45);
    expect(fake.requests).toHaveLength(2);
  });

  it('makes a POST without a key that hangs a TransportError', async () => {
    const { fake, client } = setup({ timeout: 50 });
    fake.answerHang().answerJson(201, ok);

    const error = await record(client(), null).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TransportError);
    expect((error as TransportError).message).toContain('did not answer within');
    expect(fake.requests).toHaveLength(1);
  });

  it('retries a body that breaks while it is read', async () => {
    const { fake, client } = setup();
    const broken = new ReadableStream({
      pull(controller) {
        controller.error(new TypeError('terminated'));
      },
    });
    fake.answer(() => new Response(broken, { status: 200, headers: { 'Content-Type': 'application/json' } })).answerJson(200, ok);

    await client().showMe();

    expect(fake.requests).toHaveLength(2);
  });

  it('does not treat a caller cancellation as a timeout', async () => {
    const { fake, client } = setup();
    fake.answerHang();

    const error = await client().showMe({ signal: AbortSignal.timeout(30) }).catch((e: unknown) => e);

    expect(error).not.toBeInstanceOf(TransportError);
    expect((error as Error).name).toMatch(/AbortError|TimeoutError/);
    expect(fake.requests).toHaveLength(1);
  });

  it('reads the body of a successful answer after the retry layer buffered it', async () => {
    const { fake, client } = setup();
    fake.answer(() => json(200, { data: { name: 'Bakery' } }));

    const { data } = await client().showMe();

    expect(data).toEqual({ data: { name: 'Bakery' } });
  });
});
