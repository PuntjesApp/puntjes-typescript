import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { errorCodes, render } from '../tools/codegen.ts';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/codegen-spec.json', import.meta.url), 'utf8'));

describe('codegen', () => {
  it('lists every error code once, sorted, with its status', () => {
    expect(errorCodes(fixture)).toEqual([
      { code: 'CUSTOMER_NOT_FOUND', status: 404 },
      { code: 'PLAN_LIMIT_EXCEEDED', status: 429 },
      { code: 'RATE_LIMITED', status: 429 },
    ]);
  });

  it('refuses a code with two statuses', () => {
    const spec = { a: { 'x-error-codes': [{ code: 'X', status: 404 }] }, b: { 'x-error-codes': [{ code: 'X', status: 409 }] } };

    expect(() => errorCodes(spec)).toThrow('X has two statuses');
  });

  it('maps each member to its wire code and status', () => {
    const source = render(errorCodes(fixture));

    expect(source).toContain("PlanLimitExceeded: 'PLAN_LIMIT_EXCEEDED',");
    expect(source).toContain('PLAN_LIMIT_EXCEEDED: 429,');
  });

  it('renders a module whose values match the codes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'puntjes-codegen-'));
    writeFileSync(join(dir, 'error-codes.gen.ts'), render(errorCodes(fixture)));
    const module = await import(join(dir, 'error-codes.gen.ts'));

    expect(module.ErrorCode.RateLimited).toBe('RATE_LIMITED');
    expect(module.errorCodeStatus.CUSTOMER_NOT_FOUND).toBe(404);
    expect(module.isErrorCode('RATE_LIMITED')).toBe(true);
    expect(module.isErrorCode('SOMETHING_NEW')).toBe(false);
  });
});
