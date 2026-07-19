import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse as parseJsonc } from 'jsonc-parser';

function readTemplate(): string {
  return fs
    .readFileSync(
      path.resolve(
        __dirname,
        '..',
        '..',
        'docs',
        'consumer-workflows',
        'codespace-preview-cache.devcontainer.json'
      ),
      'utf8'
    )
    .replace(/\r\n/g, '\n');
}

/** The parsed devcontainer object (jsonc — the template carries `//` comments). */
function parseTemplate(): Record<string, unknown> {
  return parseJsonc(readTemplate()) as Record<string, unknown>;
}

describe('Codespace preview-cache worker devcontainer template (VHS-REQ-671)', () => {
  it('is valid jsonc that parses to a devcontainer object (VHS-REQ-671.7)', () => {
    const parsed = parseTemplate();
    expect(parsed).toBeTypeOf('object');
    expect(parsed.name).toBeTypeOf('string');
    expect(parsed.image).toBeTypeOf('string');
  });

  it('enables Docker-in-Docker because a live preview render is Docker-only (VHS-REQ-671.7)', () => {
    const features = parseTemplate().features as Record<string, unknown>;
    const keys = Object.keys(features);
    expect(keys.some((key) => key.includes('docker-in-docker'))).toBe(true);
    // Node + git are needed to run the shipped worker CLI in the Codespace.
    expect(keys.some((key) => key.includes('features/node'))).toBe(true);
  });

  it('installs the VI History Suite extension by its Marketplace id (VHS-REQ-671.7)', () => {
    const parsed = parseTemplate();
    const customizations = parsed.customizations as {
      vscode?: { extensions?: string[] };
    };
    expect(customizations.vscode?.extensions).toContain('svelderrainruiz.vi-history-suite');
  });

  it('enables the Docker-only preview feature and aggressive background warming (VHS-REQ-671.7)', () => {
    const parsed = parseTemplate();
    const settings = (parsed.customizations as { vscode?: { settings?: Record<string, unknown> } })
      .vscode?.settings;
    expect(settings?.['viHistorySuite.preview.enabled']).toBe(true);
    expect(settings?.['viHistorySuite.preview.backgroundWarming']).toBe('always');
  });

  it('documents the headless worker invocation over gh codespace ssh (VHS-REQ-671.7)', () => {
    const template = readTemplate();
    expect(template).toContain('gh codespace ssh');
    expect(template).toContain('npm run preview:cache:warm');
    expect(template).toContain('--cache-dir');
  });
});
