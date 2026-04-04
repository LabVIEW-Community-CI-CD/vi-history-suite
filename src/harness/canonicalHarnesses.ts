export interface CanonicalHarnessDefinition {
  id: string;
  repositoryUrl: string;
  cloneDirectoryName: string;
  targetRelativePath: string;
  description: string;
}

export const HARNESS_VHS_001: CanonicalHarnessDefinition = {
  id: 'HARNESS-VHS-001',
  repositoryUrl: 'https://github.com/ni/labview-icon-editor.git',
  cloneDirectoryName: 'ni-labview-icon-editor',
  targetRelativePath: 'Tooling/deployment/VIP_Pre-Install Custom Action.vi',
  description:
    'Canonical real-history harness for content-detected VI history against ni/labview-icon-editor.'
};

export const HARNESS_VHS_002: CanonicalHarnessDefinition = {
  id: 'HARNESS-VHS-002',
  repositoryUrl: 'https://github.com/ni/labview-icon-editor.git',
  cloneDirectoryName: 'ni-labview-icon-editor',
  targetRelativePath: 'resource/plugins/lv_icon.vi',
  description:
    'Canonical high-history benchmark harness for lv_icon.vi against ni/labview-icon-editor.'
};

const HARNESSES = new Map<string, CanonicalHarnessDefinition>([
  [HARNESS_VHS_001.id, HARNESS_VHS_001],
  [HARNESS_VHS_002.id, HARNESS_VHS_002]
]);

export function getCanonicalHarnessDefinition(id: string): CanonicalHarnessDefinition {
  const definition = HARNESSES.get(id);
  if (!definition) {
    throw new Error(`Unknown harness id: ${id}`);
  }
  return definition;
}
