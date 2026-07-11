import { describe, expect, it } from 'vitest';

import { VI_REPOSITORY_INDEX_SCHEMA } from '../../src/semantic/viRepositoryIndex';
import { VI_SEMANTIC_HISTORY_SCHEMA } from '../../src/semantic/viSemanticHistory';
import {
  buildViSemanticComparisonModelFromHtml,
  VI_SEMANTIC_COMPARISON_SCHEMA
} from '../../src/semantic/viSemanticModel';
import {
  validateAgainstJsonSchema,
  validateViSemanticDocument,
  VI_REPOSITORY_INDEX_SCHEMA_ID,
  VI_SEMANTIC_COMPARISON_SCHEMA_ID,
  VI_SEMANTIC_HISTORY_SCHEMA_ID,
  VI_SEMANTIC_SCHEMAS
} from '../../src/semantic/viSemanticSchemas';

describe('viSemanticSchemas registry', () => {
  it('publishes schema ids that match the canonical model constants', () => {
    expect(VI_SEMANTIC_COMPARISON_SCHEMA_ID).toBe(VI_SEMANTIC_COMPARISON_SCHEMA);
    expect(VI_SEMANTIC_HISTORY_SCHEMA_ID).toBe(VI_SEMANTIC_HISTORY_SCHEMA);
    expect(VI_REPOSITORY_INDEX_SCHEMA_ID).toBe(VI_REPOSITORY_INDEX_SCHEMA);
    expect(Object.keys(VI_SEMANTIC_SCHEMAS).sort()).toEqual(
      [
        VI_SEMANTIC_COMPARISON_SCHEMA_ID,
        VI_SEMANTIC_HISTORY_SCHEMA_ID,
        VI_REPOSITORY_INDEX_SCHEMA_ID
      ].sort()
    );
  });
});

describe('validateAgainstJsonSchema', () => {
  const schema = {
    type: 'object',
    required: ['a', 'b'],
    properties: {
      a: { type: 'string' },
      b: { type: 'integer' },
      c: { type: 'string', enum: ['x', 'y'] },
      d: {
        type: 'array',
        items: { type: 'object', required: ['n'], properties: { n: { type: 'number' } } }
      }
    }
  };

  it('accepts a conforming object', () => {
    expect(validateAgainstJsonSchema(schema, { a: 's', b: 1, c: 'x', d: [{ n: 2 }] })).toEqual({
      valid: true,
      errors: []
    });
  });

  it('reports precise, path-qualified errors', () => {
    const result = validateAgainstJsonSchema(schema, { a: 5, c: 'z', d: [{ n: 'no' }] });
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes('/b') && error.includes('missing'))).toBe(true);
    expect(result.errors.some((error) => error.includes('/a') && error.includes('string'))).toBe(true);
    expect(result.errors.some((error) => error.includes('/c') && error.includes('enum'))).toBe(true);
    expect(result.errors.some((error) => error.includes('/d[0]/n'))).toBe(true);
  });

  it('allows undeclared properties for forward compatibility', () => {
    const openSchema = { type: 'object', properties: { a: { type: 'string' } } };
    expect(validateAgainstJsonSchema(openSchema, { a: 's', extra: 1 }).valid).toBe(true);
  });

  it('treats an explicit undefined optional value as absent', () => {
    const optionalSchema = {
      type: 'object',
      required: ['a'],
      properties: { a: { type: 'string' }, b: { type: 'object' } }
    };
    expect(validateAgainstJsonSchema(optionalSchema, { a: 's', b: undefined }).valid).toBe(true);
  });

  it('enforces const', () => {
    const constSchema = { type: 'object', properties: { schema: { const: 'x@v1' } } };
    expect(validateAgainstJsonSchema(constSchema, { schema: 'x@v1' }).valid).toBe(true);
    expect(validateAgainstJsonSchema(constSchema, { schema: 'y@v2' }).valid).toBe(false);
  });
});

describe('validateViSemanticDocument', () => {
  it('validates a real comparison model against its published schema', () => {
    const model = buildViSemanticComparisonModelFromHtml(
      `<h1 class="report-title">R</h1>
       <h2 class="section-header">Detailed Information</h2>
       <details><summary class="difference-heading">1. Front Panel - Control</summary>
         <ol><li class="diff-detail">Caption changed</li></ol></details>`,
      { revisions: { baseHash: 'a', selectedHash: 'b' } }
    );
    expect(validateViSemanticDocument(model)).toEqual({ valid: true, errors: [] });
  });

  it('validates a history document', () => {
    const history = {
      schema: VI_SEMANTIC_HISTORY_SCHEMA_ID,
      vi: { relativePath: 'a.vi' },
      repositoryRoot: '/r',
      revisionCount: 1,
      comparedStepCount: 0,
      steps: [],
      totals: {
        changingStepCount: 0,
        frontPanelChangeCount: 0,
        blockDiagramChangeCount: 0,
        connectorPaneChangeCount: 0,
        viAttributeChangeCount: 0,
        blockedOrFailedStepCount: 0
      },
      narrative: 'x'
    };
    expect(validateViSemanticDocument(history).valid).toBe(true);
  });

  it('validates a repository index document', () => {
    const index = {
      schema: VI_REPOSITORY_INDEX_SCHEMA_ID,
      repositoryRoot: '/r',
      viCount: 1,
      indexedCount: 1,
      vis: [
        {
          relativePath: 'a.vi',
          revisionCount: 2,
          latestCommit: { hash: 'h', authorDate: 'd', authorName: 'n', subject: 's' }
        }
      ],
      narrative: 'x'
    };
    expect(validateViSemanticDocument(index).valid).toBe(true);
  });

  it('rejects a document whose required field has the wrong type', () => {
    const result = validateViSemanticDocument({
      schema: VI_REPOSITORY_INDEX_SCHEMA_ID,
      repositoryRoot: '/r',
      viCount: 'not-a-number',
      indexedCount: 1,
      vis: [],
      narrative: 'x'
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes('/viCount'))).toBe(true);
  });

  it('rejects an unknown or missing schema identifier', () => {
    expect(validateViSemanticDocument({ schema: 'nope@v9' }).valid).toBe(false);
    expect(validateViSemanticDocument({}).errors[0]).toContain('schema identifier is required');
    expect(validateViSemanticDocument(null).valid).toBe(false);
  });
});
