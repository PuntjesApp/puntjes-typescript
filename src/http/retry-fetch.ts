import { TransportError } from '../errors.ts';
import { RATE_LIMITED, readErrorBody, retryAfter } from './error-body.ts';
import type { Fetch } from './fetch.ts';

export interface RetryOptions {
  maxRetries: number;
  retryBaseDelay: number;
  timeout: number;
  sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  /** The token grant repeats on every method, because a grant changes nothing on the server. */
  repeatEveryMethod?: boolean;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'PUT', 'PATCH', 'DELETE']);

/**
 * Sends a request again after a network failure, a timed-out attempt, a 5xx or a RATE_LIMITED 429. A POST repeats
 * only when its JSON body carries an `idempotency_key`. Every attempt sends a fresh copy and buffers the answer.
 */
export function retryFetch(next: Fetch, options: RetryOptions): Fetch {
  return async (request) => {
    const body = request.body === null ? null : await request.arrayBuffer();
    const retries = options.repeatEveryMethod || isSafeToRepeat(request.method, body) ? options.maxRetries : 0;

    for (let attempt = 0; ; attempt++) {
      const timeout = AbortSignal.timeout(options.timeout);
      const signal = AbortSignal.any([request.signal, timeout]);
      let response: Response;
      try {
        const sent = await next(new Request(request, { body, signal }));
        const buffered = await sent.arrayBuffer();
        response = new Response(buffered.byteLength === 0 ? null : buffered, sent);
      } catch (error) {
        if (request.signal.aborted) {
          throw request.signal.reason;
        }

        if (attempt < retries) {
          await options.sleep(delay(options, attempt), request.signal);
          continue;
        }

        if (timeout.aborted) {
          throw new TransportError(`The Puntjes API did not answer within ${options.timeout / 1000} seconds.`, { cause: error });
        }

        throw error;
      }

      if (attempt >= retries || !(await isTransient(response))) {
        return response;
      }

      await options.sleep(retryAfter(response.headers.get('Retry-After'), Date.now()) ?? delay(options, attempt), request.signal);
    }
  };
}

function isSafeToRepeat(method: string, body: ArrayBuffer | null): boolean {
  if (SAFE_METHODS.has(method)) {
    return true;
  }

  return method === 'POST' && carriesIdempotencyKey(body);
}

function carriesIdempotencyKey(body: ArrayBuffer | null): boolean {
  if (body === null || body.byteLength === 0) {
    return false;
  }

  try {
    const json: unknown = JSON.parse(new TextDecoder().decode(body));
    return typeof json === 'object' && json !== null && typeof (json as Record<string, unknown>).idempotency_key === 'string'
      && (json as Record<string, string>).idempotency_key !== '';
  } catch {
    return false;
  }
}

async function isTransient(response: Response): Promise<boolean> {
  if (response.status >= 500) {
    return true;
  }

  return response.status === 429 && (await readErrorBody(response)).code === RATE_LIMITED;
}

function delay(options: RetryOptions, attempt: number): number {
  return options.retryBaseDelay * 2 ** attempt;
}
