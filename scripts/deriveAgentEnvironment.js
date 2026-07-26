#!/usr/bin/env node
'use strict';

// Multi-plane agent-environment derivation (issue #2392, aligned on Discussion #2365).
//
// Single source of truth for WHO (unique per-machine teamName) and WHERE (execution
// plane + capabilities) an agent is, so identity is DERIVED, never hand-set. Consumed
// by the prototype collab bus today and by the Phase-2 git hooks / `promote` verb.
//
// Design (agent-environment-descriptor@v1 / agent-roster@v1):
//  - plane = the execution context running RIGHT NOW: native | docker | vagrant.
//  - facets/capabilities = what the machine can additionally SPIN UP.
//  - machineId is raw + LOCAL-ONLY (never committed); the committed roster keys on
//    machineIdHash = sha256(machineId)[:12] so no host fingerprints reach a public repo.
//  - Dispatch branches on osPlatform FIRST, then applies the OS-specific plane
//    precedence, so the win32 and linux arms can never cross-contaminate.
//
// Every arm is pure over injectable `probes`, so it unit-tests without a real host.

const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const DESCRIPTOR_SCHEMA = 'agent-environment-descriptor@v1';
const ROSTER_SCHEMA = 'agent-roster@v1';

const DEFAULT_ROSTER_PATH = path.join(__dirname, 'agent-roster.json');

/** sha256(machineId) truncated to 12 hex (48 bits) — the committed roster key. */
function hashMachineId(rawMachineId) {
  return crypto.createHash('sha256').update(String(rawMachineId == null ? '' : rawMachineId)).digest('hex').slice(0, 12);
}

/** Slugifies a hostname into a safe teamName suffix. */
function slugifyHostname(hostname) {
  return (
    String(hostname == null ? '' : hostname)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'unknown'
  );
}

/**
 * Mints a fresh unique teamName for an unregistered machine. An explicit
 * VIHS_TEAM_NAME hint wins (so LINUX can self-register as `LINUX-oracle`);
 * otherwise `<PLANE_OS>-<hostname-slug>` keeps a 2nd machine of the same OS distinct.
 */
function mintTeamName(osPlatform, hostname, envHint) {
  if (envHint && String(envHint).trim()) return String(envHint).trim();
  const osTag = osPlatform === 'win32' ? 'WIN' : 'LINUX';
  return `${osTag}-${slugifyHostname(hostname)}`;
}

// ---------------------------------------------------------------------------
// machineId (raw, LOCAL-ONLY)
// ---------------------------------------------------------------------------

/** Windows: HKLM\SOFTWARE\Microsoft\Cryptography\MachineGuid (stable per install). */
function readWinMachineGuidReal() {
  try {
    const out = execFileSync('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], {
      encoding: 'utf8'
    });
    const m = out.match(/MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]+)/);
    return m ? m[1].trim() : '';
  } catch {
    return '';
  }
}

/** Linux: /etc/machine-id (persisted on a native host; EMPTY in a plain container). */
function readLinuxMachineIdReal() {
  for (const p of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
    try {
      const v = fs.readFileSync(p, 'utf8').trim();
      if (v) return v;
    } catch {
      /* absent — try next */
    }
  }
  return '';
}

/**
 * Resolves the raw machineId. In docker /etc/machine-id is empty and the hostname
 * is ephemeral, so an INJECTED id wins there (VIHS_MACHINE_ID = build ARG / env /
 * bind-mounted host machine-id), falling back to the image ref hint.
 */
function readRawMachineId(osPlatform, env, probes) {
  env = env || process.env;
  probes = probes || {};
  if (env.VIHS_MACHINE_ID && String(env.VIHS_MACHINE_ID).trim()) {
    return String(env.VIHS_MACHINE_ID).trim();
  }
  if (osPlatform === 'win32') {
    return (probes.winMachineGuid ? probes.winMachineGuid() : readWinMachineGuidReal()) || '';
  }
  return (probes.linuxMachineId ? probes.linuxMachineId() : readLinuxMachineIdReal()) || '';
}

