export type Fetch = (request: Request) => Promise<Response>;

/** Lets a layer chain that takes a `Request` stand where the generated client expects the global `fetch`. */
export function asGlobalFetch(chain: Fetch): typeof fetch {
  return (input: RequestInfo | URL, init?: RequestInit) => chain(input instanceof Request && init === undefined ? input : new Request(input, init));
}
