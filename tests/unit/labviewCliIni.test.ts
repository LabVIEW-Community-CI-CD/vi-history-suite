import { describe, expect, it } from 'vitest';

import {
  applyLabVIEWCliIniHardening,
  DEFAULT_LABVIEW_CLI_INI_CANDIDATE_PATHS,
  LABVIEW_CLI_INI_AFTER_LAUNCH_KEY,
  LABVIEW_CLI_INI_BACKUP_SUFFIX,
  LABVIEW_CLI_INI_OPEN_APP_KEY,
  parseLabVIEWCliIniValue,
  setLabVIEWCliIniValue
} from '../../src/reporting/runtime/labviewCliIni';

interface FakeFs {
  files: Map<string, string>;
  readCalls: string[];
  writeCalls: { path: string; contents: string }[];
  renameCalls: { from: string; to: string }[];
  pathExistsCalls: string[];
}

interface HarnessOptions {
  initialFiles?: Record<string, string>;
  failRead?: boolean;
  failWrite?: boolean;
  failRename?: boolean;
  tokens?: string[];
}

function createHarness(options: HarnessOptions = {}) {
  const state: FakeFs = {
    files: new Map(Object.entries(options.initialFiles ?? {})),
    readCalls: [],
    writeCalls: [],
    renameCalls: [],
    pathExistsCalls: []
  };
  const tokenQueue = [...(options.tokens ?? ['token1', 'token2', 'token3', 'token4'])];

  const deps = {
    readFile: (async (filePath: string) => {
      state.readCalls.push(String(filePath));
      if (options.failRead) {
        throw new Error('read-failed');
      }
      const value = state.files.get(String(filePath));
      if (value === undefined) {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      }
      return value;
    }) as never,
    writeFile: (async (filePath: string, contents: string) => {
      state.writeCalls.push({ path: String(filePath), contents: String(contents) });
      if (options.failWrite) {
        throw new Error('write-failed');
      }
      state.files.set(String(filePath), String(contents));
    }) as never,
    rename: (async (from: string, to: string) => {
      state.renameCalls.push({ from: String(from), to: String(to) });
      if (options.failRename) {
        throw new Error('rename-failed');
      }
      const contents = state.files.get(String(from));
      if (contents === undefined) {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      }
      state.files.set(String(to), contents);
      state.files.delete(String(from));
    }) as never,
    pathExists: async (filePath: string) => {
      state.pathExistsCalls.push(String(filePath));
      return state.files.has(String(filePath));
    },
    randomToken: () => tokenQueue.shift() ?? 'fallback'
  };

  return { state, deps };
}

