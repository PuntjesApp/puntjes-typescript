import { createPuntjes, type PuntjesOptions } from '../../src/index.ts';

export interface SentRequest {
  method: string;
  url: string;
  body: string;
  authorization: string | null;
  accept: string | null;
  contentType: string | null;
}

type Answer = (request: Request, signal: AbortSignal) => Response | Promise<Response>;

export const json = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

export const errorResponse = (status: number, code: string, requestId = 'req-1', headers: Record<string, string> = {}): Response =>
  json(status, { error: { code, message: `Something about ${code}.`, status, request_id: requestId, details: { field: ['bad'] } } }, headers);

/** A fetch that answers token grants by itself and replays queued answers for every other call. */
export class FakeFetch {
  readonly requests: SentRequest[] = [];
  readonly grantBodies: string[] = [];
  grants = 0;
  grantAnswer: (n: number) => Response | Promise<Response> = (n) =>
    json(200, { token_type: 'Bearer', expires_in: 3600, access_token: `token-${n}` });
  respond: Answer | null = null;
  latency = 0;
  apiLatency: ((call: number) => number) | null = null;
  private apiCalls = 0;
  private readonly answers: Answer[] = [];

  readonly fetch = async (request: Request, init: { signal?: AbortSignal } = {}): Promise<Response> => {
    const signal = init.signal ?? request.signal;
    const body = await request.text();
    if (this.latency > 0) {
      await wait(this.latency, signal);
    }

    if (new URL(request.url).pathname === '/oauth/token') {
      this.grantBodies.push(body);
      this.grants += 1;
      return this.grantAnswer(this.grants);
    }

    this.apiCalls += 1;
    if (this.apiLatency) {
      await wait(this.apiLatency(this.apiCalls), signal);
    }

    this.requests.push({
      method: request.method,
      url: request.url,
      body,
      authorization: request.headers.get('Authorization'),
      accept: request.headers.get('Accept'),
      contentType: request.headers.get('Content-Type'),
    });

    const answer = this.respond ?? this.answers.shift();
    if (!answer) {
      throw new Error(`No answer queued for ${request.method} ${request.url}.`);
    }

    return answer(request, signal);
  };

  answer(answer: Answer): this {
    this.answers.push(answer);
    return this;
  }

  answerJson(status: number, body: unknown, headers: Record<string, string> = {}): this {
    return this.answer(() => json(status, body, headers));
  }

  answerError(status: number, code: string, times = 1, headers: Record<string, string> = {}): this {
    for (let i = 0; i < times; i++) {
      this.answer(() => errorResponse(status, code, 'req-1', headers));
    }
    return this;
  }

  answerThrow(error: unknown, times = 1): this {
    for (let i = 0; i < times; i++) {
      this.answer(() => {
        throw error;
      });
    }
    return this;
  }

  answerHang(): this {
    return this.answer((_request, signal) => wait(Number.POSITIVE_INFINITY, signal).then(() => json(200, {})));
  }

  client(options: Partial<PuntjesOptions> = {}) {
    return createPuntjes({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      baseUrl: 'https://shop.test',
      fetch: this.fetch,
      sleep: async () => {},
      ...options,
    });
  }
}

export function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = Number.isFinite(ms) ? setTimeout(resolve, ms) : undefined;
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason);
    }, { once: true });
  });
}
