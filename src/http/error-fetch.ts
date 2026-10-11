import { TransportError } from '../errors.js';
import { isNetworkFailure } from './retry-fetch.js';
import { toError } from './error-body.js';
import type { Fetch } from './fetch.js';

/** The outermost layer: a non-2xx response becomes its family error, a failed connection a `TransportError`. */
export function errorFetch(next: Fetch): Fetch {
  return async (request, init) => {
    let response: Response;
    try {
      response = await next(request, init);
    } catch (error) {
      if (!isNetworkFailure(error) || request.signal.aborted) {
        throw error;
      }

      throw new TransportError(`The Puntjes API could not be reached: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }

    if (response.ok) {
      return response;
    }

    throw await toError(response);
  };
}
