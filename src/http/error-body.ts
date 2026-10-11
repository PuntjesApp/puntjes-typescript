import {
  AuthenticationError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  PlanLimitExceededError,
  PuntjesError,
  RateLimitError,
  ServerError,
  TransportError,
  ValidationError,
} from '../errors.js';

export const RATE_LIMITED = 'RATE_LIMITED';
export const PLAN_LIMIT_EXCEEDED = 'PLAN_LIMIT_EXCEEDED';

export interface ErrorBody {
  status: number;
  code: string;
  message: string;
  requestId: string | null;
  details: Record<string, unknown> | null;
  isJson: boolean;
  excerpt: string;
}

/** Reads the error envelope of a response that is already buffered. Never throws on a malformed body. */
export async function readErrorBody(response: Response): Promise<ErrorBody> {
  const status = response.status;
  const text = await response.clone().text();
  const excerpt = text.slice(0, 200);
  const fallback = `The Puntjes API returned HTTP ${status}.`;
  const headerId = response.headers.get('X-Request-ID');

  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    return { status, code: 'NON_JSON_RESPONSE', message: fallback, requestId: headerId, details: null, isJson: false, excerpt };
  }

  const error = isObject(root) && isObject(root.error) ? root.error : {};

  return {
    status,
    code: stringOrNull(error.code) ?? 'UNKNOWN_ERROR',
    message: stringOrNull(error.message) ?? fallback,
    requestId: stringOrNull(error.request_id) ?? headerId,
    details: isObject(error.details) ? error.details : null,
    isJson: true,
    excerpt,
  };
}

/** The family error for a non-2xx response. */
export async function toError(response: Response): Promise<PuntjesError> {
  const body = await readErrorBody(response);
  if (!body.isJson) {
    return body.status >= 500
      ? new ServerError(
          `The Puntjes API returned HTTP ${body.status} with a non-JSON body, likely a proxy answering for a failing backend: ${body.excerpt}`,
          { status: body.status, rawCode: body.code, requestId: body.requestId },
        )
      : new TransportError(`The Puntjes API returned a non-JSON error response (HTTP ${body.status}): ${body.excerpt}`, {
          status: body.status,
        });
  }

  const init = { status: body.status, rawCode: body.code, requestId: body.requestId, details: body.details };
  const { status, code, message } = body;

  if (status === 429 && code === PLAN_LIMIT_EXCEEDED) return new PlanLimitExceededError(message, init);
  if (status === 429) return new RateLimitError(message, { ...init, retryAfter: retryAfter(response.headers.get('Retry-After'), Date.now()) });
  if (status === 422 && code === 'VALIDATION_ERROR') return new ValidationError(message, init);
  if (status === 401) return new AuthenticationError(message, init);
  if (status === 403) return new ForbiddenError(message, init);
  if (status === 404) return new NotFoundError(message, init);
  if (status === 409) return new ConflictError(message, init);
  if (status >= 500) return new ServerError(message, init);

  return new PuntjesError(message, init);
}

/** The wait a `Retry-After` header asks for, in milliseconds, never negative; null when it says nothing usable. */
export function retryAfter(header: string | null, now: number): number | null {
  if (header === null || header.trim() === '') {
    return null;
  }

  if (/^\d+$/.test(header.trim())) {
    return Number(header.trim()) * 1000;
  }

  const date = Date.parse(header);

  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}
