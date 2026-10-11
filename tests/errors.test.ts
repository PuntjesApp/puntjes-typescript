import { describe, expect, it } from 'vitest';
import {
  AuthenticationError,
  ConflictError,
  ErrorCode,
  ForbiddenError,
  NotFoundError,
  PlanLimitExceededError,
  PuntjesError,
  RateLimitError,
  ServerError,
  TransportError,
  ValidationError,
} from '../src/index.ts';
import { FakeFetch, errorResponse, json } from './support/fake-fetch.ts';

async function caught(promise: Promise<unknown>): Promise<PuntjesError> {
  const error = await promise.then(() => null, (e: unknown) => e);
  expect(error).toBeInstanceOf(PuntjesError);
  return error as PuntjesError;
}

describe('errors', () => {
  it.each([
    [401, 'UNAUTHENTICATED', AuthenticationError, ErrorCode.Unauthenticated],
    [403, 'FORBIDDEN', ForbiddenError, ErrorCode.Forbidden],
    [404, 'CUSTOMER_NOT_FOUND', NotFoundError, ErrorCode.CustomerNotFound],
    [409, 'IDENTIFIER_DUPLICATE', ConflictError, ErrorCode.IdentifierDuplicate],
    [422, 'VALIDATION_ERROR', ValidationError, ErrorCode.ValidationError],
    [422, 'INSUFFICIENT_BALANCE', PuntjesError, ErrorCode.InsufficientBalance],
    [429, 'RATE_LIMITED', RateLimitError, ErrorCode.RateLimited],
    [429, 'PLAN_LIMIT_EXCEEDED', PlanLimitExceededError, ErrorCode.PlanLimitExceeded],
    [500, 'INTERNAL_ERROR', ServerError, ErrorCode.InternalError],
  ])('a %i with %s throws its family', async (status, code, family, expected) => {
    const fake = new FakeFetch().answerError(status, code, 3);

    const error = await caught(fake.client().showMe());

    expect(error.constructor).toBe(family);
    expect(error.code).toBe(expected);
    expect(error.rawCode).toBe(code);
    expect(error.status).toBe(status);
    expect(error.requestId).toBe('req-1');
    expect(error.message).toBe(`Something about ${code}.`);
    expect(error.name).toBe(family.name);
  });

  it('hands the validation details to the caller', async () => {
    const fake = new FakeFetch().answerError(422, 'VALIDATION_ERROR');

    const error = (await caught(fake.client().showMe())) as ValidationError;

    expect(error).toBeInstanceOf(ValidationError);
    expect(error.details).toEqual({ field: ['bad'] });
    expect(error.errorsFor('field')).toEqual(['bad']);
    expect(error.errorsFor('other')).toEqual([]);
  });

  it('keeps the raw code of a code this version does not know', async () => {
    const fake = new FakeFetch().answerError(404, 'SOMETHING_NEW');

    const error = await caught(fake.client().showMe());

    expect(error).toBeInstanceOf(NotFoundError);
    expect(error.code).toBeNull();
    expect(error.rawCode).toBe('SOMETHING_NEW');
  });

  it('throws the base error for a status no family covers', async () => {
    const fake = new FakeFetch().answerError(410, 'GONE_FOREVER');

    const error = await caught(fake.client().showMe());

    expect(error.constructor).toBe(PuntjesError);
    expect(error.status).toBe(410);
  });

  it('makes a non-JSON server error a ServerError', async () => {
    const fake = new FakeFetch();
    for (let i = 0; i < 3; i++) {
      fake.answer(() => new Response('<html>bad gateway</html>', { status: 502 }));
    }

    const error = await caught(fake.client().showMe());

    expect(error).toBeInstanceOf(ServerError);
    expect(error.status).toBe(502);
    expect(error.code).toBeNull();
    expect(error.rawCode).toBe('NON_JSON_RESPONSE');
  });

  it('makes a non-JSON client error a TransportError', async () => {
    const fake = new FakeFetch().answer(() => new Response('<html>login</html>', { status: 404 }));

    const error = await caught(fake.client().showMe());

    expect(error).toBeInstanceOf(TransportError);
  });

  it('falls back to the status for JSON with no error object', async () => {
    const fake = new FakeFetch().answerJson(409, { message: 'no envelope' });

    const error = await caught(fake.client().showMe());

    expect(error).toBeInstanceOf(ConflictError);
    expect(error.code).toBeNull();
    expect(error.rawCode).toBe('UNKNOWN_ERROR');
    expect(error.message).toBe('The Puntjes API returned HTTP 409.');
  });

  it('makes a network failure a TransportError with the cause', async () => {
    const failure = new TypeError('fetch failed');
    const fake = new FakeFetch().answerThrow(failure, 3);

    const error = await caught(fake.client().showMe());

    expect(error).toBeInstanceOf(TransportError);
    expect(error.cause).toBe(failure);
  });

  it.each(['https://shop.test', 'https://shop.test/', 'https://shop.test/api/v1', 'https://shop.test/api/v1/'])(
    'reaches the same URL from the base URL %s',
    async (baseUrl) => {
      const fake = new FakeFetch().answerJson(200, { data: {} });

      await fake.client({ baseUrl }).showMe();

      expect(fake.requests.map((r) => r.url)).toEqual(['https://shop.test/api/v1/me']);
    },
  );

  it('takes the request id from the response header when the body has none', async () => {
    const fake = new FakeFetch().answer(() =>
      json(404, { error: { code: 'CUSTOMER_NOT_FOUND', message: 'No such customer.', status: 404 } }, { 'X-Request-ID': 'req-header' }),
    );

    const error = await caught(fake.client().showMe());

    expect(error.requestId).toBe('req-header');
  });

  it('tells how long a rate limit asks to wait', async () => {
    const fake = new FakeFetch();
    for (let i = 0; i < 3; i++) {
      fake.answer(() => errorResponse(429, 'RATE_LIMITED', 'req-1', { 'Retry-After': '7' }));
    }

    const error = (await caught(fake.client().showMe())) as RateLimitError;

    expect(error.retryAfter).toBe(7000);
  });
});
