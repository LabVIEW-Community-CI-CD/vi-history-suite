#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const https = require('node:https');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(path.dirname(fs.realpathSync.native(__filename)), '..');
const DEFAULT_EVIDENCE_DIR = path.join(
  repoRoot,
  '.cache',
  'public-github-exact-release-transaction',
  'latest'
);
const DEFAULT_OWNER = 'svelderrainruiz';
const DEFAULT_REPO = 'vi-history-suite';
const DEFAULT_MARKETPLACE_ITEM = 'svelderrainruiz.vi-history-suite';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const githubToken = require(path.join(repoRoot, 'scripts', 'resolveLocalGitHubToken.js'));

function getUsage() {
  return [
    'Usage: node scripts/runPublicGithubExactReleaseTransaction.js [--tag <vX.Y.Z>] [--owner <github-owner>] [--repo <github-repo>] [--github-token-path <path>] [--marketplace-item <publisher.extension>] [--evidence-dir <path>] [--help]',
    '',
    'Assess the public GitHub exact-release transaction fail-closed and retain a resumable phase receipt.',
    '',
    'This surface is assessment-only: it does not publish, mutate GitHub releases, or open a new SemVer line.',
    '',
    'Defaults:',
    `  owner:             ${DEFAULT_OWNER}`,
    `  repo:              ${DEFAULT_REPO}`,
    `  marketplace-item:  ${DEFAULT_MARKETPLACE_ITEM}`,
    `  evidence-dir:      ${DEFAULT_EVIDENCE_DIR}`,
    '  tag:               latest exact SemVer tag found locally'
  ].join('\n');
}

function parseArgs(argv) {
  const parsed = {
    helpRequested: false,
    owner: DEFAULT_OWNER,
    repo: DEFAULT_REPO,
    tag: null,
    evidenceDir: DEFAULT_EVIDENCE_DIR,
    githubTokenPath: null,
    marketplaceItem: DEFAULT_MARKETPLACE_ITEM
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--help' || argument === '-h') {
      parsed.helpRequested = true;
      continue;
    }

    if (argument === '--tag') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --tag');
      }
      parsed.tag = value.trim();
      index += 1;
      continue;
    }

    if (argument === '--owner') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --owner');
      }
      parsed.owner = value.trim();
      index += 1;
      continue;
    }

    if (argument === '--repo') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --repo');
      }
      parsed.repo = value.trim();
      index += 1;
      continue;
    }

    if (argument === '--github-token-path') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --github-token-path');
      }
      parsed.githubTokenPath = path.resolve(value);
      index += 1;
      continue;
    }

    if (argument === '--marketplace-item') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --marketplace-item');
      }
      parsed.marketplaceItem = value.trim();
      index += 1;
      continue;
    }

    if (argument === '--evidence-dir') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --evidence-dir');
      }
      parsed.evidenceDir = path.resolve(value);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return parsed;
}

function runGit(args, cwd = repoRoot, spawnImpl = spawnSync) {
  const result = spawnImpl('git', args, {
    cwd,
    encoding: 'utf8',
    shell: false
  });

  return {
    status: result.status ?? 1,
    stdout: String(result.stdout ?? '').trim(),
    stderr: String(result.stderr ?? '').trim()
  };
}

