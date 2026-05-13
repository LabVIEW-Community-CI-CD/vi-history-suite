import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('local release evidence archive script', () => {
  it('copies retained evidence into the Seagate vault with a manifest and hashes', () => {
    const script = readText('scripts/local/archiveReleaseEvidence.sh');

    expect(script).toContain('/run/media/sergio/Seagate Backup Plus Drive/VI History Suite Evidence');
    expect(script).toContain('--source PATH');
    expect(script).toContain('--release VERSION');
    expect(script).toContain('cp -a "$SOURCE_DIR"/. "$PAYLOAD_DIR"/');
    expect(script).toContain('sha256sum');
    expect(script).toContain('sha256sum.txt');
    expect(script).toContain('archive-manifest.json');
    expect(script).toContain('vi-history-suite/local-release-evidence-archive@v1');
    expect(script).not.toContain('rm -rf "$SOURCE_DIR"');
    expect(script).not.toContain('mv "$SOURCE_DIR"');
  });
});
