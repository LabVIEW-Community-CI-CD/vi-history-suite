#!/usr/bin/env node

/**
 * Unified requirement verification-health report (advisory; VHS-REQ-601).
 *
 * This is the single pane of glass over the verification signals built up across
 * the requirements tooling. It orchestrates the existing guards/reports rather
 * than re-parsing anything, aggregating per requirement:
 *
 *   - structural integrity  - checkRequirementsIntegrity (cross-reference invariants);
 *   - requirement linkage    - auditRequirementVerificationLinkage (a test cites the ID);
 *   - criterion citation     - auditRequirementCriteriaInventory (VHS-REQ-NNN.M cited);
 *   - coverage risk          - mapCoverageToTraceability (mapped files below threshold);
 *   - assertion quality      - Stryker mutation score (reports/mutation/mutation.json).
 *
 * It is ADVISORY (exit 0): the individual gates already fail closed where the
 * repository has decided to enforce (integrity, requirement linkage, criterion
 * citation, coverage risk). It is advisory by default; with --strict it exits
 * non-zero when requirement health is not green -- a one-command local pre-push
 * check over those already-enforced signals. It summarizes the enforced state
 * plus the advisory signals so a reader or agent sees requirement health at a
 * glance and knows which requirements still need attention. Coverage and
 * mutation are optional inputs: when their artifacts are absent (no `npm test` /
 * no `npm run test:mutation`) the report marks them unavailable instead of
 * failing.
 *
 * Pure helpers stay separate from a thin CLI so the aggregation is unit-testable
 * with injected sub-results. It uses only Node built-ins plus the sibling
 * requirements/coverage modules, so the command needs no dependency install.
 */

const fs = require('node:fs');
const path = require('node:path');

const { auditRequirementVerificationLinkage } = require('./auditRequirementVerificationLinkage.js');
const { auditRequirementCriteriaInventory } = require('./auditRequirementCriteriaInventory.js');
const { checkRequirementsIntegrity } = require('./checkRequirementsIntegrity.js');
const { generateCoverageMap } = require('./mapCoverageToTraceability.js');

const MUTATION_REPORT_PATH = 'reports/mutation/mutation.json';

// Stryker mutation score = detected / valid, where detected = Killed + Timeout
// and valid = detected + Survived + NoCoverage (Ignored/CompileError excluded).
function computeMutationScore(report) {
  const counts = { killed: 0, timeout: 0, survived: 0, noCoverage: 0 };
  const files = report && report.files ? report.files : {};
  for (const file of Object.values(files)) {
    for (const mutant of file.mutants || []) {
      if (mutant.status === 'Killed') counts.killed += 1;
      else if (mutant.status === 'Timeout') counts.timeout += 1;
      else if (mutant.status === 'Survived') counts.survived += 1;
      else if (mutant.status === 'NoCoverage') counts.noCoverage += 1;
    }
  }
  const detected = counts.killed + counts.timeout;
  const valid = detected + counts.survived + counts.noCoverage;
  return {
    ...counts,
    score: valid === 0 ? null : Number(((detected / valid) * 100).toFixed(2))
  };
}

function loadCoverage(cwd) {
  try {
    return generateCoverageMap({ repoRoot: cwd });
  } catch {
    return null;
  }
}

function loadMutation(readRaw) {
  const raw = readRaw(MUTATION_REPORT_PATH);
  if (typeof raw !== 'string') {
    return null;
  }
  try {
    return computeMutationScore(JSON.parse(raw));
  } catch {
    return null;
  }
}

function aggregateRequirementHealth(linkage, criteria, coverage) {
  const criteriaByRequirement = new Map(criteria.requirements.map((entry) => [entry.reqId, entry]));
  const linkedSet = new Set(linkage.linked);
  const manualSet = new Set(linkage.manualOnly);
  const unlinkedSet = new Set(linkage.unlinked.map((entry) => entry.reqId));

  const coverageRiskByRequirement = new Map();
  if (coverage) {
    for (const file of coverage.mappedBelowThreshold) {
      for (const reqId of file.requirementIds) {
        const existing = coverageRiskByRequirement.get(reqId) || [];
        existing.push(file.path);
        coverageRiskByRequirement.set(reqId, existing);
      }
    }
  }

  const reqIds = [...new Set([...linkedSet, ...manualSet, ...unlinkedSet])].sort();
  return reqIds.map((reqId) => {
    const criterion = criteriaByRequirement.get(reqId);
    const linkState = linkedSet.has(reqId)
      ? 'linked'
      : manualSet.has(reqId)
        ? 'manual'
        : 'unlinked';
    const coverageRiskFiles = coverageRiskByRequirement.get(reqId) || [];
    const criteriaTotal = criterion ? criterion.criteriaCount : 0;
    const criteriaCited = criterion ? criterion.criteria.filter((entry) => entry.cited).length : 0;
    const criteriaUncited = criteriaTotal - criteriaCited;
    return {
      reqId,
      linkState,
      criteriaCited,
      criteriaTotal,
      criteriaUncited,
      coverageRiskFiles,
      attention: linkState === 'unlinked' || criteriaUncited > 0 || coverageRiskFiles.length > 0
    };
  });
}