function ensureGitSuccess(result, args) {
  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(' ')} failed in ${repoRoot}: ${result.stderr || result.stdout || 'unknown error'}`
    );
  }
}

function parseSemverTag(tag) {
  const match = /^v(\d+)\.(\d+)\.(\d+)$/.exec(tag.trim());
  if (!match) {
    return null;
  }

  return {
    tag,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  };
}

function compareSemverTags(left, right) {
  if (left.major !== right.major) {
    return left.major - right.major;
  }
  if (left.minor !== right.minor) {
    return left.minor - right.minor;
  }
  return left.patch - right.patch;
}

function resolveLatestExactTag(spawnImpl = spawnSync) {
  const tagList = runGit(['tag', '--list', 'v*'], repoRoot, spawnImpl);
  ensureGitSuccess(tagList, ['tag', '--list', 'v*']);
  const candidates = tagList.stdout
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .map(parseSemverTag)
    .filter((value) => value !== null);

  if (candidates.length === 0) {
    throw new Error('No exact SemVer tags were found locally.');
  }

  candidates.sort((left, right) => compareSemverTags(right, left));
  return candidates[0].tag;
}

function resolveGitCommitish(commitish, spawnImpl = spawnSync) {
  const result = runGit(['rev-parse', '--verify', commitish], repoRoot, spawnImpl);
  ensureGitSuccess(result, ['rev-parse', '--verify', commitish]);
  return result.stdout;
}

function resolveTagCommit(tag, spawnImpl = spawnSync) {
  const result = runGit(['rev-list', '-n', '1', tag], repoRoot, spawnImpl);
  ensureGitSuccess(result, ['rev-list', '-n', '1', tag]);
  return result.stdout;
}

function computeFileSha256(filePath, fsApi = fs) {
  const hash = crypto.createHash('sha256');
  hash.update(fsApi.readFileSync(filePath));
  return hash.digest('hex');
}

function resolveReleaseManifestPath(tag, fsApi = fs) {
  const manifestPath = path.join(
    repoRoot,
    '.cache',
    'gitlab-release-artifacts',
    tag,
    'expanded',
    'release-evidence',
    'release-manifest.json'
  );
  return fsApi.existsSync(manifestPath) ? manifestPath : null;
}

function readReleaseManifest(tag, fsApi = fs) {
  const manifestPath = resolveReleaseManifestPath(tag, fsApi);
  if (!manifestPath) {
    return null;
  }

  const manifest = JSON.parse(fsApi.readFileSync(manifestPath, 'utf8'));
  const checksumPath = path.join(path.dirname(manifestPath), `${manifest.vsixArtifact.fileName}.sha256`);
  return {
    manifestPath,
    checksumPath: fsApi.existsSync(checksumPath) ? checksumPath : null,
    manifest,
    checksumSha256: fsApi.existsSync(checksumPath) ? computeFileSha256(checksumPath, fsApi) : null
  };
}

function httpsJsonRequest(url, options = {}, body) {
  return new Promise((resolve, reject) => {
    const request = https.request(
      url,
      {
        method: options.method ?? (body ? 'POST' : 'GET'),
        headers: options.headers ?? {}
      },
      (response) => {
        let responseBody = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          responseBody += chunk;
        });
        response.on('end', () => {
          let parsed;
          if (responseBody.length > 0) {
            try {
              parsed = JSON.parse(responseBody);
            } catch {
              parsed = undefined;
            }
          }
          resolve({
            statusCode: response.statusCode ?? 0,
            headers: response.headers,
            bodyText: responseBody,
            json: parsed
          });
        });
      }
    );

    request.on('error', reject);
    if (body) {
      request.write(body);
    }
    request.end();
  });
}

async function fetchGitHubJson(owner, repo, endpoint, token) {
  return httpsJsonRequest(`https://api.github.com/repos/${owner}/${repo}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'vi-history-suite-public-release-transaction'
    }
  });
}

async function fetchMarketplaceState(marketplaceItem) {
  const response = await httpsJsonRequest(
    'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery',
    {
      method: 'POST',
      headers: {
        Accept: 'application/json;api-version=3.0-preview.1',
        'Content-Type': 'application/json',
        'User-Agent': 'vi-history-suite-public-release-transaction',
        'X-Market-Client-Id': 'vi-history-suite'
      }
    },
    JSON.stringify({
      filters: [
        {
          criteria: [
            {
              filterType: 7,
              value: marketplaceItem
            }
          ],
          pageNumber: 1,
          pageSize: 1,
          sortBy: 0,
          sortOrder: 0
        }
      ],
      assetTypes: [],
      flags: 103
    })
  );

  const extension =
    response.json?.results?.[0]?.extensions?.[0] ??
    response.json?.results?.[0]?.extensions?.find?.(() => true) ??
    null;
  const latestVersion = extension?.versions?.[0]?.version ?? null;

  return {
    statusCode: response.statusCode,
    marketplaceItem,
    currentPublishedVersion: latestVersion,
    found: Boolean(extension)
  };
}

