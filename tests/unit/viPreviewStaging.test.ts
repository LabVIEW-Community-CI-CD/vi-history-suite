import { describe, expect, it } from 'vitest';

import {
  isLabviewSourceFile,
  planViPreviewStaging,
  planViPreviewStagingWithProjectRoot,
  selectViPreviewStagingRoot
} from '../../src/reporting/viPreview/viPreviewStaging';

describe('isLabviewSourceFile', () => {
  it('accepts LabVIEW source/library extensions case-insensitively (VHS-REQ-659.10)', () => {
    for (const name of ['Foo.vi', 'Ctrl.ctl', 'Tmpl.vit', 'Mal.vim', 'A.lvlib', 'B.lvclass', 'p.lvproj', 'old.LLB']) {
      expect(isLabviewSourceFile(name)).toBe(true);
    }
  });

  it('rejects non-LabVIEW files', () => {
    for (const name of ['readme.txt', 'image.png', 'data.csv', 'notes.md']) {
      expect(isLabviewSourceFile(name)).toBe(false);
    }
  });
});

describe('planViPreviewStaging', () => {
  it('stages only the VI when there are no LabVIEW-source siblings', () => {
    const plan = planViPreviewStaging('Foo.vi', [
      { relativePath: 'Foo.vi', sizeBytes: 10 },
      { relativePath: 'readme.txt', sizeBytes: 5 }
    ]);
    expect(plan.strategy).toBe('single-file');
    expect(plan.reason).toBe('no-siblings');
    expect(plan.filesToStage).toEqual(['Foo.vi']);
  });

  it('stages the VI plus sibling source files as a dependency tree (VHS-REQ-659.10)', () => {
    const plan = planViPreviewStaging('Foo.vi', [
      { relativePath: 'Foo.vi', sizeBytes: 10 },
      { relativePath: 'support/Sub.vi', sizeBytes: 20 },
      { relativePath: 'Types.ctl', sizeBytes: 8 },
      { relativePath: 'notes.txt', sizeBytes: 5 }
    ]);
    expect(plan.strategy).toBe('dependency-tree');
    expect(plan.viRelativePath).toBe('Foo.vi');
    expect(plan.filesToStage).toEqual(['Foo.vi', 'support/Sub.vi', 'Types.ctl']);
    expect(plan.filesToStage).not.toContain('notes.txt');
  });

  it('includes the VI even when the enumeration omitted it, and normalizes separators', () => {
    const plan = planViPreviewStaging('Foo.vi', [
      { relativePath: 'support\\Sub.vi', sizeBytes: 20 }
    ]);
    expect(plan.strategy).toBe('dependency-tree');
    expect(plan.filesToStage).toEqual(['Foo.vi', 'support/Sub.vi']);
  });

  it('falls back to single-file when the tree exceeds the file-count guard', () => {
    const entries = Array.from({ length: 5 }, (_, index) => ({
      relativePath: `V${index}.vi`,
      sizeBytes: 1
    }));
    const plan = planViPreviewStaging('V0.vi', entries, { maxFiles: 3, maxTotalBytes: 1_000_000 });
    expect(plan.strategy).toBe('single-file');
    expect(plan.reason).toBe('too-many-files');
    expect(plan.filesToStage).toEqual(['V0.vi']);
  });

  it('falls back to single-file when the tree exceeds the size guard', () => {
    const plan = planViPreviewStaging(
      'Foo.vi',
      [
        { relativePath: 'Foo.vi', sizeBytes: 10 },
        { relativePath: 'Big.vi', sizeBytes: 10_000 }
      ],
      { maxFiles: 100, maxTotalBytes: 5_000 }
    );
    expect(plan.strategy).toBe('single-file');
    expect(plan.reason).toBe('too-large');
  });
});

describe('selectViPreviewStagingRoot', () => {
  it('returns the VI containing directory when there is no enclosing project', () => {
    expect(
      selectViPreviewStagingRoot('subsys/Main.vi', ['subsys/Main.vi', 'shared/Helper.vi'])
    ).toBe('subsys');
  });

  it('widens to the base when a project sits at the base', () => {
    expect(
      selectViPreviewStagingRoot('subsys/Main.vi', ['App.lvproj', 'subsys/Main.vi', 'shared/Helper.vi'])
    ).toBe('');
  });

  it('prefers the deepest enclosing project when projects nest', () => {
    expect(
      selectViPreviewStagingRoot('a/b/c/Main.vi', ['a/App.lvproj', 'a/b/Inner.lvproj', 'a/b/c/Main.vi'])
    ).toBe('a/b');
  });

  it('ignores projects that are not ancestors of the VI', () => {
    expect(
      selectViPreviewStagingRoot('a/b/Main.vi', ['x/Other.lvproj', 'a/b/Main.vi'])
    ).toBe('a/b');
  });
});

