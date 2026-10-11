import type { TokenSource } from '../auth/token-source.ts';
import type { Fetch } from './fetch.ts';

/**
 * The innermost layer. The generated client marks each operation that needs a token with a placeholder header; this
 * layer puts the current token there on every attempt, with one new grant and one resend after a 401. A public
 * operation carries no header and passes untouched.
 */
export function authFetch(next: Fetch, tokens: TokenSource): Fetch {
  return async (request) => {
    if (!request.headers.has('Authorization')) {
      return next(request);
    }

    const token = await tokens.get();
    const response = await next(signed(request.clone(), token));
    if (response.status !== 401) {
      return response;
    }

    await tokens.forget(token);

    return next(signed(request, await tokens.get()));
  };
}

function signed(request: Request, token: string): Request {
  const headers = new Headers(request.headers);
  headers.set('Authorization', `Bearer ${token}`);

  return new Request(request, { headers });
}