function extractReleaseAssets(release) {
  if (!release || !Array.isArray(release.assets)) {
    return [];
  }

  return release.assets.map((asset) => ({
    id: asset.id,
    name: asset.name,
    size: asset.size,
    state: asset.state,
    digest: asset.digest ?? null,
    downloadCount: asset.download_count ?? 0,
    browserDownloadUrl: asset.browser_download_url ?? null
  }));
}

function buildPhase(id, title, status, summary, details = {}) {
  return { id, title, status, summary, details };
}

function buildPublishabilityProbe(facts, assetPhaseStatus) {
  const immutableReleasePolicyStatusCode = facts.immutableReleasePolicy?.statusCode ?? null;
  const immutableReleasesEnabled = facts.immutableReleasePolicy?.enabled ?? null;
  const immutableReleasesEnforcedByOwner = facts.immutableReleasePolicy?.enforcedByOwner ?? null;
  const draftRelease = facts.publicRelease ?? null;
  const draftReleaseId = draftRelease?.id ?? null;
  const draftReleaseTag = draftRelease?.tag_name ?? null;
  const draftReleaseIsDraft = draftRelease?.draft === true;
  const draftReleaseTargetCommitish = draftRelease?.target_commitish ?? null;
  const draftReleaseTargetsMain = draftReleaseTargetCommitish === 'main';
  const draftReleaseLookupStatusCode = facts.publicReleaseLookup.statusCode;
  const draftReleaseDiscoveredByList = Boolean(draftRelease);
  const draftReleaseDiscoveredByTag = draftReleaseLookupStatusCode === 200;
  const draftReleaseHtmlUrl = draftRelease?.html_url ?? null;
  const draftReleaseHtmlUrlUsesUntaggedPath = Boolean(
    draftReleaseHtmlUrl && draftReleaseHtmlUrl.includes('/untagged-')
  );
  const exactAssetsRetained = assetPhaseStatus === 'pass';

  let blockerCode = null;
  let rationale =
    'The non-mutating publishability probe confirms the immutable-release policy, draft tag lookup, target commitish, draft URL, and retained assets for a safe in-place publish attempt.';

  if (!draftReleaseDiscoveredByList) {
    blockerCode = 'draft-release-missing';
    rationale = 'No retained draft release was found for the current exact line.';
  } else if (!draftReleaseIsDraft) {
    blockerCode = 'draft-release-not-draft';
    rationale = 'The retained release is no longer a draft, so the in-place repair path is not the active publishability surface.';
  } else if (immutableReleasePolicyStatusCode !== 200) {
    blockerCode = 'immutable-release-policy-unconfirmed';
    rationale =
      'The controller could not prove the repo immutable-release policy non-mutatively, so a safe publish transition is not yet confirmed.';
  } else if (!draftReleaseDiscoveredByTag) {
    blockerCode = 'draft-release-tag-lookup-unavailable';
    rationale =
      'Immutable releases are enabled, but the retained draft is still discoverable only by id/list; release lookup by the exact tag remains unavailable.';
  } else if (!draftReleaseTargetsMain) {
    blockerCode = 'draft-release-target-commitish-mismatch';
    rationale =
      'The retained draft release does not target public GitHub main, so publishing it in place would risk closing against the wrong source baseline.';
  } else if (draftReleaseHtmlUrlUsesUntaggedPath) {
    blockerCode = 'draft-release-html-url-still-untagged';
    rationale =
      'The retained draft release still resolves through an untagged GitHub release URL, so the controller cannot prove a safe exact-tag publish transition yet.';
  } else if (!exactAssetsRetained) {
    blockerCode = 'draft-release-assets-mismatch';
    rationale =
      'The retained draft release assets do not fully match the authority release manifest, so publishability remains blocked.';
  }

  return {
    status: blockerCode === null ? 'pass' : 'blocked',
    safeToAttemptRepairPublish: blockerCode === null,
    blockerCode,
    rationale,
    immutableReleasePolicyStatusCode,
    immutableReleasesEnabled,
    immutableReleasesEnforcedByOwner,
    draftReleaseId,
    draftReleaseTag,
    draftReleaseTargetCommitish,
    draftReleaseLookupStatusCode,
    draftReleaseDiscoveredByList,
    draftReleaseDiscoveredByTag,
    draftReleaseHtmlUrl,
    draftReleaseHtmlUrlUsesUntaggedPath,
    exactAssetsRetained
  };
}