describe('planViPreviewStagingWithProjectRoot', () => {
  it('widens to the enclosing project so cross-directory dependencies stage (VHS-REQ-659.10)', () => {
    const selection = planViPreviewStagingWithProjectRoot('subsys/Main.vi', [
      { relativePath: 'App.lvproj', sizeBytes: 10 },
      { relativePath: 'subsys/Main.vi', sizeBytes: 10 },
      { relativePath: 'shared/Helper.vi', sizeBytes: 10 }
    ]);
    expect(selection.stagingRoot).toBe('');
    expect(selection.rootKind).toBe('project');
    expect(selection.plan.strategy).toBe('dependency-tree');
    expect(selection.plan.viRelativePath).toBe('subsys/Main.vi');
    expect(selection.plan.filesToStage).toContain('shared/Helper.vi');
    expect(selection.plan.filesToStage).toContain('subsys/Main.vi');
  });

  it('keeps the containing-directory behavior when there is no project', () => {
    const selection = planViPreviewStagingWithProjectRoot('Main.vi', [
      { relativePath: 'Main.vi', sizeBytes: 10 },
      { relativePath: 'Sub.vi', sizeBytes: 10 }
    ]);
    expect(selection.stagingRoot).toBe('');
    expect(selection.rootKind).toBe('directory');
    expect(selection.plan.strategy).toBe('dependency-tree');
    expect(selection.plan.filesToStage).toEqual(['Main.vi', 'Sub.vi']);
  });

  it('falls back to the VI directory tree when the project tree trips the guard (VHS-REQ-659.10)', () => {
    const selection = planViPreviewStagingWithProjectRoot(
      'subsys/Main.vi',
      [
        { relativePath: 'App.lvproj', sizeBytes: 1 },
        { relativePath: 'subsys/Main.vi', sizeBytes: 1 },
        { relativePath: 'subsys/Helper.vi', sizeBytes: 1 },
        { relativePath: 'other/Unrelated.vi', sizeBytes: 1 }
      ],
      { maxFiles: 2, maxTotalBytes: 1_000_000 }
    );
    // The project tree (4 source files) exceeds maxFiles, so it steps down to
    // the VI's own directory (2 files) instead of collapsing to single-file.
    expect(selection.stagingRoot).toBe('subsys');
    expect(selection.rootKind).toBe('directory');
    expect(selection.stepDownFromProject).toBe(true);
    expect(selection.plan.strategy).toBe('dependency-tree');
    expect(selection.plan.viRelativePath).toBe('Main.vi');
    expect(selection.plan.filesToStage).toEqual(['Main.vi', 'Helper.vi']);
  });

  it('falls back to the VI directory tree when the project tree trips the SIZE guard (VHS-REQ-659.10)', () => {
    const selection = planViPreviewStagingWithProjectRoot(
      'subsys/Main.vi',
      [
        { relativePath: 'App.lvproj', sizeBytes: 10 },
        { relativePath: 'subsys/Main.vi', sizeBytes: 10 },
        { relativePath: 'subsys/Helper.vi', sizeBytes: 10 },
        { relativePath: 'other/Huge.vi', sizeBytes: 10_000 }
      ],
      { maxFiles: 100, maxTotalBytes: 100 }
    );
    // The project tree's total bytes exceed maxTotalBytes (driven by the large
    // out-of-directory file), so it steps down to the VI's own directory tree
    // (whose bytes fit) rather than collapsing to single-file. This exercises
    // the `too-large` reason arm of the guard, distinct from `too-many-files`.
    expect(selection.stagingRoot).toBe('subsys');
    expect(selection.rootKind).toBe('directory');
    expect(selection.stepDownFromProject).toBe(true);
    expect(selection.plan.strategy).toBe('dependency-tree');
    expect(selection.plan.filesToStage).toEqual(['Main.vi', 'Helper.vi']);
  });

  it('keeps the widened project tree when its guard is not tripped even though a project root exists (VHS-REQ-659.10)', () => {
    const selection = planViPreviewStagingWithProjectRoot('subsys/Main.vi', [
      { relativePath: 'App.lvproj', sizeBytes: 10 },
      { relativePath: 'subsys/Main.vi', sizeBytes: 10 },
      { relativePath: 'shared/Helper.vi', sizeBytes: 10 }
    ]);
    // Guard not tripped -> the project-root widening is retained (rootKind
    // 'project'), proving the fallback only fires when the guard trips.
    expect(selection.stagingRoot).toBe('');
    expect(selection.rootKind).toBe('project');
    expect(selection.stepDownFromProject).toBe(false);
    expect(selection.plan.strategy).toBe('dependency-tree');
    expect(selection.plan.filesToStage).toEqual(['subsys/Main.vi', 'App.lvproj', 'shared/Helper.vi']);
  });
});
