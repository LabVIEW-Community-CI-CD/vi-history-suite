import { describe, expect, it, vi } from 'vitest';

import { runExecFileText, type ExecFileTextRunner } from '../../src/tooling/execFileText';

// Contract tests for the shared structured execFile text runner (supporting
// VHS-REQ-659). Verifies the success/failure mapping the preview/render + verify
// call sites previously duplicated inline, using an injected runner (no real
// process spawn).

describe('runExecFileText', () => {
  it('maps success to exitCode 0 with captured stdout/stderr', async () => {
    const execFileAsync: ExecFileTextRunner = vi.fn(async () => ({ stdout: 'out', stderr: 'warn' }));
    const result = await runExecFileText('tool', ['--flag'], {
      timeoutMs: 1000,
      maxBufferBytes: 4096,
      execFileAsync
    });
    expect(result).toEqual({ exitCode: 0, stdout: 'out', stderr: 'warn' });
    expect(execFileAsync).toHaveBeenCalledWith('tool', ['--flag'], { timeout: 1000, maxBuffer: 4096 });
  });

  it('maps a numeric-code failure to that exit code with best-effort stdout/stderr', async () => {
    const execFileAsync: ExecFileTextRunner = async () => {
      throw Object.assign(new Error('boom'), { code: 3, stdout: 'partial', stderr: 'bad' });
    };
    const result = await runExecFileText('tool', [], { timeoutMs: 1, maxBufferBytes: 1, execFileAsync });
    expect(result).toEqual({ exitCode: 3, stdout: 'partial', stderr: 'bad' });
  });

  it('defaults exitCode to 1 when the failure code is not numeric', async () => {
    const execFileAsync: ExecFileTextRunner = async () => {
      throw Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' });
    };
    const result = await runExecFileText('missing', [], { timeoutMs: 1, maxBufferBytes: 1, execFileAsync });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('spawn ENOENT');
  });

  it('falls back stderr to String(error) when no message is present', async () => {
    const execFileAsync: ExecFileTextRunner = async () => {
      // A thrown non-Error value with no stderr/message.
      throw 'raw failure';
    };
    const result = await runExecFileText('tool', [], { timeoutMs: 1, maxBufferBytes: 1, execFileAsync });
    expect(result).toEqual({ exitCode: 1, stdout: '', stderr: 'raw failure' });
  });
});
