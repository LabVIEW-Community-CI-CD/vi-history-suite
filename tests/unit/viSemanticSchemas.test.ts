// Requirement coverage: VHS-REQ-662 (VI semantic comparison model and agent MCP
// surface). Verifies the open Draft-07 JSON-Schema standard and the offline
// subset validator (VHS-REQ-662.2).
import { describe, expect, it } from 'vitest';

import { VI_REPOSITORY_INDEX_SCHEMA } from '../../src/semantic/viRepositoryIndex';
import { VI_SEMANTIC_HISTORY_SCHEMA } from '../../src/semantic/viSemanticHistory';
import { VI_PREVIEW_COMPARISON_CORRELATION_SCHEMA } from '../../src/semantic/viPreviewComparisonCorrelation';
import {
  buildViSemanticComparisonModelFromHtml,
  VI_SEMANTIC_COMPARISON_SCHEMA
} from '../../src/semantic/viSemanticModel';
import {
  validateAgainstJsonSchema,
  validateViSemanticDocument,
  VI_PREVIEW_COMPARISON_CORRELATION_SCHEMA_ID,
  VI_PREVIEW_COMPARISON_CORRELATIONS_SCHEMA_ID,
  VI_PREVIEW_REGION_CORRELATION_SCHEMA_ID,
  VI_PREVIEW_REGION_CORRELATIONS_SCHEMA_ID,
  VI_LATENT_CORPUS_SAMPLE_SCHEMA_ID,
  VI_REPOSITORY_INDEX_SCHEMA_ID,
  VI_SEMANTIC_COMPARISON_JSON_SCHEMA,
  VI_SEMANTIC_COMPARISON_SCHEMA_ID,
  VI_SEMANTIC_HISTORY_SCHEMA_ID,
  VI_SEMANTIC_SCHEMAS
} from '../../src/semantic/viSemanticSchemas';

describe('viSemanticSchemas registry', () => {
  it('publishes schema ids that match the canonical model constants', () => {
    expect(VI_SEMANTIC_COMPARISON_SCHEMA_ID).toBe(VI_SEMANTIC_COMPARISON_SCHEMA);
    expect(VI_SEMANTIC_HISTORY_SCHEMA_ID).toBe(VI_SEMANTIC_HISTORY_SCHEMA);
    expect(VI_REPOSITORY_INDEX_SCHEMA_ID).toBe(VI_REPOSITORY_INDEX_SCHEMA);
    expect(VI_PREVIEW_COMPARISON_CORRELATION_SCHEMA_ID).toBe(VI_PREVIEW_COMPARISON_CORRELATION_SCHEMA);
    expect(Object.keys(VI_SEMANTIC_SCHEMAS).sort()).toEqual(
      [
        VI_SEMANTIC_COMPARISON_SCHEMA_ID,
        VI_SEMANTIC_HISTORY_SCHEMA_ID,
        VI_REPOSITORY_INDEX_SCHEMA_ID,
        VI_PREVIEW_COMPARISON_CORRELATION_SCHEMA_ID,
        VI_PREVIEW_COMPARISON_CORRELATIONS_SCHEMA_ID,
        VI_PREVIEW_REGION_CORRELATION_SCHEMA_ID,
        VI_PREVIEW_REGION_CORRELATIONS_SCHEMA_ID,
        VI_LATENT_CORPUS_SAMPLE_SCHEMA_ID
      ].sort()
    );
  });

  it('validates a preview-comparison correlations bundle against its published schema (VHS-REQ-703.13)', () => {
    const bundle = {
      schema: VI_PREVIEW_COMPARISON_CORRELATIONS_SCHEMA_ID,
      repositoryRoot: '/repo',
      baseHash: 'a',
      selectedHash: 'b',
      correlatedViCount: 1,
      entries: [
        { relativePath: 'src/A.vi', correlation: { schema: VI_PREVIEW_COMPARISON_CORRELATION_SCHEMA } }
      ]
    };
    expect(validateViSemanticDocument(bundle)).toEqual({ valid: true, errors: [] });
  });

  it('rejects a correlations bundle whose entry is not a correlation document (VHS-REQ-703.13)', () => {
    const bundle = {
      schema: VI_PREVIEW_COMPARISON_CORRELATIONS_SCHEMA_ID,
      repositoryRoot: '/repo',
      baseHash: 'a',
      selectedHash: 'b',
      correlatedViCount: 1,
      entries: [{ relativePath: 'src/A.vi', correlation: { schema: 'not-a-correlation@v1' } }]
    };
    expect(validateViSemanticDocument(bundle).valid).toBe(false);
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

  it('keeps VHS-REQ-702 classification fields additive/optional on @v1', () => {
    // The comparison schema must NOT require the new fields, so pre-enrichment
    // documents (and @v1 consumers) stay valid.
    const required = (VI_SEMANTIC_COMPARISON_JSON_SCHEMA as { required: string[] }).required;
    for (const field of ['classification', 'changeKinds', 'riskLevel', 'riskRationale', 'classificationConfidence']) {
      expect(required).not.toContain(field);
    }
    // A model carrying the classification fields still validates...
    const enriched = buildViSemanticComparisonModelFromHtml(
      `<h1 class="report-title">R</h1>
       <ul><li class="checked">Block Diagram Functional</li></ul>
       <h2 class="section-header">Detailed Information</h2>
       <details><summary class="difference-heading">3. Block Diagram objects</summary>
         <ol><li class="diff-detail">wiring changes</li></ol></details>`,
      {}
    );
    expect(enriched.riskLevel).toBe('high');
    expect(validateViSemanticDocument(enriched)).toEqual({ valid: true, errors: [] });
    // ...and a legacy document WITHOUT them is still valid.
    const legacy = { ...enriched } as Record<string, unknown>;
    delete legacy.classification;
    delete legacy.changeKinds;
    delete legacy.riskLevel;
    delete legacy.riskRationale;
    delete legacy.classificationConfidence;
    expect(validateViSemanticDocument(legacy).valid).toBe(true);
  });

  it('documents the additive per-item detail geometry field on the schema (VHS-REQ-703.10)', () => {
    // The schema must describe itemGeometry (so consumers can discover it) but
    // must NOT require it on a detail section (additive/optional to @v1).
    const detailSection = (
      VI_SEMANTIC_COMPARISON_JSON_SCHEMA as {
        properties: { detailSections: { items: { required: string[]; properties: Record<string, unknown> } } };
      }
    ).properties.detailSections.items;
    expect(detailSection.required).not.toContain('itemGeometry');
    expect(detailSection.properties.itemGeometry).toBeDefined();

    // A model whose detail geometry carries a diagram coordinate still validates.
    const model = buildViSemanticComparisonModelFromHtml(
      `<h1 class="report-title">R</h1>
       <h2 class="section-header">Detailed Information</h2>
       <details><summary class="difference-heading">3. Block Diagram objects</summary>
         <ol><li class="diff-detail">SubVI "X.vi" - added at (1570,358)</li></ol></details>`,
      {}
    );
    expect(model.detailSections[0].itemGeometry?.[0].coordinate).toEqual({ x: 1570, y: 358 });
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
