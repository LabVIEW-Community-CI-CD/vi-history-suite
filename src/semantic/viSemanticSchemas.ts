/**
 * The open VI semantic-diff standard: machine-readable JSON Schemas (Draft-07)
 * for the versioned semantic models this package emits, plus a dependency-free
 * validator. This makes the models a discoverable, validatable, interoperable
 * contract that other tools and agents can rely on.
 *
 * Schema $id strings are hardcoded (not imported from the model modules) so this
 * stays a pure, dependency-free leaf that the MCP handler can import without
 * pulling in the reporting/git runtime. Tests assert the $id values match the
 * canonical schema constants, guarding drift.
 */

export const VI_SEMANTIC_COMPARISON_SCHEMA_ID = 'vi-history-suite/vi-semantic-comparison@v1';
export const VI_SEMANTIC_HISTORY_SCHEMA_ID = 'vi-history-suite/vi-semantic-history@v1';
export const VI_REPOSITORY_INDEX_SCHEMA_ID = 'vi-history-suite/vi-repository-index@v1';
export const VI_PREVIEW_COMPARISON_CORRELATION_SCHEMA_ID =
  'vi-history-suite/vi-preview-comparison-correlation@v1';
export const VI_PREVIEW_COMPARISON_CORRELATIONS_SCHEMA_ID =
  'vi-history-suite/vi-preview-comparison-correlations@v1';
export const VI_PREVIEW_REGION_CORRELATION_SCHEMA_ID =
  'vi-history-suite/vi-preview-region-correlation@v2';
export const VI_PREVIEW_REGION_CORRELATIONS_SCHEMA_ID =
  'vi-history-suite/vi-preview-region-correlations@v2';
export const VI_LATENT_CORPUS_SAMPLE_SCHEMA_ID =
  'vi-history-suite/vi-latent-corpus-sample@v1';

const DRAFT_07 = 'http://json-schema.org/draft-07/schema#';

const CHANGE_SURFACE_ENUM = [
  'front-panel',
  'block-diagram',
  'connector-pane',
  'vi-attributes',
  'other'
];

// Semantic Diff Intelligence (VHS-REQ-702) enums. Additive to @v1.
const CHANGE_KIND_ENUM = [
  'structural',
  'behavioral',
  'interface',
  'dependency',
  'cosmetic',
  'unknown'
];

const RISK_LEVEL_ENUM = ['low', 'medium', 'high'];

const CLASSIFICATION_CONFIDENCE_ENUM = ['high', 'low'];

// Preview render reference (VHS-REQ-703 correlation). Inlined (not $ref) because
// the offline subset validator does not resolve $ref/$defs.
const PREVIEW_REFERENCE_SCHEMA = {
  type: 'object',
  required: ['available'],
  properties: {
    available: { type: 'boolean' },
    relativePath: { type: 'string' },
    revision: { type: 'string' },
    cacheKey: { type: 'string' },
    inlineImageCount: { type: 'integer' }
  }
} as const;

const STRING_ARRAY = { type: 'array', items: { type: 'string' } } as const;

// Per-item detail geometry (VHS-REQ-703.10). Additive/optional to @v1. Inlined
// (not $ref) because the offline subset validator does not resolve $ref/$defs.
const DETAIL_CHANGE_TYPE_ENUM = [
  'added',
  'deleted',
  'moved',
  'changed',
  'resized',
  'other'
];

const DIAGRAM_POINT_SCHEMA = {
  type: 'object',
  required: ['x', 'y'],
  properties: {
    x: { type: 'integer' },
    y: { type: 'integer' }
  }
} as const;

const DETAIL_ITEM_GEOMETRY_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    required: ['text', 'changeType'],
    properties: {
      text: { type: 'string' },
      changeType: { type: 'string', enum: DETAIL_CHANGE_TYPE_ENUM },
      objectKind: { type: 'string' },
      objectName: { type: 'string' },
      coordinate: DIAGRAM_POINT_SCHEMA,
      fromCoordinate: DIAGRAM_POINT_SCHEMA
    }
  }
} as const;

