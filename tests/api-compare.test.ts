import { describe, expect, it } from 'vitest';
import { removedOrChanged } from '../tools/api-compare.ts';

function report(...blocks: string[]): string {
  return ['## API Report File', '', '```ts', '', blocks.join('\n\n'), '', '```', ''].join('\n');
}

const widget = ['// @public', 'export interface Widget {', '    // (undocumented)', '    id: number;', '}'].join('\n');

describe('API compare', () => {
  it('passes an identical API', () => {
    expect(removedOrChanged(report(widget), report(widget))).toEqual([]);
  });

  it('passes an added declaration and an added member', () => {
    const more = widget.replace('    id: number;', '    id: number;\n    name?: string;');
    const other = 'export type Other = string;';

    expect(removedOrChanged(report(widget), report(more, other))).toEqual([]);
  });

  it('reports a removed declaration', () => {
    expect(removedOrChanged(report(widget, 'export type Other = string;'), report(widget))).toEqual(['export type Other was removed.']);
  });

  it('reports a removed member', () => {
    const fewer = widget.replace('    id: number;\n', '');

    expect(removedOrChanged(report(widget), report(fewer))).toEqual(['export interface Widget changed. No longer there: id: number;']);
  });

  it('reports a changed signature as a lost line', () => {
    const changed = widget.replace('id: number', 'id: string');

    expect(removedOrChanged(report(widget), report(changed))).toEqual(['export interface Widget changed. No longer there: id: number;']);
  });

  it('reports a name that now means something else', () => {
    const before = 'export type Data = {\n    body?: never;\n    url: string;\n};';
    const after = 'export type Data = {\n    branch?: string | null;\n    url: string;\n};';

    expect(removedOrChanged(report(before), report(after))).toEqual(['export type Data changed. No longer there: body?: never;']);
  });
});