function summarizeRequirementHealth(result) {
  const attention = Array.isArray(result && result.attention) ? result.attention : [];
  const reasonCounts = {
    structuralIntegrity: result && result.integrity && result.integrity.success === false ? 1 : 0,
    unlinked: 0,
    uncitedCriteria: 0,
    coverageRisk: 0
  };
  for (const entry of attention) {
    if (entry.linkState === 'unlinked') reasonCounts.unlinked += 1;
    if (entry.criteriaUncited > 0) reasonCounts.uncitedCriteria += 1;
    if (Array.isArray(entry.coverageRiskFiles) && entry.coverageRiskFiles.length > 0) {
      reasonCounts.coverageRisk += 1;
    }
  }
  const unavailableSignals = [];
  if (!result || !result.coverage || result.coverage.available === false) unavailableSignals.push('coverage');
  if (!result || !result.mutation || result.mutation.available === false) unavailableSignals.push('mutation');
  return {
    status: result && result.healthy && attention.length === 0 ? 'HEALTHY' : 'ATTENTION',
    healthy: Boolean(result && result.healthy),
    attentionCount: attention.length,
    reasonCounts,
    unavailableSignals
  };
}

function verifyRequirementsHealth(cwd = process.cwd(), deps = {}) {
  const linkage = deps.linkage || auditRequirementVerificationLinkage(cwd, deps);
  const criteria = deps.criteria || auditRequirementCriteriaInventory(cwd, deps);
  const integrity = deps.integrity || checkRequirementsIntegrity(cwd, deps);
  const coverage = deps.coverage !== undefined ? deps.coverage : loadCoverage(cwd);
  const readRaw =
    deps.readFile ||
    ((relativePath) => {
      try {
        return fs.readFileSync(path.join(cwd, ...relativePath.split('/')), 'utf8');
      } catch {
        return undefined;
      }
    });
  const mutation = deps.mutation !== undefined ? deps.mutation : loadMutation(readRaw);

  const requirements = aggregateRequirementHealth(linkage, criteria, coverage);
  const attention = requirements.filter((entry) => entry.attention);
  const coverageRiskRequirements = coverage
    ? new Set(coverage.mappedBelowThreshold.flatMap((file) => file.requirementIds)).size
    : 0;

  const result = {
    activeRequirements: requirements.length,
    integrity: { success: integrity.success, violationCount: integrity.violationCount },
    linkage: {
      linked: linkage.linked.length,
      unlinked: linkage.unlinked.length,
      manualOnly: linkage.manualOnly.length,
      total: linkage.total
    },
    criteria: {
      cited: criteria.citedCriteria,
      total: criteria.totalCriteria,
      uncited: criteria.uncitedCriteria
    },
    coverage: coverage
      ? {
          available: true,
          riskThreshold: coverage.riskThreshold,
          requirementsWithRisk: coverageRiskRequirements,
          mappedBelowThreshold: coverage.mappedBelowThreshold.length
        }
      : { available: false },
    mutation:
      mutation && mutation.score !== null ? { available: true, ...mutation } : { available: false },
    requirements,
    attention,
    healthy:
      integrity.success &&
      linkage.unlinked.length === 0 &&
      criteria.uncitedCriteria === 0 &&
      (!coverage || coverage.mappedBelowThreshold.length === 0)
  };
  return {
    ...result,
    summary: summarizeRequirementHealth(result)
  };
}

function renderSummary(result, options = {}) {
  const lines = [];
  lines.push('[requirements-verify] Requirement verification health (advisory single-pane report).');
  lines.push(`[requirements-verify] Active requirements: ${result.activeRequirements}`);
  lines.push(
    `[requirements-verify] Structural integrity: ${result.integrity.success ? 'PASS' : 'FAIL'} (${result.integrity.violationCount} violation(s))`
  );
  lines.push(
    `[requirements-verify] Requirement-level linkage: ${result.linkage.linked}/${result.linkage.total} linked (${result.linkage.unlinked} unlinked, ${result.linkage.manualOnly} manual-only)`
  );
  lines.push(
    `[requirements-verify] Criterion-level citation: ${result.criteria.cited}/${result.criteria.total} criteria cited`
  );
  lines.push(
    result.coverage.available
      ? `[requirements-verify] Coverage risk: ${result.coverage.requirementsWithRisk} requirement(s) with a mapped file below ${result.coverage.riskThreshold}%`
      : '[requirements-verify] Coverage risk: not available (run npm test)'
  );
  lines.push(
    result.mutation.available
      ? `[requirements-verify] Mutation (advisory): ${result.mutation.score}% (${result.mutation.killed + result.mutation.timeout} detected / ${result.mutation.survived} survived)`
      : '[requirements-verify] Mutation (advisory): not available (run npm run test:mutation)'
  );
  if (result.healthy && result.attention.length === 0) {
    lines.push('[requirements-verify] Overall: HEALTHY — all enforced signals green.');
  } else {
    lines.push(
      `[requirements-verify] Overall: ATTENTION — ${result.attention.length} requirement(s) need attention:`
    );
    for (const entry of result.attention) {
      const reasons = [];
      if (entry.linkState === 'unlinked') reasons.push('no citing test');
      if (entry.criteriaUncited > 0) {
        reasons.push(`${entry.criteriaUncited} uncited criterion/criteria`);
      }
      if (entry.coverageRiskFiles.length > 0) {
        reasons.push(`coverage risk (${entry.coverageRiskFiles.join(', ')})`);
      }
      lines.push(`  - ${entry.reqId}: ${reasons.join('; ')}`);
    }
  }
  if (options.strict) {
    lines.push(
      result.healthy
        ? '[requirements-verify] Strict mode: requirement health is green.'
        : '[requirements-verify] Strict mode: FAILING because requirement health is not green.'
    );
  } else {
    lines.push('[requirements-verify] Advisory report; does not fail CI.');
  }
  return lines.join('\n');
}

