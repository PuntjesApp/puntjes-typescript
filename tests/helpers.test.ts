import { describe, expect, it } from 'vitest';
import { NotFoundError, idempotencyKey, paginate, walletPass, type ProductData } from '../src/index.ts';
import { FakeFetch, json } from './support/fake-fetch.ts';

const page = (current: number, last: number, ...names: string[]) => ({
  data: names.map((name) => ({ name })),
  links: {},
  meta: { current_page: current, last_page: last, per_page: 2, total: names.length },
});

async function collect(fake: FakeFetch): Promise<string[]> {
  const puntjes = fake.client();
  const names: string[] = [];
  for await (const product of paginate<ProductData>(async (n) => (await puntjes.listProducts({ query: { page: n } })).data.data)) {
    names.push(product.name);
  }
  return names;
}

describe('helpers', () => {
  it('makes a new version 4 UUID for each idempotency key', () => {
    const first = idempotencyKey();

    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(idempotencyKey()).not.toBe(first);
  });

  it('yields every item of every page in order', async () => {
    const fake = new FakeFetch().thenJson(200, { data: page(1, 3, 'a', 'b') }).thenJson(200, { data: page(2, 3, 'c') }).thenJson(200, { data: page(3, 3, 'd') });

    expect(await collect(fake)).toEqual(['a', 'b', 'c', 'd']);
    expect(fake.requests.map((r) => new URL(r.url).search)).toEqual(['?page=1', '?page=2', '?page=3']);
  });

  it('stops when the server ignores the page', async () => {
    const fake = new FakeFetch().thenJson(200, { data: page(1, 5, 'a') }).thenJson(200, { data: page(1, 5, 'a') });

    expect(await collect(fake)).toEqual(['a']);
    expect(fake.requests).toHaveLength(2);
  });

  it('yields nothing for an empty first page', async () => {
    const fake = new FakeFetch().thenJson(200, { data: page(1, 1) });

    expect(await collect(fake)).toEqual([]);
  });

  it('fetches the Apple pass as bytes', async () => {
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    const fake = new FakeFetch().then(() => new Response(bytes, { status: 200, headers: { 'Content-Type': 'application/vnd.apple.pkpass' } }));

    const pass = await walletPass.apple(fake.client(), 'cus_1');

    expect(pass).toEqual(bytes);
    expect(fake.requests.map((r) => [r.url, r.accept])).toEqual([
      ['https://shop.test/api/v1/customers/cus_1/wallet-pass?platform=apple', 'application/vnd.apple.pkpass'],
    ]);
  });

  it('has no pass for a missing customer', async () => {
    const fake = new FakeFetch().then(() => json(404, { error: { code: 'CUSTOMER_NOT_FOUND', message: 'No.', status: 404, request_id: 'r' } }));

    await expect(walletPass.apple(fake.client(), 'cus_404')).rejects.toBeInstanceOf(NotFoundError);
  });
});
