import { PuntjesError, TransportError } from '../errors.js';
import { toError } from './error-body.js';
import type { Fetch } from './fetch.js';

/** The outermost layer: a non-2xx response becomes its family error, a failed fetch a `TransportError`. */
export function errorFetch(next: Fetch): Fetch {
  return async (request) => {
    let response: Response;
    try {
      response = await next(request);
    } catch (error) {
      if (error instanceof PuntjesError || request.signal.aborted) {
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
