import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Stdio-framing tests for the VI semantic MCP server entrypoint mapped to
 * VHS-REQ-689 (dev-only sweep, epic #2159). The protocol logic lives in the
 * covered handler; here we mock the handler + deps builder and drive stubbed
 * process.stdin/stdout to verify the thin stream-framing wiring.
 */

const handleMock = vi.fn();

vi.mock('../../src/semantic/viSemanticComparisonMcp', () => ({
  handleViSemanticMcpMessageAsync: (...args: unknown[]) => handleMock(...args),
}));

vi.mock('../../src/mcp/viSemanticMcpServerDeps', () => ({
  buildViSemanticMcpServerDeps: () => ({ __deps: true }),
  createDefaultComparisonModelCache: () => ({ __cache: true }),
}));

type StdinStub = EventEmitter & {
  setEncoding: (encoding: string) => void;
};

function makeStdinStub(): StdinStub {
  const emitter = new EventEmitter() as StdinStub;
  emitter.setEncoding = vi.fn();
  return emitter;
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('runViSemanticMcpServer stdio framing (VHS-REQ-689)', () => {
  let stdinStub: StdinStub;
  let stdoutWrites: string[];
  let stderrWrites: string[];
  let originalStdin: PropertyDescriptor | undefined;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let runViSemanticMcpServer: () => void;

  beforeEach(async () => {
    vi.resetModules();
    handleMock.mockReset();
    stdinStub = makeStdinStub();
    stdoutWrites = [];
    stderrWrites = [];

    originalStdin = Object.getOwnPropertyDescriptor(process, 'stdin');
    Object.defineProperty(process, 'stdin', {
      value: stdinStub,
      configurable: true,
    });
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      stdoutWrites.push(String(chunk));
      return true;
    });
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
      stderrWrites.push(String(chunk));
      return true;
    });

    ({ runViSemanticMcpServer } = await import('../../src/cli/runViSemanticMcpServer'));
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    if (originalStdin) {
      Object.defineProperty(process, 'stdin', originalStdin);
    }
  });

  it('dispatches newline-delimited lines to the handler and writes responses, skipping blanks (VHS-REQ-689.1)', async () => {
    handleMock.mockResolvedValue({ jsonrpc: '2.0', id: 1, result: 'ok' });
    runViSemanticMcpServer();

    stdinStub.emit('data', '{"jsonrpc":"2.0","id":1,"method":"ping"}\n\n');
    await flush();

    expect(handleMock).toHaveBeenCalledTimes(1);
    expect(handleMock).toHaveBeenCalledWith(
      { jsonrpc: '2.0', id: 1, method: 'ping' },
      { __deps: true },
    );
    expect(stdoutWrites).toContain('{"jsonrpc":"2.0","id":1,"result":"ok"}\n');
  });

  it('answers malformed JSON with a JSON-RPC parse error and never calls the handler (VHS-REQ-689.2)', async () => {
    runViSemanticMcpServer();

    stdinStub.emit('data', 'not-json\n');
    await flush();

    expect(handleMock).not.toHaveBeenCalled();
    expect(stdoutWrites).toContain(
      '{"jsonrpc":"2.0","id":null,"error":{"code":-32700,"message":"parse error"}}\n',
    );
  });

  it('flushes a trailing unterminated line when the stream ends (VHS-REQ-689.3)', async () => {
    handleMock.mockResolvedValue({ jsonrpc: '2.0', id: 7, result: 'tail' });
    runViSemanticMcpServer();

    stdinStub.emit('data', '{"jsonrpc":"2.0","id":7,"method":"ping"}');
    stdinStub.emit('end');
    await flush();

    expect(handleMock).toHaveBeenCalledTimes(1);
    expect(stdoutWrites).toContain('{"jsonrpc":"2.0","id":7,"result":"tail"}\n');
  });
});
