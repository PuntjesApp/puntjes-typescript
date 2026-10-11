import { type ErrorCode, isErrorCode } from './generated/error-codes.gen.js';

export interface PuntjesErrorInit {
  status?: number | null;
  rawCode?: string | null;
  requestId?: string | null;
  details?: Record<string, unknown> | null;
  cause?: unknown;
}

/**
 * A call the Puntjes API refused, or one that got no usable answer. `code` is null for a code this version does not
 * know yet; `rawCode` always holds the code as the API sent it.
 */
export class PuntjesError extends Error {
  readonly status: number | null;
  readonly rawCode: string | null;
  readonly code: ErrorCode | null;
  /** Identifies the request in the Puntjes logs. Quote it when you report a problem. */
  readonly requestId: string | null;
  /** Extra context; a validation error holds each rejected field and its messages here. */
  readonly details: Record<string, unknown> | null;

  constructor(message: string, init: PuntjesErrorInit = {}) {
    super(message, init.cause === undefined ? undefined : { cause: init.cause });
    this.name = new.target.name;
    this.status = init.status ?? null;
    this.rawCode = init.rawCode ?? null;
    this.code = this.rawCode !== null && isErrorCode(this.rawCode) ? this.rawCode : null;
    this.requestId = init.requestId ?? null;
    this.details = init.details ?? null;
  }
}

/** HTTP 401: the credentials or the token were refused. */
export class AuthenticationError extends PuntjesError {}

/** HTTP 403. */
export class ForbiddenError extends PuntjesError {}

/** HTTP 404. */
export class NotFoundError extends PuntjesError {}

/** HTTP 409. */
export class ConflictError extends PuntjesError {}

/** HTTP 422 with VALIDATION_ERROR; `details` holds the fields. Other 422 codes are domain refusals. */
export class ValidationError extends PuntjesError {
  /** The messages for one rejected field, or none. */
  errorsFor(field: string): string[] {
    const messages = this.details?.[field];
    return Array.isArray(messages) ? messages.filter((m): m is string => typeof m === 'string') : [];
  }
}

/** HTTP 429 with RATE_LIMITED: wait `retryAfter` milliseconds and try again. */
export class RateLimitError extends PuntjesError {
  readonly retryAfter: number | null;

  constructor(message: string, init: PuntjesErrorInit & { retryAfter?: number | null } = {}) {
    super(message, init);
    this.retryAfter = init.retryAfter ?? null;
  }
}

/** HTTP 429 with PLAN_LIMIT_EXCEEDED: the shop's plan is used up. Waiting does not clear it. */
export class PlanLimitExceededError extends PuntjesError {}

/** HTTP 5xx. */
export class ServerError extends PuntjesError {}

/** No usable answer: the network failed, or something other than the Puntjes API answered. */
export class TransportError extends PuntjesError {}
