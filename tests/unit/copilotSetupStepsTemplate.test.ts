import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

import { DEFAULT_LINUX_CONTAINER_IMAGE } from '../../src/reporting/runtime/containerRuntimePaths';

function readTemplate(): string {
  return fs
    .readFileSync(
      path.resolve(__dirname, '..', '..', 'docs', 'consumer-workflows', 'copilot-setup-steps.yml'),
      'utf8'
    )
    .replace(/\r\n/g, '\n');
}

// The executable YAML with full-line `#` comments stripped, so negative
// assertions target real workflow keys rather than the explanatory header.
function readTemplateCode(): string {
  return readTemplate()
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');
}

function readRunbook(): string {
  return fs
    .readFileSync(
      path.resolve(
        __dirname,
        '..',
        '..',
        'docs',
        'consumer-workflows',
        'copilot-cloud-agent-mcp-runbook.md'
      ),
      'utf8'
    )
    .replace(/\r\n/g, '\n');
}

describe('Copilot cloud-agent setup-steps consumer template (VHS-REQ-705)', () => {
  it('defines exactly the job id GitHub honors for the coding agent (VHS-REQ-705.1)', () => {
    const code = readTemplateCode();
    // GitHub only runs a job named exactly `copilot-setup-steps`.
    expect(code).toMatch(/^\s{2}copilot-setup-steps:\s*$/m);
    // Exactly one job is defined under `jobs:` — collect every 2-space-indented
    // job id and assert the set is exactly the honored one, so adding any other
    // job (which GitHub would ignore) fails the test.
    const jobsIndex = code.indexOf('\njobs:');
    const jobIds = code
      .slice(jobsIndex)
      .split('\n')
      .map((line) => line.match(/^\s{2}([a-z0-9][a-z0-9-]*):\s*$/))
      .filter((m): m is RegExpMatchArray => m !== null)
      .map((m) => m[1]);
    expect(jobIds).toEqual(['copilot-setup-steps']);
  });

  it('pins the vi-history-suite ref to an immutable release tag, not a floating branch (VHS-REQ-705.2)', () => {
    const code = readTemplateCode();
    const refMatch = code.match(/VIHS_REF:\s*(\S+)/);
    expect(refMatch).not.toBeNull();
    const ref = refMatch![1];
    // A reproducible, reviewed toolset requires an immutable ref (release tag
    // vX.Y.Z or a 40-char commit SHA) — never a floating branch head that could
    // build changes the consumer never adopted (supply-chain risk).
    expect(ref).not.toBe('develop');
    expect(ref).not.toBe('main');
    expect(ref).toMatch(/^(v\d+\.\d+\.\d+|[0-9a-f]{40})$/);
  });

  it('runs on an Ubuntu x64 runner within the 59-minute cap (VHS-REQ-705.1)', () => {
    const code = readTemplateCode();
    expect(code).toContain('runs-on: ubuntu-latest');
    expect(code).toMatch(/timeout-minutes:\s*59\b/);
  });

  it('clones vi-history-suite at a pinned ref and builds out/ (VHS-REQ-705.2)', () => {
    const code = readTemplateCode();
    expect(code).toContain('repository: LabVIEW-Community-CI-CD/vi-history-suite');
    // The ref is pinned through an env var, not floating implicitly.
    expect(code).toContain('ref: ${{ env.VIHS_REF }}');
    expect(code).toContain('npm ci');
    expect(code).toContain('npm run compile');
    // Fails loudly if the MCP entrypoint the repo-settings JSON references is
    // not produced by the build.
    expect(code).toContain('out/cli/runViSemanticMcpServer.js');
  });

  it('validates Docker and pre-pulls the canonical NI image, failing loud (VHS-REQ-705.3)', () => {
    const code = readTemplateCode();
    expect(code).toContain('command -v docker');
    expect(code).toContain('docker info');
    // The network-heavy pull must happen here, before the agent firewall.
    expect(code).toContain('docker pull');
    // Canonical <version>-linux tag, kept in lockstep with the runtime default.
    expect(code).toContain('nationalinstruments/labview:${CONTAINER_IMAGE_VERSION}-linux');
    const version = DEFAULT_LINUX_CONTAINER_IMAGE.split(':')[1].replace(/-linux$/, '');
    expect(code).toContain(`CONTAINER_IMAGE_VERSION: ${version}`);
    // Fail-loud posture: docker/daemon gaps exit non-zero, not a silent skip.
    expect(code).toMatch(/exit 1/);
  });

  it('prepares a container-visible TMPDIR under $HOME (VHS-REQ-705.3)', () => {
    const code = readTemplateCode();
    expect(code).toContain('TMPDIR=');
    expect(code).toContain('$HOME/.cache/');
    // Persisted for the agent phase via the environment file.
    expect(code).toContain('>> "$GITHUB_ENV"');
  });

  it('does not auto-trigger on push/PR and reads least-privilege permissions (VHS-REQ-705.1)', () => {
    const template = readTemplate();
    // Setup steps are for the agent / manual dispatch only — never a push or
    // pull_request trigger that would run the heavy prep on every event.
    expect(template).not.toMatch(/^\s*push:/m);
    expect(template).not.toMatch(/^on:\s*\n\s*pull_request:/m);
    expect(template).toContain('workflow_dispatch:');
    expect(template).toContain('permissions:\n  contents: read');
    expect(template.toLowerCase()).not.toContain('vagrant');
  });
});

describe('Copilot cloud-agent MCP runbook (VHS-REQ-705)', () => {
  it('documents a local/stdio MCP server launching the built entrypoint (VHS-REQ-705.4)', () => {
    const runbook = readRunbook();
    expect(runbook).toContain('"mcpServers"');
    expect(runbook).toContain('"type": "local"');
    expect(runbook).toContain('"command": "node"');
    expect(runbook).toContain('out/cli/runViSemanticMcpServer.js');
  });

  it('allowlists the live comparison tools and prefixes secrets with COPILOT_MCP_ (VHS-REQ-705.4)', () => {
    const runbook = readRunbook();
    expect(runbook).toContain('compare_vi_revisions');
    expect(runbook).toContain('build_vi_pr_review');
    // Cloud agent supports tools only (not resources/prompts) and needs the
    // COPILOT_MCP_ secret prefix — both called out so a consumer gets it right.
    expect(runbook).toContain('COPILOT_MCP_');
    expect(runbook).toContain('tools only');
  });
});
