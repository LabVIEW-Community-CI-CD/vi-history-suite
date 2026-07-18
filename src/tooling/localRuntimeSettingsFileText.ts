import * as path from 'node:path';
import { applyEdits, modify, parse, type ParseError } from 'jsonc-parser';

export function normalizeSettingsJsoncText(
  existingSettingsText: string | undefined,
  settingsFilePath: string
): string {
  const candidateText = stripUtf8ByteOrderMark(
    existingSettingsText?.trim() ? existingSettingsText : '{}'
  );
  const parseErrors: ParseError[] = [];
  const parsed = parse(candidateText, parseErrors, {
    allowTrailingComma: true,
    disallowComments: false
  }) as unknown;

  if (parseErrors.length > 0) {
    throw new Error(`Failed to parse VS Code settings JSONC at ${settingsFilePath}.`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('VS Code settings.json must contain a JSON object.');
  }

  return candidateText;
}

export function stripUtf8ByteOrderMark(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function applySettingsJsoncEdit(
  settingsText: string,
  pathSegments: readonly string[],
  value: string,
  endOfLine: '\n' | '\r\n'
): string {
  const edits = modify(settingsText, [...pathSegments], value, {
    formattingOptions: {
      insertSpaces: true,
      tabSize: 2,
      eol: endOfLine
    }
  });
  return applyEdits(settingsText, edits);
}

export function detectSettingsEndOfLine(existingSettingsText: string | undefined): '\n' | '\r\n' {
  if (existingSettingsText?.includes('\r\n')) {
    return '\r\n';
  }
  return '\n';
}

export function ensureTerminalNewline(settingsText: string, endOfLine: '\n' | '\r\n'): string {
  if (settingsText.endsWith(endOfLine)) {
    return settingsText;
  }
  return `${settingsText}${endOfLine}`;
}

export function assertSupportedSettingsTarget(settingsFilePath: string): void {
  const normalizedSegments = path
    .normalize(settingsFilePath)
    .split(/[\\/]+/)
    .map((segment) => segment.toLowerCase());
  const finalSegment = normalizedSegments.at(-1);
  const parentSegment = normalizedSegments.at(-2);

  if (parentSegment === '.vscode' && finalSegment === 'settings.json') {
    throw new Error(
      'Workspace settings are not supported for VI History runtime-settings CLI. Use the default user settings.json target or an explicit non-workspace settings-file path.'
    );
  }
}

export function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return (
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

export function readTrimmedSettingsProperty(
  settingsObject: Record<string, unknown>,
  propertyName: string
): string | undefined {
  const value = settingsObject[propertyName];
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmedValue = value.trim();
  return trimmedValue ? trimmedValue : undefined;
}
