import { ViHistoryViewModel } from '../services/viHistoryModel';
import { ComparisonReportRevisionMetadata } from './comparisonReportPacket';

/**
 * Pure revision-metadata projection extracted verbatim from comparisonReportAction.
 * `toRevisionMetadata` maps a resolved commit (or `undefined`) onto the packet's
 * `ComparisonReportRevisionMetadata` shape, falling back to a hash-only record when
 * the commit is not available. Isolated from comparison-report action orchestration
 * and imported back to preserve behavior.
 *
 * Supporting VHS-REQ-643.
 */
export function toRevisionMetadata(
  commit:
    | Pick<ViHistoryViewModel['commits'][number], 'hash' | 'authorDate' | 'authorName' | 'subject' | 'body'>
    | undefined,
  fallbackHash: string
): ComparisonReportRevisionMetadata {
  if (!commit) {
    return {
      hash: fallbackHash
    };
  }

  return {
    hash: commit.hash,
    authorDate: commit.authorDate,
    authorName: commit.authorName,
    subject: commit.subject,
    body: commit.body
  };
}
