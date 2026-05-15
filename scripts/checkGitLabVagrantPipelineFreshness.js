#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');

const SCHEMA = 'vi-history-suite/vagrant-acceptance-pipeline-freshness@v1';
const DEFAULT_EVIDENCE_DIR = 'vagrant/evidence/pipeline-freshness';
const DEFAULT_SETTLE_MS = 0;
const DEFAULT_API_TIMEOUT_MS = 10000;
const SKIP_FLAG_FILE = 'skip-vagrant-acceptance';
const NON_STALE_NEWER_STATUSES = new Set([
  'created',
  'waiting_for_resource',
  'preparing',
  'pending',
  'running',
  'success',
  'failed',
  'manual',
  'scheduled'
]);

function getUsage() {
  return [
    'Usage: node scripts/checkGitLabVagrantPipelineFreshness.js [options]',
    '',
    'Checks whether a Vagrant acceptance job belongs to the latest non-canceled MR pipeline before booting a VM.',
    '',
    'Options:',
    `  --evidence-dir PATH   Write freshness evidence under PATH. Defaults to ${DEFAULT_EVIDENCE_DIR}.`,
    `  --settle-ms MS        Wait before querying MR pipelines. Defaults to ${DEFAULT_SETTLE_MS}.`,
    `  --api-timeout-ms MS   Bound each GitLab API query. Defaults to ${DEFAULT_API_TIMEOUT_MS}.`,
    '  --help                Show this help.'
  ].join('\n');
}

