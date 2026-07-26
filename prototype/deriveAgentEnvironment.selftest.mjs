// Self-test for deriveAgentEnvironment.mjs (issue #2392). Pure-function coverage over
// injected `probes`/`deps` so it runs on ANY host with no real machine. This is also
// the TEST CONTRACT for the LINUX-owned linux/docker/vagrant arms: LINUX mirrors the
// linux-plane cases with real empirical fixtures. At ship this graduates to a governed
// tests/unit/deriveAgentEnvironment.test.ts with a traceability-inventory row.
//
// Run: node prototype/deriveAgentEnvironment.selftest.mjs   (exit 0 = pass)

import assert from 'node:assert/strict';
import {
  hashMachineId,
  slugifyHostname,
  mintTeamName,
  detectPlane,
  resolveTeamName,
  deriveAgentEnvironment
} from './deriveAgentEnvironment.mjs';

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  process.stdout.write(`  ok  ${name}\n`);
}

// --- hashMachineId ---
test('hashMachineId is deterministic 12-hex', () => {
  const h = hashMachineId('85f7b6bb-dcc4-4abb-a87c-16d4a7cd4e78');
  assert.equal(h, 'bfd8d07d0112');
  assert.match(h, /^[0-9a-f]{12}$/);
  assert.equal(hashMachineId('85f7b6bb-dcc4-4abb-a87c-16d4a7cd4e78'), h);
});

// --- slug + mint ---
test('mintTeamName: env hint wins, else OS-tag + hostname slug', () => {
  assert.equal(mintTeamName('linux', 'sergio-ThinkPad-P16', 'LINUX-oracle'), 'LINUX-oracle');
  assert.equal(mintTeamName('win32', 'VITLT-Sergio', ''), 'WIN-vitlt-sergio');
  assert.equal(mintTeamName('linux', 'box.Local', undefined), 'LINUX-box-local');
  assert.equal(slugifyHostname('  A_B  '), 'a-b');
});

// --- plane detection: osPlatform-first, arms isolated ---
test('detectPlane win32: winContainer -> docker, stamp -> vagrant, else native', () => {
  assert.equal(detectPlane('win32', {}, { winContainerMarker: () => true }).plane, 'docker');
  assert.equal(
    detectPlane('win32', {}, { winContainerMarker: () => false, vagrantMarker: () => true }).plane,
    'vagrant'
  );
  const nativ = detectPlane('win32', {}, { winContainerMarker: () => false, vagrantMarker: () => false });
  assert.equal(nativ.plane, 'native');
  assert.equal(nativ.markers.winContainerMarker, false);
});

test('detectPlane linux: /.dockerenv -> docker, mount -> vagrant, else native (never cgroup-decides)', () => {
  const docker = detectPlane('linux', {}, {
    dockerEnvPresent: () => true,
    systemdDetectVirt: () => 'docker',
    cgroupPid1: () => '0::/'
  });
  assert.equal(docker.plane, 'docker');
  assert.equal(docker.markers.cgroupPid1, '0::/'); // recorded as evidence, NOT decided on
  const vagrant = detectPlane('linux', {}, { dockerEnvPresent: () => false, vagrantMarker: () => '/vagrant' });
  assert.equal(vagrant.plane, 'vagrant');
  const nativ = detectPlane('linux', {}, {
    dockerEnvPresent: () => false,
    vagrantMarker: () => null,
    systemdDetectVirt: () => 'none'
  });
  assert.equal(nativ.plane, 'native');
});

// --- teamName resolution / roster ---
test('resolveTeamName: env override wins (resolvedBy=env)', () => {
  const r = resolveTeamName({
    roster: { schemaVersion: 1, agents: [{ machineIdHash: 'abc', teamName: 'WIN-vitlt' }] },
    machineIdHash: 'abc',
    osPlatform: 'win32',
    hostname: 'h',
    env: { VIHS_COLLAB_AGENT: 'WIN' },
    plane: 'native'
  });
  assert.deepEqual(r, { teamName: 'WIN', resolvedBy: 'env' });
});

test('resolveTeamName: roster hit (resolvedBy=roster)', () => {
  const r = resolveTeamName({
    roster: { schemaVersion: 1, agents: [{ machineIdHash: 'abc', teamName: 'WIN-vitlt' }] },
    machineIdHash: 'abc',
    osPlatform: 'win32',
    hostname: 'h',
    env: {},
    plane: 'native'
  });
  assert.deepEqual(r, { teamName: 'WIN-vitlt', resolvedBy: 'roster' });
});

test('resolveTeamName: fresh-mint self-registers in-memory (write:false)', () => {
  const roster = { schemaVersion: 1, agents: [] };
  const r = resolveTeamName(
    { roster, machineIdHash: 'newhash', osPlatform: 'linux', hostname: 'thinkpad', env: { VIHS_TEAM_NAME: 'LINUX-oracle' }, plane: 'native' },
    { write: false }
  );
  assert.equal(r.teamName, 'LINUX-oracle');
  assert.equal(r.resolvedBy, 'fresh-derive');
  assert.equal(roster.agents.length, 1);
  assert.equal(roster.agents[0].machineIdHash, 'newhash');
});

test('resolveTeamName: fresh-mint FAILS CLOSED on a name collision with a different machine', () => {
  assert.throws(
    () =>
      resolveTeamName(
        {
          roster: { schemaVersion: 1, agents: [{ machineIdHash: 'other', teamName: 'LINUX-oracle' }] },
          machineIdHash: 'mine',
          osPlatform: 'linux',
          hostname: 'x',
          env: { VIHS_TEAM_NAME: 'LINUX-oracle' },
          plane: 'native'
        },
        { write: false }
      ),
    /roster conflict/
  );
});

// --- end-to-end with injected deps + machineId redaction contract ---
test('deriveAgentEnvironment end-to-end (linux native fixture)', () => {
  const d = deriveAgentEnvironment({
    platform: 'linux',
    arch: 'x64',
    hostname: 'sergio-ThinkPad-P16-Gen-3',
    env: { VIHS_TEAM_NAME: 'LINUX-oracle' },
    rawMachineId: '89c5fb6a0000000000000000000000ff',
    planeResult: { plane: 'native', markers: { dockerEnvPresent: false, vagrantMarker: null } },
    facets: { labviewNative: { present: true, os: 'linux' }, capabilities: { docker: { present: true, osType: 'linux' } } },
    roster: { schemaVersion: 1, agents: [] },
    write: false
  });
  assert.equal(d.schema, 'agent-environment-descriptor@v1');
  assert.equal(d.teamName, 'LINUX-oracle');
  assert.equal(d.plane, 'native');
  assert.equal(d.osPlatform, 'linux');
  assert.match(d.machineIdHash, /^[0-9a-f]{12}$/);
  assert.equal(d.source.resolvedBy, 'fresh-derive');
  // machineId present in-memory (local-only), but the CLI --json path strips it.
  assert.equal(typeof d.machineId, 'string');
});

process.stdout.write(`\nAll ${passed} deriveAgentEnvironment self-tests passed.\n`);
