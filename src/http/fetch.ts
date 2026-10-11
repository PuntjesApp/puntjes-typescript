/**
 * One layer of the transport. `signal` travels beside the request, never inside it: a signal a `Request` derives from
 * its parent is lost when garbage collection takes an intermediate `Request`, and the abort then never arrives.
 */
export type Fetch = (request: Request, init?: { signal?: AbortSignal }) => Promise<Response>;

/** Lets a layer chain that takes a `Request` stand where the generated client expects the global `fetch`. */
export function asGlobalFetch(chain: Fetch): typeof fetch {
  return (input: RequestInfo | URL, init?: RequestInit) => chain(input instanceof Request && init === undefined ? input : new Request(input, init));
}
