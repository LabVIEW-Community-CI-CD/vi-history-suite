import { describe, expect, it } from 'vitest';

import { parseSubmoduleGitlinks } from '../../src/reporting/runtime/submoduleGitlinkParsing';

const NUL = '\0';
const TAB = '\t';

describe('parseSubmoduleGitlinks', () => {
  it('returns only mode 160000 / type commit entries', () => {
    const output = [
      `160000 commit abc123${TAB}vendor/sub-a`,
      `100644 blob def456${TAB}src/Foo.vi`,
      `160000 commit fed321${TAB}vendor/sub-b`
    ].join(NUL);
    expect(parseSubmoduleGitlinks(output)).toEqual([
      { path: 'vendor/sub-a', revisionId: 'abc123' },
      { path: 'vendor/sub-b', revisionId: 'fed321' }
    ]);
  });

  it('returns an empty list when there are no gitlinks', () => {
    expect(parseSubmoduleGitlinks(`100644 blob def456${TAB}src/Foo.vi`)).toEqual([]);
  });

  it('returns an empty list for empty output', () => {
    expect(parseSubmoduleGitlinks('')).toEqual([]);
  });

  it('keeps the path verbatim (unquoted, with spaces preserved)', () => {
    const output = `160000 commit abc123${TAB}vendor/sub with spaces`;
    expect(parseSubmoduleGitlinks(output)).toEqual([
      { path: 'vendor/sub with spaces', revisionId: 'abc123' }
    ]);
  });

  it('skips malformed records missing a tab or object', () => {
    const output = [
      '160000 commit',
      `160000 commit ${TAB}vendor/no-object`,
      `160000 commit abc123${TAB}vendor/ok`
    ].join(NUL);
    expect(parseSubmoduleGitlinks(output)).toEqual([
      { path: 'vendor/ok', revisionId: 'abc123' }
    ]);
  });
});
