export const VI_MAGIC_OFFSET = 8;
export const VI_MAGIC_LENGTH = 4;
const MINIMUM_HEADER_LENGTH = VI_MAGIC_OFFSET + VI_MAGIC_LENGTH;
const STRICT_PREFIX = Buffer.from('RSRC\r\n', 'ascii');

export type ViSignature = 'LVIN' | 'LVCC';

export interface ViMagicOptions {
  strictRsrcHeader?: boolean;
}

export function detectViSignature(
  bytes: Uint8Array,
  options: ViMagicOptions = {}
): ViSignature | undefined {
  if (bytes.byteLength < MINIMUM_HEADER_LENGTH) {
    return undefined;
  }

  if (options.strictRsrcHeader) {
    const prefix = Buffer.from(bytes.slice(0, STRICT_PREFIX.length));
    if (!prefix.equals(STRICT_PREFIX)) {
      return undefined;
    }
  }

  const magic = Buffer.from(bytes).toString(
    'ascii',
    VI_MAGIC_OFFSET,
    VI_MAGIC_OFFSET + VI_MAGIC_LENGTH
  );

  if (magic === 'LVIN' || magic === 'LVCC') {
    return magic;
  }

  return undefined;
}