describe('applyLabVIEWCliIniHardening', () => {
  describe('parser helpers', () => {
    it('parseLabVIEWCliIniValue returns the value when present', () => {
      expect(
        parseLabVIEWCliIniValue('OpenAppReferenceTimeoutInSecond=180\n', 'OpenAppReferenceTimeoutInSecond')
      ).toBe('180');
    });

    it('parseLabVIEWCliIniValue returns undefined when missing', () => {
      expect(parseLabVIEWCliIniValue('Other=1\n', 'OpenAppReferenceTimeoutInSecond')).toBeUndefined();
    });

    it('setLabVIEWCliIniValue replaces an existing line in place', () => {
      const original = 'A=1\nOpenAppReferenceTimeoutInSecond=30\nB=2\n';
      const result = setLabVIEWCliIniValue(original, 'OpenAppReferenceTimeoutInSecond', '180');
      expect(result).toContain('OpenAppReferenceTimeoutInSecond=180');
      expect(result).not.toContain('OpenAppReferenceTimeoutInSecond=30');
      expect(result).toContain('A=1');
      expect(result).toContain('B=2');
    });

    it('setLabVIEWCliIniValue appends when the key is missing', () => {
      const result = setLabVIEWCliIniValue('A=1\n', 'OpenAppReferenceTimeoutInSecond', '180');
      expect(result.endsWith('OpenAppReferenceTimeoutInSecond=180\n')).toBe(true);
      expect(result.startsWith('A=1')).toBe(true);
    });
  });

  it('returns no-candidate without writing when no candidate ini exists', async () => {
    const { state, deps } = createHarness();
    const result = await applyLabVIEWCliIniHardening({
      candidatePaths: ['C:\\nope\\LabVIEWCLI.ini'],
      requestedValueSeconds: 180,
      deps
    });
    expect(result.applied).toBe(false);
    expect(result.reason).toBe('no-candidate');
    expect(state.writeCalls).toHaveLength(0);
    expect(state.renameCalls).toHaveLength(0);
  });

  it('writes both keys atomically and creates a one-time backup on first run', async () => {
    const iniPath = 'C:\\fake\\LabVIEWCLI.ini';
    const { state, deps } = createHarness({
      initialFiles: { [iniPath]: 'A=1\n' }
    });
    const result = await applyLabVIEWCliIniHardening({
      candidatePaths: [iniPath],
      requestedValueSeconds: 180,
      deps
    });
    expect(result.applied).toBe(true);
    expect(result.iniPath).toBe(iniPath);
    expect(result.backupCreated).toBe(true);
    expect(result.currentValues).toEqual({
      [LABVIEW_CLI_INI_OPEN_APP_KEY]: '180',
      [LABVIEW_CLI_INI_AFTER_LAUNCH_KEY]: '180'
    });

    const backupPath = `${iniPath}${LABVIEW_CLI_INI_BACKUP_SUFFIX}`;
    expect(state.files.get(backupPath)).toBe('A=1\n');

    expect(state.renameCalls).toHaveLength(1);
    expect(state.renameCalls[0].to).toBe(iniPath);
    expect(state.renameCalls[0].from).toContain('.vhs-tmp');

    const finalContents = state.files.get(iniPath)!;
    expect(finalContents).toContain('OpenAppReferenceTimeoutInSecond=180');
    expect(finalContents).toContain('AfterLaunchOpenAppReferenceTimeoutInSecond=180');
  });

  it('short-circuits with already-current when both keys already match', async () => {
    const iniPath = 'C:\\fake\\LabVIEWCLI.ini';
    const initial =
      'OpenAppReferenceTimeoutInSecond=180\nAfterLaunchOpenAppReferenceTimeoutInSecond=180\n';
    const { state, deps } = createHarness({
      initialFiles: { [iniPath]: initial }
    });
    const result = await applyLabVIEWCliIniHardening({
      candidatePaths: [iniPath],
      requestedValueSeconds: 180,
      deps
    });
    expect(result.applied).toBe(false);
    expect(result.reason).toBe('already-current');
    expect(state.writeCalls).toHaveLength(0);
    expect(state.renameCalls).toHaveLength(0);
  });

  it('does not overwrite an existing backup on subsequent runs', async () => {
    const iniPath = 'C:\\fake\\LabVIEWCLI.ini';
    const backupPath = `${iniPath}${LABVIEW_CLI_INI_BACKUP_SUFFIX}`;
    const { state, deps } = createHarness({
      initialFiles: {
        [iniPath]: 'OpenAppReferenceTimeoutInSecond=30\n',
        [backupPath]: 'EARLIER_PRISTINE_BACKUP\n'
      }
    });
    const result = await applyLabVIEWCliIniHardening({
      candidatePaths: [iniPath],
      requestedValueSeconds: 180,
      deps
    });
    expect(result.applied).toBe(true);
    expect(result.backupCreated).toBe(false);
    expect(state.files.get(backupPath)).toBe('EARLIER_PRISTINE_BACKUP\n');
  });

  it('returns read-failed without writing when the ini cannot be read', async () => {
    const iniPath = 'C:\\fake\\LabVIEWCLI.ini';
    const { state, deps } = createHarness({
      initialFiles: { [iniPath]: 'A=1\n' },
      failRead: true
    });
    const result = await applyLabVIEWCliIniHardening({
      candidatePaths: [iniPath],
      requestedValueSeconds: 180,
      deps
    });
    expect(result.applied).toBe(false);
    expect(result.reason).toBe('read-failed');
    expect(state.writeCalls).toHaveLength(0);
    expect(state.renameCalls).toHaveLength(0);
  });

  it('returns write-failed when the tempfile write throws', async () => {
    const iniPath = 'C:\\fake\\LabVIEWCLI.ini';
    const { state, deps } = createHarness({
      initialFiles: { [iniPath]: 'A=1\n' },
      failWrite: true
    });
    const result = await applyLabVIEWCliIniHardening({
      candidatePaths: [iniPath],
      requestedValueSeconds: 180,
      deps
    });
    expect(result.applied).toBe(false);
    expect(result.reason).toBe('write-failed');
    expect(state.renameCalls).toHaveLength(0);
    expect(state.files.get(iniPath)).toBe('A=1\n');
  });

  it('returns rename-failed and leaves the original intact', async () => {
    const iniPath = 'C:\\fake\\LabVIEWCLI.ini';
    const { state, deps } = createHarness({
      initialFiles: { [iniPath]: 'A=1\n' },
      failRename: true
    });
    const result = await applyLabVIEWCliIniHardening({
      candidatePaths: [iniPath],
      requestedValueSeconds: 180,
      deps
    });
    expect(result.applied).toBe(false);
    expect(result.reason).toBe('rename-failed');
    expect(state.files.get(iniPath)).toBe('A=1\n');
  });

  it('rejects non-positive or non-integer values without touching the filesystem', async () => {
    const { state, deps } = createHarness({
      initialFiles: { 'C:\\fake\\LabVIEWCLI.ini': 'A=1\n' }
    });
    for (const bad of [0, -1, 1.5, Number.NaN]) {
      const result = await applyLabVIEWCliIniHardening({
        candidatePaths: ['C:\\fake\\LabVIEWCLI.ini'],
        requestedValueSeconds: bad,
        deps
      });
      expect(result.applied).toBe(false);
      expect(result.reason).toBe('invalid-value');
    }
    expect(state.readCalls).toHaveLength(0);
    expect(state.writeCalls).toHaveLength(0);
  });

  it('handles parallel-call simulation: second call short-circuits as already-current', async () => {
    const iniPath = 'C:\\fake\\LabVIEWCLI.ini';
    const { state, deps } = createHarness({
      initialFiles: { [iniPath]: 'A=1\n' }
    });
    const first = await applyLabVIEWCliIniHardening({
      candidatePaths: [iniPath],
      requestedValueSeconds: 180,
      deps
    });
    expect(first.applied).toBe(true);
    const beforeSecond = state.writeCalls.length;
    const second = await applyLabVIEWCliIniHardening({
      candidatePaths: [iniPath],
      requestedValueSeconds: 180,
      deps
    });
    expect(second.applied).toBe(false);
    expect(second.reason).toBe('already-current');
    expect(state.writeCalls.length).toBe(beforeSecond);
    expect(state.renameCalls).toHaveLength(1);
  });

  it('exports the documented default candidate paths', () => {
    expect(DEFAULT_LABVIEW_CLI_INI_CANDIDATE_PATHS.length).toBeGreaterThan(0);
    expect(DEFAULT_LABVIEW_CLI_INI_CANDIDATE_PATHS[0]).toContain('LabVIEWCLI.ini');
  });

  it('applies primary write even when the backup write throws (fail-soft backup)', async () => {
    const iniPath = 'C:\\fake\\LabVIEWCLI.ini';
    const backupPath = `${iniPath}${LABVIEW_CLI_INI_BACKUP_SUFFIX}`;
    const { state, deps } = createHarness({
      initialFiles: { [iniPath]: 'A=1\n' }
    });
    const innerWrite = deps.writeFile as unknown as (
      p: string,
      c: string
    ) => Promise<void>;
    deps.writeFile = (async (filePath: string, contents: string) => {
      if (String(filePath) === backupPath) {
        throw new Error('backup-write-denied');
      }
      return innerWrite(filePath, contents);
    }) as never;

    const result = await applyLabVIEWCliIniHardening({
      candidatePaths: [iniPath],
      requestedValueSeconds: 180,
      deps
    });
    expect(result.applied).toBe(true);
    expect(result.backupCreated).toBe(false);
    expect(state.files.has(backupPath)).toBe(false);
    const finalContents = state.files.get(iniPath)!;
    expect(finalContents).toContain('OpenAppReferenceTimeoutInSecond=180');
  });

  it('proceeds to write when only one of the two keys already matches', async () => {
    const iniPath = 'C:\\fake\\LabVIEWCLI.ini';
    const { state, deps } = createHarness({
      initialFiles: {
        [iniPath]: `${LABVIEW_CLI_INI_OPEN_APP_KEY}=180\n`
      }
    });
    const result = await applyLabVIEWCliIniHardening({
      candidatePaths: [iniPath],
      requestedValueSeconds: 180,
      deps
    });
    expect(result.applied).toBe(true);
    expect(result.reason).toBeUndefined();
    expect(state.renameCalls).toHaveLength(1);
    const finalContents = state.files.get(iniPath)!;
    expect(finalContents).toContain(`${LABVIEW_CLI_INI_AFTER_LAUNCH_KEY}=180`);
  });

  it('decodes a Buffer returned by readFile before parsing', async () => {
    const iniPath = 'C:\\fake\\LabVIEWCLI.ini';
    const { state, deps } = createHarness({
      initialFiles: { [iniPath]: 'A=1\n' }
    });
    deps.readFile = (async () => Buffer.from('A=1\n', 'utf8')) as never;
    const result = await applyLabVIEWCliIniHardening({
      candidatePaths: [iniPath],
      requestedValueSeconds: 180,
      deps
    });
    expect(result.applied).toBe(true);
    const finalContents = state.files.get(iniPath)!;
    expect(finalContents).toContain('OpenAppReferenceTimeoutInSecond=180');
  });
});

describe('parseLabVIEWCliIniValue and setLabVIEWCliIniValue edge cases', () => {
  it('parseLabVIEWCliIniValue trims surrounding whitespace around the value', () => {
    expect(parseLabVIEWCliIniValue('Key =  spaced  \n', 'Key')).toBe('spaced');
  });

  it('parseLabVIEWCliIniValue returns an empty string when the value is blank', () => {
    expect(parseLabVIEWCliIniValue('Key=\n', 'Key')).toBe('');
  });

  it('setLabVIEWCliIniValue appends without a leading newline on empty contents', () => {
    expect(setLabVIEWCliIniValue('', 'Key', 'val')).toBe('Key=val\n');
  });

  it('setLabVIEWCliIniValue trims trailing whitespace before appending', () => {
    expect(setLabVIEWCliIniValue('A=1\n\n  \n', 'Key', 'val')).toBe('A=1\nKey=val\n');
  });
});