function assessTransaction(facts) {
  const phases = [];
  const manifest = facts.releaseManifest?.manifest ?? null;
  const releaseAssets = facts.publicRelease?.assets ?? [];
  const vsixAsset = manifest
    ? releaseAssets.find((asset) => asset.name === manifest.vsixArtifact.fileName)
    : null;
  const checksumAsset =
    manifest && facts.releaseManifest?.checksumPath
      ? releaseAssets.find((asset) => asset.name === `${manifest.vsixArtifact.fileName}.sha256`)
      : null;
  phases.push(
    buildPhase(
      'authority-exact-main',
      'Authority exact main line retained',
      facts.authority.mainSha ? 'pass' : 'blocked',
      facts.authority.mainSha
        ? `Protected main resolves to ${facts.authority.mainSha}.`
        : 'Protected main did not resolve locally.',
      {
        mainSha: facts.authority.mainSha
      }
    )
  );

  phases.push(
    buildPhase(
      'authority-exact-tag',
      'Authority exact tag retained',
      facts.authority.tagCommitSha ? 'pass' : 'blocked',
      facts.authority.tagCommitSha
        ? `${facts.authority.tag} resolves to ${facts.authority.tagCommitSha}.`
        : `Authority tag ${facts.authority.tag} did not resolve locally.`,
      {
        tag: facts.authority.tag,
        tagObjectSha: facts.authority.tagObjectSha,
        tagCommitSha: facts.authority.tagCommitSha
      }
    )
  );

  phases.push(
    buildPhase(
      'public-source-main',
      'Public GitHub source main published',
      facts.publicSource.mainSha ? 'pass' : 'blocked',
      facts.publicSource.mainSha
        ? `Public GitHub main publishes ${facts.publicSource.mainSha}.`
        : 'Public GitHub main was not resolved.',
      {
        mainSha: facts.publicSource.mainSha
      }
    )
  );

  phases.push(
    buildPhase(
      'public-tag',
      'Public GitHub exact tag published',
      facts.publicSource.tagRef ? 'pass' : 'blocked',
      facts.publicSource.tagRef
        ? `Public GitHub tag ${facts.authority.tag} exists as ${facts.publicSource.tagRef}.`
        : `Public GitHub tag ${facts.authority.tag} is absent.`,
      {
        tagRef: facts.publicSource.tagRef,
        tagObjectType: facts.publicSource.tagObjectType,
        tagObjectSha: facts.publicSource.tagObjectSha,
        tagCommitSha: facts.publicSource.tagCommitSha
      }
    )
  );

  phases.push(
    buildPhase(
      'public-release-record',
      'Public GitHub release record retained',
      facts.publicRelease ? 'pass' : 'blocked',
      facts.publicRelease
        ? `GitHub release record ${facts.publicRelease.id} exists for ${facts.authority.tag}.`
        : `No GitHub release record was found for ${facts.authority.tag}.`,
      {
        releaseId: facts.publicRelease?.id ?? null,
        draft: facts.publicRelease?.draft ?? null,
        publishedAt: facts.publicRelease?.published_at ?? null,
        lookupByTagStatusCode: facts.publicReleaseLookup.statusCode
      }
    )
  );

  const assetPhaseStatus =
    manifest &&
    vsixAsset &&
    checksumAsset &&
    `${vsixAsset.digest ?? ''}`.replace(/^sha256:/, '') === manifest.vsixArtifact.sha256 &&
    `${checksumAsset.digest ?? ''}`.replace(/^sha256:/, '') === facts.releaseManifest?.checksumSha256
      ? 'pass'
      : 'blocked';
  phases.push(
    buildPhase(
      'public-release-assets',
      'Public GitHub release assets retained',
      assetPhaseStatus,
      assetPhaseStatus === 'pass'
        ? 'The draft release carries the exact VSIX and checksum assets from the authority release manifest.'
        : 'The release assets do not yet match the retained authority release manifest completely.',
      {
        manifestPath: facts.releaseManifest?.manifestPath ?? null,
        vsixExpectedSha256: manifest?.vsixArtifact?.sha256 ?? null,
        vsixObservedDigest: vsixAsset?.digest ?? null,
        checksumExpectedSha256: facts.releaseManifest?.checksumSha256 ?? null,
        checksumObservedDigest: checksumAsset?.digest ?? null
      }
    )
  );

  const publishabilityProbe = buildPublishabilityProbe(facts, assetPhaseStatus);
  const publishabilityBlocked = publishabilityProbe.safeToAttemptRepairPublish !== true;
  phases.push(
    buildPhase(
      'public-release-publishability',
      'Public GitHub release publishability proven',
      publishabilityBlocked ? 'blocked' : 'pass',
      publishabilityBlocked
        ? `The non-mutating publishability probe is blocked: ${publishabilityProbe.rationale}`
        : 'The non-mutating publishability probe proves a safe in-place publish transition.',
      {
        publishabilityProbe
      }
    )
  );

  phases.push(
    buildPhase(
      'public-release-published',
      'Public GitHub exact release published',
      facts.publicRelease?.published_at ? 'pass' : 'blocked',
      facts.publicRelease?.published_at
        ? `GitHub release ${facts.publicRelease.id} is published.`
        : `GitHub release ${facts.publicRelease?.id ?? 'unknown'} remains draft-only.`,
      {
        releaseId: facts.publicRelease?.id ?? null,
        draft: facts.publicRelease?.draft ?? null,
        publishedAt: facts.publicRelease?.published_at ?? null
      }
    )
  );

  const marketplacePhaseStatus =
    facts.marketplace.currentPublishedVersion === facts.authority.packageVersion ? 'pass' : 'blocked';
  phases.push(
    buildPhase(
      'marketplace-published',
      'VS Code Marketplace publication published',
      marketplacePhaseStatus,
      marketplacePhaseStatus === 'pass'
        ? `Marketplace already serves ${facts.marketplace.currentPublishedVersion}.`
        : `Marketplace still serves ${facts.marketplace.currentPublishedVersion ?? 'unknown'}, not ${facts.authority.packageVersion}.`,
      {
        marketplaceItem: facts.marketplace.marketplaceItem,
        currentPublishedVersion: facts.marketplace.currentPublishedVersion
      }
    )
  );

  const releasePublished = phases.find((phase) => phase.id === 'public-release-published')?.status === 'pass';
  const marketplacePublished = phases.find((phase) => phase.id === 'marketplace-published')?.status === 'pass';
  const repairInPlaceRequired =
    facts.publicSource.tagRef &&
    facts.publicRelease &&
    facts.publicRelease.draft === true &&
    !releasePublished;
  const repairInPlaceAllowed = Boolean(
    facts.publicSource.tagRef &&
      facts.publicRelease &&
      facts.publicRelease.draft === true &&
      assetPhaseStatus === 'pass'
  );
  const openingNewSemverAllowed = Boolean(releasePublished && marketplacePublished);
  const assessmentStatus = openingNewSemverAllowed ? 'pass' : 'blocked';

  return {
    status: assessmentStatus,
    phases,
    publishabilityProbe,
    semverFreeze: {
      status: openingNewSemverAllowed ? 'clear' : 'frozen',
      openingNewSemverAllowed,
      rationale: openingNewSemverAllowed
        ? 'The current exact release line is fully published across public GitHub and Marketplace.'
        : `A newer public exact-release transaction for ${facts.authority.tag} is still incomplete, so opening ${facts.authority.packageVersion} successors is forbidden.`,
      enforcedBy: 'no-bump-repair-rule'
    },
    repairInPlace: {
      required: repairInPlaceRequired,
      allowed: repairInPlaceAllowed,
      status:
        repairInPlaceRequired && repairInPlaceAllowed
          ? 'required-but-blocked-on-publishability'
          : repairInPlaceRequired
            ? 'required-but-incomplete'
            : 'not-required',
      rationale:
        repairInPlaceRequired && repairInPlaceAllowed
          ? `Public main, tag, and draft release already exist for ${facts.authority.tag}; the governed path is repair in place, not another bump.`
          : repairInPlaceRequired
            ? `The transaction is already partially public for ${facts.authority.tag}, but the release record or assets are not yet sufficient for a safe repair-in-place attempt.`
            : `No partial public exact-release transaction was detected for ${facts.authority.tag}.`,
      nextAllowedAction:
        repairInPlaceRequired && repairInPlaceAllowed && publishabilityProbe.safeToAttemptRepairPublish
          ? 'repair-the-existing-v1.3.6-public-github-release-in-place'
          : repairInPlaceRequired && repairInPlaceAllowed
            ? 'repair-the-existing-v1.3.6-public-github-release-only-after-safe-publishability-is-proven'
          : openingNewSemverAllowed
            ? 'normal-next-semver-opening-may-proceed'
            : 'retain-the-blocked-state-and-do-not-open-a-new-version'
    }
  };
}