export const VI_SEMANTIC_COMPARISON_JSON_SCHEMA = {
  $schema: DRAFT_07,
  $id: VI_SEMANTIC_COMPARISON_SCHEMA_ID,
  title: 'VI semantic comparison',
  description: 'Projection of a LabVIEW VI comparison report onto the semantic model.',
  type: 'object',
  required: [
    'schema',
    'vi',
    'hasDifferences',
    'changedSurfaces',
    'attributes',
    'overviewSections',
    'detailSections',
    'totals',
    'narrative'
  ],
  properties: {
    schema: { const: VI_SEMANTIC_COMPARISON_SCHEMA_ID },
    vi: {
      type: 'object',
      required: ['title'],
      properties: {
        title: { type: 'string' },
        firstViPath: { type: 'string' },
        secondViPath: { type: 'string' }
      }
    },
    revisions: {
      type: 'object',
      properties: { baseHash: { type: 'string' }, selectedHash: { type: 'string' } }
    },
    runtime: {
      type: 'object',
      properties: {
        provider: { type: 'string' },
        engine: { type: 'string' },
        labviewVersion: { type: 'string' },
        bitness: { type: 'string' }
      }
    },
    hasDifferences: { type: 'boolean' },
    changedSurfaces: { type: 'array', items: { type: 'string', enum: CHANGE_SURFACE_ENUM } },
    attributes: {
      type: 'object',
      required: ['included', 'excluded'],
      properties: { included: STRING_ARRAY, excluded: STRING_ARRAY }
    },
    overviewSections: {
      type: 'array',
      items: {
        type: 'object',
        required: ['surface', 'caption', 'imageCount'],
        properties: {
          surface: { type: 'string', enum: CHANGE_SURFACE_ENUM },
          caption: { type: 'string' },
          imageCount: { type: 'integer' }
        }
      }
    },
    detailSections: {
      type: 'array',
      items: {
        type: 'object',
        required: ['surface', 'heading', 'items', 'itemCount'],
        properties: {
          surface: { type: 'string', enum: CHANGE_SURFACE_ENUM },
          heading: { type: 'string' },
          items: STRING_ARRAY,
          itemCount: { type: 'integer' },
          itemGeometry: DETAIL_ITEM_GEOMETRY_SCHEMA
        }
      }
    },
    totals: {
      type: 'object',
      required: [
        'changedSurfaceCount',
        'overviewImageCount',
        'detailSectionCount',
        'detailItemCount',
        'includedAttributeCount',
        'excludedAttributeCount'
      ],
      properties: {
        changedSurfaceCount: { type: 'integer' },
        overviewImageCount: { type: 'integer' },
        detailSectionCount: { type: 'integer' },
        detailItemCount: { type: 'integer' },
        includedAttributeCount: { type: 'integer' },
        excludedAttributeCount: { type: 'integer' }
      }
    },
    // Semantic Diff Intelligence (VHS-REQ-702): additive OPTIONAL classification
    // fields. Not in `required` so @v1 consumers and cached documents predating
    // the enrichment stay valid. Heuristic over NI detail text + attribute flags.
    classification: {
      type: 'array',
      items: {
        type: 'object',
        required: ['surface', 'kind', 'text'],
        properties: {
          surface: { type: 'string', enum: CHANGE_SURFACE_ENUM },
          kind: { type: 'string', enum: CHANGE_KIND_ENUM },
          text: { type: 'string' }
        }
      }
    },
    changeKinds: { type: 'array', items: { type: 'string', enum: CHANGE_KIND_ENUM } },
    riskLevel: { type: 'string', enum: RISK_LEVEL_ENUM },
    riskRationale: { type: 'string' },
    classificationConfidence: { type: 'string', enum: CLASSIFICATION_CONFIDENCE_ENUM },
    narrative: { type: 'string' }
  }
} as const;