function renderStepSummary(result) {
  const lines = [];
  lines.push('## Requirement Verification Health');
  lines.push('');
  lines.push(
    '**Advisory single pane of glass.** Aggregates the enforced and advisory verification ' +
      'signals per requirement: structural integrity, requirement-level linkage, criterion-level ' +
      'citation, coverage risk, and mutation (assertion quality). The individual gates fail closed ' +
      'where the repository enforces them; this report never fails CI.'
  );
  lines.push('');
  lines.push(`- Active requirements: ${result.activeRequirements}`);
  lines.push(
    `- Structural integrity: ${result.integrity.success ? 'PASS' : 'FAIL'} (${result.integrity.violationCount} violation(s))`
  );
  lines.push(
    `- Requirement-level linkage: ${result.linkage.linked}/${result.linkage.total} linked (${result.linkage.unlinked} unlinked)`
  );
  lines.push(`- Criterion-level citation: ${result.criteria.cited}/${result.criteria.total} cited`);
  lines.push(
    result.coverage.available
      ? `- Coverage risk: ${result.coverage.requirementsWithRisk} requirement(s) below ${result.coverage.riskThreshold}%`
      : '- Coverage risk: not available'
  );
  lines.push(
    result.mutation.available
      ? `- Mutation (advisory): ${result.mutation.score}%`
      : '- Mutation (advisory): not available'
  );
  lines.push(`- Overall: ${result.healthy && result.attention.length === 0 ? 'HEALTHY' : 'ATTENTION'}`);
  lines.push('');

  if (result.attention.length > 0) {
    lines.push('### Requirements needing attention');
    lines.push('');
    lines.push('| Requirement | Reason |');
    lines.push('| --- | --- |');
    for (const entry of result.attention) {
      const reasons = [];
      if (entry.linkState === 'unlinked') reasons.push('no citing test');
      if (entry.criteriaUncited > 0) {
        reasons.push(`${entry.criteriaUncited} uncited criterion/criteria`);
      }
      if (entry.coverageRiskFiles.length > 0) {
        reasons.push(`coverage risk: ${entry.coverageRiskFiles.map((file) => `\`${file}\``).join(' ')}`);
      }
      lines.push(`| \`${entry.reqId}\` | ${reasons.join('; ')} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function main(argv = process.argv.slice(2), deps = {}) {
  const positionals = argv.filter((arg) => !arg.startsWith('--'));
  const asJson = deps.json ?? argv.includes('--json');
  const strict = deps.strict ?? argv.includes('--strict');
  const cwd = deps.cwd || positionals[0] || process.cwd();
  const result = verifyRequirementsHealth(cwd, deps);

  const stepSummaryPath = deps.stepSummaryPath || process.env.GITHUB_STEP_SUMMARY;
  if (stepSummaryPath) {
    const appendStepSummary =
      deps.appendStepSummary || ((filePath, content) => fs.appendFileSync(filePath, content));
    appendStepSummary(stepSummaryPath, `${renderStepSummary(result)}\n`);
  }

  const stdout = deps.stdout || process.stdout;
  stdout.write(asJson ? `${JSON.stringify(result, null, 2)}\n` : `${renderSummary(result, { strict })}\n`);

  // Advisory by default (exit 0). With --strict the report exits non-zero when
  // requirement health is not green (structural integrity, requirement linkage,
  // criterion citation, or coverage risk) -- a one-command local pre-push check
  // over the signals the individual guards already fail closed on in CI, so
  // strict is deliberately not wired into CI where it would be redundant.
  if (strict && !result.healthy) {
    return 1;
  }
  return 0;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  MUTATION_REPORT_PATH,
  computeMutationScore,
  aggregateRequirementHealth,
  summarizeRequirementHealth,
  verifyRequirementsHealth,
  renderSummary,
  renderStepSummary,
  main
};
