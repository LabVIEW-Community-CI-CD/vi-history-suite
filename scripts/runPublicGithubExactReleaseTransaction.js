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
    'Usage: node scripts/runPublicGithubExactReleaseTransaction.js [--mode <assess|publish|verify>] [--tag <vX.Y.Z>] [--draft-release-id <id>] [--owner <github-owner>] [--repo <github-repo>] [--github-token-path <path>] [--marketplace-item <publisher.extension>] [--evidence-dir <path>] [--help]',
    '',
    'Assess, publish, or verify the public GitHub exact-release transaction fail-closed and retain a resumable phase receipt.',
    '',
    'Modes:',
    '  assess  Evaluate the retained transaction state without mutating GitHub or Marketplace.',
    '  publish Publish the retained draft release in place only when the by-id draft, authority tag, target commitish, and retained assets already match and the only remaining blocker is tag lookup.',
    '  verify  Confirm the public GitHub exact release is published and canonical without touching Marketplace.',
    '',
    'Defaults:',
    '  mode:              assess',
    `  owner:             ${DEFAULT_OWNER}`,
    `  repo:              ${DEFAULT_REPO}`,
    `  marketplace-item:  ${DEFAULT_MARKETPLACE_ITEM}`,
    `  evidence-dir:      ${DEFAULT_EVIDENCE_DIR}`,
    '  tag:               latest exact SemVer tag found locally'
  ].join('\n');
}

function assertKnownMode(mode) {
  if (!['assess', 'publish', 'verify'].includes(mode)) {
    throw new Error(`Unknown mode: ${mode}`);
  }
}

function parseArgs(argv) {
  const parsed = {
    helpRequested: false,
    mode: 'assess',
    owner: DEFAULT_OWNER,
    repo: DEFAULT_REPO,
    tag: null,
    draftReleaseId: null,
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

    if (argument === '--mode') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --mode');
      }
      assertKnownMode(value.trim());
      parsed.mode = value.trim();
      index += 1;
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

    if (argument === '--draft-release-id') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --draft-release-id');
      }
      const parsedValue = Number.parseInt(value.trim(), 10);
      if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
        throw new Error('--draft-release-id must be a positive integer');
      }
      parsed.draftReleaseId = parsedValue;
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

function toRelativeReportPath(targetPath) {
  const relativePath = path.relative(repoRoot, targetPath).replaceAll(path.sep, '/');
  return relativePath.length > 0 ? relativePath : '.';
}

function listKnownWorktreeRoots(spawnImpl = spawnSync) {
  const result = runGit(['worktree', 'list', '--porcelain'], repoRoot, spawnImpl);
  if (result.status !== 0) {
    return [repoRoot];
  }

  const roots = new Set([path.resolve(repoRoot)]);
  for (const line of result.stdout.split(/\r?\n/)) {
    if (!line.startsWith('worktree ')) {
      continue;
    }
    const worktreeRoot = line.slice('worktree '.length).trim();
    if (worktreeRoot.length > 0) {
      roots.add(path.resolve(worktreeRoot));
    }
  }

  return Array.from(roots);
}

function buildReleaseManifestPathForRoot(root, tag) {
  return path.join(
    root,
    '.cache',
    'gitlab-release-artifacts',
    tag,
    'expanded',
    'release-evidence',
    'release-manifest.json'
  );
}

function resolveReleaseManifestPath(tag, fsApi = fs, spawnImpl = spawnSync) {
  for (const root of listKnownWorktreeRoots(spawnImpl)) {
    const manifestPath = buildReleaseManifestPathForRoot(root, tag);
    if (fsApi.existsSync(manifestPath)) {
      return manifestPath;
    }
  }

  return null;
}