function parseArgs(argv) {
  const parsed = {
    helpRequested: false,
    evidenceDir: DEFAULT_EVIDENCE_DIR,
    settleMs: DEFAULT_SETTLE_MS,
    apiTimeoutMs: DEFAULT_API_TIMEOUT_MS
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const requireValue = (flag) => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for ${flag}.\n\n${getUsage()}`);
      }
      index += 1;
      return value;
    };

    if (current === '--help' || current === '-h') {
      parsed.helpRequested = true;
      continue;
    }
    if (current === '--evidence-dir') {
      parsed.evidenceDir = requireValue('--evidence-dir');
      continue;
    }
    if (current === '--settle-ms') {
      const value = Number(requireValue('--settle-ms'));
      if (!Number.isFinite(value) || value < 0) {
        throw new Error(`Invalid --settle-ms value: ${value}`);
      }
      parsed.settleMs = value;
      continue;
    }
    if (current === '--api-timeout-ms') {
      const value = Number(requireValue('--api-timeout-ms'));
      if (!Number.isFinite(value) || value < 0) {
        throw new Error(`Invalid --api-timeout-ms value: ${value}`);
      }
      parsed.apiTimeoutMs = value;
      continue;
    }

    throw new Error(`Unknown argument: ${current}\n\n${getUsage()}`);
  }

  return parsed;
}

function buildContext(env = process.env) {
  return {
    apiV4Url: env.CI_API_V4_URL || 'https://gitlab.com/api/v4',
    pipelineSource: env.CI_PIPELINE_SOURCE || '',
    projectId: env.CI_PROJECT_ID || '',
    projectPath: env.CI_PROJECT_PATH || '',
    mergeRequestIid: env.CI_MERGE_REQUEST_IID || '',
    currentPipelineId: Number(env.CI_PIPELINE_ID || ''),
    currentPipelineUrl: env.CI_PIPELINE_URL || '',
    currentJobId: env.CI_JOB_ID || '',
    currentJobUrl: env.CI_JOB_URL || '',
    currentSha: env.CI_COMMIT_SHA || '',
    currentRef: env.CI_COMMIT_REF_NAME || '',
    jobToken: env.CI_JOB_TOKEN || '',
    privateToken: env.VIHS_GITLAB_API_TOKEN || env.GITLAB_TOKEN || env.GLAB_TOKEN || ''
  };
}

function isMergeRequestContext(context) {
  return context.pipelineSource === 'merge_request_event';
}

function buildHeaders(context) {
  if (context.jobToken) {
    return { 'JOB-TOKEN': context.jobToken };
  }
  if (context.privateToken) {
    return { 'PRIVATE-TOKEN': context.privateToken };
  }
  return {};
}

function buildFetchOptions(context, options = {}) {
  const fetchOptions = {
    headers: buildHeaders(context)
  };
  const timeoutMs = options.apiTimeoutMs ?? DEFAULT_API_TIMEOUT_MS;
  if (timeoutMs > 0) {
    fetchOptions.signal = createTimeoutSignal(timeoutMs);
  }
  return fetchOptions;
}

function createTimeoutSignal(timeoutMs) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(timeoutMs);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  if (typeof timeout.unref === 'function') {
    timeout.unref();
  }
  return controller.signal;
}

function buildPipelineSummary(pipeline) {
  if (!pipeline) {
    return null;
  }

  return {
    id: Number(pipeline.id),
    iid: pipeline.iid ?? null,
    status: pipeline.status ?? '',
    source: pipeline.source ?? '',
    ref: pipeline.ref ?? '',
    sha: pipeline.sha ?? '',
    webUrl: pipeline.web_url ?? pipeline.webUrl ?? '',
    createdAt: pipeline.created_at ?? pipeline.createdAt ?? '',
    updatedAt: pipeline.updated_at ?? pipeline.updatedAt ?? ''
  };
}

function hasUsablePipelineId(pipeline) {
  return Boolean(pipeline) && Number.isFinite(pipeline.id) && pipeline.id > 0;
}

function isPipelineNewerThanCurrent(pipeline, context) {
  return hasUsablePipelineId(pipeline) &&
    Number.isFinite(context.currentPipelineId) &&
    pipeline.id > context.currentPipelineId;
}

function isNonCanceledNewerPipeline(pipeline, context) {
  return isPipelineNewerThanCurrent(pipeline, context) &&
    NON_STALE_NEWER_STATUSES.has(pipeline.status);
}

async function fetchMergeRequestDetails(context, fetchImpl = fetch, options = {}) {
  const project = encodeURIComponent(context.projectId || context.projectPath);
  const mrIid = encodeURIComponent(context.mergeRequestIid);
  const url = `${context.apiV4Url}/projects/${project}/merge_requests/${mrIid}`;
  const response = await fetchImpl(url, buildFetchOptions(context, options));
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`GET ${url} failed with ${response.status}: ${text.slice(0, 500)}`);
  }
  return JSON.parse(text);
}

function publicContext(context) {
  return {
    pipelineSource: context.pipelineSource,
    projectId: context.projectId,
    projectPath: context.projectPath,
    mergeRequestIid: context.mergeRequestIid,
    currentPipelineId: context.currentPipelineId,
    currentPipelineUrl: context.currentPipelineUrl,
    currentJobId: context.currentJobId,
    currentJobUrl: context.currentJobUrl,
    currentSha: context.currentSha,
    currentRef: context.currentRef
  };
}

async function fetchMergeRequestPipelines(context, fetchImpl = fetch, options = {}) {
  const project = encodeURIComponent(context.projectId || context.projectPath);
  const mrIid = encodeURIComponent(context.mergeRequestIid);
  const url = `${context.apiV4Url}/projects/${project}/merge_requests/${mrIid}/pipelines?per_page=20`;
  const response = await fetchImpl(url, buildFetchOptions(context, options));
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`GET ${url} failed with ${response.status}: ${text.slice(0, 500)}`);
  }
  return JSON.parse(text);
}

async function evaluatePipelineFreshness(options = {}, deps = {}) {
  const context = deps.context ?? buildContext(deps.env ?? process.env);
  const now = deps.now ?? (() => new Date());

  const reportBase = {
    schema: SCHEMA,
    generatedAt: now().toISOString(),
    context: publicContext(context)
  };

  if (!isMergeRequestContext(context)) {
    return {
      ...reportBase,
      decision: 'run',
      stale: false,
      reason: 'Not a merge-request pipeline; protected branch and tag Vagrant proofs must run.'
    };
  }

  const missing = [];
  if (!context.projectId && !context.projectPath) {
    missing.push('CI_PROJECT_ID or CI_PROJECT_PATH');
  }
  if (!context.mergeRequestIid) {
    missing.push('CI_MERGE_REQUEST_IID');
  }
  if (!Number.isFinite(context.currentPipelineId) || context.currentPipelineId <= 0) {
    missing.push('CI_PIPELINE_ID');
  }
  if (!context.jobToken && !context.privateToken) {
    missing.push('CI_JOB_TOKEN or VIHS_GITLAB_API_TOKEN');
  }
  if (missing.length > 0) {
    return {
      ...reportBase,
      decision: 'run',
      stale: false,
      reason: 'Freshness could not be proven from CI context, so run fail-open to preserve the Vagrant proof.',
      warnings: [`Missing ${missing.join(', ')}`]
    };
  }

  if ((options.settleMs ?? DEFAULT_SETTLE_MS) > 0) {
    await (deps.delay ?? delay)(options.settleMs);
  }

  const warnings = [];
  const apiOptions = { apiTimeoutMs: options.apiTimeoutMs ?? DEFAULT_API_TIMEOUT_MS };
  let headPipeline = null;
  try {
    const mergeRequest = await fetchMergeRequestDetails(context, deps.fetch ?? fetch, apiOptions);
    headPipeline = buildPipelineSummary(mergeRequest.head_pipeline ?? mergeRequest.pipeline);
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : String(error));
  }

  if (headPipeline && hasUsablePipelineId(headPipeline)) {
    if (isNonCanceledNewerPipeline(headPipeline, context)) {
      return {
        ...reportBase,
        decision: 'skip-stale',
        stale: true,
        reason: 'The merge request head pipeline is newer and non-canceled, so this Vagrant acceptance job is stale and should not boot a VM.',
        freshnessSource: 'merge-request-head-pipeline',
        newestPipeline: headPipeline,
        newerPipelines: [headPipeline],
        scannedPipelines: [headPipeline],
        warnings
      };
    }

    return {
      ...reportBase,
      decision: 'run',
      stale: false,
      reason: 'This job matches or is newer than the merge request head pipeline; run the Vagrant acceptance proof.',
      freshnessSource: 'merge-request-head-pipeline',
      newestPipeline: headPipeline,
      scannedPipelines: [headPipeline],
      warnings
    };
  }

  let pipelines;
  try {
    pipelines = await fetchMergeRequestPipelines(context, deps.fetch ?? fetch, apiOptions);
  } catch (error) {
    return {
      ...reportBase,
      decision: 'run',
      stale: false,
      reason: 'Freshness API query failed, so run fail-open to preserve the Vagrant proof.',
      warnings: [
        ...warnings,
        error instanceof Error ? error.message : String(error)
      ]
    };
  }

  const summaries = pipelines.map(buildPipelineSummary).filter(hasUsablePipelineId);
  const newerPipelines = summaries
    .filter((pipeline) => isNonCanceledNewerPipeline(pipeline, context))
    .sort((left, right) => right.id - left.id);
  const newest = summaries
    .filter((pipeline) => NON_STALE_NEWER_STATUSES.has(pipeline.status))
    .sort((left, right) => right.id - left.id)[0] ?? null;

  if (newerPipelines.length > 0) {
    return {
      ...reportBase,
      decision: 'skip-stale',
      stale: true,
      reason: 'A newer non-canceled merge-request pipeline exists, so this Vagrant acceptance job is stale and should not boot a VM.',
      newestPipeline: newest,
      newerPipelines,
      scannedPipelines: summaries
    };
  }

  return {
    ...reportBase,
    decision: 'run',
    stale: false,
    reason: 'This is the latest non-canceled merge-request pipeline; run the Vagrant acceptance proof.',
    newestPipeline: newest,
    scannedPipelines: summaries
  };
}

function buildMarkdown(report) {
  const newerLines = report.newerPipelines?.length
    ? report.newerPipelines.map((pipeline) => `- ${pipeline.id}: ${pipeline.status} ${pipeline.webUrl}`)
    : ['- none'];

  return [
    '# Vagrant Acceptance Pipeline Freshness',
    '',
    `- Schema: ${report.schema}`,
    `- Generated at: ${report.generatedAt}`,
    `- Decision: ${report.decision}`,
    `- Stale: ${String(report.stale)}`,
    `- Reason: ${report.reason}`,
    `- Current pipeline: ${report.context.currentPipelineId}`,
    `- Current SHA: ${report.context.currentSha}`,
    `- MR IID: ${report.context.mergeRequestIid || 'n/a'}`,
    '',
    '## Newer Pipelines',
    '',
    ...newerLines,
    ''
  ].join('\n');
}

function writeEvidenceFiles(evidenceDir, report, fsApi = fs) {
  fsApi.mkdirSync(evidenceDir, { recursive: true });
  fsApi.writeFileSync(
    path.join(evidenceDir, 'vagrant-acceptance-pipeline-freshness.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8'
  );
  fsApi.writeFileSync(
    path.join(evidenceDir, 'vagrant-acceptance-pipeline-freshness.md'),
    `${buildMarkdown(report)}\n`,
    'utf8'
  );

  const skipFlagPath = path.join(evidenceDir, SKIP_FLAG_FILE);
  if (report.decision === 'skip-stale') {
    fsApi.writeFileSync(skipFlagPath, 'skip stale Vagrant acceptance pipeline\n', 'utf8');
  } else if (fsApi.existsSync(skipFlagPath)) {
    fsApi.rmSync(skipFlagPath, { force: true });
  }
}

async function runPipelineFreshnessCli(argv = process.argv.slice(2), deps = {}) {
  const stdout = deps.stdout ?? process.stdout;
  const parsed = parseArgs(argv);
  if (parsed.helpRequested) {
    stdout.write(`${getUsage()}\n`);
    return 'help';
  }

  const evidenceDir = path.resolve(parsed.evidenceDir);
  const report = await evaluatePipelineFreshness(
    { settleMs: parsed.settleMs, apiTimeoutMs: parsed.apiTimeoutMs },
    deps
  );
  writeEvidenceFiles(evidenceDir, report, deps.fsApi ?? fs);
  stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report.decision;
}

async function main() {
  try {
    await runPipelineFreshnessCli();
    return 0;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (require.main === module) {
  void main().then((code) => {
    process.exitCode = code;
  });
}

module.exports = {
  DEFAULT_EVIDENCE_DIR,
  DEFAULT_API_TIMEOUT_MS,
  DEFAULT_SETTLE_MS,
  NON_STALE_NEWER_STATUSES,
  SCHEMA,
  SKIP_FLAG_FILE,
  buildContext,
  buildFetchOptions,
  buildMarkdown,
  evaluatePipelineFreshness,
  getUsage,
  parseArgs,
  runPipelineFreshnessCli,
  writeEvidenceFiles
};
