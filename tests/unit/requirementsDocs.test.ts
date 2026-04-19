import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (character === '"') {
      const nextCharacter = text[index + 1];
      if (inQuotes && nextCharacter === '"') {
        currentCell += '"';
        index += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && character === ',') {
      currentRow.push(currentCell);
      currentCell = '';
      continue;
    }

    if (!inQuotes && (character === '\n' || character === '\r')) {
      if (character === '\r' && text[index + 1] === '\n') {
        index += 1;
      }

      currentRow.push(currentCell);
      currentCell = '';

      if (currentRow.some((cell) => cell.length > 0)) {
        rows.push(currentRow);
      }

      currentRow = [];
      continue;
    }

    currentCell += character;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows;
}

function parseRtmRows(): Array<Record<string, string>> {
  const rows = parseCsv(readText('docs/requirements/rtm.csv'));
  const [header, ...body] = rows;

  return body.map((row) => {
    const record: Record<string, string> = {};

    header.forEach((key, index) => {
      record[key] = row[index] ?? '';
    });

    return record;
  });
}

function extractPlanIds(text: string): string[] {
  return [...text.matchAll(/`(TEST(?:-[A-Z]+)?-\d+)`/g)].map((match) => match[1]);
}

function extractSrsRequirementIds(text: string): string[] {
  return [...text.matchAll(/\|\s(VHS-REQ-\d+)\s\|/g)].map((match) => match[1]);
}