export const VI_SEMANTIC_HISTORY_JSON_SCHEMA = {
  $schema: DRAFT_07,
  $id: VI_SEMANTIC_HISTORY_SCHEMA_ID,
  title: 'VI semantic history',
  description: 'Semantic evolution timeline of a VI across its Git revisions.',
  type: 'object',
  required: [
    'schema',
    'vi',
    'repositoryRoot',
    'revisionCount',
    'comparedStepCount',
    'steps',
    'totals',
    'narrative'
  ],
  properties: {
    schema: { const: VI_SEMANTIC_HISTORY_SCHEMA_ID },
    vi: {
      type: 'object',
      required: ['relativePath'],
      properties: { relativePath: { type: 'string' }, title: { type: 'string' } }
    },
    repositoryRoot: { type: 'string' },
    revisionCount: { type: 'integer' },
    comparedStepCount: { type: 'integer' },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        required: [
          'baseHash',
          'selectedHash',
          'authorDate',
          'authorName',
          'subject',
          'status',
          'hasDifferences',
          'changedSurfaces',
          'narrative'
        ],
        properties: {
          baseHash: { type: 'string' },
          selectedHash: { type: 'string' },
          authorDate: { type: 'string' },
          authorName: { type: 'string' },
          subject: { type: 'string' },
          status: {
            type: 'string',
            enum: ['completed', 'blocked-selection', 'blocked-preflight', 'blocked-runtime', 'failed']
          },
          hasDifferences: { type: 'boolean' },
          changedSurfaces: { type: 'array', items: { type: 'string', enum: CHANGE_SURFACE_ENUM } },
          narrative: { type: 'string' },
          reason: { type: 'string' }
        }
      }
    },
    totals: {
      type: 'object',
      required: [
        'changingStepCount',
        'frontPanelChangeCount',
        'blockDiagramChangeCount',
        'connectorPaneChangeCount',
        'viAttributeChangeCount',
        'blockedOrFailedStepCount'
      ],
      properties: {
        changingStepCount: { type: 'integer' },
        frontPanelChangeCount: { type: 'integer' },
        blockDiagramChangeCount: { type: 'integer' },
        connectorPaneChangeCount: { type: 'integer' },
        viAttributeChangeCount: { type: 'integer' },
        blockedOrFailedStepCount: { type: 'integer' }
      }
    },
    narrative: { type: 'string' }
  }
} as const;

export const VI_REPOSITORY_INDEX_JSON_SCHEMA = {
  $schema: DRAFT_07,
  $id: VI_REPOSITORY_INDEX_SCHEMA_ID,
  title: 'VI repository index',
  description: "Survey of a repository's tracked VIs with revision activity and latest change.",
  type: 'object',
  required: ['schema', 'repositoryRoot', 'viCount', 'indexedCount', 'vis', 'narrative'],
  properties: {
    schema: { const: VI_REPOSITORY_INDEX_SCHEMA_ID },
    repositoryRoot: { type: 'string' },
    viCount: { type: 'integer' },
    indexedCount: { type: 'integer' },
    vis: {
      type: 'array',
      items: {
        type: 'object',
        required: ['relativePath', 'revisionCount'],
        properties: {
          relativePath: { type: 'string' },
          revisionCount: { type: 'integer' },
          latestCommit: {
            type: 'object',
            required: ['hash', 'authorDate', 'authorName', 'subject'],
            properties: {
              hash: { type: 'string' },
              authorDate: { type: 'string' },
              authorName: { type: 'string' },
              subject: { type: 'string' }
            }
          }
        }
      }
    },
    narrative: { type: 'string' }
  }
} as const;

