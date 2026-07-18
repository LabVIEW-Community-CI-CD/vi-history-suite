import { describe, expect, it } from 'vitest';

import { appendLabviewCliPortNumberArg } from '../../src/reporting/runtime/labviewCliPortArg';

describe('appendLabviewCliPortNumberArg', () => {
  it('appends -PortNumber when the port is a positive integer', () => {
    expect(appendLabviewCliPortNumberArg(['-VI1', 'a.vi'], 3363)).toEqual([
      '-VI1',
      'a.vi',
      '-PortNumber',
      '3363'
    ]);
  });

  it('replaces an existing -PortNumber value in place (case-insensitive)', () => {
    expect(
      appendLabviewCliPortNumberArg(['-portnumber', '1111', '-VI1', 'a.vi'], 3363)
    ).toEqual(['-portnumber', '3363', '-VI1', 'a.vi']);
  });

  it('leaves the argv unchanged for a non-integer or non-positive port', () => {
    expect(appendLabviewCliPortNumberArg(['-VI1'], undefined)).toEqual(['-VI1']);
    expect(appendLabviewCliPortNumberArg(['-VI1'], 0)).toEqual(['-VI1']);
    expect(appendLabviewCliPortNumberArg(['-VI1'], -5)).toEqual(['-VI1']);
    expect(appendLabviewCliPortNumberArg(['-VI1'], 3.5)).toEqual(['-VI1']);
  });

  it('returns a new array (does not mutate the input)', () => {
    const input = ['-VI1'];
    const output = appendLabviewCliPortNumberArg(input, 3363);
    expect(output).not.toBe(input);
    expect(input).toEqual(['-VI1']);
  });
});
