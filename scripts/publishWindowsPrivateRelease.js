#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { readGitLabApiToken } = require('./resolveLocalGitLabApiToken.js');
const { parseGitLabProjectPath } = require('./queueGovernedMergeRequest.js');

const DEFAULT_GITLAB_API_URL = 'https://gitlab.com/api/v4';
const DEFAULT_GITLAB_BROWSER_URL = 'https://gitlab.com';
const DEFAULT_PACKET_JSON_PATH = 'docs/product/private-release-windows-x64-v1.3.0.json';
const DEFAULT_RECEIPT_ROOT = '.cache/private-release-publish/latest';
const DEFAULT_DIRECT_ASSET_DIRECTORY = '/private-releases/windows-x64';
const PRIVATE_RELEASE_TAG_PREFIX = 'private-v';
const PRIVATE_RELEASE_TAG_SUFFIX = '-windows-x64';
const PRIVATE_RELEASE_NAME_PREFIX = 'Windows x64 Private Release v';
const DEFAULT_LINK_TYPE = 'package';

function getPublishWindowsPrivateReleaseUsage() {
  return [
    'Usage: node scripts/publishWindowsPrivateRelease.js [--json] [--skip-package] [--allow-dirty] [--vsix <path>] [--tag <tag>] [--name <name>] [--released-at <iso8601>] [--help]',
    '',
    'Package and publish the governed Windows x64 private GitLab release for the active vi-history-suite candidate.',
    'The default tag is derived from package.json as private-v<version>-windows-x64.',
    'This path fails closed on a dirty worktree unless --allow-dirty is supplied.',
    'Inspect token resolution first with node scripts/resolveLocalGitLabApiToken.js --json.'
  ].join('\n');
}

