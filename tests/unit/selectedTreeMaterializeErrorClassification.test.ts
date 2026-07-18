import { describe, expect, it } from 'vitest';

import {
  classifySelectedTreeMaterializeError,
  SELECTED_TREE_MATERIALIZE_LONG_PATH_DIAGNOSTIC
} from '../../src/reporting/runtime/selectedTreeMaterializeErrorClassification';

describe('classifySelectedTreeMaterializeError', () => {
  it('classifies the Win32 "Filename too long" spelling as a long-path diagnostic', () => {
    const classification = classifySelectedTreeMaterializeError(
      new Error('error: unable to create file deep/path: Filename too long')
    );
    expect(classification.diagnosticReason).toBe(SELECTED_TREE_MATERIALIZE_LONG_PATH_DIAGNOSTIC);
    expect(classification.diagnosticNotes).toHaveLength(2);
    expect(classification.diagnosticNotes?.[0]).toContain('MAX_PATH');
  });

  it('classifies the POSIX "File name too long" spelling as a long-path diagnostic', () => {
    const classification = classifySelectedTreeMaterializeError(
      new Error('checkout-index: File name too long')
    );
    expect(classification.diagnosticReason).toBe(SELECTED_TREE_MATERIALIZE_LONG_PATH_DIAGNOSTIC);
  });

  it('accepts a non-Error value coerced to a string', () => {
    expect(classifySelectedTreeMaterializeError('Filename too long').diagnosticReason).toBe(
      SELECTED_TREE_MATERIALIZE_LONG_PATH_DIAGNOSTIC
    );
  });

  it('returns an empty classification for an unrecognized error', () => {
    expect(classifySelectedTreeMaterializeError(new Error('permission denied'))).toEqual({});
  });

  it('returns an empty classification for null/undefined', () => {
    expect(classifySelectedTreeMaterializeError(undefined)).toEqual({});
    expect(classifySelectedTreeMaterializeError(null)).toEqual({});
  });
});