function buildMarkdown(report) {
  const lines = [
    '# Public GitHub Exact Release Transaction',
    '',
    `- Recorded: ${report.recordedAt}`,
    `- Repo root: ${report.repoRoot}`,
    `- Status: ${report.status}`,
    `- Authority tag: ${report.authority.tag}`,
    `- Authority main: ${report.authority.mainSha}`,
    `- Public GitHub main: ${report.publicSource.mainSha ?? 'unknown'}`,
    `- Public GitHub tag: ${report.publicSource.tagRef ?? 'missing'}`,
    `- Marketplace version: ${report.marketplace.currentPublishedVersion ?? 'unknown'}`,
    '',
    '## Publishability Probe',
    '',
    `- Status: ${report.publishabilityProbe.status}`,
    `- Safe in-place publish attempt allowed: ${report.publishabilityProbe.safeToAttemptRepairPublish}`,
    `- Blocker code: ${report.publishabilityProbe.blockerCode ?? 'none'}`,
    `- Rationale: ${report.publishabilityProbe.rationale}`,
    `- Immutable releases enabled: ${report.publishabilityProbe.immutableReleasesEnabled}`,
    `- Immutable releases enforced by owner: ${report.publishabilityProbe.immutableReleasesEnforcedByOwner}`,
    `- Draft release target commitish: ${report.publishabilityProbe.draftReleaseTargetCommitish ?? 'unknown'}`,
    `- Draft release tag lookup status: ${report.publishabilityProbe.draftReleaseLookupStatusCode}`,
    `- Draft release uses untagged URL: ${report.publishabilityProbe.draftReleaseHtmlUrlUsesUntaggedPath}`,
    '',
    '## Freeze Rule',
    '',
    `- Status: ${report.semverFreeze.status}`,
    `- New SemVer opening allowed: ${report.semverFreeze.openingNewSemverAllowed}`,
    `- Rationale: ${report.semverFreeze.rationale}`,
    '',
    '## Repair In Place',
    '',
    `- Required: ${report.repairInPlace.required}`,
    `- Allowed: ${report.repairInPlace.allowed}`,
    `- Status: ${report.repairInPlace.status}`,
    `- Rationale: ${report.repairInPlace.rationale}`,
    `- Next allowed action: ${report.repairInPlace.nextAllowedAction}`,
    '',
    '| Phase | Status | Summary |',
    '| --- | --- | --- |'
  ];

  for (const phase of report.phases) {
    lines.push(`| ${phase.id} | ${phase.status} | ${phase.summary} |`);
  }

  return `${lines.join('\n')}\n`;
}

