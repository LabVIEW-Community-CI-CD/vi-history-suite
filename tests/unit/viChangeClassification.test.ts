import { describe, expect, it } from 'vitest';

import {
  classifyDetailItem,
  deriveChangeClassification,
  ViChangeClassificationSection
} from '../../src/semantic/viChangeClassification';

// Semantic Diff Intelligence Phase 1 (VHS-REQ-702): deterministic classification
// of NI comparison detail items. The corpus cases below are the REAL detail-item
// lines mined from icon-editor lv_icon.vi comparison reports (container +
// host-native renders) during the Phase 0 design pass.

describe('classifyDetailItem: real NI corpus items (VHS-REQ-702.1)', () => {
  it('classifies a subVI add/delete as a dependency change', () => {
    expect(classifyDetailItem('SubVI "VisibleTextMarker.vi" - added at (1570,358)')).toBe('dependency');
    expect(classifyDetailItem('SubVI "Finalize Text.vi" - deleted at (1397,358)')).toBe('dependency');
  });

  it('classifies subVI linkage/missing as a dependency change', () => {
    expect(classifyDetailItem('SubVI - VI missing')).toBe('dependency');
    expect(classifyDetailItem('SubVI - VI linkage')).toBe('dependency');
  });

  it('classifies wiring changes as behavioral', () => {
    expect(classifyDetailItem('wiring changes')).toBe('behavioral');
  });

  it('classifies a constant add as structural (not dependency/cosmetic)', () => {
    expect(classifyDetailItem('Boolean Constant "Visible" - added at (1538,393)')).toBe('structural');
  });
});

describe('classifyDetailItem: taxonomy coverage (VHS-REQ-702.1)', () => {
  it('recognizes interface (connector pane / control signature) changes', () => {
    expect(classifyDetailItem('Connector pane terminal pattern changed')).toBe('interface');
    expect(classifyDetailItem('Control "Threshold" - added')).toBe('interface');
    expect(classifyDetailItem('Indicator "Result" data type changed')).toBe('interface');
  });

  it('recognizes cosmetic-only changes', () => {
    expect(classifyDetailItem('Label moved')).toBe('cosmetic');
    expect(classifyDetailItem('Free label color changed')).toBe('cosmetic');
    expect(classifyDetailItem('Decoration resized')).toBe('cosmetic');
  });

  it('recognizes typedef/class dependency changes', () => {
    expect(classifyDetailItem('Type def "State.ctl" - relinked')).toBe('dependency');
    expect(classifyDetailItem('Class "Actor.lvclass" - added')).toBe('dependency');
  });

  it('classifies dataflow / structure changes as behavioral', () => {
    expect(classifyDetailItem('Case structure added')).toBe('behavioral');
    expect(classifyDetailItem('Rewired terminal')).toBe('behavioral');
  });

  it('never force-fits unrecognized text (falls back to unknown)', () => {
    expect(classifyDetailItem('something entirely unexpected')).toBe('unknown');
    expect(classifyDetailItem('')).toBe('unknown');
    expect(classifyDetailItem('   ')).toBe('unknown');
  });

  it('is case-insensitive', () => {
    expect(classifyDetailItem('SUBVI "X.vi" - ADDED')).toBe('dependency');
    expect(classifyDetailItem('WIRING CHANGES')).toBe('behavioral');
  });
});

describe('classifyDetailItem: Phase 5 real-report corpus gaps (VHS-REQ-702.1, #2259/#2260)', () => {
  // These are the exact NI detail-item strings that classified as `unknown`
  // during the Phase 5 real-runtime validation (#2259). Each is now covered.
  it('classifies node-reconfiguration changes as behavioral', () => {
    expect(classifyDetailItem('Compound Arithmetic Terminal - terminal inversion')).toBe('behavioral');
    expect(classifyDetailItem('Unbundle By Name - number of elements : changed from " 12 " to " 11 "')).toBe('behavioral');
    expect(classifyDetailItem('Unbundle By Name - number of elements : changed from " 4 " to " 5 "')).toBe('behavioral');
  });

  it('classifies a data-type-name change as interface (matches NI "data type name : changed from" phrasing)', () => {
    expect(
      classifyDetailItem('Front Panel Terminal "error in" - data type name : changed from " error in (no error) " to " error in "')
    ).toBe('interface');
    expect(
      classifyDetailItem('Cluster "error in" - data type name : changed from " error in (no error) " to " error in "')
    ).toBe('interface');
  });

  it('classifies a control-style change as cosmetic', () => {
    expect(classifyDetailItem('default control style')).toBe('cosmetic');
  });

  it('does not match "unchanged" as a datatype interface change (#2264)', () => {
    // The change verb requires a word boundary + inflection, so a line stating
    // the data type is UNCHANGED must not be force-fit to interface.
    expect(classifyDetailItem('Cluster "error out" - data type name : unchanged')).not.toBe('interface');
    // ...while a genuine datatype change still classifies as interface.
    expect(
      classifyDetailItem('Cluster "error in" - data type name : changed from " a " to " b "')
    ).toBe('interface');
  });
});

