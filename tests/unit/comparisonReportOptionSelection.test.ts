/**
 * VHS-REQ-645: unit tests for the comparison-report option settings writer used
 * by the Runtime & Report Settings panel. Confirms the Include-checkbox to
 * `report.ignore*` inversion and the format allow-list guard.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', async () => {
  const { defaultVsCodeTestHarness } = await import('./vscodeTestHarness');
  return defaultVsCodeTestHarness.vscode;
});

import * as vscode from 'vscode';

import { applyComparisonReportOptionSelection } from '../../src/reporting/comparisonReportAction';

describe('applyComparisonReportOptionSelection (VHS-REQ-645)', () => {
  it('persists a supported report format to the Global target', async () => {
    const update = vi.fn(async () => undefined);
    await applyComparisonReportOptionSelection({ kind: 'format', format: 'HTML' }, { update });
    expect(update).toHaveBeenCalledWith(
      'report.format',
      'HTML',
      vscode.ConfigurationTarget.Global
    );
  });

  it('ignores an unsupported report format so the viewer can always render', async () => {
    const update = vi.fn(async () => undefined);
    await applyComparisonReportOptionSelection(
      { kind: 'format', format: 'XML' as never },
      { update }
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('writes ignore=true when an include checkbox is deselected', async () => {
    const update = vi.fn(async () => undefined);
    await applyComparisonReportOptionSelection(
      { kind: 'include', settingKey: 'report.ignoreBlockDiagram', include: false },
      { update }
    );
    expect(update).toHaveBeenCalledWith(
      'report.ignoreBlockDiagram',
      true,
      vscode.ConfigurationTarget.Global
    );
  });

  it('writes ignore=false when an include checkbox is selected', async () => {
    const update = vi.fn(async () => undefined);
    await applyComparisonReportOptionSelection(
      { kind: 'include', settingKey: 'report.ignoreFrontPanel', include: true },
      { update }
    );
    expect(update).toHaveBeenCalledWith(
      'report.ignoreFrontPanel',
      false,
      vscode.ConfigurationTarget.Global
    );
  });
});