function readReleaseManifest(tag, fsApi = fs, spawnImpl = spawnSync) {
  const manifestPath = resolveReleaseManifestPath(tag, fsApi, spawnImpl);
  if (!manifestPath) {
    return null;
  }

  const manifest = JSON.parse(fsApi.readFileSync(manifestPath, 'utf8'));
  const checksumPath = path.join(path.dirname(manifestPath), `${manifest.vsixArtifact.fileName}.sha256`);
  return {
    manifestPath,
    manifestRoot: path.resolve(path.dirname(manifestPath), '..', '..', '..', '..', '..'),
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

async function mutateGitHubJson(owner, repo, endpoint, token, method, payload) {
  return httpsJsonRequest(
    `https://api.github.com/repos/${owner}/${repo}${endpoint}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'vi-history-suite-public-release-transaction'
      }
    },
    JSON.stringify(payload)
  );
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
  const draftPublishabilityProbe = buildDraftPublishabilityProbe(facts, assetPhaseStatus);
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

  let blockerCode = draftPublishabilityProbe.blockerCode ?? null;
  let rationale =
    'The non-mutating publishability probe confirms the immutable-release policy, draft tag lookup, target commitish, draft URL, and retained assets for a safe in-place publish attempt.';

  if (draftPublishabilityProbe.safeToAttemptPublishDraftInPlace !== true) {
    rationale = `The non-mutating draft-publishability probe is blocked: ${draftPublishabilityProbe.rationale}`;
  } else if (!draftReleaseDiscoveredByList) {
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
    draftPublishabilityStatus: draftPublishabilityProbe.status,
    draftPublishabilityBlockerCode: draftPublishabilityProbe.blockerCode,
    draftPublishabilityReleaseId: draftPublishabilityProbe.requestedDraftReleaseId,
    draftPublishabilityByIdStatusCode: draftPublishabilityProbe.draftReleaseByIdStatusCode,
    draftPublishabilitySafeToAttemptPublish: draftPublishabilityProbe.safeToAttemptPublishDraftInPlace,
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

function buildDraftPublishabilityProbe(facts, assetPhaseStatus) {
  const immutableReleasePolicyStatusCode = facts.immutableReleasePolicy?.statusCode ?? null;
  const immutableReleasesEnabled = facts.immutableReleasePolicy?.enabled ?? null;
  const immutableReleasesEnforcedByOwner = facts.immutableReleasePolicy?.enforcedByOwner ?? null;
  const requestedDraftReleaseId = facts.publicReleaseByIdLookup?.requestedDraftReleaseId ?? null;
  const draftReleaseByIdStatusCode = facts.publicReleaseByIdLookup?.statusCode ?? null;
  const draftRelease = facts.publicRelease ?? null;
  const draftReleaseResolvedById = draftReleaseByIdStatusCode === 200;
  const draftReleaseId = draftRelease?.id ?? null;
  const draftReleaseIdMatchesRequested =
    requestedDraftReleaseId !== null && draftReleaseId === requestedDraftReleaseId;
  const draftReleaseIsDraft = draftRelease?.draft === true;
  const draftReleaseTag = draftRelease?.tag_name ?? null;
  const draftReleaseTagMatchesAuthority = draftReleaseTag === facts.authority.tag;
  const draftReleaseTargetCommitish = draftRelease?.target_commitish ?? null;
  const draftReleaseTargetsMain = draftReleaseTargetCommitish === 'main';
  const draftReleaseImmutable = draftRelease?.immutable === true;
  const draftReleaseLookupByTagStatusCode = facts.publicReleaseLookup?.statusCode ?? null;
  const draftReleaseHtmlUrl = draftRelease?.html_url ?? null;
  const draftReleaseHtmlUrlUsesUntaggedPath = Boolean(
    draftReleaseHtmlUrl && draftReleaseHtmlUrl.includes('/untagged-')
  );
  const exactAssetsRetained = assetPhaseStatus === 'pass';

  let blockerCode = null;
  let rationale =
    'The non-mutating draft-publishability probe confirms the retained draft release by id, its tag binding, target commitish, immutable-release posture, and exact asset set before any in-place publish attempt is considered.';

  if (requestedDraftReleaseId === null) {
    blockerCode = 'draft-release-id-unresolved';
    rationale = 'No retained draft release id is available for the current exact line.';
  } else if (!draftReleaseResolvedById) {
    blockerCode = 'draft-release-id-lookup-failed';
    rationale = `Draft release ${requestedDraftReleaseId} could not be read back by id.`;
  } else if (!draftReleaseIdMatchesRequested) {
    blockerCode = 'draft-release-id-mismatch';
    rationale = `Draft release lookup by id did not return the requested release ${requestedDraftReleaseId}.`;
  } else if (!draftReleaseIsDraft) {
    blockerCode = 'draft-release-not-draft';
    rationale = `Release ${requestedDraftReleaseId} is no longer a draft.`;
  } else if (!draftReleaseTagMatchesAuthority) {
    blockerCode = 'draft-release-tag-mismatch';
    rationale = `Draft release ${requestedDraftReleaseId} does not retain authority tag ${facts.authority.tag}.`;
  } else if (!draftReleaseTargetsMain) {
    blockerCode = 'draft-release-target-commitish-mismatch';
    rationale = `Draft release ${requestedDraftReleaseId} does not target public GitHub main.`;
  } else if (immutableReleasePolicyStatusCode !== 200) {
    blockerCode = 'immutable-release-policy-unconfirmed';
    rationale =
      'The controller could not prove the repo immutable-release policy non-mutatively, so the draft publishability state remains unconfirmed.';
  } else if (draftReleaseLookupByTagStatusCode !== 200) {
    blockerCode = 'draft-release-tag-lookup-unavailable';
    rationale =
      `Draft release ${requestedDraftReleaseId} is readable by id and still carries the exact assets, but immutable releases are enabled while exact-tag release lookup still returns ${draftReleaseLookupByTagStatusCode}, so a safe in-place draft publish transition cannot yet be proven non-mutatively.`;
  } else if (draftReleaseHtmlUrlUsesUntaggedPath) {
    blockerCode = 'draft-release-html-url-still-untagged';
    rationale =
      `Draft release ${requestedDraftReleaseId} still resolves through an untagged GitHub release URL, so the controller cannot yet prove a safe exact-tag publish transition.`;
  } else if (draftReleaseImmutable) {
    blockerCode = 'draft-release-already-immutable';
    rationale =
      `Draft release ${requestedDraftReleaseId} is already immutable, so the controller cannot prove an in-place draft publish transition.`;
  } else if (!exactAssetsRetained) {
    blockerCode = 'draft-release-assets-mismatch';
    rationale =
      `Draft release ${requestedDraftReleaseId} does not yet fully match the retained exact assets.`;
  }

  return {
    status: blockerCode === null ? 'pass' : 'blocked',
    safeToAttemptPublishDraftInPlace: blockerCode === null,
    blockerCode,
    rationale,
    requestedDraftReleaseId,
    draftReleaseByIdStatusCode,
    draftReleaseResolvedById,
    draftReleaseId,
    draftReleaseIdMatchesRequested,
    draftReleaseIsDraft,
    draftReleaseTag,
    draftReleaseTagMatchesAuthority,
    draftReleaseTargetCommitish,
    draftReleaseTargetsMain,
    draftReleaseImmutable,
    draftReleaseLookupByTagStatusCode,
    draftReleaseHtmlUrl,
    draftReleaseHtmlUrlUsesUntaggedPath,
    immutableReleasePolicyStatusCode,
    immutableReleasesEnabled,
    immutableReleasesEnforcedByOwner,
    exactAssetsRetained
  };
}

function findPhaseStatus(phases, phaseId) {
  return phases.find((phase) => phase.id === phaseId)?.status ?? 'blocked';
}

function buildReleasePublishExecutionGate(facts, assessment) {
  const assetPhasePass = findPhaseStatus(assessment.phases, 'public-release-assets') === 'pass';
  const draftRelease = facts.publicRelease ?? null;
  const requestedDraftReleaseId = facts.publicReleaseByIdLookup?.requestedDraftReleaseId ?? null;

  let blockerCode = null;
  let rationale =
    'The retained draft is readable by id, still matches the authority tag, still targets public GitHub main, and still carries the exact authority assets, so the repo-owned controller may publish it in place by release id.';

  if (assessment.publishabilityProbe.blockerCode !== 'draft-release-tag-lookup-unavailable') {
    blockerCode = assessment.publishabilityProbe.blockerCode ?? 'publishability-not-proven';
    rationale =
      'The only admitted in-place publish recovery path in this slice is the exact retained draft-id case where tag lookup is the sole remaining blocker.';
  } else if (requestedDraftReleaseId === null) {
    blockerCode = 'draft-release-id-unresolved';
    rationale = 'No retained draft release id is available for an in-place publish attempt.';
  } else if (facts.publicReleaseByIdLookup?.statusCode !== 200) {
    blockerCode = 'draft-release-id-lookup-failed';
    rationale = `Draft release ${requestedDraftReleaseId} could not be read by id before publish.`;
  } else if (!draftRelease || draftRelease.id !== requestedDraftReleaseId) {
    blockerCode = 'draft-release-id-mismatch';
    rationale = `Draft release ${requestedDraftReleaseId} did not resolve as the retained release record.`;
  } else if (draftRelease.draft !== true) {
    blockerCode = 'draft-release-not-draft';
    rationale = `Release ${requestedDraftReleaseId} is no longer a draft, so the draft publish path is no longer active.`;
  } else if (draftRelease.tag_name !== facts.authority.tag) {
    blockerCode = 'draft-release-tag-mismatch';
    rationale = `Draft release ${requestedDraftReleaseId} no longer retains authority tag ${facts.authority.tag}.`;
  } else if (draftRelease.target_commitish !== 'main') {
    blockerCode = 'draft-release-target-commitish-mismatch';
    rationale = `Draft release ${requestedDraftReleaseId} does not target public GitHub main.`;
  } else if (!assetPhasePass) {
    blockerCode = 'draft-release-assets-mismatch';
    rationale = `Draft release ${requestedDraftReleaseId} does not fully match the retained authority assets.`;
  }

  return {
    status: blockerCode === null ? 'pass' : 'blocked',
    blockerCode,
    rationale,
    requestedDraftReleaseId,
    allowed: blockerCode === null
  };
}

function buildPublishedReleaseVerificationGate(facts, assessment) {
  const assetPhasePass = findPhaseStatus(assessment.phases, 'public-release-assets') === 'pass';
  const release = facts.publicRelease ?? null;
  const exactTagLookupStatusCode = facts.publicReleaseLookup?.statusCode ?? null;
  const htmlUrlUsesUntaggedPath = Boolean(
    release?.html_url && release.html_url.includes('/untagged-')
  );

  let blockerCode = null;
  let rationale =
    'The public GitHub exact release is now discoverable by exact tag, no longer draft, published, and still retains the exact authority assets.';

  if (!release) {
    blockerCode = 'public-release-missing';
    rationale = `No public GitHub release record was found for ${facts.authority.tag}.`;
  } else if (exactTagLookupStatusCode !== 200) {
    blockerCode = 'public-release-tag-lookup-unavailable';
    rationale = `Public GitHub release lookup by exact tag ${facts.authority.tag} still returns ${exactTagLookupStatusCode}.`;
  } else if (release.tag_name !== facts.authority.tag) {
    blockerCode = 'public-release-tag-mismatch';
    rationale = `Public GitHub release ${release.id} does not retain authority tag ${facts.authority.tag}.`;
  } else if (release.draft === true) {
    blockerCode = 'public-release-still-draft';
    rationale = `Public GitHub release ${release.id} still reports draft=true.`;
  } else if (!release.published_at) {
    blockerCode = 'public-release-published-at-missing';
    rationale = `Public GitHub release ${release.id} still has no published_at timestamp.`;
  } else if (release.target_commitish !== 'main') {
    blockerCode = 'public-release-target-commitish-mismatch';
    rationale = `Public GitHub release ${release.id} does not target public GitHub main.`;
  } else if (htmlUrlUsesUntaggedPath) {
    blockerCode = 'public-release-html-url-still-untagged';
    rationale = `Public GitHub release ${release.id} still resolves through an untagged URL.`;
  } else if (!assetPhasePass) {
    blockerCode = 'public-release-assets-mismatch';
    rationale = `Public GitHub release ${release.id} no longer matches the retained authority assets.`;
  }

  return {
    status: blockerCode === null ? 'pass' : 'blocked',
    blockerCode,
    rationale,
    allowed: blockerCode === null,
    releaseId: release?.id ?? null,
    exactTagLookupStatusCode,
    htmlUrlUsesUntaggedPath
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

  const draftPublishabilityProbe = buildDraftPublishabilityProbe(facts, assetPhaseStatus);
  phases.push(
    buildPhase(
      'public-release-draft-publishability',
      'Public GitHub draft release publishability proven',
      draftPublishabilityProbe.safeToAttemptPublishDraftInPlace ? 'pass' : 'blocked',
      draftPublishabilityProbe.safeToAttemptPublishDraftInPlace
        ? 'The non-mutating draft-publishability probe proves a safe in-place publish transition for the retained draft release.'
        : `The non-mutating draft-publishability probe is blocked: ${draftPublishabilityProbe.rationale}`,
      {
        draftPublishabilityProbe
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
    draftPublishabilityProbe,
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
    `- Authority release manifest: ${report.releaseManifest?.manifestPath ?? 'missing'}`,
    `- Marketplace version: ${report.marketplace.currentPublishedVersion ?? 'unknown'}`,
    '',
    '## Draft Publishability Probe',
    '',
    `- Status: ${report.draftPublishabilityProbe.status}`,
    `- Safe in-place draft publish attempt allowed: ${report.draftPublishabilityProbe.safeToAttemptPublishDraftInPlace}`,
    `- Requested draft release id: ${report.draftPublishabilityProbe.requestedDraftReleaseId ?? 'unknown'}`,
    `- Draft release by-id status: ${report.draftPublishabilityProbe.draftReleaseByIdStatusCode ?? 'unknown'}`,
    `- Draft release id matches requested: ${report.draftPublishabilityProbe.draftReleaseIdMatchesRequested}`,
    `- Draft release tag matches authority: ${report.draftPublishabilityProbe.draftReleaseTagMatchesAuthority}`,
    `- Exact assets retained against authority manifest: ${report.draftPublishabilityProbe.exactAssetsRetained}`,
    `- Blocker code: ${report.draftPublishabilityProbe.blockerCode ?? 'none'}`,
    `- Rationale: ${report.draftPublishabilityProbe.rationale}`,
    `- Draft release target commitish: ${report.draftPublishabilityProbe.draftReleaseTargetCommitish ?? 'unknown'}`,
    `- Draft release tag lookup status: ${report.draftPublishabilityProbe.draftReleaseLookupByTagStatusCode ?? 'unknown'}`,
    `- Draft release uses untagged URL: ${report.draftPublishabilityProbe.draftReleaseHtmlUrlUsesUntaggedPath}`,
    '',
    '## Publishability Probe',
    '',
    `- Status: ${report.publishabilityProbe.status}`,
    `- Safe in-place publish attempt allowed: ${report.publishabilityProbe.safeToAttemptRepairPublish}`,
    `- Blocker code: ${report.publishabilityProbe.blockerCode ?? 'none'}`,
    `- Rationale: ${report.publishabilityProbe.rationale}`,
    `- Immutable releases enabled: ${report.publishabilityProbe.immutableReleasesEnabled}`,
    `- Immutable releases enforced by owner: ${report.publishabilityProbe.immutableReleasesEnforcedByOwner}`,
    `- Exact assets retained against authority manifest: ${report.publishabilityProbe.exactAssetsRetained}`,
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

async function collectTransactionFacts(parsed, deps, token, fsApi) {
  const tag = parsed.tag;
  const branchPackageVersion = JSON.parse(
    fsApi.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')
  ).version;
  const authorityMainSha = resolveGitCommitish('origin/main', deps.spawnImpl);
  const authorityTagObjectSha = resolveGitCommitish(`refs/tags/${tag}`, deps.spawnImpl);
  const authorityTagCommitSha = resolveTagCommit(tag, deps.spawnImpl);

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
  const requestedDraftReleaseId = parsed.draftReleaseId ?? matchedRelease?.id ?? null;
  const releaseByIdResponse = requestedDraftReleaseId
    ? await (deps.fetchGitHubJson ?? fetchGitHubJson)(
        parsed.owner,
        parsed.repo,
        `/releases/${requestedDraftReleaseId}`,
        token
      )
    : { statusCode: 0, json: null };
  const publicRelease = releaseByIdResponse.statusCode === 200 ? releaseByIdResponse.json : null;
  const releaseManifest = readReleaseManifest(tag, fsApi, deps.spawnImpl);
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

  return {
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
    publicReleaseByIdLookup: {
      requestedDraftReleaseId,
      statusCode: requestedDraftReleaseId ? releaseByIdResponse.statusCode : null
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
}

function buildReport(facts, assessment, evidenceDir, recordedAt) {
  return {
    schema: 'vi-history-suite/public-github-exact-release-transaction@v1',
    recordedAt,
    repoRoot,
    evidenceDir: toRelativeReportPath(evidenceDir),
    mode: 'assess',
    status: assessment.status,
    authority: facts.authority,
    publicSource: facts.publicSource,
    immutableReleasePolicy: facts.immutableReleasePolicy,
    publicReleaseLookup: facts.publicReleaseLookup,
    publicReleaseByIdLookup: facts.publicReleaseByIdLookup,
    publicRelease: facts.publicRelease,
    publicReleases: facts.publicReleases,
    releaseManifest: facts.releaseManifest
      ? {
          manifestPath: toRelativeReportPath(facts.releaseManifest.manifestPath),
          manifestRoot: toRelativeReportPath(facts.releaseManifest.manifestRoot),
          checksumPath: facts.releaseManifest.checksumPath
            ? toRelativeReportPath(facts.releaseManifest.checksumPath)
            : null,
          manifest: facts.releaseManifest.manifest,
          checksumSha256: facts.releaseManifest.checksumSha256
        }
      : null,
    marketplace: facts.marketplace,
    phases: assessment.phases,
    draftPublishabilityProbe: assessment.draftPublishabilityProbe,
    publishabilityProbe: assessment.publishabilityProbe,
    semverFreeze: assessment.semverFreeze,
    repairInPlace: assessment.repairInPlace
  };
}

async function writeReport(evidenceDir, report) {
  await fsp.rm(evidenceDir, { recursive: true, force: true });
  await fsp.mkdir(evidenceDir, { recursive: true });
  await fsp.writeFile(
    path.join(evidenceDir, 'public-github-exact-release-transaction.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8'
  );
  await fsp.writeFile(
    path.join(evidenceDir, 'public-github-exact-release-transaction.md'),
    buildMarkdown(report),
    'utf8'
  );
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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

  parsed.tag = parsed.tag ?? resolveLatestExactTag(deps.spawnImpl);
  const tokenEnv = { ...(deps.env ?? process.env) };
  if (parsed.githubTokenPath) {
    tokenEnv[githubToken.GITHUB_TOKEN_FILE_ENV] = parsed.githubTokenPath;
  }
  const token = deps.readGitHubToken
    ? deps.readGitHubToken(tokenEnv, fsApi)
    : githubToken.readGitHubToken(tokenEnv, fsApi);
  const facts = await collectTransactionFacts(parsed, deps, token, fsApi);
  const assessment = assessTransaction(facts);
  const report = buildReport(facts, assessment, parsed.evidenceDir, now());
  report.mode = parsed.mode;
  await writeReport(parsed.evidenceDir, report);

  if (assessment.status !== 'pass') {
    throw new Error(
      `Public GitHub exact-release transaction is ${assessment.status}: ${assessment.repairInPlace.rationale}`
    );
  }

  return { outcome: 'pass', report };
}

async function runPublish(argv = process.argv.slice(2), deps = {}) {
  const parsed = parseArgs(argv);
  const stdout = deps.stdout ?? process.stdout;
  const now = deps.now ?? (() => new Date().toISOString());
  const fsApi = deps.fs ?? fs;

  if (parsed.helpRequested) {
    stdout.write(`${getUsage()}\n`);
    return { outcome: 'help' };
  }

  parsed.mode = 'publish';
  parsed.tag = parsed.tag ?? resolveLatestExactTag(deps.spawnImpl);
  const tokenEnv = { ...(deps.env ?? process.env) };
  if (parsed.githubTokenPath) {
    tokenEnv[githubToken.GITHUB_TOKEN_FILE_ENV] = parsed.githubTokenPath;
  }
  const token = deps.readGitHubToken
    ? deps.readGitHubToken(tokenEnv, fsApi)
    : githubToken.readGitHubToken(tokenEnv, fsApi);

  const initialFacts = await collectTransactionFacts(parsed, deps, token, fsApi);
  const initialAssessment = assessTransaction(initialFacts);
  const publishGate = buildReleasePublishExecutionGate(initialFacts, initialAssessment);
  const initialReport = buildReport(initialFacts, initialAssessment, parsed.evidenceDir, now());
  initialReport.mode = parsed.mode;
  initialReport.publishGate = publishGate;
  await writeReport(parsed.evidenceDir, initialReport);

  if (!publishGate.allowed) {
    throw new Error(`Public GitHub exact-release publish is blocked: ${publishGate.rationale}`);
  }

  const mutate = deps.mutateGitHubJson ?? mutateGitHubJson;
  const publishResponse = await mutate(
    parsed.owner,
    parsed.repo,
    `/releases/${publishGate.requestedDraftReleaseId}`,
    token,
    'PATCH',
    { draft: false }
  );
  if (publishResponse.statusCode !== 200) {
    throw new Error(
      `GitHub draft release publish failed for ${publishGate.requestedDraftReleaseId}: ${publishResponse.statusCode} ${publishResponse.bodyText || ''}`.trim()
    );
  }

  const retryCount = deps.publishVerificationRetryCount ?? 8;
  const retryDelayMs = deps.publishVerificationRetryDelayMs ?? 2000;
  let finalFacts = null;
  let finalAssessment = null;
  let verifyGate = null;
  for (let attempt = 0; attempt < retryCount; attempt += 1) {
    finalFacts = await collectTransactionFacts(parsed, deps, token, fsApi);
    finalAssessment = assessTransaction(finalFacts);
    verifyGate = buildPublishedReleaseVerificationGate(finalFacts, finalAssessment);
    if (verifyGate.allowed) {
      break;
    }
    if (attempt < retryCount - 1) {
      await delay(retryDelayMs);
    }
  }

  const finalReport = buildReport(finalFacts, finalAssessment, parsed.evidenceDir, now());
  finalReport.mode = parsed.mode;
  finalReport.publishGate = publishGate;
  finalReport.verifyGate = verifyGate;
  await writeReport(parsed.evidenceDir, finalReport);

  if (!verifyGate.allowed) {
    throw new Error(`Public GitHub exact-release publish verification is blocked: ${verifyGate.rationale}`);
  }

  return { outcome: 'published', report: finalReport };
}

async function runVerify(argv = process.argv.slice(2), deps = {}) {
  const parsed = parseArgs(argv);
  const stdout = deps.stdout ?? process.stdout;
  const now = deps.now ?? (() => new Date().toISOString());
  const fsApi = deps.fs ?? fs;

  if (parsed.helpRequested) {
    stdout.write(`${getUsage()}\n`);
    return { outcome: 'help' };
  }

  parsed.mode = 'verify';
  parsed.tag = parsed.tag ?? resolveLatestExactTag(deps.spawnImpl);
  const tokenEnv = { ...(deps.env ?? process.env) };
  if (parsed.githubTokenPath) {
    tokenEnv[githubToken.GITHUB_TOKEN_FILE_ENV] = parsed.githubTokenPath;
  }
  const token = deps.readGitHubToken
    ? deps.readGitHubToken(tokenEnv, fsApi)
    : githubToken.readGitHubToken(tokenEnv, fsApi);

  const facts = await collectTransactionFacts(parsed, deps, token, fsApi);
  const assessment = assessTransaction(facts);
  const verifyGate = buildPublishedReleaseVerificationGate(facts, assessment);
  const report = buildReport(facts, assessment, parsed.evidenceDir, now());
  report.mode = parsed.mode;
  report.verifyGate = verifyGate;
  await writeReport(parsed.evidenceDir, report);

  if (!verifyGate.allowed) {
    throw new Error(`Public GitHub exact-release verify is blocked: ${verifyGate.rationale}`);
  }

  return { outcome: 'verified', report };
}

async function runCli(argv = process.argv.slice(2), deps = {}) {
  const parsed = parseArgs(argv);
  if (parsed.mode === 'publish') {
    return runPublish(argv, deps);
  }
  if (parsed.mode === 'verify') {
    return runVerify(argv, deps);
  }
  return runAssessment(argv, deps);
}

if (require.main === module) {
  runCli().catch((error) => {
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
  buildPublishedReleaseVerificationGate,
  buildReleasePublishExecutionGate,
  collectTransactionFacts,
  computeFileSha256,
  delay,
  extractReleaseAssets,
  fetchGitHubJson,
  fetchMarketplaceState,
  getUsage,
  mutateGitHubJson,
  parseArgs,
  parseSemverTag,
  readReleaseManifest,
  resolveLatestExactTag,
  resolveReleaseManifestPath,
  runAssessment,
  runCli,
  runPublish,
  runVerify
};
