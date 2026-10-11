import { describe, expect, it } from 'vitest';
import { dispatchPlan } from '../tools/dispatch-plan.ts';

const url = 'https://raw.githubusercontent.com/PuntjesApp/puntjes-openapi/v1.1.0/api.json';

function plan(...args: string[]): { exit: number; plan: Record<string, string> } {
  const lines: string[] = [];
  const exit = dispatchPlan(args, (line) => lines.push(line), () => {});
  return { exit, plan: Object.fromEntries(lines.map((line) => [line.split('=', 1)[0], line.slice(line.indexOf('=') + 1)])) };
}

describe('dispatch plan', () => {
  it('makes a minor a feat that merges itself', () => {
    expect(plan('v1.1.0', 'minor', url, 'main@abc1234')).toEqual({
      exit: 0,
      plan: { skip: 'false', commit_type: 'feat', auto_merge: 'true', branch: 'regenerate/v1.1.0', close: '' },
    });
  });

  it('makes a major breaking and lets it wait for a person', () => {
    const { plan: p } = plan('v1.1.0', 'major', url, 'main@abc1234');

    expect([p.commit_type, p.auto_merge]).toEqual(['feat!', 'false']);
  });

  it('makes a patch a fix', () => {
    expect(plan('v1.1.0', 'patch', url, 'main@abc1234').plan.commit_type).toBe('fix');
  });

  it('skips the tag already in SOURCE', () => {
    expect(plan('v1.1.0', 'minor', url, 'v1.1.0').plan.skip).toBe('true');
  });

  it('refuses a URL outside puntjes-openapi or for another tag', () => {
    expect(plan('v1.1.0', 'minor', 'https://example.com/api.json', 'x').exit).toBe(1);
    expect(plan('v1.1.0', 'minor', 'https://raw.githubusercontent.com/PuntjesApp/puntjes-openapi/v9.9.9/api.json', 'x').exit).toBe(1);
  });

  it('refuses an unknown level or tag', () => {
    expect(plan('v1.1.0', 'huge', url, 'x').exit).toBe(1);
    expect(plan('v1.1.0;rm', 'minor', url, 'x').exit).toBe(1);
  });

  it('skips a tag older than the one in SOURCE', () => {
    expect(plan('v1.1.0', 'minor', url, 'v1.2.0').plan.skip).toBe('true');
  });

  it('compares versions by number, not by text', () => {
    const newer = 'https://raw.githubusercontent.com/PuntjesApp/puntjes-openapi/v1.10.0/api.json';

    expect(plan('v1.10.0', 'minor', newer, 'v1.9.0').plan.skip).toBe('false');
    expect(plan('v1.9.0', 'minor', newer.replace('v1.10.0', 'v1.9.0'), 'v1.10.0').plan.skip).toBe('true');
  });

  it('skips the older tag when a regenerate PR for a newer tag is open', () => {
    const { plan: p } = plan('v1.1.0', 'minor', url, 'main@abc1234', 'regenerate/v1.0.0\nregenerate/v1.2.0');

    expect([p.skip, p.close]).toEqual(['true', '']);
  });

  it('closes the open regenerate PRs for older tags', () => {
    const { plan: p } = plan('v1.1.0', 'minor', url, 'v1.0.0', 'regenerate/v1.0.1\nregenerate/v1.1.0\nfeature/x\nregenerate/v0.9.0\nregenerate/v1.0.2;rm');

    expect([p.skip, p.close]).toEqual(['false', 'regenerate/v1.0.1 regenerate/v0.9.0']);
  });

  it('makes the new PR a major when it closes an open major for an older tag', () => {
    const { plan: p } = plan('v1.1.0', 'patch', url, 'v1.0.0', 'regenerate/v1.0.5 feat!: regenerate from puntjes-openapi v1.0.5');

    expect([p.close, p.commit_type, p.auto_merge]).toEqual(['regenerate/v1.0.5', 'feat!', 'false']);
  });

  it('keeps the new level when it closes an open minor for an older tag', () => {
    const { plan: p } = plan('v1.1.0', 'patch', url, 'v1.0.0', 'regenerate/v1.0.5 feat: regenerate from puntjes-openapi v1.0.5');

    expect([p.close, p.commit_type, p.auto_merge]).toEqual(['regenerate/v1.0.5', 'fix', 'true']);
  });

  it('makes the new PR a major when SOURCE has a lower major', () => {
    const { plan: p } = plan('v2.0.1', 'patch', 'https://raw.githubusercontent.com/PuntjesApp/puntjes-openapi/v2.0.1/api.json', 'v1.9.0');

    expect([p.commit_type, p.auto_merge]).toEqual(['feat!', 'false']);
  });

  it('keeps the new level when SOURCE is not a tag', () => {
    const { plan: p } = plan('v1.1.0', 'patch', url, 'main@abc1234');

    expect([p.commit_type, p.auto_merge]).toEqual(['fix', 'true']);
  });
});