describe('deriveChangeClassification: risk aggregation (VHS-REQ-702.2)', () => {
  const bdFunctional = ['Block Diagram Functional'];

  it('is high risk when a high-severity kind (dependency/behavioral/interface) is present', () => {
    const sections: ViChangeClassificationSection[] = [
      { surface: 'block-diagram', items: ['SubVI "X.vi" - deleted at (1,2)', 'Boolean Constant "Y" - added at (3,4)'] }
    ];
    const result = deriveChangeClassification(sections, bdFunctional);
    expect(result.riskLevel).toBe('high');
    expect(result.riskRationale).toContain('dependency');
    // dependency ordered before structural in the distinct-kinds list
    expect(result.changeKinds).toEqual(['dependency', 'structural']);
  });

  it('is medium risk when only structural changes are present', () => {
    const result = deriveChangeClassification(
      [{ surface: 'block-diagram', items: ['Boolean Constant "Y" - added at (3,4)'] }],
      bdFunctional
    );
    expect(result.riskLevel).toBe('medium');
    expect(result.riskRationale).toContain('structural');
  });

  it('is low risk for cosmetic-only changes', () => {
    const result = deriveChangeClassification(
      [{ surface: 'front-panel', items: ['Label moved', 'Free label color changed'] }],
      ['Front Panel Position/Size']
    );
    expect(result.riskLevel).toBe('low');
    expect(result.riskRationale).toContain('cosmetic');
  });

  it('is low risk with an explicit rationale when there are no classified items', () => {
    const result = deriveChangeClassification([], []);
    expect(result.riskLevel).toBe('low');
    expect(result.riskRationale).toBe('low: no classified changes');
    expect(result.classification).toEqual([]);
    expect(result.changeKinds).toEqual([]);
  });

  it('does not report unknown items as "cosmetic only" (honesty rationale)', () => {
    // unknown-only: rationale must not imply cosmetic certainty
    const unknownOnly = deriveChangeClassification(
      [{ surface: 'other', items: ['something entirely unexpected'] }],
      []
    );
    expect(unknownOnly.riskLevel).toBe('low');
    expect(unknownOnly.riskRationale).toBe('low: unclassified change(s) only');
    expect(unknownOnly.classificationConfidence).toBe('low');

    // cosmetic + unknown: rationale names both, never "cosmetic only"
    const mixed = deriveChangeClassification(
      [{ surface: 'front-panel', items: ['Label moved', 'mystery item'] }],
      ['Front Panel Position/Size']
    );
    expect(mixed.riskLevel).toBe('low');
    expect(mixed.riskRationale).toBe('low: cosmetic and unclassified change(s)');
    expect(mixed.riskRationale).not.toBe('low: cosmetic change(s) only');
  });
});

describe('deriveChangeClassification: confidence (VHS-REQ-702.3)', () => {
  it('is high when every item is recognized and NI compared the functional dimension', () => {
    const result = deriveChangeClassification(
      [{ surface: 'block-diagram', items: ['wiring changes', 'SubVI "X.vi" - deleted at (1,2)'] }],
      ['Block Diagram Functional']
    );
    expect(result.classificationConfidence).toBe('high');
  });

  it('is low when any item is unrecognized', () => {
    const result = deriveChangeClassification(
      [{ surface: 'block-diagram', items: ['wiring changes', 'mystery item'] }],
      ['Block Diagram Functional']
    );
    expect(result.classificationConfidence).toBe('low');
  });

  it('is low when a block-diagram functional claim is not corroborated by NI attributes', () => {
    const result = deriveChangeClassification(
      [{ surface: 'block-diagram', items: ['wiring changes'] }],
      ['Front Panel'] // functional dimension NOT compared
    );
    expect(result.classificationConfidence).toBe('low');
  });

  it('is low when there is nothing to classify', () => {
    expect(deriveChangeClassification([], []).classificationConfidence).toBe('low');
  });

  it('preserves per-item surface + text alongside the kind', () => {
    const result = deriveChangeClassification(
      [{ surface: 'block-diagram', items: ['wiring changes'] }],
      ['Block Diagram Functional']
    );
    expect(result.classification).toEqual([
      { surface: 'block-diagram', kind: 'behavioral', text: 'wiring changes' }
    ]);
  });
});