describe('requirements documentation coherence', () => {
  it('keeps the system and software requirement package split explicit', () => {
    const syrs = readText('docs/requirements/syrs.md');
    const srs = readText('docs/requirements/srs.md');
    const informationItemMap = readText('docs/information-item-map.md');

    expect(syrs).toContain('# System Requirements Specification');
    expect(srs).toContain('Parent system specification: [docs/requirements/syrs.md](./syrs.md)');
    expect(srs).toContain('This document refines the software behavior within the system boundary');
    expect(informationItemMap).toContain('| System Specification | `docs/requirements/syrs.md` |');
    expect(informationItemMap).toContain('| Software Specification | `docs/requirements/srs.md` |');
  });

  it('keeps the SRS and RTM on the same requirement-id set', () => {
    const srsIds = new Set(extractSrsRequirementIds(readText('docs/requirements/srs.md')));
    const rtmIds = new Set(parseRtmRows().map((row) => row.ReqID));

    expect([...srsIds].sort()).toEqual([...rtmIds].sort());
  });

  it('keeps the governed RTM verification ids and test-plan ids in sync', () => {
    const planIds = new Set(extractPlanIds(readText('docs/testing/test-plan.md')));
    const rtmIds = new Set(
      parseRtmRows().flatMap((row) =>
        row.TestID.split(';')
          .map((testId) => testId.trim())
          .filter((testId) => testId.length > 0)
      )
    );

    expect([...rtmIds].sort()).toEqual([...planIds].sort());
  });

  it('keeps the research-facing dashboard and history-panel trace surfaces current', () => {
    const alignment = readText('docs/research/authoritative/research-alignment.md');
    const currentState = readText('docs/product/current-state.md');
    const srs = readText('docs/requirements/srs.md');
    const rtm = readText('docs/requirements/rtm.csv');
    const testPlan = readText('docs/testing/test-plan.md');
    const adr0005 = readText(
      'docs/architecture/adr/ADR-0005-runtime-provider-selection-and-windows64-isolation.md'
    );
    const implementationIndex = JSON.parse(
      readText('docs/research/authoritative/research-implementation-index.json')
    ) as {
      implementationState: Array<{
        surface: string;
        evidence: string[];
        requirements: string[];
      }>;
    };

    const historySurface = implementationIndex.implementationState.find(
      (entry) => entry.surface === 'history-panel-and-review-actions'
    );
    const dashboardSurface = implementationIndex.implementationState.find(
      (entry) => entry.surface === 'multi-report-developer-dashboard-for-three-plus-commits'
    );

    expect(currentState).toContain('truncated auto/capped window');
    expect(currentState).toContain('latest-dashboard-run.json');
    expect(currentState).toContain('checkbox-selected explicit compare-preflight workflow');
    expect(currentState).not.toContain(
      'the second checkbox selection triggers comparison generation automatically'
    );
    expect(srs).toContain(
      'Governed internal/runtime-proof override inputs shall allow explicit override through `labviewCliPath`, `labviewExePath`, and `bitness`'
    );
    expect(srs).not.toContain(
      'Runtime tool settings shall allow explicit user override through `labviewCliPath`, `labviewExePath`, and `bitness`'
    );
    expect(srs).toContain('selecting two distinct retained revisions establishes one explicit compare-preflight pair');
    expect(srs).not.toContain(
      'selecting the second distinct retained revision triggers comparison-report generation automatically'
    );
    expect(srs).toContain(
      'Missing-runtime selections retain notes that point to the missing provider/runtime facts that actually govern the active lane'
    );
    expect(srs).not.toContain(
      'Missing-runtime selections retain notes pointing to `viHistorySuite.labviewExePath` or `viHistorySuite.labviewCliPath` as appropriate.'
    );
    expect(srs).toContain(
      'When the Windows 64-bit container provider is selected without a resolved governing container image'
    );
    expect(srs).not.toContain(
      'When the Windows 64-bit container provider is selected without a configured container image'
    );
    expect(srs).toContain(
      'isolated LabVIEW 2026 Q1 Windows container path remains available as a bounded expert lane'
    );
    expect(srs).not.toContain(
      'isolated LabVIEW 2026 Q1 Windows container path can be introduced'
    );
    expect(rtm).toContain(
      'Keep governed internal/runtime-proof override inputs for labviewCliPath, labviewExePath, and bitness ahead of auto-discovery'
    );
    expect(rtm).not.toContain(
      'executionMode, labviewCliPath, labviewExePath, windowsContainerImage, and bitness'
    );
    expect(rtm).toContain('selecting two distinct retained revisions establishes one explicit compare-preflight pair');
    expect(rtm).toContain('canonical proof-admission contract');
    expect(rtm).toContain('effective proof-admission bundle');
    expect(rtm).toContain('explicit proof-admission override bundles');
    expect(rtm).toContain('explicit Windows proof-admission runtime paths');
    expect(rtm).not.toContain('canonical runtime-override admission contract');
    expect(rtm).not.toContain('effective runtime override bundle');
    expect(rtm).not.toContain('effective launch bundle');
    expect(rtm).not.toContain('explicit runtime override bundles');
    expect(rtm).not.toContain('explicit Windows runtime override paths');
    expect(rtm).toContain('without a resolved governing container image');
    expect(rtm).not.toContain('without a configured container image');
    expect(rtm).toContain('remains available as a bounded expert lane');
    expect(rtm).toContain(
      'surface provider request, chosen provider, rejected-provider reasons, acquisition outcome, and next action'
    );
    expect(rtm).not.toContain(
      'surface the selected execution mode, chosen provider, rejected-provider reasons, acquisition outcome, and next action'
    );
    expect(rtm).toContain(
      'surface the current released Docker-only installed-user execution-policy truths'
    );
    expect(rtm).not.toContain(
      'surface the critical Docker-first Windows installed-user execution-policy truths'
    );
    expect(testPlan).toContain('explicit compare-preflight entrypoint');
    expect(testPlan).toContain('does not expose');
    expect(testPlan).toContain('`labviewCliPath`, `labviewExePath`, `bitness`, `executionMode`, or public');
    expect(testPlan).toContain('without a resolved governing image');
    expect(testPlan).toContain('bounded expert isolated container execution path');
    expect(testPlan).toContain('truth checks for Docker-only');
    expect(testPlan).toContain('compare execution, engine-aware Windows/Linux image selection');
    expect(testPlan).toContain('Docker-required hard stops without host fallback');
    expect(testPlan).not.toContain('critical Docker-first Windows');
    expect(adr0005).toContain('bounded expert isolation path');
    expect(adr0005).not.toContain('preferred future isolation path');

    expect(alignment).toContain('history-window packet');
    expect(alignment).toContain('latest-run discovery');

    expect(historySurface?.evidence).toContain('src/ui/historyPanel.ts');
    expect(historySurface?.requirements).toContain('VHS-REQ-387');

    expect(dashboardSurface?.evidence).toContain('src/dashboard/dashboardLatestRun.ts');
    expect(dashboardSurface?.requirements).toContain('VHS-REQ-388');
    expect(dashboardSurface?.requirements).toContain('VHS-REQ-389');
  });

  it('keeps the second runtime-provider CLI requirement cluster explicit', () => {
    const srs = readText('docs/requirements/srs.md');
    const rtm = readText('docs/requirements/rtm.csv');
    const testPlan = readText('docs/testing/test-plan.md');

    expect(srs).toContain('derive `ready` state from runtime-backed provider and runtime resolution');
    expect(srs).toContain('reload or restart the window before trusting updated provider or runtime facts');
    expect(srs).toContain('support governed VS Code settings targets that contain JSONC comments or trailing commas');
    expect(srs).toContain('generated settings-CLI launcher surface shall make its runtime dependency explicit');
    expect(srs).toContain('`labviewViHistory.prepareLocalRuntimeSettingsCli` command shall make its trust and settings-target governance explicit');
    expect(srs).toContain('expose one governed readback or validation surface');
    expect(srs).toContain('close the remaining LabVIEW 2026 operation-matrix admission seams');
    expect(srs).toContain('prove `CreateComparisonReport` admission on each supported LabVIEW 2026 host bundle');
    expect(srs).toContain('remain on the exact released Docker-only baseline until the host-default provider contract is source-backed');
    expect(srs).toContain('VHS-REQ-551');
    expect(srs).toContain(
      'shall use native Windows host execution and native Windows-container execution'
    );
    expect(srs).toContain('VHS-REQ-553');
    expect(srs).toContain('published `repo-standards-review` assurance-workbench lane');
    expect(srs).toContain('VHS-REQ-554');
    expect(srs).toContain('self-hosted Linux assurance runner lane');
    expect(srs).toContain('VHS-REQ-555');
    expect(srs).toContain('repo-owned `assurance:*` command surface');
    expect(srs).toContain('VHS-REQ-556');
    expect(srs).toContain('assurance_audit_packet');
    expect(srs).toContain('VHS-REQ-557');
    expect(srs).toContain('repo-native contradiction guards');

    expect(rtm).toContain('VHS-REQ-541');
    expect(rtm).toContain('VHS-REQ-549');
    expect(rtm).toContain('VHS-REQ-551');
    expect(rtm).toContain('VHS-REQ-553');
    expect(rtm).toContain('VHS-REQ-554');
    expect(rtm).toContain('VHS-REQ-555');
    expect(rtm).toContain('VHS-REQ-556');
    expect(rtm).toContain('VHS-REQ-557');
    expect(rtm).toContain('TEST-UNIT-349');
    expect(rtm).toContain('TEST-INTEG-011');
    expect(rtm).toContain('TEST-SMOKE-022');
    expect(rtm).toContain('TEST-DOC-109');
    expect(rtm).toContain('TEST-DOC-110');
    expect(rtm).toContain('TEST-UNIT-357');
    expect(rtm).toContain('TEST-DOC-112');
    expect(rtm).toContain('TEST-UNIT-358');
    expect(rtm).toContain('TEST-UNIT-359');
    expect(rtm).toContain('TEST-UNIT-360');
    expect(rtm).toContain('TEST-UNIT-361');
    expect(rtm).toContain('TEST-DOC-113');
    expect(rtm).toContain('TEST-DOC-114');
    expect(rtm).toContain('docs/product/runtime-provider-public-acceptance-gate.md');
    expect(rtm).toContain('docs/product/runtime-provider-public-acceptance-gate.json');
    expect(rtm).toContain('docs/release-procedure.md');
    expect(rtm).toContain('docs/product/linux-assurance-runner-lane.md');

    expect(testPlan).toContain('TEST-UNIT-349');
    expect(testPlan).toContain('settings-only fallback cannot');
    expect(testPlan).toContain('publishable runtime-backed ready state');
    expect(testPlan).toContain('TEST-UNIT-351');
    expect(testPlan).toContain('JSONC comments or trailing commas');
    expect(testPlan).toContain('TEST-UNIT-352');
    expect(testPlan).toContain('TEST-INTEG-010');
    expect(testPlan).toContain('TEST-INTEG-011');
    expect(testPlan).toContain('TEST-SMOKE-020');
    expect(testPlan).toContain('TEST-DOC-108');
    expect(testPlan).toContain('TEST-DOC-109');
    expect(testPlan).toContain('TEST-DOC-110');
    expect(testPlan).toContain('TEST-UNIT-357');
    expect(testPlan).toContain('TEST-DOC-112');
    expect(testPlan).toContain('TEST-UNIT-358');
    expect(testPlan).toContain('TEST-UNIT-359');
    expect(testPlan).toContain('TEST-UNIT-360');
    expect(testPlan).toContain('TEST-UNIT-361');
    expect(testPlan).toContain('TEST-DOC-113');
    expect(testPlan).toContain('TEST-DOC-114');
    expect(testPlan).toContain('native Windows only');
    expect(testPlan).toContain('WSL is retained historical context only');
    expect(testPlan).toContain('runtime-provider public-acceptance gate');
    expect(testPlan).toContain('release procedure');
  });
});