export const VI_PREVIEW_COMPARISON_CORRELATION_JSON_SCHEMA = {
  $schema: DRAFT_07,
  $id: VI_PREVIEW_COMPARISON_CORRELATION_SCHEMA_ID,
  title: 'VI preview-comparison correlation',
  description:
    'Deterministic surface-level correlation between a VI semantic comparison and its base/head preview renders.',
  type: 'object',
  required: ['schema', 'vi', 'hasDifferences', 'previews', 'surfaces', 'totals', 'narrative'],
  properties: {
    schema: { const: VI_PREVIEW_COMPARISON_CORRELATION_SCHEMA_ID },
    vi: {
      type: 'object',
      required: ['title'],
      properties: { title: { type: 'string' }, relativePath: { type: 'string' } }
    },
    hasDifferences: { type: 'boolean' },
    riskLevel: { type: 'string', enum: RISK_LEVEL_ENUM },
    classificationConfidence: { type: 'string', enum: CLASSIFICATION_CONFIDENCE_ENUM },
    previews: {
      type: 'object',
      required: ['base', 'head'],
      properties: {
        base: PREVIEW_REFERENCE_SCHEMA,
        head: PREVIEW_REFERENCE_SCHEMA
      }
    },
    surfaces: {
      type: 'array',
      items: {
        type: 'object',
        required: [
          'surface',
          'changeKinds',
          'changeCount',
          'sampleChanges',
          'basePreviewAvailable',
          'headPreviewAvailable',
          'correlated'
        ],
        properties: {
          surface: { type: 'string', enum: CHANGE_SURFACE_ENUM },
          changeKinds: { type: 'array', items: { type: 'string', enum: CHANGE_KIND_ENUM } },
          changeCount: { type: 'integer' },
          sampleChanges: STRING_ARRAY,
          basePreviewAvailable: { type: 'boolean' },
          headPreviewAvailable: { type: 'boolean' },
          correlated: { type: 'boolean' },
          coordinateChanges: {
            type: 'array',
            maxItems: 25,
            items: {
              type: 'object',
              required: ['text', 'changeType'],
              properties: {
                text: { type: 'string' },
                changeType: { type: 'string', enum: DETAIL_CHANGE_TYPE_ENUM },
                objectKind: { type: 'string' },
                objectName: { type: 'string' },
                coordinate: DIAGRAM_POINT_SCHEMA,
                fromCoordinate: DIAGRAM_POINT_SCHEMA
              }
            }
          }
        }
      }
    },
    totals: {
      type: 'object',
      required: ['changedSurfaceCount', 'correlatedSurfaceCount', 'uncorrelatedSurfaceCount'],
      properties: {
        changedSurfaceCount: { type: 'integer' },
        correlatedSurfaceCount: { type: 'integer' },
        uncorrelatedSurfaceCount: { type: 'integer' }
      }
    },
    narrative: { type: 'string' }
  }
} as const;

// The first-class bundle of per-VI preview-comparison correlations a PR review
// emits (VHS-REQ-703.13). Each entry's `correlation` is itself a
// vi-preview-comparison-correlation@v1 document; it is typed as an object here
// (not inlined/`$ref`ed) because the offline subset validator does not resolve
// `$ref` — an agent can validate each correlation separately against its schema.
export const VI_PREVIEW_COMPARISON_CORRELATIONS_JSON_SCHEMA = {
  $schema: DRAFT_07,
  $id: VI_PREVIEW_COMPARISON_CORRELATIONS_SCHEMA_ID,
  title: 'VI preview-comparison correlations',
  description:
    'First-class bundle of per-VI preview-comparison correlations produced by a VI semantic PR review.',
  type: 'object',
  required: [
    'schema',
    'repositoryRoot',
    'baseHash',
    'selectedHash',
    'correlatedViCount',
    'entries'
  ],
  properties: {
    schema: { const: VI_PREVIEW_COMPARISON_CORRELATIONS_SCHEMA_ID },
    repositoryRoot: { type: 'string' },
    baseHash: { type: 'string' },
    selectedHash: { type: 'string' },
    // The bundle is only emitted when at least one VI carries a correlation
    // (buildViPreviewComparisonCorrelationsArtifact returns undefined otherwise),
    // so the published contract requires a non-empty bundle. The offline subset
    // validator ignores minItems/minimum (like maxItems above); external
    // Draft-07 consumers honor them.
    correlatedViCount: { type: 'integer', minimum: 1 },
    entries: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['relativePath', 'correlation'],
        properties: {
          relativePath: { type: 'string' },
          correlation: {
            type: 'object',
            required: ['schema'],
            properties: {
              // Lock the embedded document type to the correlation schema so a
              // non-correlation payload cannot validate; the rest stays open for
              // forward compatibility (validate a correlation fully against its
              // own schema separately).
              schema: { const: VI_PREVIEW_COMPARISON_CORRELATION_SCHEMA_ID }
            }
          }
        }
      }
    }
  }
} as const;