// ---------------------------------------------------------------------------
// plane detection (osPlatform-first dispatch)
// ---------------------------------------------------------------------------

/** win32 container marker: CExecSvc service present (runs inside Windows containers). */
function detectWinContainerReal() {
  try {
    const out = execFileSync('sc', ['query', 'cexecsvc'], { encoding: 'utf8' });
    return /RUNNING|STOPPED/.test(out); // service EXISTS => Windows container image
  } catch {
    return false;
  }
}

/**
 * win32 vagrant guest marker: the C:\vagrant synced folder (natural, symmetric with
 * /vagrant on a linux guest; verified on the win11 guest). A provision-written stamp
 * is OPTIONAL belt-and-suspenders.
 */
function detectVagrantWinReal(env) {
  env = env || process.env;
  if (env.VAGRANT_GUEST || env.VIHS_PLANE === 'vagrant') return true;
  return ['C:/vagrant', 'C:/vihs-workspace/.vihs-plane.json', 'C:/vagrant/.vihs-plane.json'].some((p) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  });
}

// LINUX-ARM: systemd-detect-virt EXITS 1 when it detects "none" (bare metal) while
// still printing "none" on stdout, so execFileSync throws — read the thrown stdout to
// record the real "none" evidence instead of null (null would falsely imply the tool
// was absent). A detected hypervisor exits 0; a genuinely absent tool yields null.
function detectVirtReal() {
  try {
    return execFileSync('systemd-detect-virt', [], { encoding: 'utf8' }).trim();
  } catch (err) {
    const out = err && err.stdout ? String(err.stdout).trim() : '';
    return out || null;
  }
}
function readCgroupPid1Real() {
  try {
    const first = fs.readFileSync('/proc/1/cgroup', 'utf8').trim().split('\n')[0];
    return first == null ? null : first;
  } catch {
    return null;
  }
}
function detectVagrantLinuxReal(env) {
  env = env || process.env;
  if (env.VAGRANT_GUEST || env.VIHS_PLANE === 'vagrant') return '/vagrant(env)';
  try {
    return fs.existsSync('/vagrant') ? '/vagrant' : null;
  } catch {
    return null;
  }
}

/**
 * Detects the execution plane. Returns { plane, markers } where markers is the RAW
 * evidence the decision used (auditable, paired with resolvedBy). NEVER string-matches
 * /proc/1/cgroup for docker (unreliable on cgroup v2) — it is recorded, not decided on.
 */
function detectPlane(osPlatform, env, probes) {
  env = env || process.env;
  probes = probes || {};
  const markers = {
    dockerEnvPresent: null,
    systemdDetectVirt: null,
    vagrantMarker: null,
    cgroupPid1: null,
    winContainerMarker: null
  };

  if (osPlatform === 'win32') {
    const winC = probes.winContainerMarker ? probes.winContainerMarker() : detectWinContainerReal();
    markers.winContainerMarker = winC;
    if (winC) return { plane: 'docker', markers };
    const vg = probes.vagrantMarker ? probes.vagrantMarker() : detectVagrantWinReal(env);
    markers.vagrantMarker = vg ? 'win-mount' : null;
    if (vg) return { plane: 'vagrant', markers };
    return { plane: 'native', markers };
  }

  // linux (+ any other posix) — LINUX-ARM
  const dockerEnv = probes.dockerEnvPresent
    ? probes.dockerEnvPresent()
    : (() => {
        try {
          return fs.existsSync('/.dockerenv');
        } catch {
          return false;
        }
      })();
  markers.dockerEnvPresent = dockerEnv;
  markers.systemdDetectVirt = probes.systemdDetectVirt ? probes.systemdDetectVirt() : detectVirtReal();
  markers.cgroupPid1 = probes.cgroupPid1 ? probes.cgroupPid1() : readCgroupPid1Real();
  if (dockerEnv) return { plane: 'docker', markers };
  const vg = probes.vagrantMarker ? probes.vagrantMarker() : detectVagrantLinuxReal(env);
  markers.vagrantMarker = vg;
  if (vg) return { plane: 'vagrant', markers };
  return { plane: 'native', markers };
}

