import { describe, expect, it } from 'vitest';

import { scanFlags, type ScanFlagsSpec } from '../../src/tooling/cliFlags';

interface Captured {
  flags: string[];
  values: Record<string, string>;
}

function makeSpec(
  captured: Captured,
  overrides: Partial<ScanFlagsSpec> = {}
): ScanFlagsSpec {
  return {
    boolFlags: {
      '--verbose': () => {
        captured.flags.push('--verbose');
      },
      '-h': () => {
        captured.flags.push('-h');
      }
    },
    valueFlags: {
      '--name': (value) => {
        captured.values['--name'] = value;
      },
      '--path': (value) => {
        captured.values['--path'] = value;
      }
    },
    ...overrides
  };
}

describe('scanFlags', () => {
  it('dispatches boolean flags including aliases', () => {
    const captured: Captured = { flags: [], values: {} };
    scanFlags(['--verbose', '-h'], makeSpec(captured));
    expect(captured.flags).toEqual(['--verbose', '-h']);
  });

  it('reads value flags and consumes the following token', () => {
    const captured: Captured = { flags: [], values: {} };
    scanFlags(['--name', 'alpha', '--path', '/tmp/x'], makeSpec(captured));
    expect(captured.values).toEqual({ '--name': 'alpha', '--path': '/tmp/x' });
  });

  it('throws for an unknown argument', () => {
    const captured: Captured = { flags: [], values: {} };
    expect(() => scanFlags(['--bogus'], makeSpec(captured))).toThrow(
      'Unknown argument: --bogus'
    );
  });

  it('throws when a value flag has no following token', () => {
    const captured: Captured = { flags: [], values: {} };
    expect(() => scanFlags(['--name'], makeSpec(captured))).toThrow(
      'Missing value for --name.'
    );
  });

  it('appends the usage text to every error when usage is provided', () => {
    const captured: Captured = { flags: [], values: {} };
    const spec = makeSpec(captured, { usage: () => 'USAGE LINE' });
    expect(() => scanFlags(['--name'], spec)).toThrow(
      'Missing value for --name.\n\nUSAGE LINE'
    );
    expect(() => scanFlags(['--bogus'], spec)).toThrow(
      'Unknown argument: --bogus\n\nUSAGE LINE'
    );
  });

  describe('trimValues mode', () => {
    it('trims the resolved value', () => {
      const captured: Captured = { flags: [], values: {} };
      scanFlags(['--name', '  alpha  '], makeSpec(captured, { trimValues: true }));
      expect(captured.values['--name']).toBe('alpha');
    });

    it('treats a blank value as missing', () => {
      const captured: Captured = { flags: [], values: {} };
      expect(() =>
        scanFlags(['--name', '   '], makeSpec(captured, { trimValues: true }))
      ).toThrow('Missing value for --name.');
    });

    it('accepts a flag-like token as the value verbatim', () => {
      const captured: Captured = { flags: [], values: {} };
      scanFlags(['--name', '--other'], makeSpec(captured, { trimValues: true }));
      expect(captured.values['--name']).toBe('--other');
    });
  });

  describe('rejectFlagLikeValues mode', () => {
    it('treats a flag-like token as a missing value', () => {
      const captured: Captured = { flags: [], values: {} };
      expect(() =>
        scanFlags(
          ['--name', '--verbose'],
          makeSpec(captured, { rejectFlagLikeValues: true })
        )
      ).toThrow('Missing value for --name.');
    });

    it('accepts a normal value token', () => {
      const captured: Captured = { flags: [], values: {} };
      scanFlags(
        ['--name', 'alpha'],
        makeSpec(captured, { rejectFlagLikeValues: true })
      );
      expect(captured.values['--name']).toBe('alpha');
    });
  });
});