// The pixel-region correlation (VHS-REQ-703.14): each changed object placed as a
// pixel region on the base/head preview rasters (or diagram-space-only). Inlined
// (the offline validator does not resolve $ref).
export const VI_PREVIEW_REGION_CORRELATION_JSON_SCHEMA = {
  $schema: DRAFT_07,
  $id: VI_PREVIEW_REGION_CORRELATION_SCHEMA_ID,
  title: 'VI preview-region correlation',
  description:
    'Places each changed object from a LabVIEW comparison report as a pixel region on the base/head preview rasters, or diagram-space-only when not located.',
  type: 'object',
  required: ['schema', 'entries', 'totals'],
  properties: {
    schema: { const: VI_PREVIEW_REGION_CORRELATION_SCHEMA_ID },
    entries: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'sourceIndex', 'changeType', 'regions', 'located'],
        properties: {
          id: { type: 'string' },
          // Stable occurrence key so same-named object instances stay uniquely
          // joinable to their image associations (report section/item order).
          sourceIndex: { type: 'integer', minimum: 0 },
          changeType: { type: 'string', enum: DETAIL_CHANGE_TYPE_ENUM },
          coordinate: DIAGRAM_POINT_SCHEMA,
          // Present only for moved objects: the base-side (source) diagram
          // coordinate, kept distinct from `coordinate` (the head-side point).
          fromCoordinate: DIAGRAM_POINT_SCHEMA,
          // pixelSize mirrors intrinsic PNG dimensions, so width/height are
          // positive integers (the offline validator ignores minimum; external
          // Draft-07 validators use it to reject zero/negative rasters).
          pixelSize: {
            type: 'object',
            required: ['width', 'height'],
            properties: {
              width: { type: 'integer', minimum: 1 },
              height: { type: 'integer', minimum: 1 }
            }
          },
          located: { type: 'boolean' },
          regions: {
            type: 'array',
            items: {
              type: 'object',
              required: ['side', 'left', 'top', 'width', 'height', 'confidence'],
              // Geometry is a non-negative-origin rectangle with positive area
              // and confidence in (0, 1]; matches isUsableRegion's runtime
              // contract so external validators reject nonsensical overlays.
              properties: {
                side: { type: 'string', enum: ['base', 'head'] },
                left: { type: 'integer', minimum: 0 },
                top: { type: 'integer', minimum: 0 },
                width: { type: 'integer', minimum: 1 },
                height: { type: 'integer', minimum: 1 },
                confidence: { type: 'number', exclusiveMinimum: 0, maximum: 1 }
              }
            }
          }
        }
      }
    },
    totals: {
      type: 'object',
      required: ['regionCount', 'locatedRegionCount', 'diagramOnlyRegionCount'],
      properties: {
        regionCount: { type: 'integer', minimum: 0 },
        locatedRegionCount: { type: 'integer', minimum: 0 },
        diagramOnlyRegionCount: { type: 'integer', minimum: 0 }
      }
    }
  }
} as const;

// The first-class bundle of per-VI pixel-region correlations a PR review emits
// (VHS-REQ-703.14). Each entry's `regionCorrelation` is itself a
// vi-preview-region-correlation@v2 document; typed as an object here (the offline
// validator does not resolve $ref).
export const VI_PREVIEW_REGION_CORRELATIONS_JSON_SCHEMA = {
  $schema: DRAFT_07,
  $id: VI_PREVIEW_REGION_CORRELATIONS_SCHEMA_ID,
  title: 'VI preview-region correlations',
  description:
    'First-class bundle of per-VI pixel-region correlations produced by a VI semantic PR review.',
  type: 'object',
  required: ['schema', 'repositoryRoot', 'baseHash', 'selectedHash', 'correlatedViCount', 'entries'],
  properties: {
    schema: { const: VI_PREVIEW_REGION_CORRELATIONS_SCHEMA_ID },
    repositoryRoot: { type: 'string' },
    baseHash: { type: 'string' },
    selectedHash: { type: 'string' },
    correlatedViCount: { type: 'integer', minimum: 1 },
    entries: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['relativePath', 'regionCorrelation'],
        properties: {
          relativePath: { type: 'string' },
          regionCorrelation: {
            type: 'object',
            required: ['schema'],
            properties: { schema: { const: VI_PREVIEW_REGION_CORRELATION_SCHEMA_ID } }
          }
        }
      }
    }
  }
} as const;

