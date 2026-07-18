import { createHash } from 'node:crypto';

export interface DecodedDataUriImage {
  data: Buffer;
  extension: string;
  contentHash: string;
}

/**
 * VHS-REQ-640: decodes a `data:image/<type>;base64,<payload>` overview-image
 * source produced by single-file reports. Tolerates the whitespace LabVIEW
 * inserts after `base64,`. Returns undefined for non-data-URI sources (legacy
 * multi-file reports reference `<report>_files/...` paths instead).
 */
export function decodeDataUriImage(source: string): DecodedDataUriImage | undefined {
  const match = /^data:image\/([a-z0-9.+-]+);base64,([\s\S]*)$/i.exec(source.trim());
  if (!match) {
    return undefined;
  }
  const rawType = match[1].toLowerCase();
  const extension = rawType === 'jpeg' ? 'jpg' : rawType.replace(/[^a-z0-9]/g, '');
  const base64Payload = match[2].replace(/\s+/g, '');
  if (!extension || base64Payload.length === 0) {
    return undefined;
  }
  const data = Buffer.from(base64Payload, 'base64');
  if (data.length === 0) {
    return undefined;
  }
  const contentHash = createHash('sha256').update(data).digest('hex').slice(0, 16);
  return { data, extension, contentHash };
}
