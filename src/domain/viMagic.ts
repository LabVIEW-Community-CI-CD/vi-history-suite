import * as vscode from 'vscode';

import {
  detectViSignature,
  ViMagicOptions,
  ViSignature,
  VI_MAGIC_LENGTH,
  VI_MAGIC_OFFSET
} from './viMagicCore';
import { readViProbeBytesFromFsPath } from './viFile';

const MINIMUM_HEADER_LENGTH = VI_MAGIC_OFFSET + VI_MAGIC_LENGTH;

export async function readViProbeBytes(uri: vscode.Uri): Promise<Uint8Array> {
  if (uri.scheme === 'file') {
    return readViProbeBytesFromFsPath(uri.fsPath);
  }

  const bytes = await vscode.workspace.fs.readFile(uri);
  return bytes.slice(0, MINIMUM_HEADER_LENGTH);
}

export async function detectViSignatureFromUri(
  uri: vscode.Uri,
  options: ViMagicOptions = {}
): Promise<ViSignature | undefined> {
  try {
    return detectViSignature(await readViProbeBytes(uri), options);
  } catch {
    return undefined;
  }
}

export async function isLabviewViByMagic(
  uri: vscode.Uri,
  options: ViMagicOptions = {}
): Promise<boolean> {
  return Boolean(await detectViSignatureFromUri(uri, options));
}