// A single labeled corpus sample (VHS-REQ-703.16): the deterministic
// region-correlation body plus the provenance that makes it reproducible from a
// named base/head revision pair (ADR-0027 closed-corpus rail). Its
// `correlation` is a vi-preview-region-correlation@v2 document; typed as an
// object here (the offline validator does not resolve $ref).
export const VI_LATENT_CORPUS_SAMPLE_JSON_SCHEMA = {
  $schema: DRAFT_07,
  $id: VI_LATENT_CORPUS_SAMPLE_SCHEMA_ID,
  title: 'VI latent-structure corpus sample',
  description:
    'A reproducible labeled corpus sample assembled from the base/head preview HTML and the LabVIEW comparison report, for the gated ML latent-structure research track (ADR-0027). Ships no model and carries no inferred label.',
  type: 'object',
  required: ['schema', 'provenance', 'artifacts', 'correlation', 'imageAssociations', 'previewImageCounts'],
  properties: {
    schema: { const: VI_LATENT_CORPUS_SAMPLE_SCHEMA_ID },
    provenance: {
      type: 'object',
      required: ['viPath', 'baseRevision', 'headRevision', 'runtime'],
      properties: {
        viPath: { type: 'string' },
        baseRevision: { type: 'string' },
        headRevision: { type: 'string' },
        runtime: {
          type: 'object',
          properties: {
            engine: { type: 'string' },
            provider: { type: 'string' },
            bitness: { type: 'string' },
            version: { type: 'string' }
          }
        }
      }
    },
    artifacts: {
      type: 'object',
      required: ['basePreviewAvailable', 'headPreviewAvailable', 'comparisonReportAvailable'],
      properties: {
        basePreviewAvailable: { type: 'boolean' },
        headPreviewAvailable: { type: 'boolean' },
        // Always true: the comparison report is what produced the model.
        comparisonReportAvailable: { const: true }
      }
    },
    correlation: {
      type: 'object',
      required: ['schema'],
      properties: { schema: { const: VI_PREVIEW_REGION_CORRELATION_SCHEMA_ID } }
    },
    imageAssociations: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'sourceIndex', 'side', 'previewImageIndex', 'contentKey'],
        properties: {
          id: { type: 'string' },
          // Occurrence key matching the correlation entry's sourceIndex.
          sourceIndex: { type: 'integer', minimum: 0 },
          side: { type: 'string', enum: ['base', 'head'] },
          previewImageIndex: { type: 'integer', minimum: 0 },
          contentKey: { type: 'string' },
          pixelSize: {
            type: 'object',
            required: ['width', 'height'],
            properties: {
              width: { type: 'integer', minimum: 1 },
              height: { type: 'integer', minimum: 1 }
            }
          }
        }
      }
    },
    previewImageCounts: {
      type: 'object',
      required: ['base', 'head'],
      properties: {
        base: { type: 'integer', minimum: 0 },
        head: { type: 'integer', minimum: 0 }
      }
    }
  }
} as const;