async function runAssessment(argv = process.argv.slice(2), deps = {}) {
  const parsed = parseArgs(argv);
  const stdout = deps.stdout ?? process.stdout;
  const now = deps.now ?? (() => new Date().toISOString());
  const fsApi = deps.fs ?? fs;

  if (parsed.helpRequested) {
    stdout.write(`${getUsage()}\n`);
    return { outcome: 'help' };
  }

  const tag = parsed.tag ?? resolveLatestExactTag(deps.spawnImpl);
  const tokenEnv = { ...(deps.env ?? process.env) };
  if (parsed.githubTokenPath) {
    tokenEnv[githubToken.GITHUB_TOKEN_FILE_ENV] = parsed.githubTokenPath;
  }
  const token = deps.readGitHubToken
    ? deps.readGitHubToken(tokenEnv, fsApi)
    : githubToken.readGitHubToken(tokenEnv, fsApi);

  await fsp.rm(parsed.evidenceDir, { recursive: true, force: true });
  await fsp.mkdir(parsed.evidenceDir, { recursive: true });

  const authorityMainSha = resolveGitCommitish('origin/main', deps.spawnImpl);
  const authorityTagObjectSha = resolveGitCommitish(`refs/tags/${tag}`, deps.spawnImpl);
  const authorityTagCommitSha = resolveTagCommit(tag, deps.spawnImpl);
  const branchPackageVersion = JSON.parse(
    fsApi.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')
  ).version;

  const branchResponse = await (deps.fetchGitHubJson ?? fetchGitHubJson)(
    parsed.owner,
    parsed.repo,
    '/branches/main',
    token
  );
  const tagResponse = await (deps.fetchGitHubJson ?? fetchGitHubJson)(
    parsed.owner,
    parsed.repo,
    `/git/ref/tags/${encodeURIComponent(tag)}`,
    token
  );
  const releasesResponse = await (deps.fetchGitHubJson ?? fetchGitHubJson)(
    parsed.owner,
    parsed.repo,
    '/releases?per_page=100',
    token
  );
  const releaseByTagResponse = await (deps.fetchGitHubJson ?? fetchGitHubJson)(
    parsed.owner,
    parsed.repo,
    `/releases/tags/${encodeURIComponent(tag)}`,
    token
  );
  const immutableReleasePolicyResponse = await (deps.fetchGitHubJson ?? fetchGitHubJson)(
    parsed.owner,
    parsed.repo,
    '/immutable-releases',
    token
  );
  const marketplace = await (deps.fetchMarketplaceState ?? fetchMarketplaceState)(
    parsed.marketplaceItem
  );

  const publicReleases = Array.isArray(releasesResponse.json)
    ? releasesResponse.json.map((release) => ({
        id: release.id,
        tag_name: release.tag_name,
        draft: release.draft,
        prerelease: release.prerelease,
        created_at: release.created_at,
        published_at: release.published_at,
        html_url: release.html_url,
        immutable: release.immutable === true
      }))
    : [];
  const matchedRelease = Array.isArray(releasesResponse.json)
    ? releasesResponse.json.find((release) => release.tag_name === tag) ?? null
    : null;
  const publicRelease =
    matchedRelease && matchedRelease.url
      ? (
          await (deps.fetchGitHubJson ?? fetchGitHubJson)(
            parsed.owner,
            parsed.repo,
            matchedRelease.url.replace(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`, ''),
            token
          )
        ).json
      : null;
  const releaseManifest = readReleaseManifest(tag, fsApi);
  const packageVersion =
    releaseManifest?.manifest?.packageVersion ??
    (parseSemverTag(tag)?.tag.replace(/^v/, '') ?? branchPackageVersion);

  const tagCommitSha =
    tagResponse.statusCode === 200 && tagResponse.json?.object?.type === 'tag'
      ? (
          await (deps.fetchGitHubJson ?? fetchGitHubJson)(
            parsed.owner,
            parsed.repo,
            `/git/tags/${tagResponse.json.object.sha}`,
            token
          )
        ).json?.object?.sha ?? null
      : tagResponse.json?.object?.sha ?? null;

  const facts = {
    authority: {
      tag,
      packageVersion,
      branchPackageVersion,
      mainSha: authorityMainSha,
      tagObjectSha: authorityTagObjectSha,
      tagCommitSha: authorityTagCommitSha
    },
    publicSource: {
      mainSha: branchResponse.json?.commit?.sha ?? null,
      tagRef: tagResponse.json?.ref ?? null,
      tagObjectType: tagResponse.json?.object?.type ?? null,
      tagObjectSha: tagResponse.json?.object?.sha ?? null,
      tagCommitSha
    },
    immutableReleasePolicy: {
      statusCode: immutableReleasePolicyResponse.statusCode,
      enabled:
        immutableReleasePolicyResponse.statusCode === 200
          ? immutableReleasePolicyResponse.json?.enabled === true
          : null,
      enforcedByOwner:
        immutableReleasePolicyResponse.statusCode === 200
          ? immutableReleasePolicyResponse.json?.enforced_by_owner === true
          : null
    },
    publicReleaseLookup: {
      statusCode: releaseByTagResponse.statusCode
    },
    publicReleases,
    publicRelease: publicRelease
      ? {
          id: publicRelease.id,
          tag_name: publicRelease.tag_name,
          draft: publicRelease.draft,
        prerelease: publicRelease.prerelease,
        created_at: publicRelease.created_at,
        published_at: publicRelease.published_at,
        html_url: publicRelease.html_url,
        target_commitish: publicRelease.target_commitish ?? null,
        immutable: publicRelease.immutable === true,
        assets: extractReleaseAssets(publicRelease)
      }
      : null,
    releaseManifest,
    marketplace
  };

  const assessment = assessTransaction(facts);
  const report = {
    schema: 'vi-history-suite/public-github-exact-release-transaction@v1',
    recordedAt: now(),
    repoRoot,
    status: assessment.status,
    authority: facts.authority,
    publicSource: facts.publicSource,
    immutableReleasePolicy: facts.immutableReleasePolicy,
    publicReleaseLookup: facts.publicReleaseLookup,
    publicRelease: facts.publicRelease,
    publicReleases: facts.publicReleases,
    releaseManifest: facts.releaseManifest
      ? {
          manifestPath: path.relative(repoRoot, facts.releaseManifest.manifestPath).replaceAll(path.sep, '/'),
          checksumPath: facts.releaseManifest.checksumPath
            ? path.relative(repoRoot, facts.releaseManifest.checksumPath).replaceAll(path.sep, '/')
            : null,
          manifest: facts.releaseManifest.manifest,
          checksumSha256: facts.releaseManifest.checksumSha256
        }
      : null,
    marketplace: facts.marketplace,
    phases: assessment.phases,
    publishabilityProbe: assessment.publishabilityProbe,
    semverFreeze: assessment.semverFreeze,
    repairInPlace: assessment.repairInPlace
  };

  await fsp.writeFile(
    path.join(parsed.evidenceDir, 'public-github-exact-release-transaction.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8'
  );
  await fsp.writeFile(
    path.join(parsed.evidenceDir, 'public-github-exact-release-transaction.md'),
    buildMarkdown(report),
    'utf8'
  );

  if (assessment.status !== 'pass') {
    throw new Error(
      `Public GitHub exact-release transaction is ${assessment.status}: ${assessment.repairInPlace.rationale}`
    );
  }

  return { outcome: 'pass', report };
}

if (require.main === module) {
  runAssessment().catch((error) => {
    console.error(String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_EVIDENCE_DIR,
  DEFAULT_MARKETPLACE_ITEM,
  DEFAULT_OWNER,
  DEFAULT_REPO,
  assessTransaction,
  buildMarkdown,
  computeFileSha256,
  extractReleaseAssets,
  fetchGitHubJson,
  fetchMarketplaceState,
  getUsage,
  parseArgs,
  parseSemverTag,
  readReleaseManifest,
  resolveLatestExactTag,
  resolveReleaseManifestPath,
  runAssessment
};