function parsePublishWindowsPrivateReleaseArgs(argv) {
  const parsed = {
    helpRequested: false,
    json: false,
    skipPackage: false,
    allowDirty: false,
    vsixPath: '',
    tag: '',
    name: '',
    releasedAt: ''
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      parsed.helpRequested = true;
      continue;
    }
    if (argument === '--json') {
      parsed.json = true;
      continue;
    }
    if (argument === '--skip-package') {
      parsed.skipPackage = true;
      continue;
    }
    if (argument === '--allow-dirty') {
      parsed.allowDirty = true;
      continue;
    }
    if (argument === '--vsix') {
      parsed.vsixPath = readRequiredValue(argv, ++index, '--vsix');
      continue;
    }
    if (argument === '--tag') {
      parsed.tag = readRequiredValue(argv, ++index, '--tag');
      continue;
    }
    if (argument === '--name') {
      parsed.name = readRequiredValue(argv, ++index, '--name');
      continue;
    }
    if (argument === '--released-at') {
      parsed.releasedAt = readRequiredValue(argv, ++index, '--released-at');
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  if (parsed.releasedAt) {
    const parsedDate = Date.parse(parsed.releasedAt);
    if (!Number.isFinite(parsedDate)) {
      throw new Error(`Invalid --released-at value: ${parsed.releasedAt}`);
    }
  }

  return parsed;
}

function readRequiredValue(argv, index, flag) {
  const value = argv[index];
  if (!value || !value.trim()) {
    throw new Error(`Missing value for ${flag}.`);
  }

  return value.trim();
}

function repoRoot() {
  return path.resolve(path.dirname(fs.realpathSync.native(__filename)), '..');
}

function gitOutput(args, spawnSyncImpl = spawnSync, cwd = repoRoot()) {
  const result = spawnSyncImpl('git', ['-C', cwd, ...args], {
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(`git ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`);
  }

  return result.stdout.trim();
}

function readPackageManifest(repoRootPath = repoRoot(), fsApi = fs) {
  return JSON.parse(
    fsApi.readFileSync(path.join(repoRootPath, 'package.json'), 'utf8')
  );
}

function readPrivateReleasePacket(
  repoRootPath = repoRoot(),
  packetJsonPath = DEFAULT_PACKET_JSON_PATH,
  fsApi = fs
) {
  return JSON.parse(
    fsApi.readFileSync(path.join(repoRootPath, packetJsonPath), 'utf8')
  );
}

function resolvePrivateReleaseTag(version) {
  return `${PRIVATE_RELEASE_TAG_PREFIX}${version}${PRIVATE_RELEASE_TAG_SUFFIX}`;
}

function resolvePrivateReleaseName(version) {
  return `${PRIVATE_RELEASE_NAME_PREFIX}${version}`;
}

function resolvePrivateReleaseVsixPath(version) {
  return path.join('preview-evidence', `vi-history-suite-${version}.vsix`);
}

function resolvePrivateReleasePacketJsonPath(version) {
  return path.join('docs', 'product', `private-release-windows-x64-v${version}.json`);
}

function resolvePrivateReleaseChecksumPath(vsixPath) {
  return `${vsixPath}.sha256`;
}

function resolveDirectAssetPath(fileName, directory = DEFAULT_DIRECT_ASSET_DIRECTORY) {
  const normalizedDirectory = directory.startsWith('/') ? directory : `/${directory}`;
  return `${normalizedDirectory.replace(/\/+$/u, '')}/${fileName}`;
}

function buildBrowserReleaseUrl(projectPath, tag, browserUrl = DEFAULT_GITLAB_BROWSER_URL) {
  return `${browserUrl.replace(/\/+$/u, '')}/${projectPath}/-/releases/${encodeURIComponent(tag)}`;
}

function computeFileMetadata(filePath, fsApi = fs) {
  const bytes = fsApi.readFileSync(filePath);
  return {
    sizeBytes: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase()
  };
}

function ensureCleanWorktree(allowDirty, spawnSyncImpl = spawnSync, cwd = repoRoot()) {
  if (allowDirty) {
    return;
  }

  const status = gitOutput(['status', '--short'], spawnSyncImpl, cwd);
  if (status) {
    throw new Error(
      'Refusing to publish a Windows private release from a dirty worktree. Commit or clean the changes first, or rerun with --allow-dirty when you intentionally want that behavior.'
    );
  }
}

function buildNpmCommand(platform = process.platform) {
  return platform === 'win32' ? 'npm.cmd' : 'npm';
}

function quoteCmdArg(value) {
  const text = String(value);
  if (!/[ \t"&^<>|()]/u.test(text)) {
    return text;
  }
  return `"${text.replace(/(["^])/gu, '^$1')}"`;
}

function runPackageBuild(vsixPath, deps = {}) {
  const spawnSyncImpl = deps.spawnSync ?? spawnSync;
  const cwd = deps.repoRoot ?? repoRoot();
  const platform = deps.platform ?? process.platform;
  const npmCommand = deps.npmCommand ?? buildNpmCommand(platform);
  const invocation =
    platform === 'win32'
      ? {
          command: 'cmd.exe',
          args: ['/d', '/s', '/c', [npmCommand, 'run', 'package', '--', '--out', vsixPath]
            .map(quoteCmdArg)
            .join(' ')]
        }
      : {
          command: npmCommand,
          args: ['run', 'package', '--', '--out', vsixPath]
        };
  const result = spawnSyncImpl(invocation.command, invocation.args, {
    cwd,
    stdio: 'inherit',
    shell: false
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`npm run package failed with exit code ${String(result.status ?? 1)}.`);
  }
}

function buildPrivateReleaseDescription(context) {
  return [
    `# ${context.releaseName}`,
    '',
    '- Support claim: Windows x64 private release only',
    '- Runtime lanes: native Windows host LabVIEW and Docker Desktop Windows-container mode',
    '- Out of scope: Linux installed-user support, Linux proof as the active private-release claim, Windows x86 / 32-bit LabVIEW, WSL, exact SemVer tagging, Marketplace publication, and main promotion',
    `- Source branch: \`${context.sourceBranch}\``,
    `- Source commit: \`${context.commitSha}\``,
    `- Packet: \`${context.packetJsonPath}\``,
    `- VSIX: \`${context.vsixFileName}\``,
    `- SHA-256: \`${context.sha256}\``,
    `- Size: \`${context.sizeBytes}\` bytes`,
    '',
    `This retained private release is the governed Windows-only v${context.versionLine} install surface for controlled testing before any exact public-release closeout.`
  ].join('\n');
}

async function gitLabRequest(url, token, options = {}, fetchImpl = fetch) {
  const headers = {
    'PRIVATE-TOKEN': token,
    ...(options.headers ?? {})
  };

  let body = undefined;
  if (options.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.json);
  } else if (options.body) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(options.body);
  } else if (options.rawBody !== undefined) {
    body = options.rawBody;
  }

  const response = await fetchImpl(url, {
    method: options.method ?? 'GET',
    headers,
    body
  });
  const text = await response.text();
  let json;
  try {
    json = text.trim() ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }

  return {
    ok: response.ok,
    status: response.status,
    text,
    json
  };
}

function projectApiUrl(projectPath, suffix, apiUrl = DEFAULT_GITLAB_API_URL) {
  return `${apiUrl}/projects/${encodeURIComponent(projectPath)}${suffix}`;
}

async function readRelease(projectPath, tag, token, deps = {}) {
  const response = await gitLabRequest(
    projectApiUrl(projectPath, `/releases/${encodeURIComponent(tag)}`, deps.apiUrl),
    token,
    {},
    deps.fetch ?? fetch
  );

  if (response.ok) {
    return response.json;
  }
  if (response.status === 404) {
    return undefined;
  }

  throw new Error(`GET release ${tag} failed with ${response.status}: ${response.text.trim()}`);
}

async function createOrUpdateRelease(projectPath, release, token, deps = {}) {
  const existing = await readRelease(projectPath, release.tag, token, deps);
  const body = {
    name: release.name,
    description: release.description
  };
  if (release.releasedAt) {
    body.released_at = release.releasedAt;
  }

  if (existing) {
    const response = await gitLabRequest(
      projectApiUrl(projectPath, `/releases/${encodeURIComponent(release.tag)}`, deps.apiUrl),
      token,
      {
        method: 'PUT',
        body
      },
      deps.fetch ?? fetch
    );
    if (!response.ok) {
      throw new Error(
        `PUT release ${release.tag} failed with ${response.status}: ${response.text.trim()}`
      );
    }
    return {
      outcome: 'updated',
      release: response.json
    };
  }

  const response = await gitLabRequest(
    projectApiUrl(projectPath, '/releases', deps.apiUrl),
    token,
    {
      method: 'POST',
      body: {
        tag_name: release.tag,
        tag_message: `${release.name} (${release.commitSha})`,
        ref: release.commitSha,
        ...body
      }
    },
    deps.fetch ?? fetch
  );
  if (!response.ok) {
    throw new Error(
      `POST release ${release.tag} failed with ${response.status}: ${response.text.trim()}`
    );
  }

  return {
    outcome: 'created',
    release: response.json
  };
}

async function listReleaseLinks(projectPath, tag, token, deps = {}) {
  const response = await gitLabRequest(
    projectApiUrl(
      projectPath,
      `/releases/${encodeURIComponent(tag)}/assets/links`,
      deps.apiUrl
    ),
    token,
    {},
    deps.fetch ?? fetch
  );
  if (!response.ok) {
    throw new Error(
      `GET release links for ${tag} failed with ${response.status}: ${response.text.trim()}`
    );
  }

  return Array.isArray(response.json) ? response.json : [];
}

async function upsertReleaseLink(projectPath, tag, link, token, deps = {}) {
  const existingLinks = await listReleaseLinks(projectPath, tag, token, deps);
  const existingLink = existingLinks.find(
    (candidate) => candidate.name === link.name || candidate.url === link.url
  );

  if (existingLink) {
    const response = await gitLabRequest(
      projectApiUrl(
        projectPath,
        `/releases/${encodeURIComponent(tag)}/assets/links/${existingLink.id}`,
        deps.apiUrl
      ),
      token,
      {
        method: 'PUT',
        body: {
          name: link.name,
          url: link.url,
          direct_asset_path: link.directAssetPath,
          link_type: link.linkType ?? DEFAULT_LINK_TYPE
        }
      },
      deps.fetch ?? fetch
    );
    if (!response.ok) {
      throw new Error(
        `PUT release link ${link.name} failed with ${response.status}: ${response.text.trim()}`
      );
    }

    return {
      outcome: 'updated',
      link: response.json
    };
  }

  const response = await gitLabRequest(
    projectApiUrl(
      projectPath,
      `/releases/${encodeURIComponent(tag)}/assets/links`,
      deps.apiUrl
    ),
    token,
    {
      method: 'POST',
      body: {
        name: link.name,
        url: link.url,
        direct_asset_path: link.directAssetPath,
        link_type: link.linkType ?? DEFAULT_LINK_TYPE
      }
    },
    deps.fetch ?? fetch
  );
  if (!response.ok) {
    throw new Error(
      `POST release link ${link.name} failed with ${response.status}: ${response.text.trim()}`
    );
  }

  return {
    outcome: 'created',
    link: response.json
  };
}

async function uploadProjectFile(projectPath, filePath, token, deps = {}) {
  const fileName = path.basename(filePath);
  const buffer = (deps.fs ?? fs).readFileSync(filePath);
  const formData = new FormData();
  formData.set('file', new Blob([buffer]), fileName);

  const response = await (deps.fetch ?? fetch)(
    projectApiUrl(projectPath, '/uploads', deps.apiUrl),
    {
      method: 'POST',
      headers: {
        'PRIVATE-TOKEN': token
      },
      body: formData
    }
  );
  const text = await response.text();
  let json;
  try {
    json = text.trim() ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }

  if (!response.ok) {
    throw new Error(
      `POST upload ${fileName} failed with ${response.status}: ${text.trim()}`
    );
  }
  if (!json?.full_path) {
    throw new Error(`Upload response for ${fileName} did not include full_path.`);
  }

  return {
    fileName,
    url: new URL(json.full_path, deps.browserUrl ?? DEFAULT_GITLAB_BROWSER_URL).toString(),
    fullPath: json.full_path
  };
}

function writeReceipt(receipt, receiptRoot = DEFAULT_RECEIPT_ROOT, fsApi = fs, repoRootPath = repoRoot()) {
  const absoluteReceiptRoot = path.join(repoRootPath, receiptRoot);
  fsApi.mkdirSync(absoluteReceiptRoot, { recursive: true });
  const jsonPath = path.join(absoluteReceiptRoot, 'private-release-publish.json');
  const markdownPath = path.join(absoluteReceiptRoot, 'private-release-publish.md');

  fsApi.writeFileSync(jsonPath, `${JSON.stringify(receipt, null, 2)}\n`);
  fsApi.writeFileSync(
    markdownPath,
    [
      '# Windows Private Release Publish Receipt',
      '',
      `- Tag: ${receipt.releaseTag}`,
      `- Release: ${receipt.releaseName}`,
      `- Release URL: ${receipt.releaseUrl}`,
      `- Source branch: ${receipt.sourceBranch}`,
      `- Source commit: ${receipt.commitSha}`,
      `- VSIX: ${receipt.vsix.fileName}`,
      `- SHA-256: ${receipt.vsix.sha256}`,
      `- Size: ${receipt.vsix.sizeBytes} bytes`,
      `- Direct asset URL: ${receipt.vsix.directAssetUrl}`,
      `- Checksum asset URL: ${receipt.checksum.directAssetUrl}`
    ].join('\n') + '\n'
  );

  return {
    receiptRoot,
    jsonPath: path.relative(repoRootPath, jsonPath).replace(/\\/gu, '/'),
    markdownPath: path.relative(repoRootPath, markdownPath).replace(/\\/gu, '/')
  };
}

async function runPublishWindowsPrivateRelease(argv = process.argv.slice(2), deps = {}) {
  const parsed = parsePublishWindowsPrivateReleaseArgs(argv);
  const stdout = deps.stdout ?? process.stdout;
  const fsApi = deps.fs ?? fs;

  if (parsed.helpRequested) {
    stdout.write(`${getPublishWindowsPrivateReleaseUsage()}\n`);
    return { outcome: 'help' };
  }

  const repoRootPath = deps.repoRoot ?? repoRoot();
  ensureCleanWorktree(parsed.allowDirty, deps.spawnSync ?? spawnSync, repoRootPath);

  const packageManifest = readPackageManifest(repoRootPath, fsApi);
  const version = packageManifest.version;
  const packetJsonPath = resolvePrivateReleasePacketJsonPath(version);
  const packet = readPrivateReleasePacket(repoRootPath, packetJsonPath, fsApi);
  if (packet?.packageEvidence?.versionLine !== version) {
    throw new Error(
      `Private-release packet version ${String(packet?.packageEvidence?.versionLine ?? '')} does not match package.json version ${version}.`
    );
  }

  const sourceBranch =
    deps.sourceBranch ??
    gitOutput(['branch', '--show-current'], deps.spawnSync ?? spawnSync, repoRootPath);
  const commitSha =
    deps.commitSha ??
    gitOutput(['rev-parse', 'HEAD'], deps.spawnSync ?? spawnSync, repoRootPath);
  const projectPath =
    deps.projectPath ??
    parseGitLabProjectPath(
      gitOutput(['remote', 'get-url', 'origin'], deps.spawnSync ?? spawnSync, repoRootPath)
    );
  const token = deps.token ?? readGitLabApiToken(deps.env ?? process.env, fsApi);
  const releaseTag = parsed.tag || resolvePrivateReleaseTag(version);
  const releaseName = parsed.name || resolvePrivateReleaseName(version);
  const vsixRelativePath = parsed.vsixPath || resolvePrivateReleaseVsixPath(version);
  const vsixAbsolutePath = path.join(repoRootPath, vsixRelativePath);
  const checksumRelativePath = resolvePrivateReleaseChecksumPath(vsixRelativePath);
  const checksumAbsolutePath = path.join(repoRootPath, checksumRelativePath);
  const releaseDescription = buildPrivateReleaseDescription({
    releaseName,
    versionLine: version,
    sourceBranch,
    commitSha,
    packetJsonPath,
    vsixFileName: path.basename(vsixRelativePath),
    sha256: 'pending',
    sizeBytes: 0
  });

  if (!parsed.skipPackage) {
    fsApi.mkdirSync(path.dirname(vsixAbsolutePath), { recursive: true });
    runPackageBuild(vsixRelativePath, deps);
  }
  if (!fsApi.existsSync(vsixAbsolutePath)) {
    throw new Error(`Expected private-release VSIX at ${vsixRelativePath}.`);
  }

  const metadata = computeFileMetadata(vsixAbsolutePath, fsApi);
  fsApi.writeFileSync(
    checksumAbsolutePath,
    `${metadata.sha256}  ${path.basename(vsixRelativePath)}\n`,
    'utf8'
  );

  const populatedDescription = buildPrivateReleaseDescription({
    releaseName,
    versionLine: version,
    sourceBranch,
    commitSha,
    packetJsonPath,
    vsixFileName: path.basename(vsixRelativePath),
    sha256: metadata.sha256,
    sizeBytes: metadata.sizeBytes
  });

  const releaseMutation = await createOrUpdateRelease(
    projectPath,
    {
      tag: releaseTag,
      name: releaseName,
      description: populatedDescription,
      releasedAt: parsed.releasedAt,
      commitSha
    },
    token,
    deps
  );

  const uploadedVsix = await uploadProjectFile(projectPath, vsixAbsolutePath, token, deps);
  const uploadedChecksum = await uploadProjectFile(projectPath, checksumAbsolutePath, token, deps);
  const vsixLink = await upsertReleaseLink(
    projectPath,
    releaseTag,
    {
      name: path.basename(vsixRelativePath),
      url: uploadedVsix.url,
      directAssetPath: resolveDirectAssetPath(path.basename(vsixRelativePath)),
      linkType: DEFAULT_LINK_TYPE
    },
    token,
    deps
  );
  const checksumLink = await upsertReleaseLink(
    projectPath,
    releaseTag,
    {
      name: path.basename(checksumRelativePath),
      url: uploadedChecksum.url,
      directAssetPath: resolveDirectAssetPath(path.basename(checksumRelativePath)),
      linkType: DEFAULT_LINK_TYPE
    },
    token,
    deps
  );

  const releaseUrl = buildBrowserReleaseUrl(
    projectPath,
    releaseTag,
    deps.browserUrl ?? DEFAULT_GITLAB_BROWSER_URL
  );
  const result = {
    outcome: 'published',
    projectPath,
    sourceBranch,
    commitSha,
    releaseTag,
    releaseName,
    releaseUrl,
    releaseMutation: releaseMutation.outcome,
    vsix: {
      path: vsixRelativePath.replace(/\\/gu, '/'),
      fileName: path.basename(vsixRelativePath),
      sizeBytes: metadata.sizeBytes,
      sha256: metadata.sha256,
      uploadUrl: uploadedVsix.url,
      directAssetPath: resolveDirectAssetPath(path.basename(vsixRelativePath)),
      directAssetUrl: vsixLink.link.direct_asset_url
    },
    checksum: {
      path: checksumRelativePath.replace(/\\/gu, '/'),
      fileName: path.basename(checksumRelativePath),
      uploadUrl: uploadedChecksum.url,
      directAssetPath: resolveDirectAssetPath(path.basename(checksumRelativePath)),
      directAssetUrl: checksumLink.link.direct_asset_url
    }
  };
  result.receipt = writeReceipt(result, DEFAULT_RECEIPT_ROOT, fsApi, repoRootPath);

  if (parsed.json) {
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    stdout.write(`Windows private release published: ${releaseTag}\n`);
    stdout.write(`- release: ${releaseUrl}\n`);
    stdout.write(`- vsix: ${result.vsix.directAssetUrl}\n`);
    stdout.write(`- sha256: ${result.vsix.sha256}\n`);
    stdout.write(`- receipt: ${result.receipt.jsonPath}\n`);
  }

  return result;
}

function main() {
  runPublishWindowsPrivateRelease()
    .then((result) => {
      process.exitCode = result.outcome === 'help' ? 0 : 0;
    })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_GITLAB_API_URL,
  DEFAULT_GITLAB_BROWSER_URL,
  DEFAULT_PACKET_JSON_PATH,
  DEFAULT_RECEIPT_ROOT,
  DEFAULT_DIRECT_ASSET_DIRECTORY,
  PRIVATE_RELEASE_TAG_PREFIX,
  PRIVATE_RELEASE_TAG_SUFFIX,
  PRIVATE_RELEASE_NAME_PREFIX,
  DEFAULT_LINK_TYPE,
  getPublishWindowsPrivateReleaseUsage,
  parsePublishWindowsPrivateReleaseArgs,
  resolvePrivateReleaseTag,
  resolvePrivateReleaseName,
  resolvePrivateReleaseVsixPath,
  resolvePrivateReleasePacketJsonPath,
  resolvePrivateReleaseChecksumPath,
  resolveDirectAssetPath,
  buildBrowserReleaseUrl,
  computeFileMetadata,
  buildPrivateReleaseDescription,
  runPublishWindowsPrivateRelease
};