/** Registry of every published schema, keyed by its `$id`. */
export const VI_SEMANTIC_SCHEMAS: Record<string, unknown> = {
  [VI_SEMANTIC_COMPARISON_SCHEMA_ID]: VI_SEMANTIC_COMPARISON_JSON_SCHEMA,
  [VI_SEMANTIC_HISTORY_SCHEMA_ID]: VI_SEMANTIC_HISTORY_JSON_SCHEMA,
  [VI_REPOSITORY_INDEX_SCHEMA_ID]: VI_REPOSITORY_INDEX_JSON_SCHEMA,
  [VI_PREVIEW_COMPARISON_CORRELATION_SCHEMA_ID]: VI_PREVIEW_COMPARISON_CORRELATION_JSON_SCHEMA,
  [VI_PREVIEW_COMPARISON_CORRELATIONS_SCHEMA_ID]: VI_PREVIEW_COMPARISON_CORRELATIONS_JSON_SCHEMA,
  [VI_PREVIEW_REGION_CORRELATION_SCHEMA_ID]: VI_PREVIEW_REGION_CORRELATION_JSON_SCHEMA,
  [VI_PREVIEW_REGION_CORRELATIONS_SCHEMA_ID]: VI_PREVIEW_REGION_CORRELATIONS_JSON_SCHEMA,
  [VI_LATENT_CORPUS_SAMPLE_SCHEMA_ID]: VI_LATENT_CORPUS_SAMPLE_JSON_SCHEMA
};

export interface SchemaValidationResult {
  valid: boolean;
  errors: string[];
}

interface JsonSchemaNode {
  type?: string;
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
  items?: JsonSchemaNode;
  enum?: readonly unknown[];
  const?: unknown;
}

function matchesType(type: string, value: unknown): boolean {
  switch (type) {
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    case 'array':
      return Array.isArray(value);
    case 'string':
      return typeof value === 'string';
    case 'boolean':
      return typeof value === 'boolean';
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'number':
      return typeof value === 'number';
    default:
      return true;
  }
}

function collectErrors(schema: JsonSchemaNode, value: unknown, pathLabel: string): string[] {
  const errors: string[] = [];

  if ('const' in schema && value !== schema.const) {
    errors.push(`${pathLabel}: expected constant ${JSON.stringify(schema.const)}`);
    return errors;
  }

  if (schema.type && !matchesType(schema.type, value)) {
    errors.push(`${pathLabel}: expected type ${schema.type}`);
    return errors;
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${pathLabel}: value ${JSON.stringify(value)} is not an allowed enum member`);
  }

  if (schema.type === 'object' && matchesType('object', value)) {
    const record = value as Record<string, unknown>;
    for (const requiredKey of schema.required ?? []) {
      // Treat an explicit `undefined` value as absent (matches JSON semantics).
      if (record[requiredKey] === undefined) {
        errors.push(`${pathLabel}/${requiredKey}: required property is missing`);
      }
    }
    // Extra (undeclared) properties are permitted for forward compatibility.
    for (const [key, childSchema] of Object.entries(schema.properties ?? {})) {
      if (record[key] !== undefined) {
        errors.push(...collectErrors(childSchema, record[key], `${pathLabel}/${key}`));
      }
    }
  }

  if (schema.type === 'array' && Array.isArray(value) && schema.items) {
    value.forEach((item, index) => {
      errors.push(...collectErrors(schema.items as JsonSchemaNode, item, `${pathLabel}[${index}]`));
    });
  }

  return errors;
}

/**
 * Validates a value against one of the published JSON Schemas (a bounded
 * Draft-07 subset: type, properties, required, items, enum, const). Undeclared
 * properties are allowed so the standard can evolve forward-compatibly.
 */
export function validateAgainstJsonSchema(schema: unknown, value: unknown): SchemaValidationResult {
  const errors = collectErrors(schema as JsonSchemaNode, value, '$');
  return { valid: errors.length === 0, errors };
}

/**
 * Validates a self-describing semantic document by looking up the schema named
 * in its own `schema` field.
 */
export function validateViSemanticDocument(document: unknown): SchemaValidationResult {
  if (typeof document !== 'object' || document === null) {
    return { valid: false, errors: ['$: document must be an object'] };
  }
  const schemaId = (document as Record<string, unknown>).schema;
  if (typeof schemaId !== 'string') {
    return { valid: false, errors: ['$/schema: a string schema identifier is required'] };
  }
  const schema = VI_SEMANTIC_SCHEMAS[schemaId];
  if (!schema) {
    return { valid: false, errors: [`$/schema: unknown schema identifier ${JSON.stringify(schemaId)}`] };
  }
  return validateAgainstJsonSchema(schema, document);
}
