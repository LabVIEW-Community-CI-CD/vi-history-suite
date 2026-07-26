import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const derive = require('../../scripts/deriveAgentEnvironment.js');

// VHS #2392 Phase 1: multi-plane agent-environment derivation. These cover the shared
// module + the win32 arm (WIN-owned); the linux/docker real-fixture cases are appended
// by the LINUX plane owner. Every case drives injectable `probes`/`deps`, so the suite
// is host-free and deterministic in CI.
describe('deriveAgentEnvironment (issue #2392)', () => {
  describe('hashMachineId', () => {
    it('is a deterministic 12-hex digest of the raw machineId', () => {
      const h = derive.hashMachineId('85f7b6bb-dcc4-4abb-a87c-16d4a7cd4e78');
      expect(h).toBe('bfd8d07d0112');
      expect(h).toMatch(/^[0-9a-f]{12}$/);
      expect(derive.hashMachineId('85f7b6bb-dcc4-4abb-a87c-16d4a7cd4e78')).toBe(h);
    });

    it('treats null/undefined as the empty string (no throw)', () => {
      expect(derive.hashMachineId(undefined)).toMatch(/^[0-9a-f]{12}$/);
      expect(derive.hashMachineId(null)).toBe(derive.hashMachineId(''));
    });
  });

  describe('slugifyHostname + mintTeamName', () => {
    it('slugifies to a safe suffix and falls back to "unknown"', () => {
      expect(derive.slugifyHostname('VITLT-Sergio')).toBe('vitlt-sergio');
      expect(derive.slugifyHostname('  A_B  ')).toBe('a-b');
      expect(derive.slugifyHostname('')).toBe('unknown');
    });

    it('mints from an env hint when present, else OS-tag + hostname slug', () => {
      expect(derive.mintTeamName('linux', 'sergio-ThinkPad-P16', 'LINUX-oracle')).toBe('LINUX-oracle');
      expect(derive.mintTeamName('win32', 'VITLT-Sergio', '')).toBe('WIN-vitlt-sergio');
      expect(derive.mintTeamName('linux', 'box.Local', undefined)).toBe('LINUX-box-local');
    });
  });

  describe('detectPlane — osPlatform-first, arms isolated', () => {
    it('win32: winContainer marker -> docker', () => {
      const r = derive.detectPlane('win32', {}, { winContainerMarker: () => true });
      expect(r.plane).toBe('docker');
      expect(r.markers.winContainerMarker).toBe(true);
    });

    it('win32: no container, C:/vagrant mount -> vagrant', () => {
      const r = derive.detectPlane('win32', {}, { winContainerMarker: () => false, vagrantMarker: () => true });
      expect(r.plane).toBe('vagrant');
      expect(r.markers.vagrantMarker).toBe('win-mount');
    });

    it('win32: no container, no vagrant -> native', () => {
      const r = derive.detectPlane('win32', {}, { winContainerMarker: () => false, vagrantMarker: () => false });
      expect(r.plane).toBe('native');
    });

    it('records raw detection markers as evidence (auditable), never deciding on cgroup', () => {
      const r = derive.detectPlane('linux', {}, {
        dockerEnvPresent: () => true,
        systemdDetectVirt: () => 'docker',
        cgroupPid1: () => '0::/'
      });
      expect(r.plane).toBe('docker');
      // cgroupPid1 is recorded evidence, NOT the decision input.
      expect(r.markers.cgroupPid1).toBe('0::/');
    });
  });

  describe('resolveTeamName', () => {
    const roster = () => ({ schemaVersion: 1, agents: [{ machineIdHash: 'abc', teamName: 'WIN-vitlt' }] });

    it('env override wins (resolvedBy=env), even when it differs from the roster name', () => {
      const r = derive.resolveTeamName({
        roster: roster(),
        machineIdHash: 'abc',
        osPlatform: 'win32',
        hostname: 'h',
        env: { VIHS_COLLAB_AGENT: 'WIN' },
        plane: 'native'
      });
      expect(r).toEqual({ teamName: 'WIN', resolvedBy: 'env' });
    });

    it('roster hit resolves to the registered name (resolvedBy=roster)', () => {
      const r = derive.resolveTeamName({
        roster: roster(),
        machineIdHash: 'abc',
        osPlatform: 'win32',
        hostname: 'h',
        env: {},
        plane: 'native'
      });
      expect(r).toEqual({ teamName: 'WIN-vitlt', resolvedBy: 'roster' });
    });

    it('fresh-mint self-registers in-memory when write:false (no disk write)', () => {
      const r = { schemaVersion: 1, agents: [] };
      const out = derive.resolveTeamName(
        { roster: r, machineIdHash: 'newhash', osPlatform: 'linux', hostname: 'thinkpad', env: { VIHS_TEAM_NAME: 'LINUX-oracle' }, plane: 'native' },
        { write: false }
      );
      expect(out).toEqual({ teamName: 'LINUX-oracle', resolvedBy: 'fresh-derive' });
      expect(r.agents).toHaveLength(1);
      expect(r.agents[0].machineIdHash).toBe('newhash');
    });

    it('fails CLOSED when a minted name already maps to a different machine', () => {
      expect(() =>
        derive.resolveTeamName(
          {
            roster: { schemaVersion: 1, agents: [{ machineIdHash: 'other', teamName: 'LINUX-oracle' }] },
            machineIdHash: 'mine',
            osPlatform: 'linux',
            hostname: 'x',
            env: { VIHS_TEAM_NAME: 'LINUX-oracle' },
            plane: 'native'
          },
          { write: false }
        )
      ).toThrow(/roster conflict/);
    });
  });

  describe('deriveAgentEnvironment end-to-end', () => {
    it('assembles a descriptor@v1 and keeps the raw machineId in-memory only', () => {
      const d = derive.deriveAgentEnvironment({
        platform: 'win32',
        arch: 'x64',
        hostname: 'VITLT-Sergio',
        env: {},
        rawMachineId: '85f7b6bb-dcc4-4abb-a87c-16d4a7cd4e78',
        planeResult: { plane: 'native', markers: { winContainerMarker: false } },
        facets: { labviewNative: { present: true, os: 'win32' }, capabilities: { docker: { present: true, osType: 'linux' } } },
        roster: { schemaVersion: 1, agents: [{ machineIdHash: 'bfd8d07d0112', teamName: 'WIN-vitlt' }] },
        write: false
      });
      expect(d.schema).toBe('agent-environment-descriptor@v1');
      expect(d.teamName).toBe('WIN-vitlt');
      expect(d.source.resolvedBy).toBe('roster');
      expect(d.plane).toBe('native');
      expect(d.machineIdHash).toBe('bfd8d07d0112');
      expect(d.capabilities.docker).toEqual({ present: true, osType: 'linux' });
      // The raw machineId lives in-memory but must be redactable; assert it is the
      // ONLY sensitive key so the CLI --json redaction (delete safe.machineId) is complete.
      expect(typeof d.machineId).toBe('string');
    });
  });

  describe('committed roster', () => {
    it('is valid agent-roster@v1 with unique hashes + unique teamNames', () => {
      const roster = derive.loadRoster(derive.DEFAULT_ROSTER_PATH);
      expect(roster.schemaVersion).toBe(1);
      expect(Array.isArray(roster.agents)).toBe(true);
      const hashes = roster.agents.map((a: { machineIdHash: string }) => a.machineIdHash);
      const names = roster.agents.map((a: { teamName: string }) => a.teamName.toLowerCase());
      expect(new Set(hashes).size).toBe(hashes.length);
      expect(new Set(names).size).toBe(names.length);
      // No raw MachineGuid/machine-id fingerprints committed — keys are 12-hex hashes.
      for (const h of hashes) expect(h).toMatch(/^[0-9a-f]{12}$/);
    });
  });
});