// ---------------------------------------------------------------------------
// facets / capabilities (best-effort; pure over injectable probes)
// ---------------------------------------------------------------------------

function firstExisting(paths) {
  for (const p of paths) {
    try {
      if (p && fs.existsSync(p)) return p;
    } catch {
      /* skip */
    }
  }
  return null;
}

function detectDocker(probes) {
  probes = probes || {};
  if (probes.docker) return probes.docker();
  try {
    const osType = execFileSync('docker', ['version', '--format', '{{.Server.Os}}'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    return { present: Boolean(osType), osType: osType || null };
  } catch {
    return { present: false, osType: null };
  }
}

// LINUX-ARM: GPU + local-LLM facet. nvidia-smi yields the device name + total VRAM
// (MiB); ollama --version records the local runner. Pure over an injectable probe.
function detectGpu(probes) {
  probes = probes || {};
  if (probes.gpu) return probes.gpu();
  let name = null;
  let vramMiB = null;
  try {
    const line = execFileSync('nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    })
      .trim()
      .split('\n')[0];
    if (line) {
      const parts = line.split(',').map((s) => s.trim());
      name = parts[0] || null;
      const parsed = Number.parseInt(parts[1], 10);
      vramMiB = Number.isFinite(parsed) ? parsed : null;
    }
  } catch {
    /* no NVIDIA GPU / driver absent */
  }
  let ollama = { present: false, version: null };
  try {
    const out = execFileSync('ollama', ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const m = out.match(/(\d+\.\d+\.\d+)/);
    ollama = { present: true, version: m ? m[1] : null };
  } catch {
    /* ollama not installed */
  }
  return { present: Boolean(name), name, vramMiB, ollama };
}

/** Detects LabVIEW native + CLI/compare/merge tooling for the current OS. */
function detectFacets(osPlatform, env, probes) {
  env = env || process.env;
  probes = probes || {};
  if (probes.facets) return probes.facets();

  if (osPlatform === 'win32') {
    const niRoots = ['C:/Program Files/National Instruments', 'C:/Program Files (x86)/National Instruments'];
    let lvPath = null;
    let version = null;
    let bitness = '64';
    for (const root of niRoots) {
      try {
        const dirs = fs.existsSync(root)
          ? fs.readdirSync(root).filter((d) => /^LabVIEW \d{4}$/.test(d)).sort()
          : [];
        if (dirs.length) {
          version = dirs[dirs.length - 1].replace('LabVIEW ', '');
          lvPath = `${root}/LabVIEW ${version}`;
          bitness = root.includes('(x86)') ? '32' : '64';
          break; // prefer the 64-bit Program Files root; only fall back to (x86)
        }
      } catch {
        /* skip */
      }
    }
    const cli = firstExisting([
      'C:/Program Files (x86)/National Instruments/Shared/LabVIEW CLI/LabVIEWCLI.exe',
      'C:/Program Files/National Instruments/Shared/LabVIEW CLI/LabVIEWCLI.exe'
    ]);
    const cmp = firstExisting(['C:/Program Files/National Instruments/Shared/LabVIEW Compare/LVCompare.exe']);
    const mrg = firstExisting(['C:/Program Files/National Instruments/Shared/LabVIEW Merge/LVMerge.exe']);
    return {
      // `functional` = verified-runnable (a real compare ran), null when only the
      // install was detected. A caller sets it true after a functional probe.
      labviewNative: { present: Boolean(lvPath), functional: null, os: 'win32', edition: 'full', bitness, version, path: lvPath },
      labviewCli: { present: Boolean(cli), path: cli },
      lvCompare: { present: Boolean(cmp), path: cmp },
      lvMerge: { present: Boolean(mrg), path: mrg },
      labviewViaWindowsContainer: false,
      gpu: detectGpu(probes),
      capabilities: { docker: detectDocker(probes) }
    };
  }

  // linux — LINUX-ARM (validated empirically on the native host + a linux container).
  const lvPath = firstExisting(['/usr/local/natinst/LabVIEW-2026-64', '/usr/local/natinst/LabVIEW-2025-64']);
  const cli = firstExisting(['/usr/local/bin/LabVIEWCLI']);
  const cmp = firstExisting(['/usr/local/natinst/lvcompare/LVCompare']);
  const mrg = firstExisting(['/usr/local/natinst/lvmerge/LVMerge']);
  return {
    labviewNative: {
      present: Boolean(lvPath),
      functional: null,
      os: 'linux',
      edition: 'community',
      bitness: '64',
      version: lvPath ? (lvPath.match(/LabVIEW-(\d{4})/) || [])[1] || null : null,
      path: lvPath
    },
    labviewCli: { present: Boolean(cli), path: cli },
    lvCompare: { present: Boolean(cmp), path: cmp },
    lvMerge: { present: Boolean(mrg), path: mrg },
    labviewViaWindowsContainer: false,
    gpu: detectGpu(probes),
    capabilities: { docker: detectDocker(probes) }
  };
}

// ---------------------------------------------------------------------------
// roster (committed; keyed on machineIdHash; append-only self-registration)
// ---------------------------------------------------------------------------

function loadRoster(rosterPath, fsi) {
  rosterPath = rosterPath || DEFAULT_ROSTER_PATH;
  fsi = fsi || fs;
  try {
    if (!fsi.existsSync(rosterPath)) return { schemaVersion: 1, agents: [] };
    const parsed = JSON.parse(fsi.readFileSync(rosterPath, 'utf8'));
    if (!parsed || !Array.isArray(parsed.agents)) return { schemaVersion: 1, agents: [] };
    return parsed;
  } catch {
    return { schemaVersion: 1, agents: [] };
  }
}

/**
 * Resolves teamName from env (override) -> roster -> fresh mint (+ self-register).
 * An explicit VIHS_COLLAB_AGENT wins (Q4). Fresh-mint fails CLOSED only when the
 * minted name already maps to a DIFFERENT machine, so two machines stay distinct.
 */
function resolveTeamName(args, io) {
  const { roster, machineIdHash, osPlatform, hostname, plane } = args;
  const env = args.env || process.env;
  io = io || {};
  const rosterRow = roster.agents.find((a) => a.machineIdHash === machineIdHash);
  const override = env.VIHS_COLLAB_AGENT ? String(env.VIHS_COLLAB_AGENT).toUpperCase() : null;

  if (override) {
    return { teamName: override, resolvedBy: 'env' };
  }
  if (rosterRow) return { teamName: rosterRow.teamName, resolvedBy: 'roster' };

  const teamName = mintTeamName(osPlatform, hostname, env.VIHS_TEAM_NAME);
  const conflict = roster.agents.find((a) => a.teamName.toLowerCase() === teamName.toLowerCase());
  if (conflict) {
    throw new Error(
      `agent-roster conflict: teamName "${teamName}" already maps to a different machine ` +
        `(${conflict.machineIdHash}). Set a distinct VIHS_TEAM_NAME.`
    );
  }
  roster.agents.push({ machineIdHash, teamName, planeDefaults: { plane } });
  const fsi = io.fs || fs;
  const rosterPath = io.rosterPath || DEFAULT_ROSTER_PATH;
  if (io.write !== false) {
    fsi.writeFileSync(rosterPath, `${JSON.stringify({ schemaVersion: 1, agents: roster.agents }, null, 2)}\n`);
  }
  return { teamName, resolvedBy: 'fresh-derive' };
}

// ---------------------------------------------------------------------------
// top-level derivation
// ---------------------------------------------------------------------------

function deriveAgentEnvironment(deps) {
  deps = deps || {};
  const osPlatform = deps.platform || process.platform;
  const env = deps.env || process.env;
  const hostname = deps.hostname || os.hostname();
  const arch = deps.arch || process.arch;
  const rosterPath = deps.rosterPath || DEFAULT_ROSTER_PATH;
  const fsi = deps.fs || fs;

  const rawMachineId = deps.rawMachineId != null ? deps.rawMachineId : readRawMachineId(osPlatform, env, deps.probes);
  const machineIdHash = hashMachineId(rawMachineId);
  const planeResult = deps.planeResult || detectPlane(osPlatform, env, deps.probes);
  const { plane, markers } = planeResult;
  const facets = deps.facets || detectFacets(osPlatform, env, deps.probes);

  const roster = deps.roster || loadRoster(rosterPath, fsi);
  const resolved = resolveTeamName(
    { roster, machineIdHash, osPlatform, hostname, env, plane },
    { fs: fsi, rosterPath, write: deps.write }
  );

  return {
    schemaVersion: 1,
    schema: DESCRIPTOR_SCHEMA,
    machineId: rawMachineId, // LOCAL-ONLY: never persist this to a committed file
    machineIdHash,
    teamName: resolved.teamName,
    osPlatform,
    arch,
    plane,
    facets,
    capabilities: facets.capabilities || {},
    source: { hostname, resolvedBy: resolved.resolvedBy, detectionMarkers: markers }
  };
}

/** The bus label an agent should use = derived teamName (env still overrides upstream). */
function deriveTeamName(deps) {
  deps = deps || {};
  const osPlatform = deps.platform || process.platform;
  const env = deps.env || process.env;
  if (env.VIHS_COLLAB_AGENT) return String(env.VIHS_COLLAB_AGENT).toUpperCase();
  const hostname = deps.hostname || os.hostname();
  const rosterPath = deps.rosterPath || DEFAULT_ROSTER_PATH;
  const fsi = deps.fs || fs;
  const rawMachineId = deps.rawMachineId != null ? deps.rawMachineId : readRawMachineId(osPlatform, env, deps.probes);
  const machineIdHash = hashMachineId(rawMachineId);
  const roster = deps.roster || loadRoster(rosterPath, fsi);
  const rosterRow = roster.agents.find((r) => r.machineIdHash === machineIdHash);
  if (rosterRow) return rosterRow.teamName;
  const planeResult = deps.planeResult || detectPlane(osPlatform, env, deps.probes);
  return resolveTeamName({ roster, machineIdHash, osPlatform, hostname, env, plane: planeResult.plane }, { write: false })
    .teamName;
}

module.exports = {
  DESCRIPTOR_SCHEMA,
  ROSTER_SCHEMA,
  DEFAULT_ROSTER_PATH,
  hashMachineId,
  slugifyHostname,
  mintTeamName,
  readRawMachineId,
  detectPlane,
  detectFacets,
  loadRoster,
  resolveTeamName,
  deriveAgentEnvironment,
  deriveTeamName
};

// CLI: `node scripts/deriveAgentEnvironment.js [--json] [--register]`
if (require.main === module) {
  const asJson = process.argv.includes('--json');
  const doRegister = process.argv.includes('--register');
  const descriptor = deriveAgentEnvironment({ write: doRegister });
  if (asJson) {
    const safe = Object.assign({}, descriptor);
    delete safe.machineId; // redact the raw machineId (local-only invariant)
    process.stdout.write(`${JSON.stringify(safe, null, 2)}\n`);
  } else {
    process.stdout.write(
      `teamName=${descriptor.teamName} (via ${descriptor.source.resolvedBy})\n` +
        `plane=${descriptor.plane} os=${descriptor.osPlatform}/${descriptor.arch} host=${descriptor.source.hostname}\n` +
        `machineIdHash=${descriptor.machineIdHash}\n` +
        `labviewNative=${descriptor.facets.labviewNative && descriptor.facets.labviewNative.present} ` +
        `docker=${descriptor.capabilities.docker && descriptor.capabilities.docker.present}` +
        `(${descriptor.capabilities.docker && descriptor.capabilities.docker.osType})\n`
    );
  }
}
